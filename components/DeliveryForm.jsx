"use client";

import { useState } from "react";

export default function DeliveryForm({ onCreate }) {
  const [customerName, setCustomerName] = useState("");
  const [address, setAddress] = useState("");
  const [priority, setPriority] = useState("normal");
  const [requiresRefrigeration, setRequiresRefrigeration] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!customerName.trim() || !address.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await onCreate({
        customerName: customerName.trim(),
        address: address.trim(),
        priority,
        requiresRefrigeration,
        notes: notes.trim(),
      });
      setCustomerName("");
      setAddress("");
      setPriority("normal");
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
        <div className="flex flex-[2] min-w-[240px] flex-col gap-1">
          <label className="text-xs text-neutral-500">Address</label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="123 Main St, Springfield, IL"
            className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-500">Priority</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          >
            <option value="normal">Normal</option>
            <option value="urgent">Urgent</option>
          </select>
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
          className="rounded-md bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {submitting ? "Adding…" : "Add delivery"}
        </button>
      </div>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </form>
  );
}
