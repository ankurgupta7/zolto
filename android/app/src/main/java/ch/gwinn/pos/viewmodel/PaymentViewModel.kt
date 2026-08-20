package ch.gwinn.pos.viewmodel

import android.content.Context
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import ch.gwinn.pos.data.ApiService
import ch.gwinn.pos.data.OfflinePaymentManager
import ch.gwinn.pos.data.PosSession
import ch.gwinn.pos.data.models.CustomLineItemRequest
import ch.gwinn.pos.data.models.ManualSaleRequest
import ch.gwinn.pos.data.models.PaymentIntentRequest
import ch.gwinn.pos.data.models.PaymentIntentResponse
import ch.gwinn.pos.data.models.SaleRequest
import ch.gwinn.pos.data.models.TwintIntentRequest
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

sealed class PaymentState {
    object Idle : PaymentState()
    object CreatingIntent : PaymentState()
    data class IntentCreated(val response: PaymentIntentResponse) : PaymentState()
    object CollectingPayment : PaymentState()
    object ProcessingPayment : PaymentState()
    // Cash path — no Stripe involved, just recording the sale.
    object RecordingCashSale : PaymentState()
    // TWINT path — QR (the Stripe redirect URL) is on screen; we poll for success.
    data class ShowingTwintQr(val redirectUrl: String) : PaymentState()
    // TWINT QR-sticker path — the merchant's OWN sticker is on screen with the
    // amount beside it. There is nothing to poll: TWINT exposes no API to us,
    // so the merchant confirms from their own TWINT app (see confirmTwintQr).
    data class ShowingTwintSticker(
        val qrUrl: String,
        val totalRappen: Int,
    ) : PaymentState()
    data class Succeeded(val posOrderId: Int, val totalRappen: Int, val offline: Boolean = false) : PaymentState()
    data class Failed(val message: String) : PaymentState()
    object Cancelled : PaymentState()
}

class PaymentViewModel(
    private val api: ApiService,
    private val offlineManager: OfflinePaymentManager? = null,
) : ViewModel() {

    private companion object {
        // The customer opens the TWINT app, authorises, and comes back — poll
        // for a few minutes before giving up.
        const val TWINT_POLL_INTERVAL_MS = 2500L
        const val TWINT_POLL_MAX_ATTEMPTS = 72 // ~3 minutes
    }

    private val _state = MutableLiveData<PaymentState>(PaymentState.Idle)
    val state: LiveData<PaymentState> = _state

    private var twintPollJob: Job? = null

    /** Whether the device is currently online — exposed for UI decisions. */
    val isOnline: LiveData<Boolean> = MutableLiveData(true)

    init {
        // Observe connectivity changes
        viewModelScope.launch {
            offlineManager?.isOnline?.collect { online ->
                (isOnline as MutableLiveData).postValue(online)
            }
        }
    }

    fun createPaymentIntent(productIds: List<Int>) {
        _state.value = PaymentState.CreatingIntent
        viewModelScope.launch {
            try {
                val response = api.createPaymentIntent(
                    PaymentIntentRequest(
                        productIds,
                        allowHidden = PosSession.showHiddenItems,
                        priceOverrides = PosSession.priceOverrides.mapKeys { it.key.toString() },
                        customItems = PosSession.customItems.map {
                            CustomLineItemRequest(name = it.name, priceRappen = it.priceRappen)
                        },
                    )
                )
                _state.value = PaymentState.IntentCreated(response)
            } catch (e: Exception) {
                _state.value = PaymentState.Failed(e.message ?: "Failed to create payment")
            }
        }
    }

    // Cash is the only method that works fully offline. We always try the
    // direct API first; if it fails (network offline), we record the sale
    // locally via [OfflinePaymentManager] and show success — the transaction
    // will sync automatically when connectivity returns.
    fun createCashSale(productIds: List<Int>, context: Context? = null) {
        _state.value = PaymentState.RecordingCashSale
        val itemCount = productIds.size + PosSession.customItems.size
        val totalRappen = PosSession.totalRappenFor(
            // Best-effort: look up products for total calculation
            emptyList() // Total is computed by the backend or from session
        ) + PosSession.customItems.sumOf { it.priceRappen }

        viewModelScope.launch {
            try {
                val response = api.manualSale(
                    ManualSaleRequest(
                        productIds,
                        allowHidden = PosSession.showHiddenItems,
                        priceOverrides = PosSession.priceOverrides.mapKeys { it.key.toString() },
                        customItems = PosSession.customItems.map {
                            CustomLineItemRequest(name = it.name, priceRappen = it.priceRappen)
                        },
                    )
                )
                _state.value = PaymentState.Succeeded(response.posOrderId, response.totalRappen, offline = false)
            } catch (e: Exception) {
                // Direct API failed — fall back to offline recording if we have
                // an OfflinePaymentManager and a context.
                val mgr = offlineManager
                    ?: (context?.let { OfflinePaymentManager(it) })
                if (mgr != null) {
                    val computedTotal = PosSession.priceOverrides.values.sum() +
                            PosSession.customItems.sumOf { it.priceRappen } +
                            productIds.sumOf { pid ->
                                PosSession.priceOverrides[pid]
                                    ?: 0 // We don't have product list here; trust session
                            }
                    val localTotal = if (computedTotal > 0) computedTotal else 0
                    val txId = mgr.recordCashSale(
                        productIds = productIds,
                        allowHidden = PosSession.showHiddenItems,
                        priceOverrides = PosSession.priceOverrides.mapKeys { it.key.toString() },
                        customItems = PosSession.customItems.map {
                            CustomLineItemRequest(name = it.name, priceRappen = it.priceRappen)
                        },
                        totalRappen = localTotal,
                        itemCount = itemCount,
                    )
                    // Show success with a synthetic local order id (the tx id)
                    _state.value = PaymentState.Succeeded(
                        posOrderId = txId.toInt(),
                        totalRappen = localTotal,
                        offline = true,
                    )
                } else {
                    _state.value = PaymentState.Failed(e.message ?: "Failed to record sale")
                }
            }
        }
    }

    // TWINT goes through Stripe: the backend creates + confirms a `twint`
    // PaymentIntent and returns a redirect URL, which we render as a QR code for
    // the customer to scan with their TWINT app. We then poll /pos/sale until
    // the PaymentIntent succeeds (the webhook fulfils in parallel — polling is
    // just so the cashier's screen advances without waiting on the webhook).
    //
    // NOTE: TWINT requires network — it cannot work offline.
    fun startTwint(productIds: List<Int>) {
        _state.value = PaymentState.CreatingIntent
        viewModelScope.launch {
            try {
                val response = api.twintIntent(
                    TwintIntentRequest(
                        productIds,
                        allowHidden = PosSession.showHiddenItems,
                        priceOverrides = PosSession.priceOverrides.mapKeys { it.key.toString() },
                        customItems = PosSession.customItems.map {
                            CustomLineItemRequest(name = it.name, priceRappen = it.priceRappen)
                        },
                    )
                )
                _state.value = PaymentState.ShowingTwintQr(response.redirectUrl)
                pollTwintUntilPaid(response.paymentIntentId, response.posOrderId, response.totalRappen)
            } catch (e: Exception) {
                _state.value = PaymentState.Failed(e.message ?: "Failed to start TWINT payment")
            }
        }
    }

    // TWINT QR sticker: the customer scans the merchant's own sticker and types
    // the amount into their TWINT app. Nothing reaches Gwinn until the merchant
    // says so, so this step is purely presentational — we put the code and the
    // expected amount on screen and wait for confirmTwintQr().
    fun showTwintSticker(qrUrl: String, totalRappen: Int) {
        _state.value = PaymentState.ShowingTwintSticker(qrUrl, totalRappen)
    }

    // The merchant has seen the payment land in their TWINT app. Record it the
    // same way cash is recorded — an attested sale, distinguished from
    // Stripe-confirmed TWINT by paymentMethod = "twint_qr".
    fun confirmTwintQr(productIds: List<Int>) {
        _state.value = PaymentState.RecordingCashSale
        viewModelScope.launch {
            try {
                val response = api.manualSale(
                    ManualSaleRequest(
                        productIds,
                        paymentMethod = "twint_qr",
                        priceOverrides = PosSession.priceOverrides.mapKeys { it.key.toString() },
                        customItems = PosSession.customItems.map {
                            CustomLineItemRequest(name = it.name, priceRappen = it.priceRappen)
                        },
                    )
                )
                _state.value = PaymentState.Succeeded(response.posOrderId, response.totalRappen)
            } catch (e: Exception) {
                // Deliberately NOT falling back to offline recording like cash
                // does. Cash is in the merchant's hand either way; a TWINT
                // payment we failed to record is one we also can't verify
                // later, so surface the failure and let them retry.
                _state.value = PaymentState.Failed(
                    e.message ?: "Couldn't record the TWINT payment"
                )
            }
        }
    }

    private fun pollTwintUntilPaid(paymentIntentId: String, posOrderId: Int, totalRappen: Int) {
        twintPollJob?.cancel()
        twintPollJob = viewModelScope.launch {
            repeat(TWINT_POLL_MAX_ATTEMPTS) {
                delay(TWINT_POLL_INTERVAL_MS)
                val paid = try {
                    // /pos/sale returns 200 once the PaymentIntent has succeeded
                    // and 409 (→ exception) while it hasn't. Any error just means
                    // "keep waiting".
                    api.confirmSale(SaleRequest(paymentIntentId)).success
                } catch (_: Exception) {
                    false
                }
                if (paid) {
                    _state.value = PaymentState.Succeeded(posOrderId, totalRappen)
                    return@launch
                }
            }
            _state.value = PaymentState.Failed(
                "TWINT payment wasn't completed. Please try again."
            )
        }
    }

    fun onCollectingPayment() {
        _state.value = PaymentState.CollectingPayment
    }

    fun onProcessingPayment() {
        _state.value = PaymentState.ProcessingPayment
    }

    fun onPaymentSucceeded(posOrderId: Int, totalRappen: Int) {
        viewModelScope.launch {
            try {
                // Belt-and-suspenders: confirm via API even though webhook handles fulfillment
                api.confirmSale(SaleRequest(/* paymentIntentId set by caller */ ""))
            } catch (_: Exception) {
                // Webhook is primary; this is best-effort
            }
            _state.value = PaymentState.Succeeded(posOrderId, totalRappen)
        }
    }

    // Called after Stripe Terminal confirms the card was charged. We try to
    // confirm with our backend; if that fails (network hiccup), we queue the
    // confirmation for later sync so the cashier doesn't see a failure for an
    // already-completed charge.
    fun onPaymentSucceeded(paymentIntentId: String, posOrderId: Int, totalRappen: Int, itemCount: Int = 0) {
        viewModelScope.launch {
            try {
                api.confirmSale(SaleRequest(paymentIntentId))
                _state.value = PaymentState.Succeeded(posOrderId, totalRappen)
            } catch (_: Exception) {
                // Backend confirm failed but card was already charged.
                // Queue for background sync and show success to the cashier.
                offlineManager?.recordCardBackendConfirm(
                    paymentIntentId = paymentIntentId,
                    posOrderId = posOrderId,
                    totalRappen = totalRappen,
                    itemCount = itemCount,
                )
                _state.value = PaymentState.Succeeded(posOrderId, totalRappen, offline = true)
            }
        }
    }

    fun onPaymentFailed(message: String) {
        _state.value = PaymentState.Failed(message)
    }

    fun onCancelled() {
        twintPollJob?.cancel()
        _state.value = PaymentState.Cancelled
    }

    fun reset() {
        twintPollJob?.cancel()
        _state.value = PaymentState.Idle
    }
}
