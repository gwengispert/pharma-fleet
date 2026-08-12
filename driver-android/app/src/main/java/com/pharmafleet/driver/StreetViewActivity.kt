package com.pharmafleet.driver

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.google.android.gms.maps.OnStreetViewPanoramaReadyCallback
import com.google.android.gms.maps.StreetViewPanorama
import com.google.android.gms.maps.SupportStreetViewPanoramaFragment
import com.google.android.gms.maps.model.LatLng

// Full-screen Street View panorama of one location. Launched from
// NavigationActivity's "Street View" button so a driver can preview the
// destination without leaving guidance (MapActivity has its own inline
// Street View toggle; this is the standalone screen the nav screen uses).
class StreetViewActivity : AppCompatActivity(), OnStreetViewPanoramaReadyCallback {

    private var lat = 0.0
    private var lng = 0.0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_streetview)
        applySystemBarInsets()

        lat = intent.getDoubleExtra(EXTRA_LAT, 0.0)
        lng = intent.getDoubleExtra(EXTRA_LNG, 0.0)
        findViewById<TextView>(R.id.svName).text = intent.getStringExtra(EXTRA_TITLE).orEmpty()
        findViewById<TextView>(R.id.svBackLink).setOnClickListener { finish() }

        (supportFragmentManager.findFragmentById(R.id.svContainer) as SupportStreetViewPanoramaFragment)
            .getStreetViewPanoramaAsync(this)
    }

    override fun onStreetViewPanoramaReady(panorama: StreetViewPanorama) {
        panorama.setPosition(LatLng(lat, lng))
    }

    private fun applySystemBarInsets() {
        val content = findViewById<View>(android.R.id.content)
        ViewCompat.setOnApplyWindowInsetsListener(content) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
    }

    companion object {
        private const val EXTRA_LAT = "lat"
        private const val EXTRA_LNG = "lng"
        private const val EXTRA_TITLE = "title"

        fun intent(context: Context, lat: Double, lng: Double, title: String): Intent =
            Intent(context, StreetViewActivity::class.java)
                .putExtra(EXTRA_LAT, lat)
                .putExtra(EXTRA_LNG, lng)
                .putExtra(EXTRA_TITLE, title)
    }
}
