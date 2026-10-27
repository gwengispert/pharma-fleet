"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GoogleMap, Marker, Polyline, useJsApiLoader } from "@react-google-maps/api";
import { GOOGLE_MAPS_LIBRARIES } from "@/lib/googleMapsLibraries";
import CarMarker from "@/components/CarMarker";

const containerStyle = { width: "100%", height: "100%" };

export default function MapView({
  apiKey,
  depot,
  stops = [],
  path = [],
  // The simulated vehicle, driven by useDriveSimulation (shared with the
  // Android app): its current {lat,lng,heading} and the leg it's driving,
  // highlighted over the full route.
  vehiclePos = null,
  legPath = [],
  // While true (and in driverMode), the camera follows `vehiclePos`.
  following = false,
  // Driver-facing behavior: zoom into the depot while idle (instead of
  // fitting bounds to the whole route) and have the camera follow the
  // vehicle marker as it drives. Off by default since MapView is also used
  // for the admin's route-overview preview, where seeing the whole route at
  // once is the point.
  driverMode = false,
}) {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey || "",
    id: "pharma-fleet-google-maps",
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  const mapRef = useRef(null);
  // State (not just the ref) so the idle-camera effect re-runs once the map
  // instance exists — onLoad fires after the first effects have run.
  const [mapReady, setMapReady] = useState(false);

  // Zoom in once when a drive starts; after that only re-center, so the
  // driver can still zoom by hand mid-drive.
  useEffect(() => {
    if (driverMode && following && mapRef.current) mapRef.current.setZoom(14);
  }, [driverMode, following]);

  // Read (not depended on) by the idle-camera effect below, so it can center
  // on a vehicle parked at a stop without re-running every animation frame.
  const vehiclePosRef = useRef(vehiclePos);
  useEffect(() => {
    vehiclePosRef.current = vehiclePos;
  }, [vehiclePos]);

  useEffect(() => {
    if (driverMode && following && vehiclePos && mapRef.current) {
      mapRef.current.setCenter({ lat: vehiclePos.lat, lng: vehiclePos.lng });
    }
  }, [driverMode, following, vehiclePos]);

  // Only the map's starting center. <GoogleMap> re-applies `center` whenever
  // the prop changes, which snapped the map back on every parent re-render
  // (polls, drive animation frames) — the camera is driven by the effects
  // here instead.
  const [initialCenter] = useState(() => {
    if (depot) return depot;
    if (stops[0]) return { lat: stops[0].lat, lng: stops[0].lng };
    return { lat: 0, lng: 0 };
  });

  const onLoad = useCallback((map) => {
    mapRef.current = map;
    setMapReady(true);
  }, []);

  // Depot and stop coordinates as a plain string, so the idle camera only
  // re-fits when one actually moves — parents hand MapView equal-but-new
  // depot/stops objects on every poll and animation frame, and depending on
  // those identities re-fit the map constantly, undoing any pan or zoom.
  const cameraKey = JSON.stringify({
    depot: depot ? [depot.lat, depot.lng] : null,
    stops: stops.filter((s) => s.lat != null && s.lng != null).map((s) => [s.lat, s.lng]),
  });

  useEffect(() => {
    if (!isLoaded || !mapReady || !window.google) return;
    if (following) return; // camera follows the vehicle instead — see the effects above

    const camera = JSON.parse(cameraKey);
    const depot = camera.depot && { lat: camera.depot[0], lng: camera.depot[1] };

    if (driverMode && (vehiclePosRef.current || depot)) {
      const parked = vehiclePosRef.current;
      mapRef.current.setCenter(parked ? { lat: parked.lat, lng: parked.lng } : depot);
      mapRef.current.setZoom(15);
      return;
    }

    const bounds = new window.google.maps.LatLngBounds();
    let any = false;
    if (depot) {
      bounds.extend(depot);
      any = true;
    }
    camera.stops.forEach(([lat, lng]) => {
      bounds.extend({ lat, lng });
      any = true;
    });
    if (any) mapRef.current.fitBounds(bounds, 60);
  }, [isLoaded, mapReady, cameraKey, following, driverMode]);

  if (!apiKey) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-lg bg-neutral-100 p-4 text-center text-sm text-neutral-500">
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
      <div className="flex h-full w-full items-center justify-center rounded-lg bg-neutral-100 text-sm text-neutral-500">
        Loading map…
      </div>
    );
  }

  return (
    <GoogleMap mapContainerStyle={containerStyle} center={initialCenter} zoom={11} onLoad={onLoad}>
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

      {legPath.length > 1 && (
        <Polyline path={legPath} options={{ strokeColor: "#f97316", strokeWeight: 5, zIndex: 1 }} />
      )}

      {vehiclePos && <CarMarker position={vehiclePos} />}
    </GoogleMap>
  );
}
