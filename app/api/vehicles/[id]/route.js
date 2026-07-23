import { NextResponse } from "next/server";
import { updateVehicle, deleteVehicle } from "@/lib/store";

export async function PATCH(request, { params }) {
  const { id } = await params;
  const body = await request.json();
  const vehicle = updateVehicle(id, body);
  if (!vehicle) {
    return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
  }
  return NextResponse.json(vehicle);
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  deleteVehicle(id);
  return NextResponse.json({ ok: true });
}
