import { NextResponse } from "next/server";
import {
  getSettings,
  listVehicles,
  listDrivers,
  listDeliveries,
  updateDelivery,
  setRoute,
  clearRoute,
} from "@/lib/store";
import { optimizeFleetRoutes } from "@/lib/googleRouteOptimization.server";
import { syncDeliveryVehicle, syncTask } from "@/lib/fleetEngine.server";

// Re-plans the whole fleet in one solve: every vehicle, every delivery that's
// not yet in-transit or delivered. Deliveries the solver can't fit anywhere
// (over capacity everywhere, or need refrigeration none of the fleet has) are
// reported back and left/reset to "pending". This fully supersedes any
// previous assignment for those deliveries, so nothing is left stale.
export async function POST() {
  const settings = getSettings();
  if (settings.depotLat == null || settings.depotLng == null) {
    return NextResponse.json(
      { error: "Set the depot address in Settings before optimizing routes." },
      { status: 422 }
    );
  }

  if (!settings.dispatchDate) {
    return NextResponse.json(
      { error: "Set the dispatch date in Settings before optimizing routes." },
      { status: 422 }
    );
  }

  const vehicles = listVehicles();
  if (vehicles.length === 0) {
    return NextResponse.json({ error: "Add at least one vehicle first." }, { status: 422 });
  }

  const eligibleDeliveries = listDeliveries().filter(
    (d) => (d.status === "pending" || d.status === "assigned") && d.lat != null && d.lng != null
  );
  if (eligibleDeliveries.length === 0) {
    return NextResponse.json(
      { error: "No pending deliveries with resolved coordinates to assign." },
      { status: 422 }
    );
  }

  const depot = { lat: settings.depotLat, lng: settings.depotLng };

  let result;
  try {
    result = await optimizeFleetRoutes({
      depot,
      vehicles,
      deliveries: eligibleDeliveries,
      dispatchDate: settings.dispatchDate,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }

  const drivers = listDrivers();
  const distanceKm = (meters) => meters / 1000;

  // Every vehicle we asked the solver to consider gets its route replaced —
  // vehicles that ended up with zero stops this time have their old (now
  // stale) route cleared, rather than left pointing at deliveries that have
  // since moved to a different vehicle.
  const routedVehicleIds = new Set(result.routes.map((r) => r.vehicleId));
  vehicles.filter((v) => !routedVehicleIds.has(v.id)).forEach((v) => clearRoute(v.id));

  const deliveriesById = Object.fromEntries(listDeliveries().map((d) => [d.id, d]));
  const fleetEngineWarnings = [];

  for (const route of result.routes) {
    const driver = drivers.find((d) => d.vehicleId === route.vehicleId) || null;
    const estimatedCost = Math.round(distanceKm(route.totalDistanceMeters) * settings.fuelCostPerKm * 100) / 100;

    const storedRoute = {
      vehicleId: route.vehicleId,
      driverId: driver?.id || null,
      deliveryIds: route.deliveryIds,
      polyline: route.polyline,
      legs: [],
      totalDistanceMeters: route.totalDistanceMeters,
      totalDurationSeconds: route.totalDurationSeconds,
      estimatedCost,
      computedAt: new Date().toISOString(),
    };
    setRoute(route.vehicleId, storedRoute);

    route.deliveryIds.forEach((deliveryId, index) => {
      updateDelivery(deliveryId, {
        assignedVehicleId: route.vehicleId,
        assignedDriverId: driver?.id || null,
        sequence: index + 1,
        status: "assigned",
      });
    });

    // Best-effort sync into Fleet Engine (the Driver SDK's backend) — a
    // failure here must never break the route-optimization response that
    // the admin dashboard and driver view already depend on.
    try {
      for (const deliveryId of route.deliveryIds) {
        await syncTask(deliveriesById[deliveryId]);
      }
      await syncDeliveryVehicle({ vehicleId: route.vehicleId, deliveryIds: route.deliveryIds, deliveriesById });
    } catch (err) {
      fleetEngineWarnings.push(err.message);
    }
  }

  // Every eligible delivery either landed in a route above or was skipped —
  // skipped ones (and any not mentioned at all) go back to pending.
  const assignedIds = new Set(result.routes.flatMap((r) => r.deliveryIds));
  eligibleDeliveries
    .filter((d) => !assignedIds.has(d.id))
    .forEach((d) => {
      updateDelivery(d.id, {
        assignedVehicleId: null,
        assignedDriverId: null,
        sequence: null,
        status: "pending",
      });
    });

  return NextResponse.json({
    vehicleCount: result.routes.length,
    deliveryCount: assignedIds.size,
    skippedDeliveryIds: result.skippedDeliveryIds,
    ...(fleetEngineWarnings.length > 0 ? { fleetEngineWarnings } : {}),
  });
}
