"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";
import { GOOGLE_MAPS_LIBRARIES } from "@/lib/googleMapsLibraries";
import { api } from "@/lib/apiClient";
import { useFleetDriveSimulation } from "@/lib/useDriveSimulation";
import CarMarker from "@/components/CarMarker";

const containerStyle = { width: "100%", height: "100%" };
const REFRESH_MS = 5000;

// One color per driver (by position in the drivers list), used for their
// car and legend dot — Google's brand/Material palette.
const DRIVER_COLORS = ["#1a73e8", "#d93025", "#188038", "#f29900", "#9334e6", "#12b5cb", "#e52592", "#e8710a"];

// Idle cars all sit at the depot; draw them fanned out around it (in screen
// space, so it holds at every zoom) so each one and the depot marker stay
// visible and clickable.
const IDLE_OFFSET_UNITS = 15;

// Every driver's current location on one map — a car where their simulated
// drive has them right now (the drives the web driver view and Android app
// start — see lib/useDriveSimulation.js), or at the depot if they haven't
// set off. No routes or stops are drawn. A filter shows all drivers or only
// selected ones. Fills its container; the filter and driver status cards
// float over the map.
export default function FleetLiveMap({ apiKey, settings, drivers, vehiclesById, deliveries, routes }) {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey || "",
    id: "pharma-fleet-google-maps",
    libraries: GOOGLE_MAPS_LIBRARIES,
  });
  const drives = useFleetDriveSimulation();

  // Delivery statuses and routes change from the driver apps too (marked
  // delivered, re-optimized), so poll them here rather than reloading the
  // whole admin page — that would clobber forms being edited in the side
  // panel. Refetch right away whenever the admin's own copy changes, so the
  // map reflects their actions immediately.
  const [live, setLive] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const [deliveries, routes] = await Promise.all([api.get("/api/deliveries"), api.get("/api/routes")]);
        if (!cancelled) setLive({ deliveries, routes });
      } catch {
        // Transient — the next poll retries.
      }
    };
    refresh();
    const interval = setInterval(refresh, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [deliveries, routes]);
  const currentDeliveries = live?.deliveries ?? deliveries;
  const currentRoutes = live?.routes ?? routes;

  const [panelOpen, setPanelOpen] = useState(true);

  const [mode, setMode] = useState("all"); // "all" | "select"
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const deliveriesById = useMemo(
    () => Object.fromEntries(currentDeliveries.map((d) => [d.id, d])),
    [currentDeliveries]
  );

  // Everything needed to draw and describe each driver, in drivers-list order.
  const fleet = useMemo(
    () =>
      drivers.map((driver, i) => {
        const route = driver.vehicleId ? currentRoutes[driver.vehicleId] : null;
        return {
          driver,
          color: DRIVER_COLORS[i % DRIVER_COLORS.length],
          vehicle: driver.vehicleId ? vehiclesById[driver.vehicleId] : null,
          route,
          stops: route ? route.deliveryIds.map((id) => deliveriesById[id]).filter(Boolean) : [],
        };
      }),
    [drivers, currentRoutes, vehiclesById, deliveriesById]
  );

  const visible = fleet.filter((f) => mode === "all" || selectedIds.has(f.driver.id));

  const depot = settings?.depotLat != null ? { lat: settings.depotLat, lng: settings.depotLng } : null;

  // Where each driver's car is right now: along their drive, or parked at
  // the depot (fanned out) when they have a vehicle but no drive yet.
  let idleIndex = 0;
  const positions = Object.fromEntries(
    fleet.map((f) => {
      const snapshot = f.vehicle ? drives[f.vehicle.id] : null;
      if (snapshot?.vehiclePos) return [f.driver.id, snapshot.vehiclePos];
      if (!f.vehicle || !depot) return [f.driver.id, null];
      const angle = (idleIndex++ * 2 * Math.PI) / 6;
      return [
        f.driver.id,
        {
          ...depot,
          heading: 0,
          offset: { x: IDLE_OFFSET_UNITS * Math.cos(angle), y: -IDLE_OFFSET_UNITS * Math.sin(angle) },
        },
      ];
    })
  );

  const mapRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const onLoad = useCallback((map) => {
    mapRef.current = map;
    setMapReady(true);
  }, []);
  const [initialCenter] = useState(() => depot || { lat: 0, lng: 0 });

  // Re-fit only when the selection changes (see MapView's cameraKey) — to
  // the area the shown drivers operate in (depot + their stops, which aren't
  // drawn), not their moving cars, so the view doesn't chase them.
  const cameraKey = JSON.stringify([
    depot ? [depot.lat, depot.lng] : null,
    ...visible.flatMap((f) => f.stops.map((s) => [s.lat, s.lng])),
  ]);
  useEffect(() => {
    if (!isLoaded || !mapReady || !window.google) return;
    const [depotPoint, ...stopPoints] = JSON.parse(cameraKey);
    const points = [...(depotPoint ? [depotPoint] : []), ...stopPoints];
    if (!points.length) return;
    const bounds = new window.google.maps.LatLngBounds();
    points.forEach(([lat, lng]) => bounds.extend({ lat, lng }));
    mapRef.current.fitBounds(bounds, 60);
  }, [isLoaded, mapReady, cameraKey]);

  function focus(f) {
    const pos = positions[f.driver.id];
    if (!mapRef.current || !pos) return;
    mapRef.current.panTo({ lat: pos.lat, lng: pos.lng });
    mapRef.current.setZoom(15);
  }

  function toggleDriver(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const card = "rounded-lg bg-white shadow-g2";

  return (
    <div className="relative h-full w-full">
      {!apiKey ? (
        <MapMessage>Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in .env.local to display the map.</MapMessage>
      ) : loadError ? (
        <MapMessage>Failed to load Google Maps: {String(loadError.message || loadError)}</MapMessage>
      ) : !isLoaded ? (
        <MapMessage>Loading map…</MapMessage>
      ) : (
        <GoogleMap
          mapContainerStyle={containerStyle}
          center={initialCenter}
          zoom={11}
          onLoad={onLoad}
          // Move the default controls off the top corners, where the filter
          // and driver status overlays sit.
          options={{
            mapTypeControlOptions: { position: window.google.maps.ControlPosition.BOTTOM_LEFT },
            fullscreenControlOptions: { position: window.google.maps.ControlPosition.RIGHT_BOTTOM },
          }}
        >
          {depot && (
            <Marker
              position={depot}
              title={settings.depotName || "Depot"}
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

          {visible.map(
            (f) =>
              positions[f.driver.id] && (
                <CarMarker
                  key={f.driver.id}
                  position={positions[f.driver.id]}
                  offset={positions[f.driver.id].offset}
                  color={f.color}
                  outline="#202124"
                  title={`${f.driver.name}${f.vehicle ? ` · ${f.vehicle.name}` : ""}`}
                  onClick={() => focus(f)}
                />
              )
          )}
        </GoogleMap>
      )}

      {/* Driver filter */}
      <div className={`absolute top-3 left-3 flex max-w-[calc(100%-1.5rem)] flex-col gap-2 p-2 sm:max-w-md ${card}`}>
        {/* Material segmented button */}
        <div className="inline-flex self-start overflow-hidden rounded-full border border-neutral-400 text-sm font-medium">
          {[
            ["all", "All drivers"],
            ["select", "Select drivers"],
          ].map(([value, label], i) => (
            <button
              key={value}
              onClick={() => setMode(value)}
              aria-pressed={mode === value}
              className={`flex h-8 items-center gap-1.5 px-4 transition-colors ${i > 0 ? "border-l border-neutral-400" : ""} ${
                mode === value ? "bg-primary-50 text-primary-800" : "text-neutral-700 hover:bg-neutral-100"
              }`}
            >
              {mode === value && <span aria-hidden="true">✓</span>}
              {label}
            </button>
          ))}
        </div>
        {mode === "select" && (
          <div className="flex flex-wrap gap-1.5">
            {drivers.length === 0 && <span className="text-sm text-neutral-500">No drivers yet.</span>}
            {fleet.map((f) => {
              const checked = selectedIds.has(f.driver.id);
              return (
                <button
                  key={f.driver.id}
                  onClick={() => toggleDriver(f.driver.id)}
                  aria-pressed={checked}
                  className={`flex h-8 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors ${
                    checked
                      ? "border-transparent bg-primary-50 text-primary-800"
                      : "border-neutral-300 text-neutral-700 hover:bg-neutral-100"
                  }`}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: f.color }} />
                  {f.driver.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Driver status */}
      <div className={`absolute top-3 right-3 hidden w-64 flex-col sm:flex ${card} max-h-[calc(100%-1.5rem)]`}>
        <button
          onClick={() => setPanelOpen((o) => !o)}
          className="flex items-center justify-between rounded-lg px-4 py-3 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
          aria-expanded={panelOpen}
        >
          Drivers ({visible.length})
          <span className="text-neutral-500">{panelOpen ? "▾" : "▸"}</span>
        </button>
        {panelOpen && (
          <ul className="flex flex-col divide-y divide-neutral-200 overflow-y-auto border-t border-neutral-200 pb-1">
            {drivers.length === 0 && <li className="px-4 py-3 text-sm text-neutral-500">Add a driver first.</li>}
            {drivers.length > 0 && visible.length === 0 && (
              <li className="px-4 py-3 text-sm text-neutral-500">Select one or more drivers to show them on the map.</li>
            )}
            {visible.map((f) => (
              <DriverStatus
                key={f.driver.id}
                entry={f}
                snapshot={f.vehicle ? drives[f.vehicle.id] : null}
                located={!!positions[f.driver.id]}
                onFocus={() => focus(f)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function DriverStatus({ entry, snapshot, located, onFocus }) {
  const { driver, vehicle, route, stops, color } = entry;
  const delivered = stops.filter((s) => s.status === "delivered").length;
  const target = snapshot ? stops.find((s) => s.id === snapshot.drive.deliveryId) : null;

  let status;
  if (!vehicle) status = "No vehicle assigned";
  else if (!route) status = "No optimized route";
  else if (snapshot?.driving) {
    const speed = snapshot.drive.speed;
    status = `Driving to ${target?.customerName ?? "stop"}${speed && speed !== 1 ? ` · ${speed}×` : ""}`;
  }
  else if (snapshot) status = `At ${target?.customerName ?? "stop"}`;
  else status = "At depot";

  return (
    <li>
      <button
        onClick={onFocus}
        disabled={!located}
        className="flex w-full flex-col gap-1 px-4 py-2.5 text-left transition-colors hover:bg-neutral-100 disabled:cursor-default disabled:hover:bg-transparent"
      >
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ backgroundColor: color }} />
          <span className="text-sm font-medium text-neutral-800">{driver.name}</span>
          {vehicle && <span className="text-xs text-neutral-500">{vehicle.name}</span>}
        </span>
        <span className="text-sm text-neutral-500">{status}</span>
        {snapshot?.driving && (
          <span className="h-1 w-full overflow-hidden rounded-full bg-neutral-200">
            <span
              className="block h-full rounded-full"
              style={{ width: `${Math.round(snapshot.progress * 100)}%`, backgroundColor: color }}
            />
          </span>
        )}
        {route && (
          <span className="text-xs text-neutral-400">
            {delivered}/{stops.length} delivered
          </span>
        )}
      </button>
    </li>
  );
}

function MapMessage({ children }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-neutral-50 p-4 text-center text-sm text-neutral-500">
      {children}
    </div>
  );
}
