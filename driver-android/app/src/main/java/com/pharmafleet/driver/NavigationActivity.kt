package com.pharmafleet.driver

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.google.android.gms.maps.model.LatLng
import com.google.android.libraries.navigation.NavigationApi
import com.google.android.libraries.navigation.Navigator
import com.google.android.libraries.navigation.TermsAndConditionsCheckOption
import com.google.android.libraries.navigation.Waypoint

// Full-screen turn-by-turn navigation to one delivery stop. The Navigation
// SDK's SupportNavigationFragment (in the layout) renders the guidance UI; we
// just drive the Navigator singleton here. Launched from MapActivity's
// "Start Driving" button.
//
// Navigation always routes from the device's *current* location, so it needs
// a real GPS fix — on an emulator with no mock location set it will report
// no route (same reason the external google.navigation: intent said "can't
// find a way there" earlier). Works on a real device.
class NavigationActivity : AppCompatActivity() {

    private var navigator: Navigator? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_navigation)

        val lat = intent.getDoubleExtra(EXTRA_LAT, 0.0)
        val lng = intent.getDoubleExtra(EXTRA_LNG, 0.0)
        val title = intent.getStringExtra(EXTRA_TITLE).orEmpty()
        val startFrom = if (intent.getBooleanExtra(EXTRA_HAS_START, false)) {
            LatLng(intent.getDoubleExtra(EXTRA_START_LAT, 0.0), intent.getDoubleExtra(EXTRA_START_LNG, 0.0))
        } else {
            null
        }

        val exit = findViewById<View>(R.id.navExit)
        exit.setOnClickListener { finish() }
        val streetViewButton = findViewById<View>(R.id.navStreetView)
        streetViewButton.setOnClickListener {
            startActivity(StreetViewActivity.intent(this, lat, lng, title))
        }
        // Keep both top buttons clear of the status bar under edge-to-edge.
        val base = (12 * resources.displayMetrics.density).toInt()
        ViewCompat.setOnApplyWindowInsetsListener(exit) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            val lp = v.layoutParams as ViewGroup.MarginLayoutParams
            lp.topMargin = bars.top + base
            lp.leftMargin = bars.left + base
            v.layoutParams = lp
            insets
        }
        ViewCompat.setOnApplyWindowInsetsListener(streetViewButton) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            val lp = v.layoutParams as ViewGroup.MarginLayoutParams
            lp.topMargin = bars.top + base
            lp.rightMargin = bars.right + base
            v.layoutParams = lp
            insets
        }

        NavigationApi.getNavigator(
            this,
            object : NavigationApi.NavigatorListener {
                override fun onNavigatorReady(nav: Navigator) {
                    navigator = nav
                    // Override the start position to the warehouse for the
                    // first drive (via the SDK simulator — the only way to
                    // route from somewhere other than the real GPS location).
                    // Must happen before setDestination so the route is
                    // computed from there.
                    if (startFrom != null) {
                        nav.simulator?.setUserLocation(startFrom)
                    }
                    navigateTo(lat, lng, title)
                }

                override fun onError(errorCode: Int) {
                    Toast.makeText(
                        this@NavigationActivity,
                        "Navigation unavailable (error $errorCode)",
                        Toast.LENGTH_LONG,
                    ).show()
                    finish()
                }
            },
            TermsAndConditionsCheckOption.ENABLED,
        )
    }

    private fun navigateTo(lat: Double, lng: Double, title: String) {
        val nav = navigator ?: return
        val destination = try {
            Waypoint.builder().setLatLng(lat, lng).setTitle(title).build()
        } catch (err: Exception) {
            Toast.makeText(this, "Invalid destination: ${err.message}", Toast.LENGTH_LONG).show()
            return
        }
        nav.setDestination(destination).setOnResultListener { status ->
            if (status == Navigator.RouteStatus.OK) {
                nav.startGuidance()
            } else {
                Toast.makeText(this, "Couldn't find a route ($status)", Toast.LENGTH_LONG).show()
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        // Stop guidance but deliberately do NOT NavigationApi.cleanup() — the
        // Driver SDK's location reporting shares this Navigator singleton.
        navigator?.stopGuidance()
    }

    companion object {
        private const val EXTRA_LAT = "lat"
        private const val EXTRA_LNG = "lng"
        private const val EXTRA_TITLE = "title"
        private const val EXTRA_HAS_START = "hasStart"
        private const val EXTRA_START_LAT = "startLat"
        private const val EXTRA_START_LNG = "startLng"

        // startLat/startLng: optional override for where navigation begins
        // (the warehouse, for the first drive). Null → route from the
        // device's real current location.
        fun intent(
            context: Context,
            lat: Double,
            lng: Double,
            title: String,
            startLat: Double?,
            startLng: Double?,
        ): Intent {
            val i = Intent(context, NavigationActivity::class.java)
                .putExtra(EXTRA_LAT, lat)
                .putExtra(EXTRA_LNG, lng)
                .putExtra(EXTRA_TITLE, title)
            if (startLat != null && startLng != null) {
                i.putExtra(EXTRA_HAS_START, true)
                    .putExtra(EXTRA_START_LAT, startLat)
                    .putExtra(EXTRA_START_LNG, startLng)
            }
            return i
        }
    }
}
