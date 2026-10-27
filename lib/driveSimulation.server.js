// Server-authoritative "Start Driving" simulation, shared by the web driver
// view, the admin route preview and the Android app so they all show the
// same vehicle at the same spot. A drive is one leg of a vehicle's optimized
// route — from the depot (first stop) or the previous stop to the target
// stop — cut out of the route's stored road polyline (the real Google
// polyline captured in data/simulation-state.json, or a freshly optimized
// one). The server only records the drive's progress at one moment
// (`anchorAt` / `anchorProgress`) and how fast it's advancing from there
// (`speed`, 1 = real time); each client interpolates the position locally
// from that, so the animation is smooth everywhere yet in lockstep.
// Changing speed or skipping just moves the anchor, so the vehicle never
// jumps backwards.

import { getRoute, getSettings, listDeliveries } from "@/lib/store";
import { decodePolyline } from "@/lib/polyline";
import { bearingDegrees, haversineMeters, pathLengthMeters } from "@/lib/geo";
import directionsCache from "@/data/directions-cache.json";

// Playback speeds offered in the UIs (multiples of real time). Real time is
// the default; the chosen speed sticks per vehicle across legs.
export const DRIVE_SPEEDS = [1, 2, 5, 10, 30, 60];
const DEFAULT_SPEED = 1;

// vehicleId -> drive / chosen speed. Kept out of the exported state on
// purpose: a drive is transient playback, not part of a saved session.
const drives = globalThis.__pharmaFleetDrives || (globalThis.__pharmaFleetDrives = {});
const speeds = globalThis.__pharmaFleetDriveSpeeds || (globalThis.__pharmaFleetDriveSpeeds = {});

// Index of the path point closest to `point`, searching from `fromIndex`
// onward so stops are matched in route order (and the return leg to the
// depot, which may pass near earlier stops, isn't matched by mistake).
function closestIndex(path, point, fromIndex) {
  let best = fromIndex;
  let bestDist = Infinity;
  for (let i = fromIndex; i < path.length; i++) {
    const d = haversineMeters(path[i], point);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

// The path for leg `stopIndex`, starting and ending exactly on the depot /
// stop coordinates (road polylines snap to the street, a few meters off).
function legPath(route, stops, depot, stopIndex) {
  const from = stopIndex === 0 ? depot : stops[stopIndex - 1];
  const to = stops[stopIndex];
  const full = decodePolyline(route.polyline);
  if (full.length < 2) return [from, to];

  let start = 0;
  for (let i = 0; i < stopIndex; i++) start = closestIndex(full, stops[i], start);
  const end = closestIndex(full, to, start);
  return [from, ...full.slice(start, end + 1), to];
}

// ---- Turn-by-turn steps ----
// Each drive carries `steps` — [{ instruction, maneuver, startProgress }] —
// for the navigation header: the maneuver happens where the vehicle reaches
// `startProgress` (0-1 along the leg). The last step is always the arrival.

// Must match legKey() in scripts/capture-directions.mjs.
function legKey(from, to) {
  return `${from.lat.toFixed(5)},${from.lng.toFixed(5)}>${to.lat.toFixed(5)},${to.lng.toFixed(5)}`;
}

// A leg captured by `npm run sim:capture-directions`: its road path (the
// Directions steps' polylines, so instructions line up with the drive) and
// steps with the distance at which each begins.
function cachedLeg(from, to) {
  const entry = directionsCache[legKey(from, to)];
  if (!entry) return null;
  const path = [from];
  const steps = [];
  let meters = 0;
  for (const step of entry.steps) {
    steps.push({ instruction: step.instruction, maneuver: step.maneuver, startMeters: meters });
    for (const point of decodePolyline(step.polyline)) {
      meters += haversineMeters(path[path.length - 1], point);
      path.push(point);
    }
  }
  path.push(to);
  return { path, steps, realDurationSeconds: entry.durationSeconds };
}

const TURN_LOOK_M = 30; // how far before/after a vertex to measure the turn
const TURN_MIN_DEG = 30; // smaller bends are just the road curving
const TURN_CLUSTER_M = 60; // one maneuver per stretch this long
const TURN_END_MARGIN_M = 50; // the jog from the depot/stop pin onto the road isn't a turn

const CARDINALS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];

// Offline fallback for legs with no captured directions: finds the turns in
// the road geometry itself. No street names — "Turn right", "Slight left".
function geometricSteps(path) {
  const cumulative = [0];
  for (let i = 1; i < path.length; i++) cumulative.push(cumulative[i - 1] + haversineMeters(path[i - 1], path[i]));
  if (path.length < 2) return [];

  const heading = bearingDegrees(path[0], path[Math.min(path.length - 1, 1)]);
  const steps = [{ instruction: `Head ${CARDINALS[Math.round(heading / 45) % 8]}`, maneuver: null, startMeters: 0 }];

  let back = 0;
  let ahead = 0;
  let pending = null; // strongest turn in the current cluster
  const flush = () => {
    if (!pending) return;
    const abs = Math.abs(pending.delta);
    const side = pending.delta > 0 ? "right" : "left";
    const [maneuver, instruction] =
      abs >= 150
        ? ["uturn-" + side, "Make a U-turn"]
        : abs >= 60
          ? ["turn-" + side, `Turn ${side}`]
          : ["turn-slight-" + side, `Slight ${side}`];
    steps.push({ instruction, maneuver, startMeters: pending.meters });
    pending = null;
  };

  const total = cumulative[cumulative.length - 1];
  for (let i = 1; i < path.length - 1; i++) {
    if (cumulative[i] < TURN_END_MARGIN_M || cumulative[i] > total - TURN_END_MARGIN_M) continue;
    while (cumulative[i] - cumulative[back] > TURN_LOOK_M) back++;
    if (ahead < i) ahead = i;
    while (ahead < path.length - 1 && cumulative[ahead] - cumulative[i] < TURN_LOOK_M) ahead++;
    const from = back < i ? back : i - 1;
    const bearingIn = bearingDegrees(path[from], path[i]);
    const bearingOut = bearingDegrees(path[i], path[ahead]);
    const delta = ((bearingOut - bearingIn + 540) % 360) - 180;

    if (pending && cumulative[i] - pending.meters > TURN_CLUSTER_M) flush();
    if (Math.abs(delta) >= TURN_MIN_DEG && (!pending || Math.abs(delta) > Math.abs(pending.delta))) {
      pending = { delta, meters: cumulative[i] };
    }
  }
  flush();
  return steps;
}

// The leg's real-world length and drive time (its share of the route's
// totals). Never zero, so progress math always has a duration to divide by.
function legTiming(route, path) {
  const distanceMeters = pathLengthMeters(path);
  const routeMeters = route.totalDistanceMeters || pathLengthMeters(decodePolyline(route.polyline)) || 1;
  const realDurationSeconds = (distanceMeters / routeMeters) * (route.totalDurationSeconds || 0);
  return {
    distanceMeters: Math.round(distanceMeters),
    realDurationSeconds: Math.max(1, Math.round(realDurationSeconds)),
  };
}

// 0-1 progress of `drive` at server time `now`. Clients mirror this exactly
// (lib/useDriveSimulation.js, the Android app's MapActivity).
function progressAt(drive, now) {
  const advanced = ((now - drive.anchorAt) * drive.speed) / (drive.realDurationSeconds * 1000);
  return Math.min(1, Math.max(0, drive.anchorProgress + advanced));
}

// Re-anchors a drive at the current moment with new progress/speed.
function reanchor(drive, { progress, speed }) {
  const now = Date.now();
  drive.anchorProgress = progress ?? progressAt(drive, now);
  drive.anchorAt = now;
  if (speed != null) drive.speed = speed;
  return drive;
}

// Starts driving `vehicleId` to `deliveryId` (default: its next undelivered
// stop), replacing any drive already in progress for that vehicle.
export function startDrive(vehicleId, deliveryId) {
  const route = getRoute(vehicleId);
  if (!route) throw new Error("This vehicle has no optimized route yet.");

  const settings = getSettings();
  if (settings.depotLat == null || settings.depotLng == null) {
    throw new Error("Set the depot address in Settings before driving.");
  }
  const depot = { lat: settings.depotLat, lng: settings.depotLng };

  const deliveriesById = new Map(listDeliveries().map((d) => [d.id, d]));
  const stops = route.deliveryIds.map((id) => deliveriesById.get(id));
  if (stops.some((s) => !s || s.lat == null || s.lng == null)) {
    throw new Error("Every stop on the route needs coordinates to simulate driving.");
  }

  const stopIndex = deliveryId
    ? route.deliveryIds.indexOf(deliveryId)
    : stops.findIndex((s) => s.status !== "delivered");
  if (stopIndex < 0) {
    throw new Error(deliveryId ? "That delivery isn't on this vehicle's route." : "Every stop is already delivered.");
  }

  const from = stopIndex === 0 ? depot : stops[stopIndex - 1];
  const to = stops[stopIndex];
  const cached = cachedLeg(from, to);
  const path = cached?.path ?? legPath(route, stops, depot, stopIndex);
  const timing = legTiming(route, path);
  if (cached) timing.realDurationSeconds = Math.max(1, cached.realDurationSeconds);
  const legMeters = pathLengthMeters(path) || 1;
  const steps = [
    ...(cached?.steps ?? geometricSteps(path)),
    { instruction: `Arrive at ${to.customerName}`, maneuver: "arrive", startMeters: legMeters },
  ].map(({ startMeters, ...step }) => ({ ...step, startProgress: Math.min(1, startMeters / legMeters) }));
  const now = Date.now();
  const drive = {
    vehicleId,
    deliveryId: route.deliveryIds[stopIndex],
    stopIndex,
    path: path.map((p) => [p.lat, p.lng]),
    startedAt: now,
    // realDurationSeconds / distanceMeters: the real-world leg. Progress
    // advances `speed` times faster than real time from the anchor.
    ...timing,
    steps,
    speed: getSpeed(vehicleId),
    anchorAt: now,
    anchorProgress: 0,
  };
  drives[vehicleId] = drive;
  return drive;
}

// The vehicle's current drive (in progress, or finished and parked at its
// stop), or null. Dropped once the route no longer contains that stop,
// e.g. after a re-optimize.
export function getDrive(vehicleId) {
  const drive = drives[vehicleId];
  if (!drive) return null;
  if (!getRoute(vehicleId)?.deliveryIds.includes(drive.deliveryId)) {
    delete drives[vehicleId];
    return null;
  }
  return drive;
}

// Every vehicle's current drive, keyed by vehicleId — for the fleet live map.
export function getAllDrives() {
  return Object.fromEntries(
    Object.keys(drives)
      .map((vehicleId) => [vehicleId, getDrive(vehicleId)])
      .filter(([, drive]) => drive)
  );
}

export function getSpeed(vehicleId) {
  return speeds[vehicleId] ?? DEFAULT_SPEED;
}

// Sets the vehicle's playback speed — applied to the drive in progress from
// this moment on, and to its next legs.
export function setSpeed(vehicleId, speed) {
  if (!DRIVE_SPEEDS.includes(speed)) {
    throw new Error(`Speed must be one of ${DRIVE_SPEEDS.join(", ")}.`);
  }
  speeds[vehicleId] = speed;
  const drive = getDrive(vehicleId);
  if (drive) reanchor(drive, { speed });
  return drive;
}

// Jumps the drive in progress straight to its destination stop.
export function skipToDestination(vehicleId) {
  const drive = getDrive(vehicleId);
  if (!drive) throw new Error("This vehicle isn't driving.");
  return reanchor(drive, { progress: 1 });
}

export function stopDrive(vehicleId) {
  delete drives[vehicleId];
}
