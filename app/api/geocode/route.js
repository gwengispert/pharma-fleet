import { NextResponse } from "next/server";
import { geocodeAddress, reverseGeocode } from "@/lib/googleMaps.server";

export async function POST(request) {
  const { address, lat, lng } = await request.json();
  try {
    if (lat != null && lng != null) {
      const geo = await reverseGeocode(lat, lng);
      return NextResponse.json(geo);
    }
    if (!address) {
      return NextResponse.json({ error: "address or lat/lng is required" }, { status: 400 });
    }
    const geo = await geocodeAddress(address);
    return NextResponse.json(geo);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 422 });
  }
}
