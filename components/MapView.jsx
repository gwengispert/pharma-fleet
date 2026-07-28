"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GoogleMap, Marker, Polyline, useJsApiLoader } from "@react-google-maps/api";
import { GOOGLE_MAPS_LIBRARIES } from "@/lib/googleMapsLibraries";

const containerStyle = { width: "100%", height: "100%" };

function haversineMeters(a, b) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Compass bearing (0-360, 0 = north, clockwise) from point a to point b —
// used to point the vehicle marker in its direction of travel. Google Maps
// only rotates the actual map camera for vector maps (which need a Map ID
// configured in Cloud Console); plain raster maps ignore `heading`, so
// rotating the marker icon itself is what actually works here.
function bearingDegrees(a, b) {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// Walks the decoded route path and returns the {lat,lng,heading} at
// `fraction` (0-1) of the total path length — used to animate the simulated
// vehicle marker, including which way it should be pointing.
function positionAlongPath(path, fraction) {
  if (!path.length) return null;
  if (path.length === 1) return { ...path[0], heading: 0 };

  const segmentLengths = [];
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const len = haversineMeters(path[i], path[i + 1]);
    segmentLengths.push(len);
    total += len;
  }
  if (total === 0) return { ...path[0], heading: 0 };

  let target = total * Math.min(Math.max(fraction, 0), 1);
  for (let i = 0; i < segmentLengths.length; i++) {
    if (target <= segmentLengths[i]) {
      const t = segmentLengths[i] === 0 ? 0 : target / segmentLengths[i];
      const a = path[i];
      const b = path[i + 1];
      return {
        lat: a.lat + (b.lat - a.lat) * t,
        lng: a.lng + (b.lng - a.lng) * t,
        heading: bearingDegrees(a, b),
      };
    }
    target -= segmentLengths[i];
  }
  const last = path[path.length - 1];
  const prev = path[path.length - 2];
  return { ...last, heading: bearingDegrees(prev, last) };
}

// For each stop (in route order), finds the closest point on `path` and
// returns its cumulative-distance fraction (0-1) along the whole path — the
// simulation pauses when the animated position crosses each of these.
function computeStopFractions(path, stops) {
  if (path.length < 2 || stops.length === 0) return [];

  const cumulative = [0];
  for (let i = 0; i < path.length - 1; i++) {
    cumulative.push(cumulative[i] + haversineMeters(path[i], path[i + 1]));
  }
  const total = cumulative[cumulative.length - 1];
  if (total === 0) return stops.map(() => 0);

  return stops.map((stop) => {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < path.length; i++) {
      const d = haversineMeters(path[i], { lat: stop.lat, lng: stop.lng });
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    return cumulative[bestIdx] / total;
  });
}

const STOP_PAUSE_MS = 2000;

export default function MapView({
  apiKey,
  depot,
  stops = [],
  path = [],
  simulating = false,
  durationMs = 20000,
  onProgress,
  // Driver-facing behavior: zoom into the depot while idle (instead of
  // fitting bounds to the whole route) and have the camera follow the
  // vehicle marker as it animates. Off by default since MapView is also used
  // for the admin's route-overview preview, where seeing the whole route at
  // once is the point.
  driverMode = false,
}) {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey || "",
    id: "pharma-fleet-google-maps",
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  const [vehiclePos, setVehiclePos] = useState(null);
  const startRef = useRef(null);
  const rafRef = useRef(null);
  const mapRef = useRef(null);
  const pauseUntilRef = useRef(null);
  const pauseAccumRef = useRef(0);
  const nextStopIndexRef = useRef(0);

  // Kept in a ref (rather than an effect dependency) so a new onProgress
  // function identity on every parent render doesn't restart the animation
  // effect — that was resetting startRef to null on nearly every frame,
  // pinning `fraction` at ~0 forever instead of ever counting up.
  const onProgressRef = useRef(onProgress);
  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  // Same pattern for the per-stop pause fractions: recomputed whenever
  // path/stops change (including polling-driven reference churn that
  // shouldn't restart a simulation already in progress).
  const stopFractionsRef = useRef([]);
  useEffect(() => {
    stopFractionsRef.current = computeStopFractions(path, stops);
  }, [path, stops]);

  useEffect(() => {
    if (!simulating || path.length < 2) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }
    startRef.current = null;
    pauseUntilRef.current = null;
    pauseAccumRef.current = 0;
    nextStopIndexRef.current = 0;
    if (driverMode && mapRef.current) {
      mapRef.current.setZoom(13);
    }

    function step(ts) {
      if (startRef.current == null) startRef.current = ts;

      if (pauseUntilRef.current != null) {
        if (ts < pauseUntilRef.current) {
          rafRef.current = requestAnimationFrame(step);
          return;
        }
        pauseAccumRef.current += STOP_PAUSE_MS;
        pauseUntilRef.current = null;
      }

      const drivingElapsed = ts - startRef.current - pauseAccumRef.current;
      let fraction = Math.min(Math.max(drivingElapsed / durationMs, 0), 1);

      const stopFractions = stopFractionsRef.current;
      const nextIdx = nextStopIndexRef.current;
      if (nextIdx < stopFractions.length && fraction >= stopFractions[nextIdx]) {
        fraction = stopFractions[nextIdx]; // snap exactly to the stop before pausing
        nextStopIndexRef.current = nextIdx + 1;
        pauseUntilRef.current = ts + STOP_PAUSE_MS;
      }

      const pos = positionAlongPath(path, fraction);
      setVehiclePos(pos);
      if (driverMode && pos && mapRef.current) {
        mapRef.current.setCenter(pos);
      }
      onProgressRef.current?.(fraction);
      if (fraction < 1) {
        rafRef.current = requestAnimationFrame(step);
      }
    }
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [simulating, path, durationMs, driverMode]);

  const center = useMemo(() => {
    if (depot) return depot;
    if (stops[0]) return { lat: stops[0].lat, lng: stops[0].lng };
    return { lat: 0, lng: 0 };
  }, [depot, stops]);

  const onLoad = useCallback((map) => {
    mapRef.current = map;
  }, []);

  useEffect(() => {
    if (!isLoaded || !mapRef.current || !window.google) return;
    if (simulating) return; // camera follows the vehicle instead — see the effect above

    if (driverMode && depot) {
      mapRef.current.setCenter(depot);
      mapRef.current.setZoom(15);
      return;
    }

    const bounds = new window.google.maps.LatLngBounds();
    let any = false;
    if (depot) {
      bounds.extend(depot);
      any = true;
    }
    stops.forEach((s) => {
      if (s.lat != null && s.lng != null) {
        bounds.extend({ lat: s.lat, lng: s.lng });
        any = true;
      }
    });
    if (any) mapRef.current.fitBounds(bounds, 60);
  }, [isLoaded, depot, stops, simulating, driverMode]);

  if (!apiKey) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-lg bg-neutral-100 p-4 text-center text-sm text-neutral-500 dark:bg-neutral-800">
        Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in .env.local to display the map.
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-lg bg-red-50 p-4 text-center text-sm text-red-600">
        Failed to load Google Maps: {String(loadError.message || loadError)}
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-lg bg-neutral-100 text-sm text-neutral-500 dark:bg-neutral-800">
        Loading map…
      </div>
    );
  }

  return (
    <GoogleMap mapContainerStyle={containerStyle} center={center} zoom={11} onLoad={onLoad}>
      {depot && (
        <Marker
          position={depot}
          label={{ text: "D", color: "white", fontSize: "11px" }}
          icon={{
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: "#111827",
            fillOpacity: 1,
            strokeColor: "white",
            strokeWeight: 2,
          }}
        />
      )}

      {stops.map((stop, i) => (
        <Marker
          key={stop.id || i}
          position={{ lat: stop.lat, lng: stop.lng }}
          label={{ text: String(stop.sequence ?? i + 1), color: "white", fontSize: "11px" }}
          icon={{
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 12,
            fillColor: stop.status === "delivered" ? "#16a34a" : "#2563eb",
            fillOpacity: 1,
            strokeColor: "white",
            strokeWeight: 2,
          }}
        />
      ))}

      {path.length > 1 && (
        <Polyline path={path} options={{ strokeColor: "#2563eb", strokeWeight: 4 }} />
      )}

      {vehiclePos && (
        <Marker
          position={vehiclePos}
          icon={{
            path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: 5,
            rotation: vehiclePos.heading ?? 0,
            fillColor: "#f97316",
            fillOpacity: 1,
            strokeColor: "#7c2d12",
            strokeWeight: 1,
          }}
        />
      )}
    </GoogleMap>
  );
}
