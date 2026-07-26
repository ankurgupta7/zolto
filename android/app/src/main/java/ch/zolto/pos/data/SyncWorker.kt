package ch.zolto.pos.data

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters

/**
 * Background worker that retries all pending offline transactions.
 * Triggered automatically when connectivity returns, or manually from the UI.
 *
 * WorkManager enqueues this with a [NetworkType.CONNECTED] constraint so it
 * only runs when the device is online.
 */
class SyncWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val manager = OfflinePaymentManager(applicationContext)
        val synced = manager.syncAllPending()
        return Result.success()
    }

    companion object {
        const val NAME = "zolto_pending_sync"
        const val TAG = "offline_sync"
    }
}
