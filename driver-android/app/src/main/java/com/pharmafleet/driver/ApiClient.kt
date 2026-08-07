package com.pharmafleet.driver

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

data class Driver(val id: String, val name: String, val vehicleId: String?)

data class Delivery(
    val id: String,
    val customerName: String,
    val address: String,
    val status: String,
    // Nullable — lib/store.js allows a delivery to exist before it's been
    // geocoded (see createDelivery's `data.lat ?? null`). In practice any
    // delivery that's made it into an optimized route has both set, but the
    // type doesn't promise it.
    val lat: Double?,
    val lng: Double?,
)

data class Route(val vehicleId: String, val deliveryIds: List<String>)

data class FleetEngineToken(val token: String, val expiration: String)

class ApiException(message: String) : Exception(message)

// Talks to the existing pharma-fleet Next.js REST API — the same endpoints
// and join logic app/driver/page.js already uses (drivers -> vehicleId ->
// routes[vehicleId] -> deliveryIds -> deliveries), so this app is an
// alternative frontend on the same backend, not a separate one. All calls
// are synchronous/blocking; call from a background dispatcher.
class ApiClient(private val baseUrl: String) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()
    private val jsonMediaType = "application/json".toMediaType()

    private fun get(path: String): String {
        val request = Request.Builder().url(baseUrl + path).get().build()
        client.newCall(request).execute().use { response ->
            val bodyString = response.body.string()
            if (!response.isSuccessful) throw ApiException("$path failed: ${response.code} $bodyString")
            return bodyString
        }
    }

    private fun patch(path: String, body: JSONObject): String {
        val request = Request.Builder()
            .url(baseUrl + path)
            .patch(body.toString().toRequestBody(jsonMediaType))
            .build()
        client.newCall(request).execute().use { response ->
            val bodyString = response.body.string()
            if (!response.isSuccessful) throw ApiException("$path failed: ${response.code} $bodyString")
            return bodyString
        }
    }

    fun getDrivers(): List<Driver> {
        val arr = JSONArray(get("/api/drivers"))
        return (0 until arr.length()).map { i ->
            val o = arr.getJSONObject(i)
            Driver(o.getString("id"), o.getString("name"), o.optStringOrNull("vehicleId"))
        }
    }

    fun getDeliveries(): List<Delivery> {
        val arr = JSONArray(get("/api/deliveries"))
        return (0 until arr.length()).map { i ->
            val o = arr.getJSONObject(i)
            Delivery(
                id = o.getString("id"),
                customerName = o.getString("customerName"),
                address = o.getString("address"),
                status = o.getString("status"),
                lat = o.optDoubleOrNull("lat"),
                lng = o.optDoubleOrNull("lng"),
            )
        }
    }

    // GET /api/routes returns a JSON *object* keyed by vehicleId
    // (see app/api/routes/route.js: NextResponse.json(getState().routes)),
    // not an array — mirrored here rather than assumed.
    fun getRoutes(): Map<String, Route> {
        val obj = JSONObject(get("/api/routes"))
        return obj.keys().asSequence().associateWith { vehicleId ->
            val r = obj.getJSONObject(vehicleId)
            val ids = r.getJSONArray("deliveryIds")
            Route(vehicleId, (0 until ids.length()).map { ids.getString(it) })
        }
    }

    // Mirrors app/driver/page.js's markDelivered(): PATCH status="delivered".
    // The backend's app/api/deliveries/[id]/route.js best-effort-syncs this
    // to Fleet Engine's closeTask() server-side — nothing extra needed here.
    fun markDelivered(deliveryId: String) {
        patch("/api/deliveries/$deliveryId", JSONObject().put("status", "delivered"))
    }

    fun getFleetEngineToken(vehicleId: String): FleetEngineToken {
        val body = JSONObject(get("/api/fleet-engine/token?vehicleId=$vehicleId"))
        if (body.has("error")) throw ApiException(body.getString("error"))
        return FleetEngineToken(body.getString("token"), body.getString("expiration"))
    }
}

private fun JSONObject.optStringOrNull(name: String): String? =
    if (!has(name) || isNull(name)) null else getString(name)

private fun JSONObject.optDoubleOrNull(name: String): Double? =
    if (!has(name) || isNull(name)) null else getDouble(name)
