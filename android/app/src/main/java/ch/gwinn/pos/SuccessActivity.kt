package ch.gwinn.pos

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import ch.gwinn.pos.data.PosSession
import ch.gwinn.pos.data.RetrofitClient
import ch.gwinn.pos.data.models.SaveReceiptRequest
import ch.gwinn.pos.data.models.SendReceiptRequest
import ch.gwinn.pos.databinding.ActivitySuccessBinding
import kotlinx.coroutines.launch

class SuccessActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_ORDER_ID = "extra_order_id"
        const val EXTRA_TOTAL_RAPPEN = "extra_total_rappen"
        const val EXTRA_OFFLINE = "extra_offline"
    }

    private lateinit var binding: ActivitySuccessBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySuccessBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val orderId = intent.getIntExtra(EXTRA_ORDER_ID, -1)
        val offline = intent.getBooleanExtra(EXTRA_OFFLINE, false)

        // Load receipt HTML from backend
        val baseUrl = RetrofitClient.getBaseUrl()
        val receiptUrl = "$baseUrl/api/pos/receipt/$orderId"
        binding.receiptWebview.apply {
            settings.javaScriptEnabled = false
            webViewClient = WebViewClient()
            loadUrl(receiptUrl)
        }

        binding.txtOfflineNote.visibility = if (offline) View.VISIBLE else View.GONE

        binding.btnDone.setOnClickListener {
            saveReceiptAndReturn(orderId)
        }

        binding.btnSendReceipt.setOnClickListener {
            sendReceipt(orderId)
        }
    }

    private fun sendReceipt(posOrderId: Int) {
        val email = binding.edtReceiptEmail.text.toString().trim()
        if (email.isEmpty()) {
            showError("Enter an email address")
            return
        }

        binding.btnSendReceipt.isEnabled = false
        binding.btnSendReceipt.text = "Sending…"
        hideError()

        lifecycleScope.launch {
            try {
                val api = RetrofitClient.apiService
                val response = api.sendReceipt(
                    SendReceiptRequest(
                        posOrderId = posOrderId,
                        customerEmail = email,
                        customerPhone = binding.edtReceiptPhone.text.toString().trim().ifEmpty { null }
                    )
                )
                if (response.success) {
                    binding.txtReceiptSent.visibility = View.VISIBLE
                    binding.btnSendReceipt.text = "Sent"
                } else {
                    showError("Failed to send")
                    binding.btnSendReceipt.isEnabled = true
                    binding.btnSendReceipt.text = getString(R.string.send_receipt)
                }
            } catch (e: Exception) {
                showError("Failed to send receipt")
                binding.btnSendReceipt.isEnabled = true
                binding.btnSendReceipt.text = getString(R.string.send_receipt)
            }
        }
    }

    private fun saveReceiptAndReturn(posOrderId: Int) {
        lifecycleScope.launch {
            try {
                val api = RetrofitClient.apiService
                api.saveReceipt(
                    SaveReceiptRequest(
                        posOrderId = posOrderId,
                        customerEmail = binding.edtReceiptEmail.text.toString().trim().ifEmpty { null },
                        customerPhone = binding.edtReceiptPhone.text.toString().trim().ifEmpty { null }
                    )
                )
            } catch (_: Exception) {
                // Ignore S3 save failures — the order is already recorded
            }
            returnToMain()
        }
    }

    private fun showError(message: String) {
        binding.txtReceiptError.text = message
        binding.txtReceiptError.visibility = View.VISIBLE
    }

    private fun hideError() {
        binding.txtReceiptError.visibility = View.GONE
    }

    private fun returnToMain() {
        PosSession.clearCart()
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        startActivity(intent)
        finish()
    }
}
