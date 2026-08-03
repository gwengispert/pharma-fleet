import { NextResponse } from "next/server";
import {
  getSettings,
  listVehicles,
  listDrivers,
  listDeliveries,
  updateDelivery,
  setRoute,
} from "@/lib/store";
import { optimizeRoute } from "@/lib/googleMaps.server";
import { syncDeliveryVehicle, syncTask } from "@/lib/fleetEngine.server";

export async function POST(request) {
  const { vehicleId, deliveryIds } = await request.json();

  if (!vehicleId || !Array.isArray(deliveryIds) || deliveryIds.length === 0) {
    return NextResponse.json(
      { error: "vehicleId and a non-empty deliveryIds array are required" },
      { status: 400 }
    );
  }

  const vehicle = listVehicles().find((v) => v.id === vehicleId);
  if (!vehicle) {
    return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
  }

  const settings = getSettings();
  if (settings.depotLat == null || settings.depotLng == null) {
    return NextResponse.json(
      { error: "Set the depot address in Settings before optimizing a route." },
      { status: 422 }
    );
  }

  const deliveries = deliveryIds.map((id) => listDeliveries().find((d) => d.id === id));
  const missing = deliveries.some((d) => !d);
  if (missing) {
    return NextResponse.json({ error: "One or more deliveries not found" }, { status: 404 });
  }
  const missingCoords = deliveries.some((d) => d.lat == null || d.lng == null);
  if (missingCoords) {
    return NextResponse.json(
      { error: "One or more deliveries could not be geocoded and have no coordinates." },
      { status: 422 }
    );
  }

  const origin = { lat: settings.depotLat, lng: settings.depotLng };
  const waypoints = deliveries.map((d) => ({ lat: d.lat, lng: d.lng }));

  let result;
  try {
    result = await optimizeRoute({ origin, waypoints, destination: origin });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }

  const orderedDeliveryIds = result.waypointOrder.map((idx) => deliveries[idx].id);
  const orderedDeliveryIdSet = new Set(orderedDeliveryIds);

  // This vehicle's previous route may have included deliveries that aren't
  // part of the new one (e.g. a re-optimize with a different stop set). Those
  // would otherwise be left permanently "assigned" to a route that no longer
  // contains them — free them back to pending so they can be reassigned.
  listDeliveries()
    .filter((d) => d.assignedVehicleId === vehicleId && !orderedDeliveryIdSet.has(d.id))
    .forEach((d) => {
      updateDelivery(d.id, {
        assignedVehicleId: null,
        assignedDriverId: null,
        sequence: null,
        status: "pending",
      });
    });

  const driver = listDrivers().find((d) => d.vehicleId === vehicleId) || null;
  const distanceKm = result.totalDistanceMeters / 1000;
  const estimatedCost = Math.round(distanceKm * settings.fuelCostPerKm * 100) / 100;

  const route = {
    vehicleId,
    driverId: driver?.id || null,
    deliveryIds: orderedDeliveryIds,
    polyline: result.polyline,
    legs: result.legs,
    totalDistanceMeters: result.totalDistanceMeters,
    totalDurationSeconds: result.totalDurationSeconds,
    estimatedCost,
    computedAt: new Date().toISOString(),
  };
  setRoute(vehicleId, route);

  orderedDeliveryIds.forEach((deliveryId, index) => {
    updateDelivery(deliveryId, {
      assignedVehicleId: vehicleId,
      assignedDriverId: driver?.id || null,
      sequence: index + 1,
      status: "assigned",
    });
  });

  // Best-effort sync into Fleet Engine — never break this already-working
  // response if the sync itself fails.
  let fleetEngineWarning = null;
  try {
    const deliveriesById = Object.fromEntries(listDeliveries().map((d) => [d.id, d]));
    for (const deliveryId of orderedDeliveryIds) {
      await syncTask(deliveriesById[deliveryId]);
    }
    await syncDeliveryVehicle({ vehicleId, deliveryIds: orderedDeliveryIds, deliveriesById });
  } catch (err) {
    fleetEngineWarning = err.message;
  }

  return NextResponse.json({ ...route, ...(fleetEngineWarning ? { fleetEngineWarning } : {}) });
}
