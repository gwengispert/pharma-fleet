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

  return NextResponse.json(route);
}
