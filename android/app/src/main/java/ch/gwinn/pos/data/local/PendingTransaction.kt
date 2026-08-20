package ch.gwinn.pos.data.local

import androidx.room.*
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken

/**
 * Represents a sale transaction that was recorded locally while the device was
 * offline and still needs to be synced to the backend.
 *
 * [payloadJson] stores the complete request data (productIds, priceOverrides,
 * customItems, paymentMethod) as JSON so the sync worker can replay the exact
 * sale when connectivity returns.
 */
@Entity(tableName = "pending_transactions")
data class PendingTransactionEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    /** One of: "cash", "card", "twint", "card_backend_confirm" */
    val transactionType: String,
    /** JSON-encoded request payload — see [PendingTransactionPayload]. */
    val payloadJson: String,
    /** ISO-8601 timestamp of when the sale was recorded locally. */
    val createdAt: String,
    /** Number of sync retry attempts so far. */
    val retryCount: Int = 0,
    /** "pending", "syncing", "failed", or "synced". */
    val status: String = "pending",
    /** Human-readable error message from the last failed sync attempt. */
    val lastError: String? = null,
    /** The local sale total in Rappen — shown in the UI while pending. */
    val totalRappen: Int,
    /** A display label for the UI, e.g. "3 items - Cash". */
    val displayLabel: String,
)

/**
 * Serializable payload stored in [PendingTransactionEntity.payloadJson].
 * Gson is used for JSON serialization.
 */
data class PendingTransactionPayload(
    val productIds: List<Int> = emptyList(),
    val priceOverrides: Map<String, Int> = emptyMap(),
    val customItems: List<CustomItemPayload> = emptyList(),
    val paymentMethod: String = "cash",
    val paymentIntentId: String? = null,
    val posOrderId: Int? = null,
    val allowHidden: Boolean = false,
)

data class CustomItemPayload(
    val name: String,
    val priceRappen: Int,
)

@Dao
interface PendingTransactionDao {
    @Query("SELECT * FROM pending_transactions WHERE status = 'pending' OR status = 'failed' ORDER BY createdAt ASC")
    suspend fun getPending(): List<PendingTransactionEntity>

    @Query("SELECT * FROM pending_transactions WHERE status = 'syncing' ORDER BY createdAt ASC")
    suspend fun getSyncing(): List<PendingTransactionEntity>

    @Query("SELECT COUNT(*) FROM pending_transactions WHERE status = 'pending' OR status = 'failed'")
    suspend fun getPendingCount(): Int

    @Insert
    suspend fun insert(transaction: PendingTransactionEntity): Long

    @Update
    suspend fun update(transaction: PendingTransactionEntity)

    @Query("UPDATE pending_transactions SET status = :status, retryCount = retryCount + 1, lastError = :error WHERE id = :id")
    suspend fun markStatus(id: Long, status: String, error: String? = null)

    @Query("DELETE FROM pending_transactions WHERE status = 'synced'")
    suspend fun deleteSynced()

    @Query("DELETE FROM pending_transactions WHERE id = :id")
    suspend fun deleteById(id: Long)

    @Query("DELETE FROM pending_transactions")
    suspend fun deleteAll()
}

/** Gson helper for payload (de)serialization. */
object PendingTransactionSerializer {
    private val gson = Gson()
    private val payloadType = object : TypeToken<PendingTransactionPayload>() {}.type

    fun toJson(payload: PendingTransactionPayload): String = gson.toJson(payload, payloadType)
    fun fromJson(json: String): PendingTransactionPayload = gson.fromJson(json, payloadType)
}
