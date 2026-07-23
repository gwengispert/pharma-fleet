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

// Walks the decoded route path and returns the {lat,lng} at `fraction` (0-1)
// of the total path length — used to animate the simulated vehicle marker.
function positionAlongPath(path, fraction) {
  if (!path.length) return null;
  if (path.length === 1) return path[0];

  const segmentLengths = [];
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const len = haversineMeters(path[i], path[i + 1]);
    segmentLengths.push(len);
    total += len;
  }
  if (total === 0) return path[0];

  let target = total * Math.min(Math.max(fraction, 0), 1);
  for (let i = 0; i < segmentLengths.length; i++) {
    if (target <= segmentLengths[i]) {
      const t = segmentLengths[i] === 0 ? 0 : target / segmentLengths[i];
      const a = path[i];
      const b = path[i + 1];
      return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
    }
    target -= segmentLengths[i];
  }
  return path[path.length - 1];
}

export default function MapView({
  apiKey,
  depot,
  stops = [],
  path = [],
  simulating = false,
  durationMs = 20000,
  onProgress,
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

  useEffect(() => {
    if (!simulating || path.length < 2) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }
    startRef.current = null;

    function step(ts) {
      if (startRef.current == null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const fraction = Math.min(elapsed / durationMs, 1);
      setVehiclePos(positionAlongPath(path, fraction));
      onProgress?.(fraction);
      if (fraction < 1) {
        rafRef.current = requestAnimationFrame(step);
      }
    }
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [simulating, path, durationMs, onProgress]);

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
  }, [isLoaded, depot, stops]);

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
