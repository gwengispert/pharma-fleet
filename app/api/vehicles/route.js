import { NextResponse } from "next/server";
import { listVehicles, createVehicle } from "@/lib/store";

export async function GET() {
  return NextResponse.json(listVehicles());
}

export async function POST(request) {
  const body = await request.json();
  if (!body.name) {
    return NextResponse.json({ error: "Vehicle name is required" }, { status: 400 });
  }
  const vehicle = createVehicle(body);
  return NextResponse.json(vehicle, { status: 201 });
}
