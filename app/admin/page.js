"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { decodePolyline } from "@/lib/polyline";
import VehicleForm from "@/components/VehicleForm";
import { VEHICLE_TYPES } from "@/lib/constants";
import FieldLabel from "@/components/FieldLabel";
import {
  MapPinIcon,
  DollarIcon,
  CalendarIcon,
  SettingsIcon,
  TruckIcon,
  UserIcon,
  BoxIcon,
  RouteIcon,
  DatabaseIcon,
  UploadIcon,
  UndoIcon,
} from "@/components/icons";
import DriverForm from "@/components/DriverForm";
import DeliveryForm from "@/components/DeliveryForm";
import DeliveryTable from "@/components/DeliveryTable";
import RouteSummary from "@/components/RouteSummary";
import MapView from "@/components/MapView";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import Logo from "@/components/Logo";

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const TABS = ["Settings", "Vehicles", "Drivers", "Deliveries", "Assign & Optimize", "Data"];
const TAB_ICONS = {
  Settings: SettingsIcon,
  Vehicles: TruckIcon,
  Drivers: UserIcon,
  Deliveries: BoxIcon,
  "Assign & Optimize": RouteIcon,
  Data: DatabaseIcon,
};

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
        <div className="flex flex-col gap-1">
          <Logo size="sm" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Admin Dashboard</h1>
            <p className="text-sm text-neutral-500">Vehicles, drivers, deliveries, and route optimization</p>
          </div>
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
        {TABS.map((t) => {
          const Icon = TAB_ICONS[t];
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ${
                tab === t
                  ? "bg-teal-700 text-white dark:bg-teal-500 dark:text-teal-950"
                  : "text-neutral-500 hover:bg-teal-50 dark:hover:bg-neutral-900"
              }`}
            >
              <Icon className="h-4 w-4 flex-none" />
              {t}
            </button>
          );
        })}
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
              <div className="flex flex-wrap items-start justify-between gap-3">
                <VehicleForm
                  onCreate={async (data) => {
                    const vehicle = await api.post("/api/vehicles", data);
                    setVehicles((v) => [...v, vehicle]);
                  }}
                />
                <CsvImportToggle
                  description="Download a template, fill it in, and upload it back to create many vehicles at once."
                  templateFilename="vehicles-template.csv"
                  templateContent={VEHICLE_CSV_TEMPLATE}
                  endpoint="/api/vehicles/import"
                  resultNoun="vehicles"
                  onImported={loadAll}
                />
              </div>
              <VehicleTable
                vehicles={vehicles}
                onUpdate={async (id, patch) => {
                  const updated = await api.patch(`/api/vehicles/${id}`, patch);
                  setVehicles((vs) => vs.map((v) => (v.id === id ? updated : v)));
                }}
                onDelete={async (id) => {
                  await api.del(`/api/vehicles/${id}`);
                  await loadAll();
                }}
              />
            </section>
          )}

          {tab === "Drivers" && (
            <section className="flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <DriverForm
                  vehicles={vehicles.filter((v) => !drivers.some((d) => d.vehicleId === v.id))}
                  onCreate={async (data) => {
                    const driver = await api.post("/api/drivers", data);
                    setDrivers((d) => [...d, driver]);
                  }}
                />
                <CsvImportToggle
                  description="Download a template, fill it in, and upload it back to create many drivers at once. The vehicleName column is matched against existing vehicle names."
                  templateFilename="drivers-template.csv"
                  templateContent={DRIVER_CSV_TEMPLATE}
                  endpoint="/api/drivers/import"
                  resultNoun="drivers"
                  onImported={loadAll}
                />
              </div>
              <DriverTable
                drivers={drivers}
                vehicles={vehicles}
                vehiclesById={vehiclesById}
                onUpdate={async (id, patch) => {
                  const updated = await api.patch(`/api/drivers/${id}`, patch);
                  setDrivers((ds) => ds.map((d) => (d.id === id ? updated : d)));
                }}
                onDelete={async (id) => {
                  await api.del(`/api/drivers/${id}`);
                  await loadAll();
                }}
              />
            </section>
          )}

          {tab === "Deliveries" && (
            <section className="flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <DeliveryForm
                  apiKey={GOOGLE_MAPS_API_KEY}
                  onCreate={async (data) => {
                    const delivery = await api.post("/api/deliveries", data);
                    setDeliveries((d) => [...d, delivery]);
                  }}
                />
                <CsvImportToggle
                  description="Download a template, fill it in, and upload it back to create many deliveries at once. Addresses are geocoded automatically."
                  templateFilename="deliveries-template.csv"
                  templateContent={DELIVERY_CSV_TEMPLATE}
                  endpoint="/api/deliveries/import"
                  resultNoun="deliveries"
                  onImported={loadAll}
                />
              </div>
              <DeliveryTable
                deliveries={deliveries}
                vehiclesById={vehiclesById}
                driversById={driversById}
                apiKey={GOOGLE_MAPS_API_KEY}
                onUpdate={async (id, patch) => {
                  const updated = await api.patch(`/api/deliveries/${id}`, patch);
                  setDeliveries((ds) => ds.map((d) => (d.id === id ? updated : d)));
                }}
                onDelete={async (id) => {
                  await api.del(`/api/deliveries/${id}`);
                  await loadAll();
                }}
                onReset={async (id) => {
                  await api.post(`/api/deliveries/${id}/reset`);
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
    <section className="flex flex-col gap-3 rounded-xl border border-neutral-200 border-t-2 border-t-teal-600 p-5 dark:border-neutral-800 dark:border-t-teal-600">
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
  const [dispatchDate, setDispatchDate] = useState(settings?.dispatchDate || "");
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
      const payload = {
        depotAddress,
        fuelCostPerKm: Number(fuelCostPerKm),
        dispatchDate: dispatchDate || null,
      };
      if (depotCoords) {
        payload.depotLat = depotCoords.lat;
        payload.depotLng = depotCoords.lng;
      }
      const updated = await api.patch("/api/settings", payload);
      onSaved(updated);
      setDepotAddress(updated.depotAddress);
      setDepotCoords(updated.depotLat != null ? { lat: updated.depotLat, lng: updated.depotLng } : null);
      setDispatchDate(updated.dispatchDate || "");
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
          <FieldLabel icon={MapPinIcon}>Depot / warehouse address</FieldLabel>
          <AddressAutocomplete
            apiKey={GOOGLE_MAPS_API_KEY}
            value={depotAddress}
            onChange={handleAddressChange}
            onPlaceSelected={handlePlaceSelected}
            countryRestriction="ph"
            coords={depotCoords}
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
          <FieldLabel icon={DollarIcon}>Fuel cost per km ($)</FieldLabel>
          <input
            type="number"
            step="0.01"
            value={fuelCostPerKm}
            onChange={(e) => setFuelCostPerKm(e.target.value)}
            className="w-32 rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </div>
        <div className="flex flex-col gap-1">
          <FieldLabel icon={CalendarIcon}>Dispatch date</FieldLabel>
          <input
            type="date"
            value={dispatchDate}
            onChange={(e) => setDispatchDate(e.target.value)}
            className="w-40 rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <span className="text-xs text-neutral-400">
            The day every delivery&apos;s arrival window (earliest/latest arrival) is resolved against.
          </span>
        </div>
        <div>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-teal-700 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-teal-800 disabled:opacity-50 dark:bg-teal-500 dark:text-teal-950 dark:hover:bg-teal-400"
          >
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </form>
    </Section>
  );
}

function VehicleTable({ vehicles, onUpdate, onDelete }) {
  const [editingId, setEditingId] = useState(null);

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
          {vehicles.map((v) =>
            editingId === v.id ? (
              <VehicleEditRow
                key={v.id}
                vehicle={v}
                onCancel={() => setEditingId(null)}
                onSave={async (patch) => {
                  await onUpdate(v.id, patch);
                  setEditingId(null);
                }}
              />
            ) : (
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
                <td className="py-2 text-right whitespace-nowrap">
                  <button
                    onClick={() => setEditingId(v.id)}
                    className="mr-3 text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                  >
                    edit
                  </button>
                  <button onClick={() => onDelete(v.id)} className="text-xs text-neutral-400 hover:text-red-600">
                    delete
                  </button>
                </td>
              </tr>
            )
          )}
        </tbody>
      </table>
    </div>
  );
}

function VehicleEditRow({ vehicle, onSave, onCancel }) {
  const [name, setName] = useState(vehicle.name);
  const [type, setType] = useState(vehicle.type);
  const [capacityKg, setCapacityKg] = useState(vehicle.capacityKg ?? "");
  const [refrigerated, setRefrigerated] = useState(vehicle.refrigerated);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: name.trim(),
        type,
        capacityKg: capacityKg === "" ? null : Number(capacityKg),
        refrigerated,
      });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <tr className="border-b border-neutral-100 dark:border-neutral-900">
      <td className="py-2 pr-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </td>
      <td className="py-2 pr-3">
        <div className="flex items-center gap-2">
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-md border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          >
            {VEHICLE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-xs text-neutral-500" title="Refrigerated">
            <input
              type="checkbox"
              checked={refrigerated}
              onChange={(e) => setRefrigerated(e.target.checked)}
            />
            ❄
          </label>
        </div>
      </td>
      <td className="py-2 pr-3">
        <input
          type="number"
          value={capacityKg}
          onChange={(e) => setCapacityKg(e.target.value)}
          className="w-20 rounded-md border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </td>
      <td className="py-2 pr-3 text-neutral-500">{vehicle.status}</td>
      <td className="py-2 text-right whitespace-nowrap">
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="mr-3 text-xs font-medium text-neutral-900 hover:underline disabled:opacity-50 dark:text-white"
        >
          {saving ? "Saving…" : "save"}
        </button>
        <button onClick={onCancel} className="text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200">
          cancel
        </button>
        {error && <div className="text-xs text-red-600">{error}</div>}
      </td>
    </tr>
  );
}

function DriverTable({ drivers, vehicles, vehiclesById, onUpdate, onDelete }) {
  const [editingId, setEditingId] = useState(null);

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
          {drivers.map((d) =>
            editingId === d.id ? (
              <DriverEditRow
                key={d.id}
                driver={d}
                vehicles={vehicles.filter(
                  (v) => v.id === d.vehicleId || !drivers.some((other) => other.id !== d.id && other.vehicleId === v.id)
                )}
                onCancel={() => setEditingId(null)}
                onSave={async (patch) => {
                  await onUpdate(d.id, patch);
                  setEditingId(null);
                }}
              />
            ) : (
              <tr key={d.id} className="border-b border-neutral-100 dark:border-neutral-900">
                <td className="py-2 pr-3 font-medium">{d.name}</td>
                <td className="py-2 pr-3 text-neutral-500">{d.phone || "—"}</td>
                <td className="py-2 pr-3 text-neutral-500">{vehiclesById[d.vehicleId]?.name || "—"}</td>
                <td className="py-2 text-right whitespace-nowrap">
                  <button
                    onClick={() => setEditingId(d.id)}
                    className="mr-3 text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                  >
                    edit
                  </button>
                  <button onClick={() => onDelete(d.id)} className="text-xs text-neutral-400 hover:text-red-600">
                    delete
                  </button>
                </td>
              </tr>
            )
          )}
        </tbody>
      </table>
    </div>
  );
}

function DriverEditRow({ driver, vehicles, onSave, onCancel }) {
  const [name, setName] = useState(driver.name);
  const [phone, setPhone] = useState(driver.phone || "");
  const [vehicleId, setVehicleId] = useState(driver.vehicleId || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({ name: name.trim(), phone: phone.trim(), vehicleId: vehicleId || null });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <tr className="border-b border-neutral-100 dark:border-neutral-900">
      <td className="py-2 pr-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </td>
      <td className="py-2 pr-3">
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </td>
      <td className="py-2 pr-3">
        <select
          value={vehicleId}
          onChange={(e) => setVehicleId(e.target.value)}
          className="rounded-md border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        >
          <option value="">Unassigned</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </td>
      <td className="py-2 text-right whitespace-nowrap">
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="mr-3 text-xs font-medium text-neutral-900 hover:underline disabled:opacity-50 dark:text-white"
        >
          {saving ? "Saving…" : "save"}
        </button>
        <button onClick={onCancel} className="text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200">
          cancel
        </button>
        {error && <div className="text-xs text-red-600">{error}</div>}
      </td>
    </tr>
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
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [autoAssignError, setAutoAssignError] = useState(null);
  const [autoAssignResult, setAutoAssignResult] = useState(null);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState(null);

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

  async function handleAutoAssign() {
    setAutoAssigning(true);
    setAutoAssignError(null);
    setAutoAssignResult(null);
    try {
      const result = await api.post("/api/routes/optimize-fleet", {});
      setAutoAssignResult(result);
      await onOptimized();
    } catch (err) {
      setAutoAssignError(err.message);
    } finally {
      setAutoAssigning(false);
    }
  }

  async function handleResetAll() {
    if (!window.confirm("Unassign every delivery and clear all vehicle routes?")) return;
    setResetting(true);
    setResetError(null);
    try {
      await api.post("/api/deliveries/reset-all");
      setAutoAssignResult(null);
      await onOptimized();
    } catch (err) {
      setResetError(err.message);
    } finally {
      setResetting(false);
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
  const assignedCount = deliveries.filter((d) => d.status !== "pending").length;

  return (
    <div className="flex flex-col gap-4">
      <Section title="Auto-assign by weight">
        <p className="text-sm text-neutral-500">
          Solves the whole fleet at once with Google&apos;s Route Optimization API: which vehicle
          takes which deliveries (respecting weight capacity, refrigeration, and each
          delivery&apos;s arrival window) and each vehicle&apos;s shortest stop order, jointly.
        </p>
        <div>
          <button
            onClick={handleAutoAssign}
            disabled={autoAssigning || pendingDeliveries.length === 0 || !settings?.dispatchDate}
            className="rounded-md bg-teal-700 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-teal-800 disabled:opacity-50 dark:bg-teal-500 dark:text-teal-950 dark:hover:bg-teal-400"
          >
            {autoAssigning ? "Assigning…" : "Auto-assign & optimize routes"}
          </button>
          {!settings?.dispatchDate && (
            <span className="ml-3 text-sm text-neutral-500">
              Set the dispatch date under Settings first.
            </span>
          )}
          <button
            onClick={handleResetAll}
            disabled={resetting || assignedCount === 0}
            className="ml-2 inline-flex items-center gap-1.5 rounded-md border border-neutral-300 px-4 py-1.5 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            <UndoIcon className="h-4 w-4" />
            {resetting ? "Resetting…" : "Reset all assignments"}
          </button>
          {autoAssignError && <span className="ml-3 text-sm text-red-600">{autoAssignError}</span>}
          {resetError && <span className="ml-3 text-sm text-red-600">{resetError}</span>}
        </div>
        {autoAssignResult && (
          <div className="text-sm text-neutral-600 dark:text-neutral-300">
            <p>
              Assigned {autoAssignResult.deliveryCount} deliveries across {autoAssignResult.vehicleCount}{" "}
              vehicle{autoAssignResult.vehicleCount === 1 ? "" : "s"}.
            </p>
            {autoAssignResult.skippedDeliveryIds.length > 0 && (
              <p className="text-amber-600">
                Couldn&apos;t fit:{" "}
                {autoAssignResult.skippedDeliveryIds
                  .map((id) => deliveriesById[id]?.customerName || id)
                  .join(", ")}{" "}
                — no vehicle could fit it (capacity, refrigeration, or its arrival window).
              </p>
            )}
          </div>
        )}
      </Section>

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
            className="rounded-md bg-teal-700 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-teal-800 disabled:opacity-50 dark:bg-teal-500 dark:text-teal-950 dark:hover:bg-teal-400"
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

const VEHICLE_CSV_TEMPLATE = `name,type,capacityKg,refrigerated
Van 01 - ABC123,van,500,false
Reefer Truck 01,refrigerated truck,1200,true
`;

const DRIVER_CSV_TEMPLATE = `name,phone,vehicleName
Jane Doe,+63 900 000 0000,Van 01 - ABC123
`;

const DELIVERY_CSV_TEMPLATE = `customerName,address,weightKg,windowStart,windowEnd,requiresRefrigeration,notes
Riverside Pharmacy,"123 Rizal Ave, Makati City, Metro Manila",25,09:00,11:00,false,Leave at guard house
`;

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function CsvImportBlock({ templateFilename, templateContent, endpoint, resultNoun, onImported }) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const csv = await file.text();
      const res = await api.post(endpoint, { csv });
      setResult(res);
      await onImported();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => downloadTextFile(templateFilename, templateContent)}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
        >
          Download template
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
        >
          {uploading ? "Uploading…" : "Upload CSV"}
        </button>
        <input ref={fileInputRef} type="file" accept=".csv,text/csv" hidden onChange={handleUpload} />
      </div>
      {result && (
        <div className="text-xs">
          <p className="text-green-600">
            Created {result.created} {resultNoun}.
          </p>
          {result.errors?.length > 0 && (
            <ul className="mt-1 list-inside list-disc text-amber-600">
              {result.errors.map((e, i) => (
                <li key={i}>
                  Row {e.row}: {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function CsvImportToggle({ description, templateFilename, templateContent, endpoint, resultNoun, onImported }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={panelRef} className="relative flex-none">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
      >
        <UploadIcon className="h-3.5 w-3.5" />
        Bulk import CSV
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-2 w-72 rounded-lg border border-neutral-200 bg-white p-3 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          <p className="mb-2 text-xs text-neutral-500">{description}</p>
          <CsvImportBlock
            templateFilename={templateFilename}
            templateContent={templateContent}
            endpoint={endpoint}
            resultNoun={resultNoun}
            onImported={onImported}
          />
        </div>
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
