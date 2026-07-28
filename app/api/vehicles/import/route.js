import { NextResponse } from "next/server";
import { parseCsv, parseCsvBoolean, parseCsvNumber } from "@/lib/csv";
import { createVehicle } from "@/lib/store";
import { VEHICLE_TYPES } from "@/lib/constants";

// Bulk-create vehicles from a CSV: name,type,capacityKg,refrigerated
export async function POST(request) {
  const { csv } = await request.json();
  if (!csv) {
    return NextResponse.json({ error: "csv is required" }, { status: 400 });
  }

  const rows = parseCsv(csv);
  const created = [];
  const errors = [];

  rows.forEach((row, i) => {
    const name = row.name?.trim();
    if (!name) {
      errors.push({ row: i + 2, message: "Missing name" });
      return;
    }
    const type = VEHICLE_TYPES.includes(row.type?.trim()) ? row.type.trim() : "van";
    created.push(
      createVehicle({
        name,
        type,
        capacityKg: parseCsvNumber(row.capacityKg),
        refrigerated: parseCsvBoolean(row.refrigerated),
      })
    );
  });

  return NextResponse.json({ created: created.length, vehicles: created, errors });
}
