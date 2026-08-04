package com.pharmafleet.driver

// AuthTokenFactory is a nested interface on AuthTokenContext (not top-level
// as originally guessed) — confirmed via Android Studio, hence the qualified
// `AuthTokenContext.AuthTokenFactory` supertype below instead of a separate
// import.
import com.google.android.libraries.mapsplatform.transportation.driver.api.base.data.AuthTokenContext
import java.time.Instant
import java.util.concurrent.TimeUnit

// Fetches a Fleet Engine bearer token from our own backend
// (GET /api/fleet-engine/token?vehicleId=...) rather than signing a JWT on
// device. See app/api/fleet-engine/token/route.js's comments for why: this
// token carries the backend service account's full deliveryAdmin scope, not
// a claim scoped to just this vehicle — a deliberate demo-grade trade-off,
// not an oversight here.
//
// getToken() is documented as running on the Driver SDK's own dedicated
// location-update thread and is allowed to block, so a synchronous OkHttp
// call here (via ApiClient) is intentional, not a bug.
class FleetEngineAuthTokenFactory(private val apiClient: ApiClient) :
    AuthTokenContext.AuthTokenFactory {
    private var cachedToken: String? = null
    private var cachedForVehicleId: String? = null
    private var expiryEpochMs: Long = 0

    // Refresh this long before actual expiry so a request already in flight
    // never races a token that just expired underneath it.
    private val refreshSlackMs = TimeUnit.MINUTES.toMillis(10)

    override fun getToken(context: AuthTokenContext): String {
        // AuthTokenContext.vehicleId is nullable at the type level (it's a
        // shared context type across auth scenarios) even though it's always
        // populated for our single-vehicle use — Google's own Java sample for
        // this exact interface does the same requireNonNull-style check.
        val vehicleId = requireNotNull(context.vehicleId) { "AuthTokenContext had no vehicleId" }
        val now = System.currentTimeMillis()
        val token = cachedToken
        if (token != null && vehicleId == cachedForVehicleId && now < expiryEpochMs - refreshSlackMs) {
            return token
        }
        val fresh = apiClient.getFleetEngineToken(vehicleId)
        cachedToken = fresh.token
        cachedForVehicleId = vehicleId
        expiryEpochMs = Instant.parse(fresh.expiration).toEpochMilli()
        return fresh.token
    }
}
