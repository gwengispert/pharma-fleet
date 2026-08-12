// Top-level build file — declares plugin versions once, applied per-module
// in app/build.gradle.kts. Versions below were checked against Google's
// Driver SDK for Android release notes (v7.1.0, May 2026) at scaffold time —
// re-check https://developers.google.com/maps/documentation/mobility/services/resources/relnotes_driver_sdk_android
// if it's been a while, and let Android Studio's own upgrade suggestions
// win over these on first sync.
// AGP 9.0+ has built-in Kotlin support (see gradle.properties'
// android.builtInKotlin / android.newDsl defaults), so the separate
// org.jetbrains.kotlin.android plugin is no longer applied here — AGP now
// carries a runtime dependency on the Kotlin Gradle plugin itself.
plugins {
    id("com.android.application") version "9.3.1" apply false
    id("com.google.android.libraries.mapsplatform.secrets-gradle-plugin") version "2.0.0" apply false
}
