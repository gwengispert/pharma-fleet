"use client";

import { useState } from "react";
import AddressAutocomplete from "@/components/AddressAutocomplete";

export default function DeliveryForm({ apiKey, onCreate }) {
  const [customerName, setCustomerName] = useState("");
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState(null);
  const [weightKg, setWeightKg] = useState("");
  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");
  const [requiresRefrigeration, setRequiresRefrigeration] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  function handleAddressChange(newValue) {
    setAddress(newValue);
    setCoords(null); // typed manually — needs re-geocoding on save
  }

  function handlePlaceSelected({ address: resolvedAddress, lat, lng }) {
    setAddress(resolvedAddress);
    setCoords({ lat, lng });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!customerName.trim() || !address.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        customerName: customerName.trim(),
        address: address.trim(),
        windowStart: windowStart || null,
        windowEnd: windowEnd || null,
        requiresRefrigeration,
        notes: notes.trim(),
        weightKg: weightKg === "" ? null : Number(weightKg),
      };
      if (coords) {
        payload.lat = coords.lat;
        payload.lng = coords.lng;
      }
      await onCreate(payload);
      setCustomerName("");
      setAddress("");
      setCoords(null);
      setWeightKg("");
      setWindowStart("");
      setWindowEnd("");
      setRequiresRefrigeration(false);
      setNotes("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <div className="flex flex-1 min-w-[180px] flex-col gap-1">
          <label className="text-xs text-neutral-500">Customer / pharmacy</label>
          <input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Riverside Pharmacy"
            className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </div>
        <div className="flex flex-[2] min-w-[280px] flex-col gap-1">
          <label className="text-xs text-neutral-500">Address</label>
          <AddressAutocomplete
            apiKey={apiKey}
            value={address}
            onChange={handleAddressChange}
            onPlaceSelected={handlePlaceSelected}
            countryRestriction="ph"
            coords={coords}
            placeholder="123 Rizal Ave, Makati City, Metro Manila"
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-500">Weight (kg)</label>
          <input
            type="number"
            min="0"
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
            placeholder="optional"
            className="w-24 rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-500">Earliest arrival</label>
          <input
            type="time"
            value={windowStart}
            onChange={(e) => setWindowStart(e.target.value)}
            className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-500">Latest arrival</label>
          <input
            type="time"
            value={windowEnd}
            onChange={(e) => setWindowEnd(e.target.value)}
            className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </div>
        <label className="flex items-center gap-2 pb-1.5 text-sm">
          <input
            type="checkbox"
            checked={requiresRefrigeration}
            onChange={(e) => setRequiresRefrigeration(e.target.checked)}
          />
          Requires refrigeration
        </label>
        <div className="flex flex-1 min-w-[180px] flex-col gap-1">
          <label className="text-xs text-neutral-500">Notes</label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="optional"
            className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </div>
        <button
          type="submit"
          disabled={submitting || !customerName.trim() || !address.trim()}
          className="rounded-md bg-teal-700 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-teal-800 disabled:opacity-50 dark:bg-teal-500 dark:text-teal-950 dark:hover:bg-teal-400"
        >
          {submitting ? "Adding…" : "Add delivery"}
        </button>
      </div>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </form>
  );
}
