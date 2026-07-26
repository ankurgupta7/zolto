package ch.zolto.pos.data

import android.content.Context
import android.content.SharedPreferences

/**
 * Runtime POS configuration — which zolto deployment + which store (tenant)
 * this register belongs to. Unlike the single-tenant build (which baked one
 * store's URL + key into the APK via secrets.xml), zolto is multi-tenant:
 * every merchant's register is configured on first launch via SetupActivity
 * and stored here. A secrets.xml string pair, when present, only seeds the
 * initial defaults (useful for dev builds).
 */
object PosConfig {

    private const val PREFS = "zolto_pos_config"
    private const val KEY_BASE_URL = "base_url"
    private const val KEY_API_KEY = "api_key"

    private fun prefs(context: Context): SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun isConfigured(context: Context): Boolean =
        !baseUrl(context).isNullOrBlank() && !apiKey(context).isNullOrBlank()

    fun baseUrl(context: Context): String? =
        prefs(context).getString(KEY_BASE_URL, null)?.trimEnd('/')

    fun apiKey(context: Context): String? =
        prefs(context).getString(KEY_API_KEY, null)

    fun save(context: Context, baseUrl: String, apiKey: String) {
        prefs(context).edit()
            .putString(KEY_BASE_URL, baseUrl.trim().trimEnd('/'))
            .putString(KEY_API_KEY, apiKey.trim())
            .apply()
    }

    /** Sign out / re-point this register at another store. */
    fun clear(context: Context) {
        prefs(context).edit().clear().apply()
    }
}
