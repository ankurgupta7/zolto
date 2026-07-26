plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    // Declared here (apply false) so the Kotlin plugin version is managed in one
    // place; the :logic module applies it without re-requesting a version, which
    // otherwise clashes with the Kotlin plugin already on the classpath.
    alias(libs.plugins.kotlin.jvm) apply false
}
