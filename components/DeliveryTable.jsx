"use client";

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
  onDelete,
}) {
  if (deliveries.length === 0) {
    return <p className="text-sm text-neutral-500">No deliveries yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-xs uppercase text-neutral-500 dark:border-neutral-800">
            {selectable && <th className="w-8 py-2"></th>}
            <th className="py-2 pr-3">Customer</th>
            <th className="py-2 pr-3">Address</th>
            <th className="py-2 pr-3">Priority</th>
            <th className="py-2 pr-3">Status</th>
            <th className="py-2 pr-3">Vehicle / Driver</th>
            <th className="py-2 pr-3">Seq</th>
            {onDelete && <th className="py-2"></th>}
          </tr>
        </thead>
        <tbody>
          {deliveries.map((d) => (
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
              {onDelete && (
                <td className="py-2 text-right">
                  <button
                    onClick={() => onDelete(d.id)}
                    className="text-xs text-neutral-400 hover:text-red-600"
                  >
                    delete
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
