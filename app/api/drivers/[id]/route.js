import { NextResponse } from "next/server";
import { updateDriver, deleteDriver } from "@/lib/store";

export async function PATCH(request, { params }) {
  const { id } = await params;
  const body = await request.json();
  const driver = updateDriver(id, body);
  if (!driver) {
    return NextResponse.json({ error: "Driver not found" }, { status: 404 });
  }
  return NextResponse.json(driver);
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  deleteDriver(id);
  return NextResponse.json({ ok: true });
}
