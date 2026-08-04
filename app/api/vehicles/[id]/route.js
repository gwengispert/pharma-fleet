import { NextResponse } from "next/server";
import { updateVehicle, deleteVehicle } from "@/lib/store";
import { deleteDeliveryVehicle } from "@/lib/fleetEngine.server";

export async function PATCH(request, { params }) {
  const { id } = await params;
  const body = await request.json();
  const vehicle = updateVehicle(id, body);
  if (!vehicle) {
    return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
  }
  return NextResponse.json(vehicle);
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  deleteVehicle(id);

  // Best-effort sync into Fleet Engine — never break this already-working
  // response if the sync itself fails (same pattern as the optimize routes).
  let fleetEngineWarning = null;
  try {
    await deleteDeliveryVehicle(id);
  } catch (err) {
    fleetEngineWarning = err.message;
  }

  return NextResponse.json({ ok: true, ...(fleetEngineWarning ? { fleetEngineWarning } : {}) });
}
