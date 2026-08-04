package com.pharmafleet.driver

import android.app.Application
// VERIFY IN ANDROID STUDIO: DeliveryDriverApi's exact sub-package was a
// guess (transportation.driver.api.delivery) — DeliveryVehicleReporter
// turned out to live one level deeper, in .delivery.vehiclereporter, so
// DeliveryDriverApi's may too. If it's still unresolved, Option+Return on it
// for the real path the same way.
import com.google.android.libraries.mapsplatform.transportation.driver.api.base.data.DriverContext
import com.google.android.libraries.mapsplatform.transportation.driver.api.delivery.DeliveryDriverApi
import com.google.android.libraries.mapsplatform.transportation.driver.api.delivery.vehiclereporter.DeliveryVehicleReporter
import com.google.android.libraries.navigation.NavigationApi
import com.google.android.libraries.navigation.Navigator

// Wires the Driver SDK to Fleet Engine and starts/stops real GPS reporting
// for one vehicle.
//
// No turn-by-turn UI is shown anywhere in this app, but the Navigation SDK
// is still a hard dependency: DeliveryVehicleReporter (this SDK's
// location-reporting object) extends the Navigation SDK's
// NavigationVehicleReporter, so DriverContext can't be built without a live
// Navigator — confirmed via Google's DriverContext.builder() reference,
// which requires setNavigator(). This also means the Navigation SDK's own
// terms-of-use prompt (triggered by NavigationApi.getNavigator) will appear
// on first run even though navigation itself is never displayed.
class DriverLocationReporter(private val application: Application) {

    private var navigator: Navigator? = null
    private var reporter: DeliveryVehicleReporter? = null

    // Call only after ACCESS_FINE_LOCATION has been granted.
    fun start(
        providerId: String,
        vehicleId: String,
        authTokenFactory: FleetEngineAuthTokenFactory,
        onReady: () -> Unit,
        onError: (Throwable) -> Unit,
    ) {
        NavigationApi.getNavigator(application, object : NavigationApi.NavigatorListener {
            override fun onNavigatorReady(nav: Navigator) {
                navigator = nav
                // Genuinely nullable (not just an unannotated Java platform
                // type) — can return null if called before the Navigation
                // SDK's location plumbing has finished initializing, so this
                // is worth failing loudly on rather than force-unwrapping.
                val roadSnappedLocationProvider = NavigationApi.getRoadSnappedLocationProvider(application)
                if (roadSnappedLocationProvider == null) {
                    onError(IllegalStateException("Road-snapped location provider unavailable"))
                    return
                }
                val driverContext = DriverContext.builder(application)
                    .setProviderId(providerId)
                    .setVehicleId(vehicleId)
                    .setAuthTokenFactory(authTokenFactory)
                    .setNavigator(nav)
                    .setRoadSnappedLocationProvider(roadSnappedLocationProvider)
                    .build()

                val vehicleReporter = DeliveryDriverApi.createInstance(driverContext).deliveryVehicleReporter
                reporter = vehicleReporter
                // Unlike the on-demand/rideshare Driver SDK, DeliveryVehicleReporter
                // has no separate setVehicleState(ONLINE/OFFLINE) — online/offline
                // is governed entirely by enable/disableLocationTracking() (the
                // latter sends one final update marking the vehicle offline itself).
                vehicleReporter.enableLocationTracking()
                onReady()
            }

            override fun onError(errorCode: Int) {
                onError(IllegalStateException("Navigator init failed: error code $errorCode"))
            }
        })
    }

    fun stop() {
        reporter?.disableLocationTracking()
        reporter = null
        navigator = null
    }
}
