package com.pharmafleet.driver

import com.google.android.gms.maps.model.LatLng
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

// The configured warehouse/depot location (settings.depotLat/depotLng in
// lib/store.js) — null until an admin sets a depot address.
data class DepotLocation(val lat: Double?, val lng: Double?)

// One maneuver on a drive's leg, for the navigation header: it happens when
// the vehicle reaches `startProgress` (0-1 along the leg). `maneuver` is a
// Directions API maneuver type ("turn-left", "ramp-right", …), "arrive" for
// the last step, or null for continue/head.
data class NavStep(val instruction: String, val maneuver: String?, val startProgress: Double)

// One leg of a vehicle's shared simulated drive (lib/driveSimulation.server.js
// on the backend): the road path from the depot / previous stop to
// `deliveryId`, the real-world leg, and its playback state — progress
// `anchorProgress` at server time `anchorAt`, advancing `speed`x real time.
data class Drive(
    val vehicleId: String,
    val deliveryId: String,
    val stopIndex: Int,
    val path: List<LatLng>,
    val startedAt: Long,
    val realDurationSeconds: Long,
    val distanceMeters: Long,
    val speed: Double,
    val anchorAt: Long,
    val anchorProgress: Double,
    val steps: List<NavStep>,
) {
    // Same formula as the backend's progressAt().
    fun progressAt(serverNow: Long): Double {
        val advanced = (serverNow - anchorAt) * speed / (realDurationSeconds * 1000.0)
        return (anchorProgress + advanced).coerceIn(0.0, 1.0)
    }
}

// `serverNow` lets the caller correct for the device clock differing from
// the backend's before interpolating the vehicle's position. `speed` is the
// vehicle's chosen playback speed (one of `speeds`), even between drives.
data class DriveState(val drive: Drive?, val serverNow: Long, val speed: Double, val speeds: List<Double>)

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

    private fun post(path: String, body: JSONObject): String {
        val request = Request.Builder()
            .url(baseUrl + path)
            .post(body.toString().toRequestBody(jsonMediaType))
            .build()
        client.newCall(request).execute().use { response ->
            val bodyString = response.body.string()
            if (!response.isSuccessful) {
                val message = runCatching { JSONObject(bodyString).getString("error") }.getOrNull()
                throw ApiException(message ?: "$path failed: ${response.code} $bodyString")
            }
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

    fun getDepot(): DepotLocation {
        val o = JSONObject(get("/api/settings"))
        return DepotLocation(o.optDoubleOrNull("depotLat"), o.optDoubleOrNull("depotLng"))
    }

    // The same shared drive the web driver view and admin map follow — see
    // app/api/simulation/drive/route.js.
    fun getDrive(vehicleId: String): DriveState =
        parseDriveState(JSONObject(get("/api/simulation/drive?vehicleId=$vehicleId")))

    fun startDrive(vehicleId: String, deliveryId: String): DriveState =
        parseDriveState(
            JSONObject(
                post("/api/simulation/drive", JSONObject().put("vehicleId", vehicleId).put("deliveryId", deliveryId)),
            ),
        )

    // Changes the vehicle's playback speed (current drive and next legs).
    fun setDriveSpeed(vehicleId: String, speed: Double): DriveState =
        parseDriveState(JSONObject(patch("/api/simulation/drive", JSONObject().put("vehicleId", vehicleId).put("speed", speed))))

    // Jumps the current drive straight to its destination stop.
    fun skipDrive(vehicleId: String): DriveState =
        parseDriveState(JSONObject(patch("/api/simulation/drive", JSONObject().put("vehicleId", vehicleId).put("skip", true))))

    private fun parseDriveState(o: JSONObject): DriveState {
        val d = if (o.isNull("drive")) null else o.getJSONObject("drive")
        val drive = d?.let {
            val pathArr = it.getJSONArray("path")
            Drive(
                vehicleId = it.getString("vehicleId"),
                deliveryId = it.getString("deliveryId"),
                stopIndex = it.getInt("stopIndex"),
                path = (0 until pathArr.length()).map { i ->
                    val p = pathArr.getJSONArray(i)
                    LatLng(p.getDouble(0), p.getDouble(1))
                },
                startedAt = it.getLong("startedAt"),
                realDurationSeconds = it.getLong("realDurationSeconds"),
                distanceMeters = it.optLong("distanceMeters", 0),
                speed = it.getDouble("speed"),
                anchorAt = it.getLong("anchorAt"),
                anchorProgress = it.getDouble("anchorProgress"),
                steps = it.optJSONArray("steps")?.let { arr ->
                    (0 until arr.length()).map { i ->
                        val step = arr.getJSONObject(i)
                        NavStep(step.getString("instruction"), step.optStringOrNull("maneuver"), step.getDouble("startProgress"))
                    }
                } ?: emptyList(),
            )
        }
        val speedsArr = o.optJSONArray("speeds")
        return DriveState(
            drive = drive,
            serverNow = o.getLong("serverNow"),
            speed = o.optDouble("speed", 1.0),
            speeds = if (speedsArr == null) listOf(1.0) else (0 until speedsArr.length()).map { speedsArr.getDouble(it) },
        )
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
