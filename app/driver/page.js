"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { decodePolyline } from "@/lib/polyline";
import { useDriveSimulation } from "@/lib/useDriveSimulation";
import MapView from "@/components/MapView";
import Logo from "@/components/Logo";

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const POLL_MS = 5000;

export default function DriverPage() {
  return (
    <Suspense fallback={<p className="p-10 text-sm text-neutral-500">Loading…</p>}>
      <DriverView />
    </Suspense>
  );
}

function DriverView() {
  const searchParams = useSearchParams();
  const driverId = searchParams.get("driverId");

  const [settings, setSettings] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [routes, setRoutes] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadAll = useCallback(async () => {
    const [settings, drivers, deliveries, routes] = await Promise.all([
      api.get("/api/settings"),
      api.get("/api/drivers"),
      api.get("/api/deliveries"),
      api.get("/api/routes"),
    ]);
    setSettings(settings);
    setDrivers(drivers);
    setDeliveries(deliveries);
    setRoutes(routes);
  }, []);

  useEffect(() => {
    // Initial load, then poll so admin-side changes (assignments, route
    // optimization) show up here without a manual refresh.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll()
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    const interval = setInterval(() => loadAll().catch(() => {}), POLL_MS);
    return () => clearInterval(interval);
  }, [loadAll]);

  const driver = drivers.find((d) => d.id === driverId);
  const vehicleId = driver?.vehicleId || null;
  const route = vehicleId ? routes[vehicleId] : null;
  const {
    drive,
    legPath,
    vehiclePos,
    progress,
    driving,
    start: startDrive,
    speed,
    speedOptions,
    changeSpeed,
    skip,
  } = useDriveSimulation(vehicleId);

  const stops = useMemo(() => {
    if (!route) return [];
    return route.deliveryIds
      .map((id) => deliveries.find((d) => d.id === id))
      .filter(Boolean);
  }, [route, deliveries]);

  // Memoized so MapView's `center` prop (and the underlying <GoogleMap>) sees
  // a stable reference across renders — an inline object literal here was
  // recreated every render (including every animation frame during the
  // driving animation), and @react-google-maps/api resyncs the real map's
  // center to match a changed `center` prop, which was fighting the
  // simulation's own per-frame `setCenter` follow-camera calls in MapView.
  const depot = useMemo(
    () => (settings?.depotLat != null ? { lat: settings.depotLat, lng: settings.depotLng } : null),
    [settings]
  );

  // Depend on the polyline string itself, not the `route` object — `routes`
  // gets a brand-new object from every 5s poll even when nothing changed,
  // which would otherwise hand MapView a new `path` array on every poll tick.
  const routePolyline = route?.polyline;
  const path = useMemo(() => (routePolyline ? decodePolyline(routePolyline) : []), [routePolyline]);
  const nextStopId = stops.find((s) => s.status !== "delivered")?.id;
  const driveTarget = drive ? stops.find((s) => s.id === drive.deliveryId) : null;

  async function runDriveAction(action) {
    try {
      await action();
    } catch (err) {
      setError(err.message);
    }
  }

  async function startDriving() {
    try {
      await startDrive(nextStopId);
    } catch (err) {
      setError(err.message);
    }
  }

  async function markDelivered(deliveryId) {
    try {
      await api.patch(`/api/deliveries/${deliveryId}`, { status: "delivered" });
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!driverId) {
    return (
      <Centered>
        <p className="text-sm text-neutral-500">
          No driver selected. Go back to the <Link className="underline" href="/">home page</Link> and
          pick a driver.
        </p>
      </Centered>
    );
  }

  if (loading) {
    return (
      <Centered>
        <p className="text-sm text-neutral-500">Loading…</p>
      </Centered>
    );
  }

  if (!driver) {
    return (
      <Centered>
        <p className="text-sm text-neutral-500">Driver not found.</p>
      </Centered>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <Logo size="sm" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Hi, {driver.name}</h1>
            <p className="text-sm text-neutral-500">
              {vehicleId ? "Your assigned route for today" : "No vehicle assigned yet"}
            </p>
          </div>
        </div>
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← Home
        </Link>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {!route ? (
        <p className="text-sm text-neutral-500">
          No optimized route yet. Ask an admin to assign and optimize deliveries for your vehicle.
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-3 rounded-lg border border-neutral-300 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-6 text-sm">
                <Stat label="Stops" value={stops.length} />
                <Stat label="Distance" value={`${(route.totalDistanceMeters / 1000).toFixed(1)} km`} />
                <Stat label="Est. duration" value={`${Math.round(route.totalDurationSeconds / 60)} min`} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {/* Playback speed — shared with the Android app and kept for the next legs. */}
                <label className="flex items-center gap-1.5 text-sm text-neutral-500">
                  Speed
                  <select
                    value={speed}
                    onChange={(e) => runDriveAction(() => changeSpeed(Number(e.target.value)))}
                    className="h-8 rounded-full border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-700"
                  >
                    {(speedOptions.length ? speedOptions : [1]).map((n) => (
                      <option key={n} value={n}>
                        {n}×
                      </option>
                    ))}
                  </select>
                </label>
                {driving && (
                  <button
                    onClick={() => runDriveAction(skip)}
                    className="h-8 rounded-full border border-neutral-300 px-4 text-sm font-medium text-primary-700 transition hover:bg-primary-50"
                  >
                    Skip to destination
                  </button>
                )}
                <button
                  onClick={startDriving}
                  disabled={driving || !nextStopId}
                  className="h-8 rounded-full bg-primary-700 px-4 text-sm font-medium text-white transition hover:bg-primary-800 disabled:opacity-50"
                >
                  {driving
                    ? `Driving to ${driveTarget?.customerName ?? "stop"}… ${Math.round(progress * 100)}%`
                    : "Start driving"}
                </button>
              </div>
            </div>
            <div className="h-80 w-full overflow-hidden rounded-lg">
              <MapView
                apiKey={GOOGLE_MAPS_API_KEY}
                depot={depot}
                stops={stops}
                path={path}
                vehiclePos={vehiclePos}
                legPath={driving ? legPath : []}
                following={driving}
                driverMode
              />
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-medium">Delivery checklist</h2>
            <ol className="flex flex-col gap-2">
              {stops.map((stop, i) => (
                <li
                  key={stop.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs text-white ${
                        stop.status === "delivered" ? "bg-green-600" : "bg-primary-700"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {stop.customerName}
                        {stop.requiresRefrigeration && <span className="ml-1 text-sky-600">❄</span>}
                      </span>
                      <span className="text-sm text-neutral-500">{stop.address}</span>
                      {(stop.windowStart || stop.windowEnd) && (
                        <span className="text-xs text-amber-600">
                          {stop.windowStart && stop.windowEnd
                            ? `Arrive ${stop.windowStart}–${stop.windowEnd}`
                            : stop.windowStart
                              ? `Arrive after ${stop.windowStart}`
                              : `Arrive by ${stop.windowEnd}`}
                        </span>
                      )}
                    </div>
                  </div>
                  {stop.status === "delivered" ? (
                    <span className="text-sm text-green-600">Delivered</span>
                  ) : stop.id === nextStopId ? (
                    <button
                      onClick={() => markDelivered(stop.id)}
                      className="rounded-full bg-primary-700 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-primary-800"
                    >
                      Mark delivered
                    </button>
                  ) : (
                    <span className="text-sm text-neutral-400">Waiting</span>
                  )}
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </main>
  );
}

function Stat({ label, value }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs uppercase text-neutral-400">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function Centered({ children }) {
  return <main className="flex flex-1 items-center justify-center p-10">{children}</main>;
}
