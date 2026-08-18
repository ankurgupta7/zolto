package ch.zolto.pos.data

import android.content.Context
import androidx.work.*
import ch.zolto.pos.data.local.*
import ch.zolto.pos.data.models.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import java.time.Instant
import java.time.format.DateTimeFormatter
import java.util.concurrent.TimeUnit

/**
 * Central coordinator for offline payment support.
 *
 * - Records every sale locally (into [PendingTransactionEntity]) as soon as it
 *   happens, regardless of connectivity.
 * - When online, attempts immediate sync; when offline, the transaction stays
 *   pending until [SyncWorker] or a manual retry picks it up.
 * - Provides a reactive [pendingCountFlow] so the UI can show a badge.
 */
class OfflinePaymentManager(context: Context) {

    private val db = DatabaseClient.getInstance(context)
    private val dao = db.pendingTransactionDao()
    private val networkMonitor = NetworkMonitor(context)
    private val workManager = WorkManager.getInstance(context)

    /** True when the device currently has internet access. */
    val isOnline: Flow<Boolean> = networkMonitor.isOnline

    /** Emits the current count of unsynced pending transactions. */
    val pendingCountFlow: Flow<Int> = flow {
        while (true) {
            emit(dao.getPendingCount())
            kotlinx.coroutines.delay(2000)
        }
    }

    /**
     * Records a cash sale locally and immediately attempts to sync it if
     * online. Call this from [PaymentViewModel.createCashSale].
     */
    suspend fun recordCashSale(
        productIds: List<Int>,
        allowHidden: Boolean,
        priceOverrides: Map<String, Int>,
        customItems: List<CustomLineItemRequest>,
        totalRappen: Int,
        itemCount: Int,
    ): Long {
        val payload = PendingTransactionPayload(
            productIds = productIds,
            priceOverrides = priceOverrides,
            customItems = customItems.map { CustomItemPayload(it.name, it.priceRappen) },
            paymentMethod = "cash",
            allowHidden = allowHidden,
        )
        val tx = PendingTransactionEntity(
            transactionType = "cash",
            payloadJson = PendingTransactionSerializer.toJson(payload),
            createdAt = isoNow(),
            totalRappen = totalRappen,
            displayLabel = "$itemCount items - Cash",
        )
        val id = dao.insert(tx)

        // Attempt immediate sync if we're online
        if (networkMonitor.isCurrentlyOnline()) {
            syncTransaction(dao.getPending().firstOrNull { it.id == id } ?: return id)
        } else {
            scheduleSyncWorker()
        }
        return id
    }

    /**
     * Records a card-payment backend confirmation that failed (e.g., network
     * hiccup after Stripe already charged the card). The sale is treated as
     * completed locally; we just need to tell our backend about it later.
     */
    suspend fun recordCardBackendConfirm(
        paymentIntentId: String,
        posOrderId: Int,
        totalRappen: Int,
        itemCount: Int,
    ): Long {
        val payload = PendingTransactionPayload(
            paymentIntentId = paymentIntentId,
            posOrderId = posOrderId,
            paymentMethod = "card",
        )
        val tx = PendingTransactionEntity(
            transactionType = "card_backend_confirm",
            payloadJson = PendingTransactionSerializer.toJson(payload),
            createdAt = isoNow(),
            totalRappen = totalRappen,
            displayLabel = "$itemCount items - Card (confirm)",
        )
        val id = dao.insert(tx)

        if (networkMonitor.isCurrentlyOnline()) {
            syncTransaction(dao.getPending().firstOrNull { it.id == id } ?: return id)
        } else {
            scheduleSyncWorker()
        }
        return id
    }

    /**
     * Records a locally-completed TWINT sale that couldn't be confirmed with
     * the backend due to a network error after the customer already paid.
     */
    suspend fun recordTwintBackendConfirm(
        paymentIntentId: String,
        posOrderId: Int,
        totalRappen: Int,
        itemCount: Int,
    ): Long {
        val payload = PendingTransactionPayload(
            paymentIntentId = paymentIntentId,
            posOrderId = posOrderId,
            paymentMethod = "twint",
        )
        val tx = PendingTransactionEntity(
            transactionType = "twint",
            payloadJson = PendingTransactionSerializer.toJson(payload),
            createdAt = isoNow(),
            totalRappen = totalRappen,
            displayLabel = "$itemCount items - TWINT (confirm)",
        )
        val id = dao.insert(tx)

        if (networkMonitor.isCurrentlyOnline()) {
            syncTransaction(dao.getPending().firstOrNull { it.id == id } ?: return id)
        } else {
            scheduleSyncWorker()
        }
        return id
    }

    /**
     * Attempts to sync a single pending transaction. Returns true on success.
     */
    suspend fun syncTransaction(tx: PendingTransactionEntity): Boolean {
        dao.markStatus(tx.id, "syncing")
        return try {
            val payload = PendingTransactionSerializer.fromJson(tx.payloadJson)
            val api = RetrofitClient.apiService
            when (tx.transactionType) {
                "cash" -> {
                    api.manualSale(
                        ManualSaleRequest(
                            productIds = payload.productIds,
                            paymentMethod = "cash",
                            // Replaying without this is why a queued sale of a
                            // hidden piece came back 409 forever.
                            allowHidden = payload.allowHidden,
                            priceOverrides = payload.priceOverrides,
                            customItems = payload.customItems.map {
                                CustomLineItemRequest(it.name, it.priceRappen)
                            },
                        )
                    )
                }
                "card_backend_confirm" -> {
                    val piId = payload.paymentIntentId
                        ?: throw IllegalStateException("Missing paymentIntentId")
                    api.confirmSale(SaleRequest(paymentIntentId = piId))
                }
                "twint" -> {
                    val piId = payload.paymentIntentId
                        ?: throw IllegalStateException("Missing paymentIntentId")
                    api.confirmSale(SaleRequest(paymentIntentId = piId))
                }
                else -> throw IllegalStateException("Unknown transaction type: ${tx.transactionType}")
            }
            dao.markStatus(tx.id, "synced")
            true
        } catch (e: Exception) {
            dao.markStatus(tx.id, "failed", e.message)
            false
        }
    }

    /**
     * Retries all pending and failed transactions. Returns the number
     * successfully synced.
     */
    suspend fun syncAllPending(): Int {
        val pending = dao.getPending()
        if (pending.isEmpty()) return 0
        var successCount = 0
        for (tx in pending) {
            if (syncTransaction(tx)) successCount++
        }
        // Clean up synced rows opportunistically
        dao.deleteSynced()
        return successCount
    }

    /**
     * Enqueues a one-time [SyncWorker] that will retry pending transactions
     * when connectivity is available. Uses a network constraint so WorkManager
     * only runs it when online.
    */
    private fun scheduleSyncWorker() {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val request = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(constraints)
            .setBackoffCriteria(
                BackoffPolicy.EXPONENTIAL,
                WorkRequest.MIN_BACKOFF_MILLIS,
                TimeUnit.MILLISECONDS
            )
            .addTag(SyncWorker.TAG)
            .build()

        workManager.enqueueUniqueWork(
            SyncWorker.NAME,
            ExistingWorkPolicy.KEEP,
            request
        )
    }

    private fun isoNow(): String = DateTimeFormatter.ISO_INSTANT.format(Instant.now())
}
