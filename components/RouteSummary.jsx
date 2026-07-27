"use client";

export default function RouteSummary({ route, deliveriesById = {} }) {
  if (!route) return null;

  const distanceKm = (route.totalDistanceMeters / 1000).toFixed(1);
  const durationMin = Math.round(route.totalDurationSeconds / 60);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-4 text-sm">
        <Stat label="Distance" value={`${distanceKm} km`} />
        <Stat label="Duration" value={`${durationMin} min`} />
        <Stat label="Estimated cost" value={`$${route.estimatedCost.toFixed(2)}`} />
        <Stat label="Computed" value={new Date(route.computedAt).toLocaleString()} />
      </div>
      <ol className="flex flex-col gap-1 text-sm">
        {route.deliveryIds.map((id, i) => {
          const delivery = deliveriesById[id];
          if (!delivery) return null;
          return (
            <li key={id} className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-700 text-xs text-white dark:bg-teal-500 dark:text-teal-950">
                {i + 1}
              </span>
              <span className="font-medium">{delivery.customerName}</span>
              <span className="text-neutral-500">— {delivery.address}</span>
            </li>
          );
        })}
      </ol>
    </div>
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
