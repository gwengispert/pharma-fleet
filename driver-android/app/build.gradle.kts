import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.android.libraries.mapsplatform.secrets-gradle-plugin")
}

secrets {
    propertiesFileName = "local.properties"
    defaultPropertiesFileName = "local.defaults.properties"
}

android {
    namespace = "com.pharmafleet.driver"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.pharmafleet.driver"
        // Per Driver SDK for Android v7.0.0 release notes (minSdkVersion
        // raised to API 26, targetSdkVersion to API 36) — confirmed at
        // scaffold time, May 2026.
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"

        // Not a secret — same value as the backend's FLEET_ENGINE_PROVIDER_ID
        // in .env.local (the GCP project Google has allowlisted for Fleet
        // Engine's Delivery API). Keep these in sync.
        buildConfigField("String", "FLEET_ENGINE_PROVIDER_ID", "\"mobility-partner-access\"")
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        debug {
            // 10.0.2.2 is the Android emulator's alias for its host machine's
            // loopback — reaches `npm run dev`'s localhost:3000 directly. For
            // a physical device on the same network, override with your
            // machine's LAN IP; add a `backendBaseUrlDebug=http://<lan-ip>:3000`
            // line to (gitignored) local.properties and wire it through here
            // if you need that regularly.
            buildConfigField("String", "BACKEND_BASE_URL", "\"http://10.0.2.2:3000\"")
        }
        release {
            isMinifyEnabled = false
            // Point this at the deployed Cloud Run URL before shipping.
            buildConfigField("String", "BACKEND_BASE_URL", "\"https://CHANGE-ME.run.app\"")
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
        // Required by the Navigation SDK dependency (uses Java 8+ APIs
        // internally) — the AAR metadata check fails without this even
        // though minSdk 26 already natively supports most Java 8 language
        // features; desugaring covers the library APIs, not just syntax.
        isCoreLibraryDesugaringEnabled = true
    }
}

// Kotlin Gradle Plugin 2.1+ (we pin 2.3.0, see the root build.gradle.kts)
// hard-errors on the old android { kotlinOptions { jvmTarget = "11" } }
// string-based DSL — this is the current typed replacement, set via the
// `kotlin` extension the org.jetbrains.kotlin.android plugin registers.
kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_11)
    }
}

dependencies {
    // --- Fleet Engine Driver SDK (Last Mile / "scheduled tasks" product line
    // — matches lib/fleetEngine.server.js's DeliveryVehicle/Task calls, NOT
    // the "on-demand trips" Rideshare Driver SDK, which is a different
    // artifact/class set). Version confirmed against the official release
    // notes page at scaffold time (May 2026); re-check before bumping:
    // https://developers.google.com/maps/documentation/mobility/services/resources/relnotes_driver_sdk_android
    implementation("com.google.android.libraries.mapsplatform.transportation:transportation-driver:7.1.0")

    // Required transitively by the Driver SDK even though this app shows no
    // turn-by-turn UI — DeliveryVehicleReporter extends the Navigation SDK's
    // NavigationVehicleReporter, so a live Navigator is needed to build a
    // DriverContext at all. Must stay within the Driver SDK's documented
    // supported range ([7.0, 8.0) per the 7.1.0 release notes) — check both
    // SDKs' release notes together before bumping either one independently.
    implementation("com.google.android.libraries.navigation:navigation:7.0.0")

    // Talks to the existing pharma-fleet Next.js REST API — plain OkHttp +
    // org.json rather than Retrofit/Moshi, since the API surface here is
    // small and this avoids pulling in a second serialization framework.
    implementation("com.squareup.okhttp3:okhttp:5.1.0")

    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("com.google.android.material:material:1.12.0")

    // MapActivity's `com.google.android.gms.maps.*` imports (GoogleMap,
    // SupportMapFragment, etc.) are already satisfied transitively by the
    // Navigation SDK above — it bundles the entire Maps SDK internally.
    // A separate play-services-maps dependency was tried here and removed:
    // it caused checkDebugDuplicateClasses to fail with the whole
    // com.google.android.gms.maps package duplicated between the two AARs.
    // Reuses the same MAPS_API_KEY meta-data entry in the manifest either way.

    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")
}
