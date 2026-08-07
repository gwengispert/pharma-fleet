package com.pharmafleet.driver

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.GoogleMap
import com.google.android.gms.maps.OnMapReadyCallback
import com.google.android.gms.maps.SupportMapFragment
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.MarkerOptions

// A real in-app map for one delivery stop — launched from MainActivity's
// "Open map" button instead of handing off to the Google Maps app. Added
// because google.navigation: always routes from the device's *current*
// location, and on an emulator with no real/mock GPS fix that can be
// nowhere near the delivery address, which Google Maps reports as
// "Can't seem to find a way there" rather than a location error. This
// screen sidesteps that entirely — it just shows where the stop is, with
// the driver's own position layered on top if location permission is
// already granted (no routing/directions computed here).
class MapActivity : AppCompatActivity(), OnMapReadyCallback {

    private var lat = 0.0
    private var lng = 0.0
    private var customerName = ""
    private var address = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_map)

        lat = intent.getDoubleExtra(EXTRA_LAT, 0.0)
        lng = intent.getDoubleExtra(EXTRA_LNG, 0.0)
        customerName = intent.getStringExtra(EXTRA_NAME).orEmpty()
        address = intent.getStringExtra(EXTRA_ADDRESS).orEmpty()

        findViewById<TextView>(R.id.mapDestinationName).text = customerName
        findViewById<TextView>(R.id.mapDestinationAddress).text = address
        findViewById<TextView>(R.id.mapBackLink).setOnClickListener { finish() }

        val mapFragment = supportFragmentManager.findFragmentById(R.id.map) as SupportMapFragment
        mapFragment.getMapAsync(this)
    }

    override fun onMapReady(map: GoogleMap) {
        val destination = LatLng(lat, lng)
        map.addMarker(MarkerOptions().position(destination).title(customerName).snippet(address))
        map.moveCamera(CameraUpdateFactory.newLatLngZoom(destination, 16f))

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
        ) {
            // Best-effort — if there's no fix (common on emulators with no
            // mock location set), this just doesn't show a blue dot rather
            // than failing the screen.
            map.isMyLocationEnabled = true
        }
        map.uiSettings.isZoomControlsEnabled = true
        map.uiSettings.isMyLocationButtonEnabled = true
    }

    companion object {
        private const val EXTRA_LAT = "lat"
        private const val EXTRA_LNG = "lng"
        private const val EXTRA_NAME = "name"
        private const val EXTRA_ADDRESS = "address"

        fun intent(context: Context, lat: Double, lng: Double, name: String, address: String): Intent =
            Intent(context, MapActivity::class.java)
                .putExtra(EXTRA_LAT, lat)
                .putExtra(EXTRA_LNG, lng)
                .putExtra(EXTRA_NAME, name)
                .putExtra(EXTRA_ADDRESS, address)
    }
}
