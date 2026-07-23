import { NextResponse } from "next/server";
import { listDrivers, createDriver } from "@/lib/store";

export async function GET() {
  return NextResponse.json(listDrivers());
}

export async function POST(request) {
  const body = await request.json();
  if (!body.name) {
    return NextResponse.json({ error: "Driver name is required" }, { status: 400 });
  }
  const driver = createDriver(body);
  return NextResponse.json(driver, { status: 201 });
}
