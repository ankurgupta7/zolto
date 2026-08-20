package ch.gwinn.pos.data

import com.stripe.stripeterminal.external.callable.ConnectionTokenCallback
import com.stripe.stripeterminal.external.callable.ConnectionTokenProvider
import com.stripe.stripeterminal.external.models.ConnectionTokenException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Supplies Stripe Terminal connection tokens by delegating to the POS backend
 * (`POST /api/pos/connection-token`, which proxies Stripe's
 * `/v1/terminal/connection_tokens`).
 *
 * The SDK invokes [fetchConnectionToken] on a background thread whenever it needs
 * a fresh token, so we hop onto an IO coroutine and hand the result back through
 * the provided callback.
 */
class StripeTokenProvider : ConnectionTokenProvider {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    override fun fetchConnectionToken(callback: ConnectionTokenCallback) {
        scope.launch {
            try {
                val secret = RetrofitClient.apiService.getConnectionToken().secret
                callback.onSuccess(secret)
            } catch (e: Exception) {
                callback.onFailure(
                    ConnectionTokenException("Failed to fetch connection token", e),
                )
            }
        }
    }
}
