"use client";

import { useState } from "react";
import FieldLabel from "@/components/FieldLabel";
import { UserIcon, PhoneIcon, TruckIcon } from "@/components/icons";

export default function DriverForm({ vehicles, onCreate }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await onCreate({ name: name.trim(), phone: phone.trim(), vehicleId: vehicleId || null });
      setName("");
      setPhone("");
      setVehicleId("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <FieldLabel icon={UserIcon}>Name</FieldLabel>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Jane Doe"
          className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </div>
      <div className="flex flex-col gap-1">
        <FieldLabel icon={PhoneIcon}>Phone</FieldLabel>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="optional"
          className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </div>
      <div className="flex flex-col gap-1">
        <FieldLabel icon={TruckIcon}>Assigned vehicle</FieldLabel>
        <select
          value={vehicleId}
          onChange={(e) => setVehicleId(e.target.value)}
          className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        >
          <option value="">Unassigned</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={submitting || !name.trim()}
        className="rounded-md bg-teal-700 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-teal-800 disabled:opacity-50 dark:bg-teal-500 dark:text-teal-950 dark:hover:bg-teal-400"
      >
        {submitting ? "Adding…" : "Add driver"}
      </button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </form>
  );
}
