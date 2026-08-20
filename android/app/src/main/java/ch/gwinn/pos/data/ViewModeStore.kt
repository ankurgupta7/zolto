package ch.gwinn.pos.data

import android.content.Context
import ch.gwinn.pos.logic.ViewModePreference

/**
 * Where the product picker's layout choice is kept between launches.
 *
 * An interface rather than a direct SharedPreferences call so ProductViewModel
 * stays constructible in a plain JVM unit test.
 */
interface ViewModeStore {
    fun read(): String?

    fun write(value: String)

    /** No storage at all — the picker always opens in the default layout. */
    object None : ViewModeStore {
        override fun read(): String? = null

        override fun write(value: String) = Unit
    }
}

class SharedPrefsViewModeStore(context: Context) : ViewModeStore {
    private val prefs = context.applicationContext
        .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    override fun read(): String? = prefs.getString(ViewModePreference.STORAGE_KEY, null)

    override fun write(value: String) {
        prefs.edit().putString(ViewModePreference.STORAGE_KEY, value).apply()
    }

    companion object {
        const val PREFS_NAME = "pos_ui_prefs"
    }
}
