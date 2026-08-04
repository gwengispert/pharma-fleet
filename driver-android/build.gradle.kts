// Top-level build file — declares plugin versions once, applied per-module
// in app/build.gradle.kts. Versions below were checked against Google's
// Driver SDK for Android release notes (v7.1.0, May 2026) at scaffold time —
// re-check https://developers.google.com/maps/documentation/mobility/services/resources/relnotes_driver_sdk_android
// if it's been a while, and let Android Studio's own upgrade suggestions
// win over these on first sync.
plugins {
    id("com.android.application") version "8.13.2" apply false
    id("org.jetbrains.kotlin.android") version "2.3.0" apply false
    id("com.google.android.libraries.mapsplatform.secrets-gradle-plugin") version "2.0.0" apply false
}
