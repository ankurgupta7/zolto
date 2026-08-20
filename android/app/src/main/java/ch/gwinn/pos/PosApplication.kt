package ch.gwinn.pos

import android.app.Application
import androidx.work.Configuration
import androidx.work.WorkManager
import com.stripe.stripeterminal.TerminalApplicationDelegate

/**
 * Application entry point.
 *
 * The Stripe Terminal SDK requires [TerminalApplicationDelegate.onCreate] to be
 * called from the hosting [Application] so it can register the lifecycle and
 * memory callbacks it relies on. Registered via `android:name` in the manifest.
 *
 * WorkManager is initialized for background offline payment sync.
 */
class PosApplication : Application(), Configuration.Provider {
    override fun onCreate() {
        super.onCreate()
        TerminalApplicationDelegate.onCreate(this)
    }

    // Required for custom WorkManager configuration (enables on-demand init).
    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setMinimumLoggingLevel(android.util.Log.INFO)
            .build()
}
