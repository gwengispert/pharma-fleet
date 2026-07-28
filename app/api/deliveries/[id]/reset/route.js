import { NextResponse } from "next/server";
import { listDeliveries, updateDelivery, getRoute, setRoute, clearRoute } from "@/lib/store";

// Unassigns a single delivery back to "pending" — removes it from its
// vehicle's stored route (renumbering the remaining stops), without needing
// a full re-optimize. Note: the vehicle's distance/duration/polyline are
// left as-is and will be stale until the next optimize, since removing one
// stop doesn't change those without a real routing call.
export async function POST(request, { params }) {
  const { id } = await params;
  const delivery = listDeliveries().find((d) => d.id === id);
  if (!delivery) {
    return NextResponse.json({ error: "Delivery not found" }, { status: 404 });
  }

  if (delivery.assignedVehicleId) {
    const route = getRoute(delivery.assignedVehicleId);
    if (route) {
      const remainingIds = route.deliveryIds.filter((deliveryId) => deliveryId !== id);
      if (remainingIds.length === 0) {
        clearRoute(delivery.assignedVehicleId);
      } else {
        setRoute(delivery.assignedVehicleId, { ...route, deliveryIds: remainingIds });
        remainingIds.forEach((deliveryId, index) => {
          updateDelivery(deliveryId, { sequence: index + 1 });
        });
      }
    }
  }

  const updated = updateDelivery(id, {
    assignedVehicleId: null,
    assignedDriverId: null,
    sequence: null,
    status: "pending",
  });

  return NextResponse.json(updated);
}
