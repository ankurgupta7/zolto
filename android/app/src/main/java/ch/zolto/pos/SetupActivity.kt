package ch.zolto.pos

import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import ch.zolto.pos.data.PosConfig
import ch.zolto.pos.data.RetrofitClient
import ch.zolto.pos.databinding.ActivitySetupBinding
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * First-launch store binding — zolto is multi-tenant, so each register must
 * be pointed at its store once: the zolto deployment URL plus the store's POS
 * API key (from Admin → Plan & Billing / POS settings). Verified against
 * GET /api/pos/health before saving so a typo fails here, not mid-sale.
 */
class SetupActivity : AppCompatActivity() {

    private lateinit var binding: ActivitySetupBinding
    private val scope = CoroutineScope(Dispatchers.Main)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySetupBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Pre-fill from secrets.xml defaults when a dev build bakes them in.
        val defaultUrl = getString(R.string.pos_api_base_url)
        if (defaultUrl.isNotBlank() && !defaultUrl.contains("your-")) {
            binding.edtBaseUrl.setText(defaultUrl)
        }

        binding.btnConnect.setOnClickListener { tryConnect() }
    }

    private fun tryConnect() {
        val baseUrl = binding.edtBaseUrl.text.toString().trim().trimEnd('/')
        val apiKey = binding.edtApiKey.text.toString().trim()
        if (baseUrl.isBlank() || apiKey.isBlank()) {
            toast("Enter both the server URL and your POS key")
            return
        }
        if (!baseUrl.startsWith("https://") && !baseUrl.startsWith("http://")) {
            toast("The server URL must start with https://")
            return
        }

        binding.btnConnect.isEnabled = false
        binding.btnConnect.text = getString(R.string.setup_checking)
        scope.launch {
            val ok = withContext(Dispatchers.IO) {
                try {
                    RetrofitClient.init(baseUrl, apiKey)
                    RetrofitClient.apiService.health().ok
                } catch (_: Exception) {
                    false
                }
            }
            if (ok) {
                PosConfig.save(this@SetupActivity, baseUrl, apiKey)
                startActivity(android.content.Intent(this@SetupActivity, MainActivity::class.java))
                finish()
            } else {
                binding.btnConnect.isEnabled = true
                binding.btnConnect.text = getString(R.string.setup_connect)
                toast("Couldn't reach the store — check the URL and POS key")
            }
        }
    }

    private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_LONG).show()
}
