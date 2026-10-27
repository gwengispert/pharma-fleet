package com.pharmafleet.driver

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.doOnNextLayout
import androidx.core.view.WindowInsetsCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.GoogleMap
import com.google.android.gms.maps.OnMapReadyCallback
import com.google.android.gms.maps.OnStreetViewPanoramaReadyCallback
import com.google.android.gms.maps.StreetViewPanorama
import com.google.android.gms.maps.SupportMapFragment
import com.google.android.gms.maps.SupportStreetViewPanoramaFragment
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.Marker
import com.google.android.gms.maps.model.MarkerOptions
import com.google.android.gms.maps.model.Polyline
import com.google.android.gms.maps.model.PolylineOptions
import com.google.android.material.bottomsheet.BottomSheetBehavior
import com.google.android.material.button.MaterialButton

// In-app map for the driver's route: shows one delivery stop at a time with
// back / forward arrows beside its address to step through the ordered
// stops, and a Street View preview of the current stop — both without
// leaving the app (Street View comes from the Maps SDK bundled in the
// Navigation SDK). Launched from MainActivity's "Open map" button, which
// passes the whole ordered stop list plus the index that was tapped.
//
// "Start Driving" (with BuildConfig.SIMULATED_DRIVE) plays the backend's
// shared simulated drive to the current stop instead of real navigation:
// the vehicle moves along the captured route polyline here, on the web
// driver view and on the admin map at the same time. A drive started from
// the web shows up here too (polled every second).
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
    private var vehicleId: String? = null

    // Shared simulated drive (see ApiClient.Drive). clockOffsetMs = server
    // clock - device clock, so positions match the web clients' exactly.
    private var drive: Drive? = null
    private var clockOffsetMs = 0L
    private var vehicleMarker: Marker? = null
    private var legLine: Polyline? = null
    // Follow camera state: which drive it's following, its smoothed bearing,
    // and which drive it has already eased back to the overhead view for.
    private var followingDriveStartedAt: Long? = null
    // True once the driver pans/zooms during a drive: the follow camera
    // stops until they tap "Re-center".
    private var followPaused = false
    private lateinit var recenterButton: View
    private var cameraBearing = 0f
    private var arrivedDriveStartedAt: Long? = null

    private var map: GoogleMap? = null
    private var marker: Marker? = null
    private var streetView: StreetViewPanorama? = null
    private var streetViewThumbPanorama: StreetViewPanorama? = null
    private var showingStreetView = false

    private lateinit var nameView: TextView
    private lateinit var addressView: TextView
    private lateinit var mapContainer: View
    private lateinit var streetViewContainer: View
    private lateinit var streetViewThumb: View
    private lateinit var streetViewThumbEmpty: View
    private lateinit var backToMapButton: MaterialButton
    private lateinit var etaCard: View
    private lateinit var navHeader: View
    private lateinit var navSecondary: View
    private lateinit var navManeuverIcon: ImageView
    private lateinit var navDistance: TextView
    private lateinit var navInstruction: TextView
    private lateinit var navThenIcon: ImageView
    private lateinit var navThenInstruction: TextView
    private var sheetRestHeight = 0
    private val thumbMarginPx by lazy { (12 * resources.displayMetrics.density).toInt() }
    private lateinit var bottomSheet: View
    private lateinit var dragHandle: View
    private lateinit var sheetBehavior: BottomSheetBehavior<View>
    private lateinit var etaDuration: TextView
    private lateinit var etaDetails: TextView
    private lateinit var speedButton: MaterialButton
    private lateinit var skipButton: MaterialButton
    private var speedOptions: List<Double> = listOf(1.0)
    private var driving = false
    private lateinit var prevStopButton: View
    private lateinit var nextStopButton: View
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
        vehicleId = intent.getStringExtra(EXTRA_VEHICLE_ID)

        nameView = findViewById(R.id.mapDestinationName)
        addressView = findViewById(R.id.mapDestinationAddress)
        mapContainer = findViewById(R.id.mapContainer)
        streetViewContainer = findViewById(R.id.streetViewContainer)
        streetViewThumb = findViewById(R.id.streetViewThumb)
        streetViewThumbEmpty = findViewById(R.id.streetViewThumbEmpty)
        backToMapButton = findViewById(R.id.backToMapButton)
        etaCard = findViewById(R.id.etaCard)
        recenterButton = findViewById(R.id.recenterButton)
        recenterButton.setOnClickListener { recenter() }
        navHeader = findViewById(R.id.navHeader)
        navSecondary = findViewById(R.id.navSecondary)
        navManeuverIcon = findViewById(R.id.navManeuverIcon)
        navDistance = findViewById(R.id.navDistance)
        navInstruction = findViewById(R.id.navInstruction)
        navThenIcon = findViewById(R.id.navThenIcon)
        navThenInstruction = findViewById(R.id.navThenInstruction)
        navHeader.clipToOutline = true
        bottomSheet = findViewById(R.id.bottomSheet)
        dragHandle = findViewById(R.id.dragHandle)
        sheetBehavior = BottomSheetBehavior.from(bottomSheet)
        etaDuration = findViewById(R.id.etaDuration)
        etaDetails = findViewById(R.id.etaDetails)
        speedButton = findViewById(R.id.speedButton)
        skipButton = findViewById(R.id.skipButton)
        speedButton.setOnClickListener { cycleSpeed() }
        // Speed / Skip stay hidden until the driver asks for them.
        findViewById<View>(R.id.driveSettingsButton).setOnClickListener {
            val show = speedButton.visibility != View.VISIBLE
            speedButton.visibility = if (show) View.VISIBLE else View.GONE
            skipButton.visibility = if (show) View.VISIBLE else View.GONE
        }
        skipButton.setOnClickListener { skipToDestination() }
        // Clip the live panorama to the thumbnail's rounded frame.
        streetViewThumb.clipToOutline = true
        prevStopButton = findViewById(R.id.prevStopButton)
        nextStopButton = findViewById(R.id.nextStopButton)
        startDrivingButton = findViewById(R.id.startDrivingButton)
        markDeliveredNextButton = findViewById(R.id.markDeliveredNextButton)

        findViewById<TextView>(R.id.mapBackLink).setOnClickListener { finish() }
        findViewById<View>(R.id.streetViewThumbTouch).setOnClickListener { toggleStreetView() }
        backToMapButton.setOnClickListener { toggleStreetView() }
        prevStopButton.setOnClickListener { previewStop(currentIndex - 1) }
        nextStopButton.setOnClickListener { previewStop(currentIndex + 1) }
        startDrivingButton.setOnClickListener { startDriving() }
        markDeliveredNextButton.setOnClickListener { markDeliveredAndNext() }
        // With the simulated drive, "Mark delivered" only appears once the
        // vehicle has reached the stop shown (see updateMarkDelivered). With
        // real navigation there's no arrival signal here, so it's always shown.
        markDeliveredNextButton.visibility =
            if (BuildConfig.SIMULATED_DRIVE && vehicleId != null) View.GONE else View.VISIBLE

        (supportFragmentManager.findFragmentById(R.id.mapContainer) as SupportMapFragment).getMapAsync(this)
        (supportFragmentManager.findFragmentById(R.id.streetViewContainer) as SupportStreetViewPanoramaFragment)
            .getStreetViewPanoramaAsync(this)
        (supportFragmentManager.findFragmentById(R.id.streetViewThumbPanorama) as SupportStreetViewPanoramaFragment)
            .getStreetViewPanoramaAsync { panorama ->
                // A still preview: no panning/zooming/moving inside the tiny frame.
                panorama.isUserNavigationEnabled = false
                panorama.isPanningGesturesEnabled = false
                panorama.isZoomGesturesEnabled = false
                panorama.isStreetNamesEnabled = false
                panorama.setOnStreetViewPanoramaChangeListener { location ->
                    // No imagery near this stop -> say so instead of a blank frame.
                    streetViewThumbEmpty.visibility = if (location == null) View.VISIBLE else View.GONE
                }
                streetViewThumbPanorama = panorama
                updateStreetViewPositions()
            }

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
        updateMapOverlays()

        if (BuildConfig.SIMULATED_DRIVE && vehicleId != null) {
            lifecycleScope.launch {
                repeatOnLifecycle(Lifecycle.State.STARTED) {
                    while (true) {
                        pollDrive()
                        delay(DRIVE_POLL_MS)
                    }
                }
            }
            lifecycleScope.launch {
                repeatOnLifecycle(Lifecycle.State.STARTED) {
                    while (true) {
                        renderDrive()
                        delay(FRAME_MS)
                    }
                }
            }
        }
    }

    override fun onMapReady(googleMap: GoogleMap) {
        map = googleMap
        // A pan/zoom/tilt by the driver mid-drive hands the camera to them.
        googleMap.setOnCameraMoveStartedListener { reason ->
            if (reason == GoogleMap.OnCameraMoveStartedListener.REASON_GESTURE && driving) setFollowPaused(true)
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
        ) {
            googleMap.isMyLocationEnabled = true
        }
        googleMap.uiSettings.isZoomControlsEnabled = true
        googleMap.uiSettings.isMyLocationButtonEnabled = true
        updateMapOverlays()
        showStopOnMap()
        drive?.let { drawLeg(it) }
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
        updateStopArrows()
    }

    // Back arrow from the 2nd stop on, forward arrow until the last — and
    // neither during active navigation, so the stop shown stays the one
    // being driven to.
    private fun updateStopArrows() {
        prevStopButton.visibility = if (!driving && currentIndex > 0) View.VISIBLE else View.GONE
        nextStopButton.visibility = if (!driving && currentIndex < lats.size - 1) View.VISIBLE else View.GONE
    }

    // Shows another stop of the route (arrows beside the address) without
    // affecting a drive in progress.
    private fun previewStop(index: Int) {
        if (index !in lats.indices || index == currentIndex) return
        currentIndex = index
        updateHeader()
        showStopOnMap()
        updateStreetViewPositions()
    }

    private fun showStopOnMap(moveCamera: Boolean = true) {
        val m = map ?: return
        val pos = currentLatLng()
        marker?.remove()
        marker = m.addMarker(MarkerOptions().position(pos).title(names.getOrElse(currentIndex) { "" }))
        if (moveCamera) m.moveCamera(CameraUpdateFactory.newLatLngZoom(pos, 16f))
    }

    private fun goToNextStop() {
        if (lats.size <= 1) return
        currentIndex = (currentIndex + 1) % lats.size
        updateHeader()
        showStopOnMap()
        updateStreetViewPositions()
    }

    // With SIMULATED_DRIVE, starts the shared simulated drive to the current
    // stop (see startSimulatedDrive). Otherwise launches full-screen
    // turn-by-turn navigation (Navigation SDK) to the current stop. The very first stop of the route (index 0) starts from
    // the configured warehouse; later stops start from the driver's actual
    // location.
    private fun startDriving() {
        if (BuildConfig.SIMULATED_DRIVE) {
            startSimulatedDrive()
            return
        }
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

    private fun startSimulatedDrive() {
        val vehicle = vehicleId ?: run {
            Toast.makeText(this, "No vehicle assigned to this driver", Toast.LENGTH_SHORT).show()
            return
        }
        val deliveryId = ids.getOrNull(currentIndex) ?: return
        startDrivingButton.isEnabled = false
        lifecycleScope.launch {
            val sentAt = System.currentTimeMillis()
            try {
                val state = withContext(Dispatchers.IO) { apiClient.startDrive(vehicle, deliveryId) }
                applyDriveState(state, sentAt)
            } catch (err: Exception) {
                startDrivingButton.isEnabled = true
                Toast.makeText(this@MapActivity, "Couldn't start driving: ${err.message}", Toast.LENGTH_LONG).show()
            }
        }
    }

    private suspend fun pollDrive() {
        val vehicle = vehicleId ?: return
        val sentAt = System.currentTimeMillis()
        try {
            val state = withContext(Dispatchers.IO) { apiClient.getDrive(vehicle) }
            applyDriveState(state, sentAt)
        } catch (_: Exception) {
            // Transient — the next poll retries.
        }
    }

    private fun applyDriveState(state: DriveState, sentAt: Long) {
        val receivedAt = System.currentTimeMillis()
        clockOffsetMs = state.serverNow - (sentAt + receivedAt) / 2
        speedOptions = state.speeds
        val next = state.drive
        if (next?.startedAt == drive?.startedAt && next?.vehicleId == drive?.vehicleId) {
            // Same leg — just pick up a new speed/anchor (speed change or skip).
            drive = next
            return
        }

        drive = next
        if (next == null) {
            vehicleMarker?.remove()
            vehicleMarker = null
            legLine?.remove()
            legLine = null
            return
        }
        // A drive started elsewhere (e.g. the web driver view) — show the
        // stop it's heading to.
        val index = ids.indexOf(next.deliveryId)
        if (index >= 0 && index != currentIndex) {
            currentIndex = index
            updateHeader()
            showStopOnMap(moveCamera = false)
            updateStreetViewPositions()
        }
        drawLeg(next)
    }

    private fun drawLeg(d: Drive) {
        val m = map ?: return
        legLine?.remove()
        legLine = m.addPolyline(
            PolylineOptions().addAll(d.path).color(ContextCompat.getColor(this, R.color.nav_route)).width(14f).zIndex(1f),
        )
    }

    // Runs every frame: moves the vehicle to where the shared drive says it
    // is right now, follows it with the camera, and updates the button.
    private fun renderDrive() {
        val m = map ?: return
        val d = drive
        if (d == null) {
            setDriving(false)
            updateDriveButton(null)
            updateMarkDelivered(arrived = false)
            return
        }
        val serverNow = System.currentTimeMillis() + clockOffsetMs
        val fraction = d.progressAt(serverNow)
        updateMarkDelivered(arrived = fraction >= 1.0 && d.deliveryId == ids.getOrNull(currentIndex))
        val pos = positionAlongPath(d.path, fraction) ?: return

        // Navigation SDK-style puck: flat, so it lies on the tilted map and
        // turns with the heading (straight up the screen in the follow view).
        val vm = vehicleMarker ?: m.addMarker(
            MarkerOptions()
                .position(pos.latLng)
                .icon(navigationChevronIcon((44 * resources.displayMetrics.density).toInt()))
                .anchor(0.5f, 0.5f)
                .flat(true)
                .zIndex(2f),
        )?.also { vehicleMarker = it }
        vm?.position = pos.latLng
        vm?.rotation = pos.heading

        setDriving(fraction < 1.0)
        if (fraction < 1.0) {
            trimLegBehind(d, pos)
            if (followingDriveStartedAt != d.startedAt) setFollowPaused(false) // new drive: follow again
            if (!followPaused) followVehicle(m, d, pos)
            updateEta(d, fraction)
            updateNavHeader(d, fraction)
        } else {
            if (legLine != null) {
                legLine?.remove()
                legLine = null
            }
            // Arrived: ease back from the chase view to a flat, north-up
            // view of the stop (once per drive, so the driver can then pan).
            if (arrivedDriveStartedAt != d.startedAt) {
                arrivedDriveStartedAt = d.startedAt
                m.animateCamera(
                    CameraUpdateFactory.newCameraPosition(
                        CameraPosition.Builder().target(pos.latLng).zoom(16f).tilt(0f).bearing(0f).build(),
                    ),
                    ARRIVAL_CAMERA_MS,
                    null,
                )
            }
        }
        updateDriveButton(fraction)
    }

    // Only the road still ahead stays drawn: the leg line starts at the
    // vehicle and drops each stretch of path as it's driven past.
    private fun trimLegBehind(d: Drive, pos: VehiclePosition) {
        val line = legLine ?: return
        line.points = listOf(pos.latLng) + d.path.subList(minOf(pos.segmentIndex + 1, d.path.size), d.path.size)
    }

    // Navigation-style chase camera: tilted, rotated so the car heads up the
    // screen, and centered a little ahead of the car so more of the road in
    // front is visible. The bearing eases toward the car's heading rather
    // than snapping at every polyline vertex.
    private fun followVehicle(m: GoogleMap, d: Drive, pos: VehiclePosition) {
        if (followingDriveStartedAt != d.startedAt) {
            followingDriveStartedAt = d.startedAt
            cameraBearing = pos.heading
        } else {
            val delta = ((pos.heading - cameraBearing + 540f) % 360f) - 180f
            cameraBearing = (cameraBearing + delta * BEARING_SMOOTHING + 360f) % 360f
        }
        m.moveCamera(CameraUpdateFactory.newCameraPosition(followCameraPosition(pos.latLng, cameraBearing)))
    }

    private fun followCameraPosition(at: LatLng, bearing: Float): CameraPosition =
        CameraPosition.Builder()
            .target(offsetLatLng(at, LOOK_AHEAD_M, bearing))
            .zoom(FOLLOW_ZOOM)
            .tilt(FOLLOW_TILT)
            .bearing(bearing)
            .build()

    private fun setFollowPaused(paused: Boolean) {
        followPaused = paused
        recenterButton.visibility = if (paused && driving) View.VISIBLE else View.GONE
    }

    // Glides back to the chase view on the vehicle, then resumes following
    // (still paused during the glide so the frame loop doesn't fight it).
    private fun recenter() {
        val m = map ?: return
        val d = drive ?: return setFollowPaused(false)
        val pos = positionAlongPath(d.path, d.progressAt(System.currentTimeMillis() + clockOffsetMs))
            ?: return setFollowPaused(false)
        recenterButton.visibility = View.GONE
        cameraBearing = pos.heading
        m.animateCamera(
            CameraUpdateFactory.newCameraPosition(followCameraPosition(pos.latLng, cameraBearing)),
            RECENTER_CAMERA_MS,
            object : GoogleMap.CancelableCallback {
                override fun onFinish() = setFollowPaused(false)
                override fun onCancel() = setFollowPaused(false)
            },
        )
    }

    // Trip summary like Google Maps navigation: real-world time and distance
    // left (the leg's real values, scaled by progress) and the arrival time
    // at real-time driving — steady at 1x, counting down faster when sped up.
    private fun updateEta(d: Drive, fraction: Double) {
        val remainingSeconds = ((1 - fraction) * d.realDurationSeconds).toLong()
        val remainingMeters = (1 - fraction) * d.distanceMeters
        val arrivalLocalMs = System.currentTimeMillis() + remainingSeconds * 1000

        val duration = formatEtaDuration(remainingSeconds)
        val details = "${formatEtaDistance(remainingMeters)}  •  ${arrivalFormat.format(java.util.Date(arrivalLocalMs))}"
        if (etaDuration.text != duration) etaDuration.text = duration
        if (etaDetails.text != details) etaDetails.text = details
        val speedLabel = formatSpeed(d.speed)
        if (speedButton.text != speedLabel) speedButton.text = speedLabel
    }

    private fun formatSpeed(speed: Double): String =
        if (speed % 1.0 == 0.0) "${speed.toInt()}×" else "$speed×"

    // Steps to the next playback speed (wrapping back to 1x), for this drive
    // and the next legs — the web driver view follows along.
    private fun cycleSpeed() {
        val vehicle = vehicleId ?: return
        val current = drive?.speed ?: 1.0
        val next = speedOptions.firstOrNull { it > current } ?: speedOptions.first()
        speedButton.text = formatSpeed(next)
        sendDriveUpdate { apiClient.setDriveSpeed(vehicle, next) }
    }

    private fun skipToDestination() {
        val vehicle = vehicleId ?: return
        sendDriveUpdate { apiClient.skipDrive(vehicle) }
    }

    private fun sendDriveUpdate(call: () -> DriveState) {
        lifecycleScope.launch {
            val sentAt = System.currentTimeMillis()
            try {
                val state = withContext(Dispatchers.IO) { call() }
                applyDriveState(state, sentAt)
            } catch (err: Exception) {
                Toast.makeText(this@MapActivity, "Couldn't update the drive: ${err.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    // Turn-by-turn header: the next maneuver ahead of the vehicle with the
    // distance to it, and the one after it as "Then …".
    private fun updateNavHeader(d: Drive, fraction: Double) {
        val nextIndex = d.steps.indexOfFirst { it.startProgress > fraction }
        val next = d.steps.getOrNull(nextIndex)
        if (next == null) {
            navHeader.visibility = View.GONE
            return
        }
        val distance = formatNavDistance((next.startProgress - fraction) * d.distanceMeters)
        if (navDistance.text != distance) navDistance.text = distance
        if (navInstruction.text != next.instruction) {
            navInstruction.text = next.instruction
            navManeuverIcon.setImageResource(maneuverIcon(next.maneuver))
        }

        val then = d.steps.getOrNull(nextIndex + 1)
        navSecondary.visibility = if (then != null) View.VISIBLE else View.GONE
        if (then != null && navThenInstruction.text != then.instruction) {
            navThenInstruction.text = then.instruction
            navThenIcon.setImageResource(maneuverIcon(then.maneuver))
        }
    }

    private fun maneuverIcon(maneuver: String?): Int = when {
        maneuver == null -> R.drawable.ic_maneuver_straight
        maneuver == "arrive" -> R.drawable.ic_maneuver_arrive
        maneuver.startsWith("uturn") -> R.drawable.ic_maneuver_uturn
        maneuver in setOf("turn-left", "turn-sharp-left", "roundabout-left") -> R.drawable.ic_maneuver_left
        maneuver in setOf("turn-right", "turn-sharp-right", "roundabout-right") -> R.drawable.ic_maneuver_right
        maneuver.endsWith("left") -> R.drawable.ic_maneuver_slight_left // slight / ramp / fork / keep
        maneuver.endsWith("right") -> R.drawable.ic_maneuver_slight_right
        else -> R.drawable.ic_maneuver_straight // merge, straight, ferry …
    }

    // Distance to the next maneuver, rounded like navigation apps do.
    private fun formatNavDistance(meters: Double): String = when {
        meters < 100 -> "${maxOf(10, (meters / 10).toInt() * 10)} m"
        meters < 1000 -> "${(meters / 50).toInt() * 50} m"
        else -> String.format(java.util.Locale.getDefault(), "%.1f km", meters / 1000)
    }

    private val arrivalFormat = java.text.SimpleDateFormat("h:mm a", java.util.Locale.getDefault())

    private fun formatEtaDuration(seconds: Long): String {
        val minutes = maxOf(1L, (seconds + 59) / 60)
        if (minutes < 60) return "$minutes min"
        val rest = minutes % 60
        return if (rest == 0L) "${minutes / 60} hr" else "${minutes / 60} hr $rest min"
    }

    private fun formatEtaDistance(meters: Double): String = when {
        meters < 1000 -> "${(meters / 50).toInt() * 50} m"
        meters < 10_000 -> String.format(java.util.Locale.getDefault(), "%.1f km", meters / 1000)
        else -> "${(meters / 1000).toInt()} km"
    }

    // Switches the bottom sheet between its two modes (see updateMapOverlays).
    private fun setDriving(value: Boolean) {
        if (driving == value) return
        driving = value
        setFollowPaused(false)
        updateStopArrows()
        updateMapOverlays()
    }

    // Bottom sheet modes, like Google Maps navigation:
    //  - not driving: fully open and fixed, showing the action buttons;
    //  - driving: collapsed to a drag handle + the ETA card, so the buttons
    //    are hidden until the driver slides the sheet up.
    // The map area always ends where the collapsed/fixed sheet begins, so the
    // Street View preview and the map's Google logo stay visible above it.
    private fun updateMapOverlays() {
        etaCard.visibility = if (driving) View.VISIBLE else View.GONE
        dragHandle.visibility = if (driving) View.VISIBLE else View.GONE
        streetViewThumb.visibility = if (!showingStreetView) View.VISIBLE else View.GONE
        navHeader.visibility = if (driving && !showingStreetView) View.VISIBLE else View.GONE
        sheetBehavior.isDraggable = driving

        bottomSheet.doOnNextLayout {
            sheetRestHeight = if (driving) {
                sheetBehavior.peekHeight = dragHandle.height + etaCard.height
                sheetBehavior.state = BottomSheetBehavior.STATE_COLLAPSED
                sheetBehavior.peekHeight
            } else {
                sheetBehavior.state = BottomSheetBehavior.STATE_EXPANDED
                bottomSheet.height
            }
            applyMapInsets()
        }
        bottomSheet.requestLayout()
        navHeader.doOnNextLayout { applyMapInsets() }
        navHeader.requestLayout()
    }

    // The map runs under the (inset, floating) sheet, so everything that must
    // stay visible is lifted above the sheet's resting height: the Street
    // View preview, and — via map padding — the Google logo, zoom controls
    // and the follow camera's center. Compass and my-location sit below the
    // navigation header.
    private fun applyMapInsets() {
        val lp = streetViewThumb.layoutParams as ViewGroup.MarginLayoutParams
        if (lp.bottomMargin != sheetRestHeight + thumbMarginPx) {
            lp.bottomMargin = sheetRestHeight + thumbMarginPx
            streetViewThumb.layoutParams = lp
        }
        val recenterLp = recenterButton.layoutParams as ViewGroup.MarginLayoutParams
        if (recenterLp.bottomMargin != sheetRestHeight + thumbMarginPx) {
            recenterLp.bottomMargin = sheetRestHeight + thumbMarginPx
            recenterButton.layoutParams = recenterLp
        }
        val m = map ?: return
        val top = if (navHeader.visibility == View.VISIBLE) navHeader.bottom else 0
        m.setPadding(0, top, 0, sheetRestHeight + streetViewThumb.height + 2 * thumbMarginPx)
    }

    // "Mark delivered & next stop" only once the vehicle is at the stop shown.
    // The open (not driving) sheet changes height with it, so re-fit the map.
    private fun updateMarkDelivered(arrived: Boolean) {
        val visibility = if (arrived) View.VISIBLE else View.GONE
        if (markDeliveredNextButton.visibility == visibility) return
        markDeliveredNextButton.visibility = visibility
        if (!driving) updateMapOverlays()
    }

    private fun updateDriveButton(fraction: Double?) {
        val driving = fraction != null && fraction < 1.0
        val label = if (driving) "Driving… ${(fraction!! * 100).toInt()}%" else "Start Driving"
        if (startDrivingButton.text != label) startDrivingButton.text = label
        startDrivingButton.isEnabled = !driving
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

    // Keeps both the full panorama and the preview thumbnail on the current stop.
    private fun updateStreetViewPositions() {
        streetView?.setPosition(currentLatLng())
        streetViewThumbPanorama?.setPosition(currentLatLng(), STREET_VIEW_RADIUS_M)
    }

    // Swaps between the map (with its Street View preview) and full-screen
    // Street View of the current stop.
    private fun toggleStreetView() {
        showingStreetView = !showingStreetView
        if (showingStreetView) {
            updateStreetViewPositions()
            streetViewContainer.visibility = View.VISIBLE
            backToMapButton.visibility = View.VISIBLE
            mapContainer.visibility = View.GONE
            updateMapOverlays()
        } else {
            streetViewContainer.visibility = View.GONE
            backToMapButton.visibility = View.GONE
            mapContainer.visibility = View.VISIBLE
            updateMapOverlays()
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
        private const val EXTRA_VEHICLE_ID = "vehicleId"
        private const val DRIVE_POLL_MS = 1000L
        private const val FRAME_MS = 33L
        private const val STREET_VIEW_RADIUS_M = 100

        // Follow camera while driving: street-level, close to Google Maps
        // navigation. At high playback speeds (30-60x) tiles may lag a bit.
        private const val FOLLOW_ZOOM = 18.5f
        private const val FOLLOW_TILT = 60f
        private const val LOOK_AHEAD_M = 40.0
        private const val BEARING_SMOOTHING = 0.12f // per ~33 ms frame
        private const val ARRIVAL_CAMERA_MS = 800
        private const val RECENTER_CAMERA_MS = 600

        // `stops` must all have non-null lat/lng (filter before calling);
        // startIndex is which one to show first; vehicleId identifies the
        // shared simulated drive to follow/start.
        fun intent(context: Context, stops: List<Delivery>, startIndex: Int, vehicleId: String?): Intent =
            Intent(context, MapActivity::class.java)
                .putExtra(EXTRA_IDS, Array(stops.size) { stops[it].id })
                .putExtra(EXTRA_LATS, DoubleArray(stops.size) { stops[it].lat ?: 0.0 })
                .putExtra(EXTRA_LNGS, DoubleArray(stops.size) { stops[it].lng ?: 0.0 })
                .putExtra(EXTRA_NAMES, Array(stops.size) { stops[it].customerName })
                .putExtra(EXTRA_ADDRESSES, Array(stops.size) { stops[it].address })
                .putExtra(EXTRA_START_INDEX, startIndex)
                .putExtra(EXTRA_VEHICLE_ID, vehicleId)
    }
}
