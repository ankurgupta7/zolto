package ch.zolto.pos

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.view.View
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.browser.customtabs.CustomTabsIntent
import androidx.core.content.ContextCompat
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import ch.zolto.pos.data.RetrofitClient
import ch.zolto.pos.data.StripeTokenProvider
import ch.zolto.pos.databinding.ActivityPaymentBinding
import ch.zolto.pos.viewmodel.PaymentState
import ch.zolto.pos.viewmodel.PaymentViewModel
import ch.zolto.pos.viewmodel.PaymentViewModelFactory
import com.stripe.stripeterminal.Terminal
import com.stripe.stripeterminal.external.callable.*
import com.stripe.stripeterminal.external.models.*
import com.stripe.stripeterminal.log.LogLevel
import kotlinx.coroutines.launch

class PaymentActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_PRODUCT_IDS = "extra_product_ids"
        const val EXTRA_TOTAL_RAPPEN = "extra_total_rappen"
        // "card" (default), "cash", or "twint" — see SaleReviewActivity's payment
        // method buttons. Only "card" drives the Stripe Terminal flow below.
        const val EXTRA_PAYMENT_METHOD = "extra_payment_method"
    }

    private lateinit var binding: ActivityPaymentBinding
    private lateinit var viewModel: PaymentViewModel

    private var cancelable: Cancelable? = null
    private var discoveryCancelable: Cancelable? = null
    private var currentPaymentIntentId: String? = null
    private var currentPosOrderId: Int = 0
    private var currentTotalRappen: Int = 0

    private var productIds: List<Int> = emptyList()
    private var paymentMethod: String = "card"
    private var terminalLocationId: String = ""

    @Volatile
    private var isConnecting = false

    // Tracks whether a Chrome Custom Tab for TWINT is currently open.
    // Used in onResume() to detect when the user closes the tab.
    @Volatile
    private var isTwintTabOpen = false

    private val requestLocationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) {
                resolveLocationThenStart()
            } else {
                showError("Location permission is required for Tap to Pay.")
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityPaymentBinding.inflate(layoutInflater)
        setContentView(binding.root)

        viewModel = ViewModelProvider(
            this,
            PaymentViewModelFactory(RetrofitClient.apiService, this),
        )[PaymentViewModel::class.java]

        productIds = intent.getIntegerArrayListExtra(EXTRA_PRODUCT_IDS) ?: run {
            finish()
            return
        }
        currentTotalRappen = intent.getIntExtra(EXTRA_TOTAL_RAPPEN, 0)
        paymentMethod = intent.getStringExtra(EXTRA_PAYMENT_METHOD) ?: "card"

        observeState()
        startForMethod()

        binding.btnCancel.setOnClickListener { cancelPayment() }
    }

    // Card → Tap to Pay; TWINT → Stripe PaymentIntent + on-screen QR; cash →
    // direct record. Only card runs the Stripe Terminal flow.
    private fun startForMethod() {
        when (paymentMethod) {
            "twint" -> viewModel.startTwint(productIds)
            "cash" -> {
                // Nothing to cancel — the cash record resolves near-instantly.
                binding.btnCancel.visibility = View.GONE
                viewModel.createCashSale(productIds, this)
            }
            else -> startPaymentFlow()
        }
    }

    private fun observeState() {
        viewModel.state.observe(this) { state ->
            when (state) {
                is PaymentState.Idle -> showStatus(getString(R.string.tap_card_prompt))
                is PaymentState.CreatingIntent -> showStatus("Creating payment…")
                is PaymentState.IntentCreated -> {
                    if (state.response.totalRappen <= 0) {
                        // Guards against ever tapping the card for CHF 0.00: the preview
                        // total is computed from the (possibly stale) local product cache,
                        // but the amount actually charged is whatever the backend just
                        // computed from its own authoritative data. Refuse to proceed if
                        // those have diverged down to nothing instead of silently charging
                        // zero.
                        showError("Cart total came back as CHF 0.00 — refusing to charge. Please refresh the product list and try again.")
                    } else {
                        currentPosOrderId = state.response.posOrderId
                        currentTotalRappen = state.response.totalRappen
                        collectPayment(state.response.clientSecret)
                    }
                }
                is PaymentState.CollectingPayment -> {
                    showStatus(getString(R.string.tap_card_prompt))
                    binding.btnCancel.isEnabled = true
                }
                is PaymentState.ProcessingPayment -> {
                    showStatus(getString(R.string.processing_payment))
                    binding.btnCancel.isEnabled = false
                }
                is PaymentState.RecordingCashSale -> showStatus(getString(R.string.recording_cash_sale))
                is PaymentState.ShowingTwintQr -> showTwintQr(state.redirectUrl)
                is PaymentState.Succeeded -> {
                    navigateToSuccess(state.posOrderId, state.totalRappen, state.offline)
                }
                is PaymentState.Failed -> showError(state.message)
                is PaymentState.Cancelled -> finish()
            }
        }
    }

    // Stripe Terminal Tap to Pay (SDK 5.6.0).
    //
    // Flow: request the runtime location permission Tap to Pay needs, initialise
    // the Terminal singleton with a backend-backed token provider, discover the
    // on-device Tap to Pay "reader", connect it against the configured Stripe
    // Location, then drive createPaymentIntent -> collect -> confirm.
    //
    // NOTE: Tap to Pay only functions on a Stripe-allowlisted NFC device with Tap
    // to Pay enabled on the account and a valid Stripe Terminal Location ID; the
    // flow must be verified on such hardware (it cannot run on an emulator).

    private fun startPaymentFlow() {
        val granted = ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.ACCESS_FINE_LOCATION,
        ) == PackageManager.PERMISSION_GRANTED

        if (granted) {
            resolveLocationThenStart()
        } else {
            requestLocationPermission.launch(Manifest.permission.ACCESS_FINE_LOCATION)
        }
    }

    // The Stripe Terminal Location the Tap to Pay reader registers against is
    // served by the backend (GET /api/pos/config) so no Stripe configuration
    // needs to be baked into the APK. An optional stripe_location_id string
    // resource in secrets.xml acts as a local development override when the
    // backend is not running.
    private fun resolveLocationThenStart() {
        showStatus("Preparing card reader…")
        lifecycleScope.launch {
            terminalLocationId = resolveLocationId()
            if (terminalLocationId.isBlank()) {
                showLocationNotConfigured()
            } else {
                initTerminalAndDiscover()
            }
        }
    }

    private suspend fun resolveLocationId(): String {
        val fromBackend = try {
            RetrofitClient.apiService.getConfig().locationId
        } catch (_: Exception) {
            "" // backend unreachable or not configured — fall back to the override
        }
        if (fromBackend.isNotBlank()) return fromBackend

        val override = getString(R.string.stripe_location_id)
        return if (override.isBlank() || override == "tml_...") "" else override
    }

    private fun initTerminalAndDiscover() {
        if (!Terminal.isInitialized()) {
            Terminal.init(
                applicationContext,
                LogLevel.ERROR,
                StripeTokenProvider(),
                terminalListener,
                null, // offlineListener — offline mode is not used
            )
        }

        // On a retry the Tap to Pay reader is usually still connected; skip
        // discovery and go straight to creating the payment intent.
        if (Terminal.getInstance().connectedReader != null) {
            viewModel.createPaymentIntent(productIds)
            return
        }

        val config = DiscoveryConfiguration.TapToPayDiscoveryConfiguration(isSimulated = BuildConfig.DEBUG)
        discoveryCancelable = Terminal.getInstance().discoverReaders(
            config,
            discoveryListener,
            object : Callback {
                override fun onSuccess() {}
                override fun onFailure(e: TerminalException) {
                    runOnUiThread { showError("Reader discovery failed: ${e.errorMessage}") }
                }
            },
        )
    }

    private val terminalListener = object : TerminalListener {
        override fun onConnectionStatusChange(status: ConnectionStatus) {}
        override fun onPaymentStatusChange(status: PaymentStatus) {}
    }

    private val discoveryListener = object : DiscoveryListener {
        override fun onUpdateDiscoveredReaders(readers: List<Reader>) {
            val reader = readers.firstOrNull() ?: return
            if (isConnecting || Terminal.getInstance().connectedReader != null) return
            isConnecting = true
            connectReader(reader)
        }
    }

    private val tapToPayReaderListener = object : TapToPayReaderListener {
        override fun onDisconnect(reason: DisconnectReason) {}
    }

    private fun connectReader(reader: Reader) {
        runOnUiThread { showStatus("Connecting card reader…") }

        val config = ConnectionConfiguration.TapToPayConnectionConfiguration(
            terminalLocationId,
            true, // autoReconnectOnUnexpectedDisconnect
            tapToPayReaderListener,
        )
        Terminal.getInstance().connectReader(
            reader,
            config,
            object : ReaderCallback {
                override fun onSuccess(reader: Reader) {
                    runOnUiThread { viewModel.createPaymentIntent(productIds) }
                }
                override fun onFailure(e: TerminalException) {
                    isConnecting = false
                    runOnUiThread { showError("Reader connection failed: ${e.errorMessage}") }
                }
            },
        )
    }

    private fun collectPayment(clientSecret: String) {
        viewModel.onCollectingPayment()

        Terminal.getInstance().retrievePaymentIntent(
            clientSecret,
            object : PaymentIntentCallback {
                override fun onSuccess(paymentIntent: PaymentIntent) {
                    currentPaymentIntentId = paymentIntent.id
                    cancelable = Terminal.getInstance().collectPaymentMethod(
                        paymentIntent,
                        object : PaymentIntentCallback {
                            override fun onSuccess(collected: PaymentIntent) {
                                processPayment(collected)
                            }
                            override fun onFailure(e: TerminalException) {
                                if (e.errorCode == TerminalErrorCode.CANCELED) {
                                    viewModel.onCancelled()
                                } else {
                                    runOnUiThread {
                                        viewModel.onPaymentFailed(e.errorMessage ?: "Collection failed")
                                    }
                                }
                            }
                        },
                    )
                }
                override fun onFailure(e: TerminalException) {
                    runOnUiThread { showError("Retrieve failed: ${e.errorMessage}") }
                }
            },
        )
    }

    private fun processPayment(paymentIntent: PaymentIntent) {
        viewModel.onProcessingPayment()
        val itemCount = productIds.size
        Terminal.getInstance().confirmPaymentIntent(
            paymentIntent,
            object : PaymentIntentCallback {
                override fun onSuccess(confirmed: PaymentIntent) {
                    runOnUiThread {
                        viewModel.onPaymentSucceeded(
                            confirmed.id ?: currentPaymentIntentId ?: "",
                            currentPosOrderId,
                            currentTotalRappen,
                            itemCount,
                        )
                    }
                }
                override fun onFailure(e: TerminalException) {
                    runOnUiThread { viewModel.onPaymentFailed(e.errorMessage ?: "Processing failed") }
                }
            },
        )
    }

    private fun cancelPayment() {
        if (paymentMethod == "twint") {
            // No Stripe Terminal collection to cancel — just stop polling and close.
            viewModel.onCancelled()
            return
        }
        cancelable?.cancel(object : Callback {
            override fun onSuccess() {}
            override fun onFailure(e: TerminalException) {}
        })
    }

    override fun onDestroy() {
        super.onDestroy()
        // Stop reader discovery if it's still running; the connected reader is a
        // process-wide singleton and is intentionally left connected for reuse.
        discoveryCancelable?.cancel(object : Callback {
            override fun onSuccess() {}
            override fun onFailure(e: TerminalException) {}
        })
    }

    private fun navigateToSuccess(posOrderId: Int, totalRappen: Int, offline: Boolean = false) {
        val intent = Intent(this, SuccessActivity::class.java).apply {
            putExtra(SuccessActivity.EXTRA_ORDER_ID, posOrderId)
            putExtra(SuccessActivity.EXTRA_TOTAL_RAPPEN, totalRappen)
            putExtra(SuccessActivity.EXTRA_OFFLINE, offline)
        }
        startActivity(intent)
        finish()
    }

    private fun showStatus(message: String) {
        binding.txtStatus.text = message
        binding.progressBar.visibility = View.VISIBLE
        binding.imgQr.visibility = View.GONE
    }

    // Opens Stripe's TWINT hosted page in a Chrome Custom Tab so the customer
    // sees the *genuine* TWINT QR code (which the TWINT app recognises).
    // We used to render the redirect URL as a local QR, but the TWINT app
    // rejected it — Stripe's page contains the real TWINT-native payload.
    private fun showTwintQr(redirectUrl: String) {
        binding.progressBar.visibility = View.GONE
        binding.txtStatus.text = getString(R.string.twint_scan_prompt)
        binding.btnCancel.isEnabled = true
        openTwintCustomTab(redirectUrl)
    }

    private fun openTwintCustomTab(url: String) {
        val uri = Uri.parse(url)
        val customTabsIntent = CustomTabsIntent.Builder()
            .setShowTitle(true)
            .build()
        isTwintTabOpen = true
        customTabsIntent.launchUrl(this, uri)
    }

    override fun onResume() {
        super.onResume()
        // If the user closed the Chrome Custom Tab (back button / X) while the
        // TWINT payment was still in progress, treat it as a cancellation.
        if (isTwintTabOpen && viewModel.state.value is PaymentState.ShowingTwintQr) {
            isTwintTabOpen = false
            viewModel.onCancelled()
        }
    }

    // zolto multi-tenant: no baked-in location. If the store has none yet,
    // offer one-time provisioning (store address → Terminal Location on the
    // merchant's own connected Stripe account, via POST /api/pos/terminal/location).
    private fun showLocationNotConfigured() {
        binding.progressBar.visibility = View.GONE
        showProvisionDialog()
    }

    private fun showProvisionDialog() {
        val layout = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            setPadding(48, 24, 48, 0)
        }
        fun field(hintRes: Int, maxLen: Int = 64): android.widget.EditText {
            val et = android.widget.EditText(this)
            et.hint = getString(hintRes)
            et.filters = arrayOf(android.text.InputFilter.LengthFilter(maxLen))
            layout.addView(et)
            return et
        }
        val edtLine1 = field(R.string.t2p_address_line1)
        val edtCity = field(R.string.t2p_address_city)
        val edtPostal = field(R.string.t2p_address_postal, 16)
        val edtCountry = field(R.string.t2p_address_country, 2).apply {
            setText("CH")
            inputType = android.text.InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS
        }

        AlertDialog.Builder(this)
            .setTitle(getString(R.string.t2p_provision_title))
            .setMessage(getString(R.string.t2p_provision_body))
            .setView(layout)
            .setPositiveButton(getString(R.string.t2p_provision_save), null)
            .setNegativeButton(getString(R.string.cancel)) { _, _ -> finish() }
            .setCancelable(false)
            .show()
            .also { dialog ->
                dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                    val line1 = edtLine1.text.toString().trim()
                    val city = edtCity.text.toString().trim()
                    val postal = edtPostal.text.toString().trim()
                    val country = edtCountry.text.toString().trim().uppercase()
                    if (line1.isEmpty() || city.isEmpty() || postal.isEmpty() || country.length != 2) {
                        showError("Fill in all address fields (country = 2-letter code, e.g. CH)")
                        return@setOnClickListener
                    }
                    dialog.dismiss()
                    provisionLocation(line1, city, postal, country)
                }
            }
    }

    private fun provisionLocation(line1: String, city: String, postal: String, country: String) {
        showStatus("Enabling card payments…")
        lifecycleScope.launch {
            try {
                val res = RetrofitClient.apiService.provisionLocation(
                    ch.zolto.pos.data.models.LocationProvisionRequest(
                        displayName = "Zolto POS",
                        address = ch.zolto.pos.data.models.LocationProvisionRequest.Address(
                            line1 = line1, city = city, postalCode = postal, country = country,
                        ),
                    ),
                )
                terminalLocationId = res.locationId
                initTerminalAndDiscover()
            } catch (e: Exception) {
                showError("Couldn't enable card payments: ${e.message ?: e.javaClass.simpleName}")
            }
        }
    }

    private fun showError(message: String) {
        binding.progressBar.visibility = View.GONE
        binding.imgQr.visibility = View.GONE
        AlertDialog.Builder(this)
            .setTitle(getString(R.string.payment_failed_title))
            .setMessage(message)
            .setPositiveButton(getString(R.string.try_again)) { _, _ ->
                viewModel.reset()
                startForMethod()
            }
            .setNegativeButton(getString(R.string.cancel)) { _, _ -> finish() }
            .show()
    }
}
