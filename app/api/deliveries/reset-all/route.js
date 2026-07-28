import { NextResponse } from "next/server";
import { listDeliveries, listVehicles, updateDelivery, clearRoute } from "@/lib/store";

// Unassigns every non-pending delivery and clears every vehicle's route —
// a full reset before re-planning from scratch.
export async function POST() {
  let resetCount = 0;

  listDeliveries()
    .filter((d) => d.status !== "pending")
    .forEach((d) => {
      updateDelivery(d.id, {
        assignedVehicleId: null,
        assignedDriverId: null,
        sequence: null,
        status: "pending",
      });
      resetCount++;
    });

  listVehicles().forEach((v) => clearRoute(v.id));

  return NextResponse.json({ reset: resetCount });
}
