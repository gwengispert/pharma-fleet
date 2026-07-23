import { NextResponse } from "next/server";
import { updateDelivery, deleteDelivery } from "@/lib/store";
import { geocodeAddress } from "@/lib/googleMaps.server";

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
  return NextResponse.json(delivery);
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  deleteDelivery(id);
  return NextResponse.json({ ok: true });
}
