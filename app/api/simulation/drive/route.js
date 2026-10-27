import { NextResponse } from "next/server";
import {
  DRIVE_SPEEDS,
  getAllDrives,
  getDrive,
  getSpeed,
  setSpeed,
  skipToDestination,
  startDrive,
  stopDrive,
} from "@/lib/driveSimulation.server";

// Shared simulated drive for one vehicle (see lib/driveSimulation.server.js).
// Every response carries `serverNow` so clients can correct for clock skew
// between this server and their own clock before interpolating the position.

// ?vehicleId=... -> { drive, speed, speeds } for that vehicle; no vehicleId
// -> { drives } keyed by vehicleId, for the admin's fleet live map.
export async function GET(request) {
  const vehicleId = request.nextUrl.searchParams.get("vehicleId");
  if (!vehicleId) {
    return NextResponse.json({ drives: getAllDrives(), serverNow: Date.now() });
  }
  return NextResponse.json({
    drive: getDrive(vehicleId),
    speed: getSpeed(vehicleId),
    speeds: DRIVE_SPEEDS,
    serverNow: Date.now(),
  });
}

// Body: { vehicleId, speed } to change playback speed, or
// { vehicleId, skip: true } to jump the current drive to its destination.
export async function PATCH(request) {
  const { vehicleId, speed, skip } = await request.json();
  if (!vehicleId) {
    return NextResponse.json({ error: "vehicleId is required" }, { status: 400 });
  }
  try {
    if (speed != null) setSpeed(vehicleId, Number(speed));
    if (skip) skipToDestination(vehicleId);
    return NextResponse.json({
      drive: getDrive(vehicleId),
      speed: getSpeed(vehicleId),
      speeds: DRIVE_SPEEDS,
      serverNow: Date.now(),
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 422 });
  }
}

// Body: { vehicleId, deliveryId? } — deliveryId defaults to the next
// undelivered stop on the vehicle's route.
export async function POST(request) {
  const { vehicleId, deliveryId } = await request.json();
  if (!vehicleId) {
    return NextResponse.json({ error: "vehicleId is required" }, { status: 400 });
  }
  try {
    const drive = startDrive(vehicleId, deliveryId || null);
    return NextResponse.json({ drive, speed: getSpeed(vehicleId), speeds: DRIVE_SPEEDS, serverNow: Date.now() });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 422 });
  }
}

export async function DELETE(request) {
  const vehicleId = request.nextUrl.searchParams.get("vehicleId");
  if (!vehicleId) {
    return NextResponse.json({ error: "vehicleId query param is required" }, { status: 400 });
  }
  stopDrive(vehicleId);
  return NextResponse.json({ drive: null, serverNow: Date.now() });
}
