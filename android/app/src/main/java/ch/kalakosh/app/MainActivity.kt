package ch.kalakosh.app

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Bundle
import android.view.View
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.addCallback
import androidx.appcompat.app.AppCompatActivity
import ch.kalakosh.app.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private val homeUrl = "https://kalakosh.ch"
    private var hasError = false

    private val connectivityManager by lazy {
        getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    }

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            if (hasError) runOnUiThread { loadUrl() }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupWebView()
        setupBackNavigation()
        registerNetworkCallback()
        loadUrl()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        binding.webView.apply {
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                loadWithOverviewMode = true
                useWideViewPort = true
                setSupportZoom(false)
                builtInZoomControls = false
                displayZoomControls = false
                mediaPlaybackRequiresUserGesture = false
            }
            webViewClient = KalakoshWebViewClient()
        }

        binding.swipeRefresh.apply {
            setOnRefreshListener { loadUrl() }
            setColorSchemeColors(getColor(R.color.black))
        }

        binding.btnRetry.setOnClickListener { loadUrl() }
    }

    private fun setupBackNavigation() {
        onBackPressedDispatcher.addCallback(this) {
            if (binding.webView.canGoBack()) {
                binding.webView.goBack()
            } else {
                isEnabled = false
                onBackPressedDispatcher.onBackPressed()
            }
        }
    }

    private fun loadUrl() {
        hasError = false
        showSplash()
        binding.webView.loadUrl(homeUrl)
    }

    private fun showSplash() {
        binding.swipeRefresh.isEnabled = false
        binding.splashView.visibility = View.VISIBLE
        binding.errorView.visibility = View.GONE
    }

    private fun showError(offline: Boolean) {
        hasError = true
        binding.swipeRefresh.isRefreshing = false
        binding.swipeRefresh.isEnabled = false
        binding.splashView.visibility = View.GONE
        binding.errorView.visibility = View.VISIBLE
        binding.tvErrorDetail.text = getString(
            if (offline) R.string.error_offline else R.string.error_generic
        )
    }

    private fun showContent() {
        binding.swipeRefresh.isRefreshing = false
        binding.swipeRefresh.isEnabled = true
        binding.splashView.visibility = View.GONE
        binding.errorView.visibility = View.GONE
    }

    private fun isOffline(): Boolean {
        val network = connectivityManager.activeNetwork ?: return true
        val caps = connectivityManager.getNetworkCapabilities(network) ?: return true
        return !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private fun registerNetworkCallback() {
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        connectivityManager.registerNetworkCallback(request, networkCallback)
    }

    override fun onDestroy() {
        super.onDestroy()
        connectivityManager.unregisterNetworkCallback(networkCallback)
    }

    inner class KalakoshWebViewClient : WebViewClient() {
        override fun onPageFinished(view: WebView?, url: String?) {
            // WebView fires onPageFinished even for a failed main-frame navigation,
            // since it treats rendering its own error interstitial as "finished".
            // Without this guard that clobbers the branded error overlay we just
            // showed and reveals Chromium's raw error page underneath.
            if (!hasError) {
                showContent()
            }
        }

        override fun onReceivedError(
            view: WebView?,
            request: WebResourceRequest?,
            error: WebResourceError?
        ) {
            if (request?.isForMainFrame == true) {
                showError(isOffline())
            }
        }

        override fun onReceivedHttpError(
            view: WebView?,
            request: WebResourceRequest?,
            errorResponse: WebResourceResponse?
        ) {
            if (request?.isForMainFrame == true && (errorResponse?.statusCode ?: 0) >= 500) {
                showError(false)
            }
        }

        // Open external links (WhatsApp, Instagram, etc.) in the default browser
        override fun shouldOverrideUrlLoading(
            view: WebView?,
            request: WebResourceRequest?
        ): Boolean {
            val url = request?.url ?: return false
            return if (url.host?.contains("kalakosh.ch") == true) {
                false
            } else {
                startActivity(Intent(Intent.ACTION_VIEW, url))
                true
            }
        }
    }
}
