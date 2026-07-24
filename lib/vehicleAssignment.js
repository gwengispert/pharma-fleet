// Best-fit-decreasing bin packing: assigns deliveries to the vehicle that can
// carry the load with the least leftover capacity, so route optimization
// (Google Directions, called separately per vehicle) only ever runs on a
// grouping the vehicle can actually handle.
//
// Vehicles with no capacityKg set are treated as unlimited capacity.
// Deliveries that require refrigeration are only matched to refrigerated
// vehicles. Deliveries that don't fit any vehicle come back in `unassigned`.
export function assignDeliveriesToVehicles(deliveries, vehicles) {
  const remainingCapacity = new Map(
    vehicles.map((v) => [v.id, v.capacityKg == null ? Infinity : v.capacityKg])
  );
  const groups = new Map(); // vehicleId -> delivery[]
  const unassigned = [];

  const byWeightDesc = [...deliveries].sort((a, b) => (b.weightKg || 0) - (a.weightKg || 0));

  for (const delivery of byWeightDesc) {
    const weight = delivery.weightKg || 0;
    let bestVehicleId = null;
    let bestRemaining = Infinity;

    for (const vehicle of vehicles) {
      if (delivery.requiresRefrigeration && !vehicle.refrigerated) continue;
      const remaining = remainingCapacity.get(vehicle.id);
      if (remaining < weight) continue;
      if (remaining < bestRemaining) {
        bestRemaining = remaining;
        bestVehicleId = vehicle.id;
      }
    }

    if (bestVehicleId == null) {
      unassigned.push(delivery);
      continue;
    }

    remainingCapacity.set(bestVehicleId, remainingCapacity.get(bestVehicleId) - weight);
    if (!groups.has(bestVehicleId)) groups.set(bestVehicleId, []);
    groups.get(bestVehicleId).push(delivery);
  }

  return { groups, unassigned };
}
