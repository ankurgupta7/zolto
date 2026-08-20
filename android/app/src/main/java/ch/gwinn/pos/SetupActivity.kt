package ch.gwinn.pos

import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import ch.gwinn.pos.data.PosConfig
import ch.gwinn.pos.data.RetrofitClient
import ch.gwinn.pos.data.models.PairingRequest
import ch.gwinn.pos.databinding.ActivitySetupBinding
import ch.gwinn.pos.logic.PairingLink
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * First-launch store binding — gwinn is multi-tenant, so each register must
 * be pointed at its store once: the gwinn deployment URL plus the store's POS
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

        // One-tap pairing: launched by tapping `gwinn://pair?t=…` in the store
        // admin. Skips this form entirely — nobody types 64 hex characters into a
        // phone at a market stall if they don't have to.
        PairingLink.parse(intent?.dataString)?.let { pairByLink(it) }
    }

    /** Also fires when the activity is already open and a second link arrives. */
    override fun onNewIntent(intent: android.content.Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        PairingLink.parse(intent?.dataString)?.let { pairByLink(it) }
    }

    /**
     * Redeem a pairing token, then verify the key it returned before saving.
     *
     * The health check is not ceremony: the token is single-use, so if the key
     * turns out not to work we must not have already overwritten a working
     * pairing with it. Save only once the store answers.
     */
    private fun pairByLink(link: PairingLink.Parsed) {
        binding.btnConnect.isEnabled = false
        binding.btnConnect.text = getString(R.string.setup_checking)
        binding.edtBaseUrl.setText(link.baseUrl)

        scope.launch {
            val key = withContext(Dispatchers.IO) {
                try {
                    RetrofitClient.pairingService(link.baseUrl)
                        .redeemPairing(PairingRequest(link.token))
                        .apiKey
                        .takeIf { it.isNotBlank() }
                } catch (_: Exception) {
                    null
                }
            }

            val verified = key != null && withContext(Dispatchers.IO) {
                try {
                    RetrofitClient.init(link.baseUrl, key)
                    RetrofitClient.apiService.health().ok
                } catch (_: Exception) {
                    false
                }
            }

            if (verified && key != null) {
                PosConfig.save(this@SetupActivity, link.baseUrl, key)
                startActivity(android.content.Intent(this@SetupActivity, MainActivity::class.java))
                finish()
            } else {
                binding.btnConnect.isEnabled = true
                binding.btnConnect.text = getString(R.string.setup_connect)
                // Vague on purpose, mirroring the server: the link is spent
                // either way, so the only useful instruction is "get a new one".
                toast(getString(R.string.setup_pairing_link_failed))
            }
        }
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
