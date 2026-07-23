import { NextResponse } from "next/server";
import { listDeliveries, createDelivery } from "@/lib/store";
import { geocodeAddress } from "@/lib/googleMaps.server";

export async function GET() {
  return NextResponse.json(listDeliveries());
}

export async function POST(request) {
  const body = await request.json();
  if (!body.customerName || !body.address) {
    return NextResponse.json(
      { error: "Customer name and address are required" },
      { status: 400 }
    );
  }

  let lat = body.lat ?? null;
  let lng = body.lng ?? null;
  let address = body.address;

  if (lat == null || lng == null) {
    try {
      const geo = await geocodeAddress(body.address);
      lat = geo.lat;
      lng = geo.lng;
      address = geo.formattedAddress;
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
  }

  const delivery = createDelivery({ ...body, address, lat, lng });
  return NextResponse.json(delivery, { status: 201 });
}
