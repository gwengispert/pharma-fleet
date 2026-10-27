package com.pharmafleet.driver

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import com.google.android.gms.maps.model.BitmapDescriptor
import com.google.android.gms.maps.model.BitmapDescriptorFactory
import com.google.android.gms.maps.model.LatLng
import kotlin.math.asin
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

// Kotlin port of the backend's lib/geo.js — the web clients walk a drive's
// path with exactly the same math, so the vehicle lands on the same spot on
// every screen for the same moment in time.

// `segmentIndex`: the path segment (path[i] -> path[i + 1]) the vehicle is
// on, so callers can tell which part of the path is already behind it.
data class VehiclePosition(val latLng: LatLng, val heading: Float, val segmentIndex: Int = 0)

private fun haversineMeters(a: LatLng, b: LatLng): Double {
    val r = 6371000.0
    val dLat = Math.toRadians(b.latitude - a.latitude)
    val dLng = Math.toRadians(b.longitude - a.longitude)
    val h = sin(dLat / 2) * sin(dLat / 2) +
        cos(Math.toRadians(a.latitude)) * cos(Math.toRadians(b.latitude)) * sin(dLng / 2) * sin(dLng / 2)
    return 2 * r * asin(sqrt(h))
}

private fun bearingDegrees(a: LatLng, b: LatLng): Float {
    val lat1 = Math.toRadians(a.latitude)
    val lat2 = Math.toRadians(b.latitude)
    val dLng = Math.toRadians(b.longitude - a.longitude)
    val y = sin(dLng) * cos(lat2)
    val x = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dLng)
    return ((Math.toDegrees(atan2(y, x)) + 360) % 360).toFloat()
}

fun positionAlongPath(path: List<LatLng>, fraction: Double): VehiclePosition? {
    if (path.isEmpty()) return null
    if (path.size == 1) return VehiclePosition(path[0], 0f)

    val segmentLengths = (0 until path.size - 1).map { haversineMeters(path[it], path[it + 1]) }
    val total = segmentLengths.sum()
    if (total == 0.0) return VehiclePosition(path[0], 0f)

    var target = total * fraction.coerceIn(0.0, 1.0)
    for (i in segmentLengths.indices) {
        if (target <= segmentLengths[i]) {
            val t = if (segmentLengths[i] == 0.0) 0.0 else target / segmentLengths[i]
            val a = path[i]
            val b = path[i + 1]
            return VehiclePosition(
                LatLng(a.latitude + (b.latitude - a.latitude) * t, a.longitude + (b.longitude - a.longitude) * t),
                bearingDegrees(a, b),
                i,
            )
        }
        target -= segmentLengths[i]
    }
    return VehiclePosition(path.last(), bearingDegrees(path[path.size - 2], path.last()), path.size - 2)
}

// The point `meters` from `from` in compass direction `bearingDeg` — close
// enough for the short distances a follow camera looks ahead.
fun offsetLatLng(from: LatLng, meters: Double, bearingDeg: Float): LatLng {
    val b = Math.toRadians(bearingDeg.toDouble())
    val dLat = meters * cos(b) / 111_320.0
    val dLng = meters * sin(b) / (111_320.0 * cos(Math.toRadians(from.latitude)))
    return LatLng(from.latitude + dLat, from.longitude + dLng)
}

// Google Navigation-style vehicle puck: a blue chevron on a translucent
// white halo, pointing north at rotation 0. Use with a flat marker so it
// turns with the heading and lies on the (tilted) map like the Navigation
// SDK's own puck.
fun navigationChevronIcon(sizePx: Int): BitmapDescriptor {
    val bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val s = sizePx.toFloat()
    val c = s / 2f

    canvas.drawCircle(c, c, c * 0.98f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(70, 60, 64, 67) })
    canvas.drawCircle(c, c, c * 0.94f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(225, 255, 255, 255) })

    val chevron = Path().apply {
        moveTo(c, s * 0.18f)
        lineTo(s * 0.76f, s * 0.76f)
        lineTo(c, s * 0.62f)
        lineTo(s * 0.24f, s * 0.76f)
        close()
    }
    canvas.drawPath(chevron, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.parseColor("#4285F4") })
    canvas.drawPath(
        chevron,
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = s * 0.02f
            strokeJoin = Paint.Join.ROUND
            color = Color.parseColor("#1A73E8")
        },
    )
    return BitmapDescriptorFactory.fromBitmap(bitmap)
}
