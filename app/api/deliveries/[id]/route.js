import { NextResponse } from "next/server";
import { updateDelivery, deleteDelivery } from "@/lib/store";
import { geocodeAddress } from "@/lib/googleMaps.server";
import { closeTask } from "@/lib/fleetEngine.server";

export async function PATCH(request, { params }) {
  const { id } = await params;
  const body = await request.json();

  if (body.address && body.lat == null && body.lng == null) {
    try {
      const geo = await geocodeAddress(body.address);
      body.lat = geo.lat;
      body.lng = geo.lng;
      body.address = geo.formattedAddress;
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
  }

  const delivery = updateDelivery(id, body);
  if (!delivery) {
    return NextResponse.json({ error: "Delivery not found" }, { status: 404 });
  }

  // Best-effort sync into Fleet Engine — never break this already-working
  // response if the sync itself fails (same pattern as the optimize routes).
  let fleetEngineWarning = null;
  if (body.status === "delivered") {
    try {
      await closeTask(id);
    } catch (err) {
      fleetEngineWarning = err.message;
    }
  }

  return NextResponse.json({ ...delivery, ...(fleetEngineWarning ? { fleetEngineWarning } : {}) });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  deleteDelivery(id);
  return NextResponse.json({ ok: true });
}
