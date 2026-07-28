import { NextResponse } from "next/server";
import { parseCsv } from "@/lib/csv";
import { createDriver, listVehicles } from "@/lib/store";

// Bulk-create drivers from a CSV: name,phone,vehicleName
// vehicleName is matched by exact name (case-insensitive) against existing
// vehicles — if it doesn't match anything, the driver is still created,
// just left unassigned, with a warning reported back.
export async function POST(request) {
  const { csv } = await request.json();
  if (!csv) {
    return NextResponse.json({ error: "csv is required" }, { status: 400 });
  }

  const rows = parseCsv(csv);
  const vehicles = listVehicles();
  const created = [];
  const errors = [];

  rows.forEach((row, i) => {
    const name = row.name?.trim();
    if (!name) {
      errors.push({ row: i + 2, message: "Missing name" });
      return;
    }

    let vehicleId = null;
    const vehicleName = row.vehicleName?.trim();
    if (vehicleName) {
      const match = vehicles.find((v) => v.name.toLowerCase() === vehicleName.toLowerCase());
      if (match) {
        vehicleId = match.id;
      } else {
        errors.push({ row: i + 2, message: `Vehicle "${vehicleName}" not found — added unassigned` });
      }
    }

    created.push(createDriver({ name, phone: row.phone?.trim() || "", vehicleId }));
  });

  return NextResponse.json({ created: created.length, drivers: created, errors });
}
