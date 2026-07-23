import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/store";
import { geocodeAddress } from "@/lib/googleMaps.server";

export async function GET() {
  return NextResponse.json(getSettings());
}

export async function PATCH(request) {
  const body = await request.json();

  // If the client already resolved coordinates (e.g. the admin picked a
  // suggestion from the Places autocomplete), trust them and skip a redundant
  // Geocoding API call. Only geocode when an address changed without coords.
  if (body.depotAddress && (body.depotLat == null || body.depotLng == null)) {
    try {
      const geo = await geocodeAddress(body.depotAddress);
      body.depotAddress = geo.formattedAddress;
      body.depotLat = geo.lat;
      body.depotLng = geo.lng;
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
  }

  const settings = updateSettings(body);
  return NextResponse.json(settings);
}
