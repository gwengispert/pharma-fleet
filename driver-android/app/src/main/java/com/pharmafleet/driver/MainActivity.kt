package com.pharmafleet.driver

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.google.android.material.button.MaterialButton
import com.google.android.material.switchmaterial.SwitchMaterial
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

// Driver picker + task checklist + online/offline toggle, backed by the same
// REST API and join logic as app/driver/page.js (the existing simulated web
// driver view). This app replaces the simulation with real GPS via the
// Driver SDK — it does not talk to a separate mobile backend.
//
// No turn-by-turn navigation UI in this pass, per the Phase 4 scope in
// the plan doc — just the task list and a location-reporting on/off switch.
class MainActivity : AppCompatActivity() {

    private val apiClient by lazy { ApiClient(BuildConfig.BACKEND_BASE_URL) }
    private lateinit var locationReporter: DriverLocationReporter

    private lateinit var driverSpinner: Spinner
    private lateinit var onlineSwitch: SwitchMaterial
    private lateinit var statusText: TextView
    private lateinit var stopsContainer: LinearLayout
    private lateinit var driverAdapter: ArrayAdapter<String>

    private var drivers: List<Driver> = emptyList()
    private var selectedDriver: Driver? = null

    // Set right before a programmatic setSelection() call (e.g. restoring
    // the selected driver after a poll refresh) so the resulting
    // onItemSelected callback — which would otherwise stop an active
    // location-reporting session, same as a real user switching drivers —
    // is skipped for that one call.
    private var suppressNextSelectionCallback = false

    // Same poll interval as app/driver/page.js's POLL_MS, so admin-side
    // changes (new drivers from bulk upload, vehicle assignment, route
    // optimization, delivery status) show up here without relaunching.
    private val pollIntervalMs = 5000L

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        locationReporter = DriverLocationReporter(this)

        driverSpinner = findViewById(R.id.driverSpinner)
        onlineSwitch = findViewById(R.id.onlineSwitch)
        statusText = findViewById(R.id.statusText)
        stopsContainer = findViewById(R.id.stopsContainer)

        driverAdapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, mutableListOf())
        driverSpinner.adapter = driverAdapter

        driverSpinner.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: android.view.View?, position: Int, id: Long) {
                if (suppressNextSelectionCallback) {
                    suppressNextSelectionCallback = false
                    return
                }
                if (onlineSwitch.isChecked) {
                    locationReporter.stop()
                    onlineSwitch.isChecked = false
                }
                selectedDriver = drivers.getOrNull(position)
                lifecycleScope.launch { refreshStops() }
            }

            override fun onNothingSelected(parent: AdapterView<*>?) {}
        }

        onlineSwitch.setOnCheckedChangeListener { _, isChecked ->
            val vehicleId = selectedDriver?.vehicleId
            if (vehicleId == null) {
                Toast.makeText(this, "This driver has no assigned vehicle", Toast.LENGTH_SHORT).show()
                onlineSwitch.isChecked = false
                return@setOnCheckedChangeListener
            }
            if (isChecked) {
                if (!hasLocationPermission()) {
                    requestLocationPermission()
                    onlineSwitch.isChecked = false
                    return@setOnCheckedChangeListener
                }
                goOnline(vehicleId)
            } else {
                locationReporter.stop()
                statusText.text = "Offline"
            }
        }

        // Loads immediately, then re-polls every pollIntervalMs while the
        // activity is at least STARTED (paused automatically in the
        // background, resumed on return — repeatOnLifecycle handles both).
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                var first = true
                while (isActive) {
                    refreshDrivers(showErrors = first)
                    first = false
                    delay(pollIntervalMs)
                }
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        locationReporter.stop()
    }

    private fun hasLocationPermission() = ContextCompat.checkSelfPermission(
        this,
        Manifest.permission.ACCESS_FINE_LOCATION,
    ) == PackageManager.PERMISSION_GRANTED

    private fun requestLocationPermission() {
        ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.ACCESS_FINE_LOCATION), REQUEST_LOCATION)
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQUEST_LOCATION && grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
            onlineSwitch.isChecked = true
        }
    }

    private fun goOnline(vehicleId: String) {
        statusText.text = "Connecting to Fleet Engine…"
        val authTokenFactory = FleetEngineAuthTokenFactory(apiClient)
        locationReporter.start(
            providerId = BuildConfig.FLEET_ENGINE_PROVIDER_ID,
            vehicleId = vehicleId,
            authTokenFactory = authTokenFactory,
            onReady = { runOnUiThread { statusText.text = "Online — reporting location for $vehicleId" } },
            onError = { err ->
                runOnUiThread {
                    statusText.text = "Failed to go online: ${err.message}"
                    onlineSwitch.isChecked = false
                }
            },
        )
    }

    // Reloads the driver list and, if the currently selected driver is still
    // present, restores that selection (matched by id, not position — bulk
    // uploads/edits can reorder or grow the list between polls) and refreshes
    // their stops too. Errors are only surfaced on the very first load;
    // background poll failures fail silently, same as
    // app/driver/page.js's `loadAll().catch(() => {})` on its interval.
    private suspend fun refreshDrivers(showErrors: Boolean) {
        try {
            val loaded = withContext(Dispatchers.IO) { apiClient.getDrivers() }
            val previousId = selectedDriver?.id
            drivers = loaded

            driverAdapter.clear()
            driverAdapter.addAll(loaded.map { it.name })

            // Resolved explicitly rather than left to Spinner's
            // onItemSelectedListener firing on its own — populating an
            // adapter after the fact doesn't reliably trigger that callback,
            // which left selectedDriver stuck at null (Spinner showing a
            // name selected on screen while the app still thought nothing
            // was picked, surfacing as a false "no assigned vehicle").
            val restoredIndex = loaded.indexOfFirst { it.id == previousId }
            val targetIndex = when {
                restoredIndex >= 0 -> restoredIndex
                previousId == null && loaded.isNotEmpty() -> 0 // first load, nothing picked yet
                else -> -1 // previously selected driver is gone
            }

            if (targetIndex >= 0) {
                if (driverSpinner.selectedItemPosition != targetIndex) {
                    suppressNextSelectionCallback = true
                    driverSpinner.setSelection(targetIndex)
                }
                selectedDriver = loaded[targetIndex]
            } else {
                selectedDriver = null
                if (onlineSwitch.isChecked) {
                    locationReporter.stop()
                    onlineSwitch.isChecked = false
                }
            }
        } catch (err: Exception) {
            if (showErrors) {
                Toast.makeText(this@MainActivity, "Failed to load drivers: ${err.message}", Toast.LENGTH_LONG).show()
            }
            return
        }
        refreshStops()
    }

    // Mirrors app/driver/page.js: driver -> vehicleId -> routes[vehicleId]
    // -> deliveryIds, joined against /api/deliveries, in that order.
    private suspend fun refreshStops() {
        val driver = selectedDriver
        val vehicleId = driver?.vehicleId
        if (vehicleId == null) {
            stopsContainer.removeAllViews()
            statusText.text = if (driver == null) "" else "No vehicle assigned yet"
            return
        }
        try {
            val deliveries = withContext(Dispatchers.IO) { apiClient.getDeliveries() }
            val routes = withContext(Dispatchers.IO) { apiClient.getRoutes() }
            val route = routes[vehicleId]
            if (route == null) {
                stopsContainer.removeAllViews()
                statusText.text = "No optimized route yet for this vehicle"
                return
            }
            val byId = deliveries.associateBy { it.id }
            val stops = route.deliveryIds.mapNotNull { byId[it] }
            renderStops(stops)
        } catch (err: Exception) {
            Toast.makeText(this@MainActivity, "Failed to load route: ${err.message}", Toast.LENGTH_LONG).show()
        }
    }

    private fun dp(value: Int): Int =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value.toFloat(), resources.displayMetrics).toInt()

    // Mirrors app/driver/page.js's checklist rows: numbered circle (green
    // once delivered), name + address, and a right-aligned status — a
    // "Delivered" pill, a "Mark delivered" button for the next stop, or
    // muted "Waiting" text for the rest. Below that, "Open map" launches an
    // in-app map screen (MapActivity) and "Street View" hands off to the
    // Google Maps app — no turn-by-turn UI is built here either way (out of
    // scope — see driver-android/README.md).
    private fun renderStops(stops: List<Delivery>) {
        stopsContainer.removeAllViews()
        val nextStopId = stops.firstOrNull { it.status != "delivered" }?.id

        stops.forEachIndexed { index, stop ->
            val delivered = stop.status == "delivered"
            val isNext = stop.id == nextStopId

            val card = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                background = ContextCompat.getDrawable(this@MainActivity, R.drawable.bg_stop_row)
                setPadding(dp(12), dp(12), dp(12), dp(12))
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                ).apply { bottomMargin = dp(8) }
            }

            val row = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
            }

            val indexBadge = FrameLayout(this).apply {
                background = ContextCompat.getDrawable(
                    this@MainActivity,
                    if (delivered) R.drawable.bg_stop_index_delivered else R.drawable.bg_stop_index_pending,
                )
                layoutParams = LinearLayout.LayoutParams(dp(24), dp(24))
            }
            indexBadge.addView(
                TextView(this).apply {
                    text = (index + 1).toString()
                    textSize = 11f
                    setTextColor(ContextCompat.getColor(this@MainActivity, R.color.on_brand))
                    gravity = Gravity.CENTER
                    layoutParams = FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
                },
            )

            val textColumn = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                    marginStart = dp(12)
                    marginEnd = dp(8)
                }
            }
            textColumn.addView(
                TextView(this).apply {
                    text = stop.customerName
                    textSize = 14f
                    setTypeface(typeface, android.graphics.Typeface.BOLD)
                    setTextColor(ContextCompat.getColor(this@MainActivity, R.color.foreground))
                },
            )
            textColumn.addView(
                TextView(this).apply {
                    text = stop.address
                    textSize = 13f
                    setTextColor(ContextCompat.getColor(this@MainActivity, R.color.text_secondary))
                },
            )

            row.addView(indexBadge)
            row.addView(textColumn)

            when {
                delivered -> row.addView(
                    TextView(this).apply {
                        text = "Delivered"
                        textSize = 12f
                        setTypeface(typeface, android.graphics.Typeface.BOLD)
                        setTextColor(ContextCompat.getColor(this@MainActivity, R.color.success_pill_text))
                        background = ContextCompat.getDrawable(this@MainActivity, R.drawable.bg_pill_delivered)
                        setPadding(dp(10), dp(4), dp(10), dp(4))
                    },
                )
                isNext -> row.addView(
                    MaterialButton(this).apply {
                        text = "Mark delivered"
                        textSize = 12f
                        isAllCaps = false
                        cornerRadius = dp(6)
                        setPadding(dp(4), 0, dp(4), 0)
                        setOnClickListener { markDelivered(stop.id) }
                    },
                )
                else -> row.addView(
                    TextView(this).apply {
                        text = "Waiting"
                        textSize = 12f
                        setTextColor(ContextCompat.getColor(this@MainActivity, R.color.text_muted))
                    },
                )
            }

            card.addView(row)

            if (stop.lat != null && stop.lng != null) {
                val actionsRow = LinearLayout(this).apply {
                    orientation = LinearLayout.HORIZONTAL
                    layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.WRAP_CONTENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT,
                    ).apply { topMargin = dp(8) }
                }
                actionsRow.addView(
                    MaterialButton(this, null, com.google.android.material.R.attr.materialButtonOutlinedStyle).apply {
                        text = "Open map"
                        textSize = 12f
                        isAllCaps = false
                        cornerRadius = dp(6)
                        setOnClickListener { openMap(stop) }
                    },
                )
                actionsRow.addView(
                    MaterialButton(this, null, com.google.android.material.R.attr.materialButtonOutlinedStyle).apply {
                        text = "Street View"
                        textSize = 12f
                        isAllCaps = false
                        cornerRadius = dp(6)
                        layoutParams = LinearLayout.LayoutParams(
                            LinearLayout.LayoutParams.WRAP_CONTENT,
                            LinearLayout.LayoutParams.WRAP_CONTENT,
                        ).apply { marginStart = dp(8) }
                        setOnClickListener { openStreetView(stop) }
                    },
                )
                card.addView(actionsRow)
            }

            stopsContainer.addView(card)
        }
    }

    // Hands off to the Google Maps app for turn-by-turn directions to this
    // stop — google.navigation: is a Maps-specific intent scheme (not the
    // generic geo: one), always routes from the user's current location.
    // Falls back to a Maps web URL if the app isn't installed, rather than
    // failing silently.
    private fun openMap(delivery: Delivery) {
        val lat = delivery.lat ?: return
        val lng = delivery.lng ?: return
        startActivity(MapActivity.intent(this, lat, lng, delivery.customerName, delivery.address))
    }

    // google.streetview:cbll= shows the closest Street View panorama to this
    // stop's coordinates — same fallback pattern as openMap.
    private fun openStreetView(delivery: Delivery) {
        val lat = delivery.lat ?: return
        val lng = delivery.lng ?: return
        val streetViewIntent = Intent(Intent.ACTION_VIEW, Uri.parse("google.streetview:cbll=$lat,$lng")).apply {
            setPackage("com.google.android.apps.maps")
        }
        if (streetViewIntent.resolveActivity(packageManager) != null) {
            startActivity(streetViewIntent)
        } else {
            startActivity(
                Intent(
                    Intent.ACTION_VIEW,
                    Uri.parse("https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=$lat,$lng"),
                ),
            )
        }
    }

    private fun markDelivered(deliveryId: String) {
        lifecycleScope.launch {
            try {
                withContext(Dispatchers.IO) { apiClient.markDelivered(deliveryId) }
                refreshStops()
            } catch (err: Exception) {
                Toast.makeText(this@MainActivity, "Failed to mark delivered: ${err.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    companion object {
        private const val REQUEST_LOCATION = 1001
    }
}
