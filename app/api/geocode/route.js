import { NextResponse } from "next/server";
import { geocodeAddress } from "@/lib/googleMaps.server";

export async function POST(request) {
  const { address } = await request.json();
  if (!address) {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }
  try {
    const geo = await geocodeAddress(address);
    return NextResponse.json(geo);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 422 });
  }
}
