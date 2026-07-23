"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { decodePolyline } from "@/lib/polyline";
import MapView from "@/components/MapView";

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
  const [simulating, setSimulating] = useState(false);
  const [progress, setProgress] = useState(0);

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

  const stops = useMemo(() => {
    if (!route) return [];
    return route.deliveryIds
      .map((id) => deliveries.find((d) => d.id === id))
      .filter(Boolean);
  }, [route, deliveries]);

  const path = useMemo(() => (route ? decodePolyline(route.polyline) : []), [route]);
  const nextStopId = stops.find((s) => s.status !== "delivered")?.id;

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
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Hi, {driver.name}</h1>
          <p className="text-sm text-neutral-500">
            {vehicleId ? "Your assigned route for today" : "No vehicle assigned yet"}
          </p>
        </div>
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← Home
        </Link>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {!route ? (
        <p className="text-sm text-neutral-500">
          No optimized route yet. Ask an admin to assign and optimize deliveries for your vehicle.
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-5 dark:border-neutral-800">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-6 text-sm">
                <Stat label="Stops" value={stops.length} />
                <Stat label="Distance" value={`${(route.totalDistanceMeters / 1000).toFixed(1)} km`} />
                <Stat label="Est. duration" value={`${Math.round(route.totalDurationSeconds / 60)} min`} />
              </div>
              <button
                onClick={() => {
                  setProgress(0);
                  setSimulating(true);
                }}
                disabled={simulating}
                className="rounded-md bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
              >
                {simulating ? `Driving… ${Math.round(progress * 100)}%` : "Start simulation"}
              </button>
            </div>
            <div className="h-80 w-full overflow-hidden rounded-lg">
              <MapView
                apiKey={GOOGLE_MAPS_API_KEY}
                depot={settings?.depotLat != null ? { lat: settings.depotLat, lng: settings.depotLng } : null}
                stops={stops}
                path={path}
                simulating={simulating}
                durationMs={20000}
                onProgress={(f) => {
                  setProgress(f);
                  if (f >= 1) setSimulating(false);
                }}
              />
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-medium">Delivery checklist</h2>
            <ol className="flex flex-col gap-2">
              {stops.map((stop, i) => (
                <li
                  key={stop.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 px-4 py-3 dark:border-neutral-800"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs text-white ${
                        stop.status === "delivered" ? "bg-green-600" : "bg-neutral-900 dark:bg-white dark:text-neutral-900"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {stop.customerName}
                        {stop.requiresRefrigeration && <span className="ml-1 text-sky-600">❄</span>}
                        {stop.priority === "urgent" && <span className="ml-1 text-red-600">urgent</span>}
                      </span>
                      <span className="text-sm text-neutral-500">{stop.address}</span>
                    </div>
                  </div>
                  {stop.status === "delivered" ? (
                    <span className="text-sm text-green-600">Delivered</span>
                  ) : stop.id === nextStopId ? (
                    <button
                      onClick={() => markDelivered(stop.id)}
                      className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-neutral-900"
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
