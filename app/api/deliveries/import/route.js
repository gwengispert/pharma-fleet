import { NextResponse } from "next/server";
import { parseCsv, parseCsvBoolean, parseCsvNumber } from "@/lib/csv";
import { createDelivery } from "@/lib/store";
import { geocodeAddress } from "@/lib/googleMaps.server";

// Bulk-create deliveries from a CSV:
// customerName,address,weightKg,windowStart,windowEnd,requiresRefrigeration,notes
// Each address is geocoded server-side (sequentially, so one bad address
// doesn't abort the rest of the batch) before the delivery is created.
export async function POST(request) {
  const { csv } = await request.json();
  if (!csv) {
    return NextResponse.json({ error: "csv is required" }, { status: 400 });
  }

  const rows = parseCsv(csv);
  const created = [];
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const customerName = row.customerName?.trim();
    const address = row.address?.trim();

    if (!customerName || !address) {
      errors.push({ row: i + 2, message: "Missing customerName or address" });
      continue;
    }

    try {
      const geo = await geocodeAddress(address);
      created.push(
        createDelivery({
          customerName,
          address: geo.formattedAddress,
          lat: geo.lat,
          lng: geo.lng,
          weightKg: parseCsvNumber(row.weightKg),
          windowStart: row.windowStart?.trim() || null,
          windowEnd: row.windowEnd?.trim() || null,
          requiresRefrigeration: parseCsvBoolean(row.requiresRefrigeration),
          notes: row.notes?.trim() || "",
        })
      );
    } catch (err) {
      errors.push({ row: i + 2, message: `${customerName}: ${err.message}` });
    }
  }

  return NextResponse.json({ created: created.length, deliveries: created, errors });
}
