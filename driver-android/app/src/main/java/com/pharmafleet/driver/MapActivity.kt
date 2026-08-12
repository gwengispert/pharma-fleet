package com.pharmafleet.driver

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.View
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.GoogleMap
import com.google.android.gms.maps.OnMapReadyCallback
import com.google.android.gms.maps.OnStreetViewPanoramaReadyCallback
import com.google.android.gms.maps.StreetViewPanorama
import com.google.android.gms.maps.SupportMapFragment
import com.google.android.gms.maps.SupportStreetViewPanoramaFragment
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.Marker
import com.google.android.gms.maps.model.MarkerOptions
import com.google.android.material.button.MaterialButton

// In-app map for the driver's route: shows one delivery stop at a time with
// a "Next stop" button to advance through the ordered stops, and a Street
// View toggle to view the panorama at the current stop — both without
// leaving the app (Street View comes from the Maps SDK bundled in the
// Navigation SDK). Launched from MainActivity's "Open map" button, which
// passes the whole ordered stop list plus the index that was tapped.
class MapActivity : AppCompatActivity(), OnMapReadyCallback, OnStreetViewPanoramaReadyCallback {

    private val apiClient by lazy { ApiClient(BuildConfig.BACKEND_BASE_URL) }

    private lateinit var ids: Array<String>
    private lateinit var lats: DoubleArray
    private lateinit var lngs: DoubleArray
    private lateinit var names: Array<String>
    private lateinit var addresses: Array<String>
    private var currentIndex = 0
    private var depotLat: Double? = null
    private var depotLng: Double? = null

    private var map: GoogleMap? = null
    private var marker: Marker? = null
    private var streetView: StreetViewPanorama? = null
    private var showingStreetView = false

    private lateinit var nameView: TextView
    private lateinit var addressView: TextView
    private lateinit var mapContainer: View
    private lateinit var streetViewContainer: View
    private lateinit var toggleViewButton: MaterialButton
    private lateinit var nextButton: MaterialButton
    private lateinit var startDrivingButton: MaterialButton
    private lateinit var markDeliveredNextButton: MaterialButton

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_map)
        applySystemBarInsets()

        ids = intent.getStringArrayExtra(EXTRA_IDS) ?: arrayOf()
        lats = intent.getDoubleArrayExtra(EXTRA_LATS) ?: doubleArrayOf()
        lngs = intent.getDoubleArrayExtra(EXTRA_LNGS) ?: doubleArrayOf()
        names = intent.getStringArrayExtra(EXTRA_NAMES) ?: arrayOf()
        addresses = intent.getStringArrayExtra(EXTRA_ADDRESSES) ?: arrayOf()
        currentIndex = intent.getIntExtra(EXTRA_START_INDEX, 0).coerceIn(0, (lats.size - 1).coerceAtLeast(0))

        nameView = findViewById(R.id.mapDestinationName)
        addressView = findViewById(R.id.mapDestinationAddress)
        mapContainer = findViewById(R.id.mapContainer)
        streetViewContainer = findViewById(R.id.streetViewContainer)
        toggleViewButton = findViewById(R.id.toggleViewButton)
        nextButton = findViewById(R.id.nextButton)
        startDrivingButton = findViewById(R.id.startDrivingButton)
        markDeliveredNextButton = findViewById(R.id.markDeliveredNextButton)

        findViewById<TextView>(R.id.mapBackLink).setOnClickListener { finish() }
        toggleViewButton.setOnClickListener { toggleStreetView() }
        nextButton.setOnClickListener { goToNextStop() }
        startDrivingButton.setOnClickListener { startDriving() }
        markDeliveredNextButton.setOnClickListener { markDeliveredAndNext() }
        // Only one stop → nothing to advance to.
        nextButton.visibility = if (lats.size > 1) View.VISIBLE else View.GONE

        (supportFragmentManager.findFragmentById(R.id.mapContainer) as SupportMapFragment).getMapAsync(this)
        (supportFragmentManager.findFragmentById(R.id.streetViewContainer) as SupportStreetViewPanoramaFragment)
            .getStreetViewPanoramaAsync(this)

        // Preload the warehouse location so it's ready if the driver taps
        // "Start Driving" on the first stop.
        lifecycleScope.launch {
            try {
                val depot = withContext(Dispatchers.IO) { apiClient.getDepot() }
                depotLat = depot.lat
                depotLng = depot.lng
            } catch (_: Exception) {
                // Non-fatal — first drive just falls back to current location.
            }
        }

        updateHeader()
    }

    override fun onMapReady(googleMap: GoogleMap) {
        map = googleMap
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
        ) {
            googleMap.isMyLocationEnabled = true
        }
        googleMap.uiSettings.isZoomControlsEnabled = true
        googleMap.uiSettings.isMyLocationButtonEnabled = true
        showStopOnMap()
    }

    override fun onStreetViewPanoramaReady(panorama: StreetViewPanorama) {
        streetView = panorama
        // Keep it pre-positioned at the current stop so toggling is instant.
        panorama.setPosition(currentLatLng())
    }

    private fun currentLatLng() = LatLng(lats[currentIndex], lngs[currentIndex])

    private fun updateHeader() {
        nameView.text = names.getOrElse(currentIndex) { "" }
        addressView.text = addresses.getOrElse(currentIndex) { "" }
    }

    private fun showStopOnMap() {
        val m = map ?: return
        val pos = currentLatLng()
        marker?.remove()
        marker = m.addMarker(MarkerOptions().position(pos).title(names.getOrElse(currentIndex) { "" }))
        m.moveCamera(CameraUpdateFactory.newLatLngZoom(pos, 16f))
    }

    private fun goToNextStop() {
        if (lats.size <= 1) return
        currentIndex = (currentIndex + 1) % lats.size
        updateHeader()
        showStopOnMap()
        streetView?.setPosition(currentLatLng())
    }

    // Launches full-screen turn-by-turn navigation (Navigation SDK) to the
    // current stop. The very first stop of the route (index 0) starts from
    // the configured warehouse; later stops start from the driver's actual
    // location.
    private fun startDriving() {
        val fromDepot = currentIndex == 0
        startActivity(
            NavigationActivity.intent(
                this,
                lats[currentIndex],
                lngs[currentIndex],
                names.getOrElse(currentIndex) { "" },
                if (fromDepot) depotLat else null,
                if (fromDepot) depotLng else null,
            ),
        )
    }

    // Marks the current stop delivered on the backend (same PATCH the web
    // driver view uses, which also closes the Fleet Engine Task), then
    // advances to the next stop. Only advances if the mark succeeded so a
    // failed stop isn't silently skipped.
    private fun markDeliveredAndNext() {
        val id = ids.getOrNull(currentIndex) ?: run { goToNextStop(); return }
        lifecycleScope.launch {
            try {
                withContext(Dispatchers.IO) { apiClient.markDelivered(id) }
                goToNextStop()
            } catch (err: Exception) {
                Toast.makeText(this@MapActivity, "Failed to mark delivered: ${err.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun toggleStreetView() {
        showingStreetView = !showingStreetView
        if (showingStreetView) {
            streetView?.setPosition(currentLatLng())
            streetViewContainer.visibility = View.VISIBLE
            mapContainer.visibility = View.GONE
            toggleViewButton.text = "Map"
        } else {
            streetViewContainer.visibility = View.GONE
            mapContainer.visibility = View.VISIBLE
            toggleViewButton.text = "Street View"
        }
    }

    // targetSdk 35+ forces edge-to-edge, so content draws under the status/nav
    // bars — without this the "← Back" link sat behind the status bar and
    // couldn't be tapped. Pad the content view by the system-bar insets.
    private fun applySystemBarInsets() {
        val content = findViewById<View>(android.R.id.content)
        ViewCompat.setOnApplyWindowInsetsListener(content) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
    }

    companion object {
        private const val EXTRA_IDS = "ids"
        private const val EXTRA_LATS = "lats"
        private const val EXTRA_LNGS = "lngs"
        private const val EXTRA_NAMES = "names"
        private const val EXTRA_ADDRESSES = "addresses"
        private const val EXTRA_START_INDEX = "startIndex"

        // `stops` must all have non-null lat/lng (filter before calling);
        // startIndex is which one to show first.
        fun intent(context: Context, stops: List<Delivery>, startIndex: Int): Intent =
            Intent(context, MapActivity::class.java)
                .putExtra(EXTRA_IDS, Array(stops.size) { stops[it].id })
                .putExtra(EXTRA_LATS, DoubleArray(stops.size) { stops[it].lat ?: 0.0 })
                .putExtra(EXTRA_LNGS, DoubleArray(stops.size) { stops[it].lng ?: 0.0 })
                .putExtra(EXTRA_NAMES, Array(stops.size) { stops[it].customerName })
                .putExtra(EXTRA_ADDRESSES, Array(stops.size) { stops[it].address })
                .putExtra(EXTRA_START_INDEX, startIndex)
    }
}
