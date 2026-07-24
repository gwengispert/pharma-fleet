"use client";

import { useState } from "react";
import AddressAutocomplete from "@/components/AddressAutocomplete";

const STATUS_STYLES = {
  pending: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
  assigned: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "in-transit": "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  delivered: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
};

export default function DeliveryTable({
  deliveries,
  vehiclesById = {},
  driversById = {},
  selectable = false,
  selectedIds,
  onToggleSelect,
  apiKey,
  onUpdate,
  onDelete,
}) {
  const [editingId, setEditingId] = useState(null);

  if (deliveries.length === 0) {
    return <p className="text-sm text-neutral-500">No deliveries yet.</p>;
  }

  const showActions = Boolean(onUpdate || onDelete);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-xs uppercase text-neutral-500 dark:border-neutral-800">
            {selectable && <th className="w-8 py-2"></th>}
            <th className="py-2 pr-3">Customer</th>
            <th className="py-2 pr-3">Address</th>
            <th className="py-2 pr-3">Weight</th>
            <th className="py-2 pr-3">Priority</th>
            <th className="py-2 pr-3">Status</th>
            <th className="py-2 pr-3">Vehicle / Driver</th>
            <th className="py-2 pr-3">Seq</th>
            {showActions && <th className="py-2"></th>}
          </tr>
        </thead>
        <tbody>
          {deliveries.map((d) =>
            onUpdate && editingId === d.id ? (
              <DeliveryEditRow
                key={d.id}
                delivery={d}
                apiKey={apiKey}
                vehiclesById={vehiclesById}
                driversById={driversById}
                onCancel={() => setEditingId(null)}
                onSave={async (patch) => {
                  await onUpdate(d.id, patch);
                  setEditingId(null);
                }}
              />
            ) : (
              <tr key={d.id} className="border-b border-neutral-100 dark:border-neutral-900">
                {selectable && (
                  <td className="py-2">
                    <input
                      type="checkbox"
                      checked={selectedIds?.has(d.id) || false}
                      disabled={d.status !== "pending"}
                      onChange={() => onToggleSelect?.(d.id)}
                    />
                  </td>
                )}
                <td className="py-2 pr-3 font-medium">
                  {d.customerName}
                  {d.requiresRefrigeration && (
                    <span className="ml-1 text-xs text-sky-600" title="Requires refrigeration">
                      ❄
                    </span>
                  )}
                </td>
                <td className="py-2 pr-3 text-neutral-500">{d.address}</td>
                <td className="py-2 pr-3 text-neutral-500">{d.weightKg != null ? `${d.weightKg} kg` : "—"}</td>
                <td className="py-2 pr-3">
                  {d.priority === "urgent" ? (
                    <span className="font-medium text-red-600">Urgent</span>
                  ) : (
                    "Normal"
                  )}
                </td>
                <td className="py-2 pr-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[d.status] || ""}`}>
                    {d.status}
                  </span>
                </td>
                <td className="py-2 pr-3 text-neutral-500">
                  {vehiclesById[d.assignedVehicleId]?.name || "—"}
                  {d.assignedDriverId && driversById[d.assignedDriverId]
                    ? ` / ${driversById[d.assignedDriverId].name}`
                    : ""}
                </td>
                <td className="py-2 pr-3">{d.sequence ?? "—"}</td>
                {showActions && (
                  <td className="py-2 text-right whitespace-nowrap">
                    {onUpdate && (
                      <button
                        onClick={() => setEditingId(d.id)}
                        className="mr-3 text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                      >
                        edit
                      </button>
                    )}
                    {onDelete && (
                      <button onClick={() => onDelete(d.id)} className="text-xs text-neutral-400 hover:text-red-600">
                        delete
                      </button>
                    )}
                  </td>
                )}
              </tr>
            )
          )}
        </tbody>
      </table>
    </div>
  );
}

function DeliveryEditRow({ delivery, apiKey, vehiclesById = {}, driversById = {}, onSave, onCancel }) {
  const [customerName, setCustomerName] = useState(delivery.customerName);
  const [address, setAddress] = useState(delivery.address);
  const [coords, setCoords] = useState(
    delivery.lat != null ? { lat: delivery.lat, lng: delivery.lng } : null
  );
  const [weightKg, setWeightKg] = useState(delivery.weightKg ?? "");
  const [priority, setPriority] = useState(delivery.priority);
  const [requiresRefrigeration, setRequiresRefrigeration] = useState(delivery.requiresRefrigeration);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function handleAddressChange(newValue) {
    setAddress(newValue);
    setCoords(null); // typed manually — needs re-geocoding on save
  }

  function handlePlaceSelected({ address: resolvedAddress, lat, lng }) {
    setAddress(resolvedAddress);
    setCoords({ lat, lng });
  }

  async function handleSave() {
    if (!customerName.trim() || !address.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const patch = {
        customerName: customerName.trim(),
        address: address.trim(),
        weightKg: weightKg === "" ? null : Number(weightKg),
        priority,
        requiresRefrigeration,
      };
      if (coords) {
        patch.lat = coords.lat;
        patch.lng = coords.lng;
      }
      await onSave(patch);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <tr className="border-b border-neutral-100 dark:border-neutral-900">
      <td className="py-2 pr-3">
        <input
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </td>
      <td className="py-2 pr-3 min-w-[240px]">
        <AddressAutocomplete
          apiKey={apiKey}
          value={address}
          onChange={handleAddressChange}
          onPlaceSelected={handlePlaceSelected}
          countryRestriction="ph"
          coords={coords}
          className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </td>
      <td className="py-2 pr-3">
        <input
          type="number"
          min="0"
          value={weightKg}
          onChange={(e) => setWeightKg(e.target.value)}
          className="w-20 rounded-md border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </td>
      <td className="py-2 pr-3">
        <div className="flex items-center gap-2">
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="rounded-md border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          >
            <option value="normal">Normal</option>
            <option value="urgent">Urgent</option>
          </select>
          <label className="flex items-center gap-1 text-xs text-neutral-500" title="Requires refrigeration">
            <input
              type="checkbox"
              checked={requiresRefrigeration}
              onChange={(e) => setRequiresRefrigeration(e.target.checked)}
            />
            ❄
          </label>
        </div>
      </td>
      <td className="py-2 pr-3">
        <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[delivery.status] || ""}`}>
          {delivery.status}
        </span>
      </td>
      <td className="py-2 pr-3 text-neutral-500">
        {vehiclesById[delivery.assignedVehicleId]?.name || "—"}
        {delivery.assignedDriverId && driversById[delivery.assignedDriverId]
          ? ` / ${driversById[delivery.assignedDriverId].name}`
          : ""}
      </td>
      <td className="py-2 pr-3">{delivery.sequence ?? "—"}</td>
      <td className="py-2 text-right whitespace-nowrap align-top">
        <button
          onClick={handleSave}
          disabled={saving || !customerName.trim() || !address.trim()}
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
