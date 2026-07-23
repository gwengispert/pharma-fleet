"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { decodePolyline } from "@/lib/polyline";
import VehicleForm from "@/components/VehicleForm";
import DriverForm from "@/components/DriverForm";
import DeliveryForm from "@/components/DeliveryForm";
import DeliveryTable from "@/components/DeliveryTable";
import RouteSummary from "@/components/RouteSummary";
import MapView from "@/components/MapView";
import AddressAutocomplete from "@/components/AddressAutocomplete";

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const TABS = ["Settings", "Vehicles", "Drivers", "Deliveries", "Assign & Optimize", "Data"];

export default function AdminPage() {
  const [tab, setTab] = useState(TABS[0]);
  const [settings, setSettings] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [routes, setRoutes] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function loadAll() {
    const [settings, vehicles, drivers, deliveries, routes] = await Promise.all([
      api.get("/api/settings"),
      api.get("/api/vehicles"),
      api.get("/api/drivers"),
      api.get("/api/deliveries"),
      api.get("/api/routes"),
    ]);
    setSettings(settings);
    setVehicles(vehicles);
    setDrivers(drivers);
    setDeliveries(deliveries);
    setRoutes(routes);
  }

  useEffect(() => {
    // Initial data load from the in-memory store via the API routes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll()
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const vehiclesById = useMemo(() => Object.fromEntries(vehicles.map((v) => [v.id, v])), [vehicles]);
  const driversById = useMemo(() => Object.fromEntries(drivers.map((d) => [d.id, d])), [drivers]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin Dashboard</h1>
          <p className="text-sm text-neutral-500">Vehicles, drivers, deliveries, and route optimization</p>
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

      <nav className="flex flex-wrap gap-2 border-b border-neutral-200 pb-2 dark:border-neutral-800">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-3 py-1.5 text-sm ${
              tab === t
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900"
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <>
          {tab === "Settings" && (
            <SettingsPanel settings={settings} onSaved={setSettings} />
          )}

          {tab === "Vehicles" && (
            <section className="flex flex-col gap-4">
              <VehicleForm
                onCreate={async (data) => {
                  const vehicle = await api.post("/api/vehicles", data);
                  setVehicles((v) => [...v, vehicle]);
                }}
              />
              <VehicleTable
                vehicles={vehicles}
                onDelete={async (id) => {
                  await api.del(`/api/vehicles/${id}`);
                  await loadAll();
                }}
              />
            </section>
          )}

          {tab === "Drivers" && (
            <section className="flex flex-col gap-4">
              <DriverForm
                vehicles={vehicles}
                onCreate={async (data) => {
                  const driver = await api.post("/api/drivers", data);
                  setDrivers((d) => [...d, driver]);
                }}
              />
              <DriverTable
                drivers={drivers}
                vehiclesById={vehiclesById}
                onDelete={async (id) => {
                  await api.del(`/api/drivers/${id}`);
                  await loadAll();
                }}
              />
            </section>
          )}

          {tab === "Deliveries" && (
            <section className="flex flex-col gap-4">
              <DeliveryForm
                onCreate={async (data) => {
                  const delivery = await api.post("/api/deliveries", data);
                  setDeliveries((d) => [...d, delivery]);
                }}
              />
              <DeliveryTable
                deliveries={deliveries}
                vehiclesById={vehiclesById}
                driversById={driversById}
                onDelete={async (id) => {
                  await api.del(`/api/deliveries/${id}`);
                  await loadAll();
                }}
              />
            </section>
          )}

          {tab === "Assign & Optimize" && (
            <AssignOptimizePanel
              vehicles={vehicles}
              deliveries={deliveries}
              vehiclesById={vehiclesById}
              driversById={driversById}
              routes={routes}
              settings={settings}
              onOptimized={loadAll}
            />
          )}

          {tab === "Data" && <DataPanel onImported={loadAll} />}
        </>
      )}
    </main>
  );
}

function Section({ title, children }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-5 dark:border-neutral-800">
      <h2 className="font-medium">{title}</h2>
      {children}
    </section>
  );
}

function SettingsPanel({ settings, onSaved }) {
  const [depotAddress, setDepotAddress] = useState(settings?.depotAddress || "");
  const [depotCoords, setDepotCoords] = useState(
    settings?.depotLat != null ? { lat: settings.depotLat, lng: settings.depotLng } : null
  );
  const [fuelCostPerKm, setFuelCostPerKm] = useState(settings?.fuelCostPerKm ?? 0.15);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function handleAddressChange(newValue) {
    setDepotAddress(newValue);
    setDepotCoords(null); // typed manually — needs re-geocoding on save
  }

  function handlePlaceSelected({ address, lat, lng }) {
    setDepotAddress(address);
    setDepotCoords({ lat, lng });
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = { depotAddress, fuelCostPerKm: Number(fuelCostPerKm) };
      if (depotCoords) {
        payload.depotLat = depotCoords.lat;
        payload.depotLng = depotCoords.lng;
      }
      const updated = await api.patch("/api/settings", payload);
      onSaved(updated);
      setDepotAddress(updated.depotAddress);
      setDepotCoords(updated.depotLat != null ? { lat: updated.depotLat, lng: updated.depotLng } : null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section title="Depot & cost settings">
      <form onSubmit={handleSave} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-500">Depot / warehouse address</label>
          <AddressAutocomplete
            apiKey={GOOGLE_MAPS_API_KEY}
            value={depotAddress}
            onChange={handleAddressChange}
            onPlaceSelected={handlePlaceSelected}
            countryRestriction="ph"
            placeholder="123 Rizal Ave, Makati City, Metro Manila"
            className="w-full max-w-lg rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          {settings?.depotLat != null && (
            <span className="text-xs text-neutral-400">
              Resolved: {settings.depotLat.toFixed(5)}, {settings.depotLng.toFixed(5)}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-500">Fuel cost per km ($)</label>
          <input
            type="number"
            step="0.01"
            value={fuelCostPerKm}
            onChange={(e) => setFuelCostPerKm(e.target.value)}
            className="w-32 rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </div>
        <div>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </form>
    </Section>
  );
}

function VehicleTable({ vehicles, onDelete }) {
  if (vehicles.length === 0) return <p className="text-sm text-neutral-500">No vehicles yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-xs uppercase text-neutral-500 dark:border-neutral-800">
            <th className="py-2 pr-3">Name</th>
            <th className="py-2 pr-3">Type</th>
            <th className="py-2 pr-3">Capacity</th>
            <th className="py-2 pr-3">Status</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {vehicles.map((v) => (
            <tr key={v.id} className="border-b border-neutral-100 dark:border-neutral-900">
              <td className="py-2 pr-3 font-medium">
                {v.name}
                {v.refrigerated && (
                  <span className="ml-1 text-xs text-sky-600" title="Refrigerated">
                    ❄
                  </span>
                )}
              </td>
              <td className="py-2 pr-3 text-neutral-500">{v.type}</td>
              <td className="py-2 pr-3 text-neutral-500">{v.capacityKg ? `${v.capacityKg} kg` : "—"}</td>
              <td className="py-2 pr-3 text-neutral-500">{v.status}</td>
              <td className="py-2 text-right">
                <button onClick={() => onDelete(v.id)} className="text-xs text-neutral-400 hover:text-red-600">
                  delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DriverTable({ drivers, vehiclesById, onDelete }) {
  if (drivers.length === 0) return <p className="text-sm text-neutral-500">No drivers yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-xs uppercase text-neutral-500 dark:border-neutral-800">
            <th className="py-2 pr-3">Name</th>
            <th className="py-2 pr-3">Phone</th>
            <th className="py-2 pr-3">Vehicle</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {drivers.map((d) => (
            <tr key={d.id} className="border-b border-neutral-100 dark:border-neutral-900">
              <td className="py-2 pr-3 font-medium">{d.name}</td>
              <td className="py-2 pr-3 text-neutral-500">{d.phone || "—"}</td>
              <td className="py-2 pr-3 text-neutral-500">{vehiclesById[d.vehicleId]?.name || "—"}</td>
              <td className="py-2 text-right">
                <button onClick={() => onDelete(d.id)} className="text-xs text-neutral-400 hover:text-red-600">
                  delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AssignOptimizePanel({
  vehicles,
  deliveries,
  vehiclesById,
  driversById,
  routes,
  settings,
  onOptimized,
}) {
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id || "");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [optimizing, setOptimizing] = useState(false);
  const [error, setError] = useState(null);

  // Reset the selection when the vehicle changes, without an effect
  // (see: https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
  const [prevVehicleId, setPrevVehicleId] = useState(vehicleId);
  if (vehicleId !== prevVehicleId) {
    setPrevVehicleId(vehicleId);
    setSelectedIds(new Set());
  }

  const pendingDeliveries = deliveries.filter((d) => d.status === "pending");
  const route = vehicleId ? routes[vehicleId] : null;
  const deliveriesById = useMemo(() => Object.fromEntries(deliveries.map((d) => [d.id, d])), [deliveries]);

  async function handleOptimize() {
    if (!vehicleId || selectedIds.size === 0) return;
    setOptimizing(true);
    setError(null);
    try {
      await api.post("/api/routes/optimize", {
        vehicleId,
        deliveryIds: Array.from(selectedIds),
      });
      setSelectedIds(new Set());
      await onOptimized();
    } catch (err) {
      setError(err.message);
    } finally {
      setOptimizing(false);
    }
  }

  if (vehicles.length === 0) {
    return <p className="text-sm text-neutral-500">Add a vehicle first.</p>;
  }
  if (settings?.depotLat == null) {
    return (
      <p className="text-sm text-neutral-500">
        Set the depot address under the Settings tab before optimizing routes.
      </p>
    );
  }

  const routeStops = route
    ? route.deliveryIds
        .map((id) => deliveriesById[id])
        .filter(Boolean)
        .map((d) => ({ ...d }))
    : [];
  const path = route ? decodePolyline(route.polyline) : [];

  return (
    <div className="flex flex-col gap-4">
      <Section title="Choose vehicle & stops">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-500">Vehicle</label>
          <select
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            className="w-64 rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          >
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>

        <p className="text-sm text-neutral-500">
          Select pending deliveries to assign to this vehicle, then optimize for the shortest total route.
        </p>
        <DeliveryTable
          deliveries={pendingDeliveries}
          vehiclesById={vehiclesById}
          driversById={driversById}
          selectable
          selectedIds={selectedIds}
          onToggleSelect={(id) =>
            setSelectedIds((prev) => {
              const next = new Set(prev);
              next.has(id) ? next.delete(id) : next.add(id);
              return next;
            })
          }
        />
        <div>
          <button
            onClick={handleOptimize}
            disabled={optimizing || selectedIds.size === 0}
            className="rounded-md bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            {optimizing ? "Optimizing…" : `Optimize route (${selectedIds.size} selected)`}
          </button>
          {error && <span className="ml-3 text-sm text-red-600">{error}</span>}
        </div>
      </Section>

      {route && (
        <Section title={`Route for ${vehiclesById[vehicleId]?.name}`}>
          <RouteSummary route={route} deliveriesById={deliveriesById} />
          <div className="h-96 w-full overflow-hidden rounded-lg">
            <MapView
              apiKey={GOOGLE_MAPS_API_KEY}
              depot={{ lat: settings.depotLat, lng: settings.depotLng }}
              stops={routeStops}
              path={path}
            />
          </div>
        </Section>
      )}
    </div>
  );
}

function DataPanel({ onImported }) {
  const fileInputRef = useRef(null);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  async function handleImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setMessage(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      await api.post("/api/state/import", json);
      setMessage("State imported successfully.");
      await onImported();
    } catch (err) {
      setError(err.message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <Section title="Save / restore session data">
      <p className="text-sm text-neutral-500">
        This demo stores data in memory only — it resets when the server restarts. Download the
        current state to a JSON file, and re-upload it later to restore vehicles, drivers,
        deliveries, and computed routes.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <a
          href="/api/state/export"
          className="rounded-md border border-neutral-300 px-4 py-1.5 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
        >
          Download state (JSON)
        </a>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="rounded-md border border-neutral-300 px-4 py-1.5 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
        >
          Upload state (JSON)
        </button>
        <input ref={fileInputRef} type="file" accept="application/json" hidden onChange={handleImport} />
      </div>
      {message && <p className="text-sm text-green-600">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </Section>
  );
}
