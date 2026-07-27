"use client";

import { useState } from "react";

export const VEHICLE_TYPES = ["van", "truck", "refrigerated truck", "motorcycle"];

export default function VehicleForm({ onCreate }) {
  const [name, setName] = useState("");
  const [type, setType] = useState(VEHICLE_TYPES[0]);
  const [capacityKg, setCapacityKg] = useState("");
  const [refrigerated, setRefrigerated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await onCreate({
        name: name.trim(),
        type,
        capacityKg: capacityKg ? Number(capacityKg) : null,
        refrigerated,
      });
      setName("");
      setCapacityKg("");
      setRefrigerated(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-neutral-500">Name / plate</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Van 01 - ABC123"
          className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-neutral-500">Type</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        >
          {VEHICLE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-neutral-500">Capacity (kg)</label>
        <input
          type="number"
          value={capacityKg}
          onChange={(e) => setCapacityKg(e.target.value)}
          placeholder="500"
          className="w-24 rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </div>
      <label className="flex items-center gap-2 pb-1.5 text-sm">
        <input
          type="checkbox"
          checked={refrigerated}
          onChange={(e) => setRefrigerated(e.target.checked)}
        />
        Refrigerated
      </label>
      <button
        type="submit"
        disabled={submitting || !name.trim()}
        className="rounded-md bg-teal-700 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-teal-800 disabled:opacity-50 dark:bg-teal-500 dark:text-teal-950 dark:hover:bg-teal-400"
      >
        {submitting ? "Adding…" : "Add vehicle"}
      </button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </form>
  );
}
