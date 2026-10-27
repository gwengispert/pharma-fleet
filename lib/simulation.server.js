// Offline stand-in for every server-side Google call (Geocoding, Directions,
// Route Optimization, Fleet Engine), switched on with SIMULATION_MODE=true.
// Built from data/simulation-state.json — a snapshot of a real session
// captured with `npm run sim:capture` — so the demo keeps working without
// spending API quota:
//
// - Geocoding: addresses seen in the snapshot resolve to their recorded
//   coordinates; anything else gets a stable pseudo-random point near the
//   depot (same address -> same point, every time).
// - Route optimization: if the requested stop set matches a recorded route
//   (or, fleet-wide, the full recorded plan), the real Google result —
//   order, road-following polyline, distance, duration — is replayed as-is.
//   Otherwise a local heuristic (nearest neighbor + 2-opt) orders the stops,
//   with straight-line polylines and distances estimated from haversine.
// - Fleet Engine: sync calls are no-ops.

import fixture from "@/data/simulation-state.json";
import { encodePolyline } from "@/lib/polyline";

// Haversine is as-the-crow-flies; real Metro Manila road routes in the
// snapshot run ~1.35x longer, at ~35 km/h average including traffic.
const ROAD_FACTOR = 1.35;
const AVG_SPEED_KMH = 35;
const FALLBACK_CENTER = { lat: 14.5995, lng: 120.9842 }; // Manila
const FAKE_GEOCODE_RADIUS_KM = 12;

export function isSimulation() {
  return process.env.SIMULATION_MODE === "true";
}

// The store's starting state in simulation mode. Delivered stops come back
// as "assigned" so the driver flow can be replayed from the top each restart.
export function getSimulationSeedState() {
  const state = structuredClone(fixture);
  state.deliveries.forEach((d) => {
    if (d.status === "delivered" || d.status === "in-transit") d.status = "assigned";
  });
  return state;
}

// ---- Geometry ----

function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function roadMeters(a, b) {
  return Math.round(haversineMeters(a, b) * ROAD_FACTOR);
}

function driveSeconds(meters) {
  return Math.round((meters / 1000 / AVG_SPEED_KMH) * 3600);
}

function coordKey({ lat, lng }) {
  return `${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`;
}

function sameKeySet(a, b) {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((k) => set.has(k));
}

// ---- Geocoding ----

function normalizeAddress(address) {
  return address.trim().toLowerCase().replace(/\s+/g, " ");
}

const knownPlaces = [
  ...(fixture.settings.depotLat != null
    ? [{ address: fixture.settings.depotAddress, lat: fixture.settings.depotLat, lng: fixture.settings.depotLng }]
    : []),
  ...fixture.deliveries
    .filter((d) => d.lat != null && d.lng != null)
    .map((d) => ({ address: d.address, lat: d.lat, lng: d.lng })),
];
const knownByAddress = new Map(knownPlaces.map((p) => [normalizeAddress(p.address), p]));

// FNV-1a, so an unknown address always lands on the same fake point.
function hashString(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export async function simGeocodeAddress(address) {
  const known = knownByAddress.get(normalizeAddress(address));
  if (known) return { lat: known.lat, lng: known.lng, formattedAddress: known.address };

  const center =
    fixture.settings.depotLat != null
      ? { lat: fixture.settings.depotLat, lng: fixture.settings.depotLng }
      : FALLBACK_CENTER;
  const hash = hashString(normalizeAddress(address));
  const angle = ((hash & 0xffff) / 0xffff) * 2 * Math.PI;
  const distanceKm = (2 + ((hash >>> 16) / 0xffff) * (FAKE_GEOCODE_RADIUS_KM - 2));
  const lat = center.lat + (distanceKm / 111.32) * Math.cos(angle);
  const lng = center.lng + (distanceKm / (111.32 * Math.cos((center.lat * Math.PI) / 180))) * Math.sin(angle);

  console.warn(`[simulation] "${address}" is not in the snapshot — using a simulated location.`);
  return { lat, lng, formattedAddress: address };
}

export async function simReverseGeocode(lat, lng) {
  const point = { lat, lng };
  const nearest = knownPlaces
    .map((p) => ({ ...p, meters: haversineMeters(point, p) }))
    .sort((a, b) => a.meters - b.meters)[0];
  if (nearest && nearest.meters < 300) {
    return { lat: nearest.lat, lng: nearest.lng, formattedAddress: nearest.address };
  }
  return { lat, lng, formattedAddress: `Simulated location (${lat.toFixed(5)}, ${lng.toFixed(5)})` };
}

// ---- Recorded routes ----

const deliveriesById = new Map(fixture.deliveries.map((d) => [d.id, d]));

const recordedRoutes = Object.values(fixture.routes)
  .filter((r) => r.deliveryIds.every((id) => deliveriesById.get(id)?.lat != null))
  .map((r) => ({
    vehicleId: r.vehicleId,
    stopKeys: r.deliveryIds.map((id) => coordKey(deliveriesById.get(id))),
    polyline: r.polyline,
    totalDistanceMeters: r.totalDistanceMeters,
    totalDurationSeconds: r.totalDurationSeconds,
  }));

// ---- Heuristic routing ----

// Orders `stops` into a short closed tour from/to the depot: greedy nearest
// neighbor, then 2-opt until no segment reversal shortens it. Plenty for the
// handful of stops a demo route has.
function orderStops(depot, stops) {
  const remaining = stops.map((_, i) => i);
  const order = [];
  let current = depot;
  while (remaining.length) {
    let bestIdx = 0;
    for (let i = 1; i < remaining.length; i++) {
      if (haversineMeters(current, stops[remaining[i]]) < haversineMeters(current, stops[remaining[bestIdx]])) {
        bestIdx = i;
      }
    }
    const [next] = remaining.splice(bestIdx, 1);
    order.push(next);
    current = stops[next];
  }

  const pointAt = (tour, i) => (i < 0 || i >= tour.length ? depot : stops[tour[i]]);
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < order.length - 1; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const before =
          haversineMeters(pointAt(order, i - 1), pointAt(order, i)) +
          haversineMeters(pointAt(order, j), pointAt(order, j + 1));
        const after =
          haversineMeters(pointAt(order, i - 1), pointAt(order, j)) +
          haversineMeters(pointAt(order, i), pointAt(order, j + 1));
        if (after < before - 1e-6) {
          order.splice(i, j - i + 1, ...order.slice(i, j + 1).reverse());
          improved = true;
        }
      }
    }
  }
  return order;
}

function formatDistance(meters) {
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(seconds) {
  const mins = Math.max(1, Math.round(seconds / 60));
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"}`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return `${hours} hour${hours === 1 ? "" : "s"}${rest ? ` ${rest} min${rest === 1 ? "" : "s"}` : ""}`;
}

// Builds legs for depot -> ordered stops -> depot. When a recorded total is
// supplied, the haversine leg estimates are scaled so they sum to it.
function buildLegs(depot, orderedStops, scaleTo) {
  const points = [depot, ...orderedStops, depot];
  const raw = points.slice(1).map((p, i) => roadMeters(points[i], p));
  const rawTotal = raw.reduce((s, m) => s + m, 0) || 1;
  const distanceScale = scaleTo ? scaleTo.totalDistanceMeters / rawTotal : 1;

  return raw.map((m, i) => {
    const distanceMeters = Math.round(m * distanceScale);
    const durationSeconds = scaleTo
      ? Math.round((m / rawTotal) * scaleTo.totalDurationSeconds)
      : driveSeconds(distanceMeters);
    return {
      distanceMeters,
      distanceText: formatDistance(distanceMeters),
      durationSeconds,
      durationText: formatDuration(durationSeconds),
      startAddress: points[i].address || "",
      endAddress: points[i + 1].address || "",
    };
  });
}

// Same contract as googleMaps.server.js#optimizeRoute.
export async function simOptimizeRoute({ origin, waypoints }) {
  if (!waypoints.length) {
    throw new Error("At least one delivery stop is required to optimize a route.");
  }

  const keys = waypoints.map(coordKey);
  const recorded = recordedRoutes.find((r) => sameKeySet(r.stopKeys, keys));

  if (recorded) {
    const waypointOrder = recorded.stopKeys.map((k) => keys.indexOf(k));
    const ordered = waypointOrder.map((i) => waypoints[i]);
    return {
      waypointOrder,
      polyline: recorded.polyline,
      totalDistanceMeters: recorded.totalDistanceMeters,
      totalDurationSeconds: recorded.totalDurationSeconds,
      legs: buildLegs(origin, ordered, recorded),
    };
  }

  const waypointOrder = orderStops(origin, waypoints);
  const ordered = waypointOrder.map((i) => waypoints[i]);
  const legs = buildLegs(origin, ordered);
  return {
    waypointOrder,
    polyline: encodePolyline([origin, ...ordered, origin]),
    totalDistanceMeters: legs.reduce((s, l) => s + l.distanceMeters, 0),
    totalDurationSeconds: legs.reduce((s, l) => s + l.durationSeconds, 0),
    legs,
  };
}

// Same contract as googleRouteOptimization.server.js#optimizeFleetRoutes.
// Time windows aren't modeled by the heuristic — only capacity and
// refrigeration are enforced.
export async function simOptimizeFleetRoutes({ depot, vehicles, deliveries }) {
  const vehicleIds = new Set(vehicles.map((v) => v.id));
  const idByKey = new Map(deliveries.map((d) => [coordKey(d), d.id]));
  const recordedKeys = recordedRoutes.flatMap((r) => r.stopKeys);

  const canReplay =
    recordedRoutes.length > 0 &&
    recordedRoutes.every((r) => vehicleIds.has(r.vehicleId)) &&
    sameKeySet(recordedKeys, [...idByKey.keys()]);

  if (canReplay) {
    return {
      routes: recordedRoutes.map((r) => ({
        vehicleId: r.vehicleId,
        deliveryIds: r.stopKeys.map((k) => idByKey.get(k)),
        polyline: r.polyline,
        totalDistanceMeters: r.totalDistanceMeters,
        totalDurationSeconds: r.totalDurationSeconds,
      })),
      skippedDeliveryIds: [],
    };
  }

  // Greedy assignment: repeatedly give the closest (vehicle tail, delivery)
  // pair that fits capacity/refrigeration. Refrigerated deliveries go first
  // so non-refrigerated ones can't use up the refrigerated vans' capacity.
  const plans = vehicles.map((v) => ({ vehicle: v, stops: [], loadKg: 0 }));
  const fits = (plan, d) =>
    (!d.requiresRefrigeration || plan.vehicle.refrigerated) &&
    (plan.vehicle.capacityKg == null || plan.loadKg + (d.weightKg || 0) <= plan.vehicle.capacityKg);

  const skippedDeliveryIds = [];
  for (const group of [deliveries.filter((d) => d.requiresRefrigeration), deliveries.filter((d) => !d.requiresRefrigeration)]) {
    const pending = [...group];
    while (pending.length) {
      let best = null;
      for (const plan of plans) {
        const tail = plan.stops.at(-1) || depot;
        pending.forEach((d, i) => {
          if (!fits(plan, d)) return;
          const meters = haversineMeters(tail, d);
          if (!best || meters < best.meters) best = { plan, index: i, meters };
        });
      }
      if (!best) {
        skippedDeliveryIds.push(...pending.map((d) => d.id));
        break;
      }
      const [delivery] = pending.splice(best.index, 1);
      best.plan.stops.push(delivery);
      best.plan.loadKg += delivery.weightKg || 0;
    }
  }

  const routes = plans
    .filter((p) => p.stops.length)
    .map(({ vehicle, stops }) => {
      const ordered = orderStops(depot, stops).map((i) => stops[i]);
      const legs = buildLegs(depot, ordered);
      return {
        vehicleId: vehicle.id,
        deliveryIds: ordered.map((d) => d.id),
        polyline: encodePolyline([depot, ...ordered, depot]),
        totalDistanceMeters: legs.reduce((s, l) => s + l.distanceMeters, 0),
        totalDurationSeconds: legs.reduce((s, l) => s + l.durationSeconds, 0),
      };
    });

  return { routes, skippedDeliveryIds };
}
