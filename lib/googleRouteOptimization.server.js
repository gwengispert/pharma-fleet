// Server-only client for Google's Route Optimization API
// (routeoptimization.googleapis.com) — a fleet-wide vehicle routing problem
// (VRP) solver: given a set of vehicles (with capacities) and shipments (with
// load demands), it jointly decides which vehicle takes which stops *and*
// the shortest order for each vehicle's stops, all in one solve.
//
// Unlike the Directions/Geocoding APIs (simple `?key=` API keys), this is a
// Google Cloud API authenticated via OAuth2 / Application Default
// Credentials — it needs a service account or user credentials with access
// to the project, not a Maps Platform API key. In Cloud Run this is
// automatic via the attached service account; for local dev run
// `gcloud auth application-default login` once.

import { GoogleAuth } from "google-auth-library";

const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });

// A load-demand "type" isn't a physical unit Google defines — it's an
// arbitrary string key we choose. We use it as a trick to make the solver
// enforce refrigeration matching: refrigeration-requiring shipments demand
// 1 unit of "refrigerated" capacity, and non-refrigerated vehicles are given
// a hard limit of 0 units of it, so the solver can never place them there.
const REFRIGERATION_DEMAND_TYPE = "refrigerated";

async function getAuthClient() {
  try {
    const client = await auth.getClient();
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || (await auth.getProjectId());
    return { client, projectId };
  } catch (err) {
    throw new Error(
      "Could not authenticate to Google Cloud for the Route Optimization API. " +
        "Locally, run `gcloud auth application-default login`. In Cloud Run, make sure " +
        `the service's runtime service account has access to the project. (${err.message})`
    );
  }
}

// The API's Timestamp fields reject fractional seconds ("nanos must be unset").
function toWholeSecondRfc3339(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

// Delivery time windows are entered as "HH:MM" for today's dispatch — resolve
// against a shared midnight so every window lands in the same day.
function timeStringToDate(hhmm, todayMidnight) {
  const [hours, minutes] = hhmm.split(":").map(Number);
  const date = new Date(todayMidnight);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

// `vehicles`: [{ id, capacityKg, refrigerated }]
// `deliveries`: [{ id, lat, lng, weightKg, requiresRefrigeration, windowStart, windowEnd }]
// `depot`: { lat, lng }
// `dispatchDate`: "YYYY-MM-DD" — the day every delivery's "HH:MM" window is resolved
// against. Entered once in Settings and shared by every delivery, rather than always
// assuming "today" (which made windows go stale the moment the clock passed them).
// Returns { routes: [{ vehicleId, deliveryIds (ordered), polyline, totalDistanceMeters, totalDurationSeconds }], skippedDeliveryIds }
export async function optimizeFleetRoutes({ depot, vehicles, deliveries, dispatchDate }) {
  const { client, projectId } = await getAuthClient();

  const depotWaypoint = { location: { latLng: { latitude: depot.lat, longitude: depot.lng } } };

  const dispatchMidnight = dispatchDate ? new Date(`${dispatchDate}T00:00:00`) : new Date();
  if (!dispatchDate) dispatchMidnight.setHours(0, 0, 0, 0);

  const shipments = deliveries.map((d) => {
    const loadDemands = {};
    if (d.weightKg) loadDemands.weight = { amount: String(Math.round(d.weightKg)) };
    if (d.requiresRefrigeration) loadDemands[REFRIGERATION_DEMAND_TYPE] = { amount: "1" };

    const timeWindow = {};
    if (d.windowStart) timeWindow.startTime = toWholeSecondRfc3339(timeStringToDate(d.windowStart, dispatchMidnight));
    if (d.windowEnd) timeWindow.endTime = toWholeSecondRfc3339(timeStringToDate(d.windowEnd, dispatchMidnight));

    return {
      label: d.id,
      deliveries: [
        {
          arrivalWaypoint: {
            location: { latLng: { latitude: d.lat, longitude: d.lng } },
          },
          ...(timeWindow.startTime || timeWindow.endTime ? { timeWindows: [timeWindow] } : {}),
        },
      ],
      loadDemands,
    };
  });

  // A vehicle can never depart before the actual current moment — but if the
  // dispatch date is a future day, "now" (today) isn't a meaningful lower
  // bound at all, so use whichever is later. Without this, the solver would
  // either assume a same-day route can start hours before "now" (making
  // deadlines meaningless — see below) or, for a future dispatch date, be
  // wrongly bounded by today's clock time instead of that future day.
  const now = new Date();
  const earliestStart = now > dispatchMidnight ? now : dispatchMidnight;
  const nowTimeWindow = { startTime: toWholeSecondRfc3339(earliestStart) };

  const modelVehicles = vehicles.map((v) => {
    const loadLimits = {};
    if (v.capacityKg != null) loadLimits.weight = { maxLoad: String(Math.round(v.capacityKg)) };
    if (!v.refrigerated) loadLimits[REFRIGERATION_DEMAND_TYPE] = { maxLoad: "0" };
    return {
      label: v.id,
      startWaypoint: depotWaypoint,
      endWaypoint: depotWaypoint,
      startTimeWindows: [nowTimeWindow],
      loadLimits,
      // Without a non-zero cost field the solver has no actual objective to
      // minimize, so it won't reliably favor shorter routes or fewer vehicles.
      costPerKilometer: 1,
    };
  });

  // The end of the horizon must give the vehicle enough runway to actually
  // finish a route *from its earliest start*, not just "until midnight" — if
  // this runs late in the evening on dispatch day, "until midnight" might
  // only be an hour away, nowhere near enough to complete a multi-stop route
  // (the solver would rather skip shipments than blow through the horizon).
  // A full day from the earliest start guarantees enough room regardless of
  // when this runs, while still comfortably covering any "HH:MM" window
  // entered for later on the dispatch day.
  const horizonEnd = new Date(earliestStart.getTime() + 24 * 60 * 60 * 1000);

  const body = {
    model: {
      shipments,
      vehicles: modelVehicles,
      globalStartTime: toWholeSecondRfc3339(dispatchMidnight),
      globalEndTime: toWholeSecondRfc3339(horizonEnd),
    },
    populatePolylines: true,
  };

  let response;
  try {
    response = await client.request({
      url: `https://routeoptimization.googleapis.com/v1/projects/${projectId}:optimizeTours`,
      method: "POST",
      data: body,
    });
  } catch (err) {
    const detail = err.response?.data?.error?.message || err.message;
    throw new Error(`Route Optimization API request failed: ${detail}`);
  }

  const data = response.data;
  const deliveriesByLabel = new Map(deliveries.map((d) => [d.id, d]));

  const routes = (data.routes || [])
    .filter((route) => route.visits?.length)
    .map((route) => {
      const vehicleId = modelVehicles[route.vehicleIndex ?? 0]?.label;
      // shipmentIndex/vehicleIndex are proto3 fields, so a value of 0 (the
      // default) is omitted from the JSON response entirely — must default
      // the missing key back to 0, not treat it as "no shipment".
      const deliveryIds = route.visits
        .map((visit) => shipments[visit.shipmentIndex ?? 0]?.label)
        .filter((id) => id && deliveriesByLabel.has(id));

      const travelDurationSeconds = route.metrics?.travelDuration
        ? Math.round(parseFloat(route.metrics.travelDuration))
        : 0;

      return {
        vehicleId,
        deliveryIds,
        polyline: route.routePolyline?.points || "",
        totalDistanceMeters: route.metrics?.travelDistanceMeters || 0,
        totalDurationSeconds: travelDurationSeconds,
      };
    })
    .filter((route) => route.vehicleId);

  const skippedDeliveryIds = (data.skippedShipments || [])
    .map((skipped) => shipments[skipped.index ?? 0]?.label)
    .filter(Boolean);

  return { routes, skippedDeliveryIds };
}
