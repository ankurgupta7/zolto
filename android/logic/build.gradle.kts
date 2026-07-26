plugins {
    // Version comes from the root project's plugin management (single source),
    // avoiding an "already on the classpath" clash with the Kotlin plugin.
    alias(libs.plugins.kotlin.jvm)
}

// Repositories are declared centrally in settings.gradle.kts
// (dependencyResolutionManagement with FAIL_ON_PROJECT_REPOS), so this module
// must not add its own.

dependencies {
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.9.0")
    testImplementation(kotlin("test"))
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.9.0")
}

tasks.test {
    useJUnitPlatform()
}

kotlin {
    jvmToolchain(17)
}
