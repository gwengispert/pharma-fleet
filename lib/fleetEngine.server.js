// Server-only client for Fleet Engine (fleetengine.googleapis.com) — the
// backend Google Maps Platform's Driver SDK reports location to. We
// provision DeliveryVehicle and Task entities here to mirror our own
// Vehicle/Delivery/Route store whenever a route is (re)computed, so the
// Android Driver SDK app (added in a later phase) has real entities to
// report location against.
//
// Uses the same OAuth/ADC pattern as lib/googleRouteOptimization.server.js —
// Fleet Engine access comes from the roles/fleetengine.deliveryAdmin IAM role
// granted to whichever identity runs this server, not a Maps API key.
//
// Field shapes below were verified against Google's current REST reference
// (not assumed from the Route Optimization API's shapes, which differ):
// DeliveryVehicle.lastLocation uses `{ location: { latitude, longitude } }`,
// while Task.plannedLocation (a distinct message type, LocationInfo) uses
// `{ point: { latitude, longitude } }`.

import { GoogleAuth } from "google-auth-library";

const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
const BASE_URL = "https://fleetengine.googleapis.com/v1";

async function getAuthedClient() {
  try {
    const client = await auth.getClient();
    const projectId =
      process.env.FLEET_ENGINE_PROVIDER_ID || process.env.GOOGLE_CLOUD_PROJECT || (await auth.getProjectId());
    return { client, projectId };
  } catch (err) {
    throw new Error(
      "Could not authenticate to Google Cloud for Fleet Engine. Locally, run " +
        "`gcloud auth application-default login`. In Cloud Run, make sure the " +
        `service's runtime service account has the fleetengine.deliveryAdmin role. (${err.message})`
    );
  }
}

function errorMessage(err) {
  return err.response?.data?.error?.message || err.message;
}

function isAlreadyExists(err) {
  return err.response?.status === 409 || err.response?.data?.error?.status === "ALREADY_EXISTS";
}

// Ensures a Fleet Engine DeliveryVehicle exists for this vehicle (idempotent
// create — already-exists is treated as success), then replaces its ordered
// remaining stops with one VehicleJourneySegment per delivery in the route.
// Safe to call repeatedly; the journey segments are fully replaced each time.
export async function syncDeliveryVehicle({ vehicleId, deliveryIds, deliveriesById }) {
  const { client, projectId } = await getAuthedClient();

  try {
    await client.request({
      url: `${BASE_URL}/providers/${projectId}/deliveryVehicles?${new URLSearchParams({ deliveryVehicleId: vehicleId })}`,
      method: "POST",
      data: {},
    });
  } catch (err) {
    if (!isAlreadyExists(err)) {
      throw new Error(`Fleet Engine: failed to create DeliveryVehicle ${vehicleId}: ${errorMessage(err)}`);
    }
  }

  const remainingVehicleJourneySegments = deliveryIds.map((deliveryId, index) => {
    const delivery = deliveriesById[deliveryId];
    return {
      stop: {
        state: index === 0 ? "ENROUTE" : "NEW",
        plannedLocation: { point: { latitude: delivery.lat, longitude: delivery.lng } },
        tasks: [{ taskId: deliveryId }],
      },
    };
  });

  try {
    await client.request({
      url: `${BASE_URL}/providers/${projectId}/deliveryVehicles/${vehicleId}?${new URLSearchParams({ updateMask: "remainingVehicleJourneySegments" })}`,
      method: "PATCH",
      data: { remainingVehicleJourneySegments },
    });
  } catch (err) {
    throw new Error(`Fleet Engine: failed to update DeliveryVehicle ${vehicleId} journey: ${errorMessage(err)}`);
  }
}

// Ensures a Fleet Engine Task exists for this delivery (idempotent create).
export async function syncTask(delivery) {
  const { client, projectId } = await getAuthedClient();

  const body = {
    type: "DELIVERY",
    state: "OPEN",
    trackingId: delivery.id,
    plannedLocation: { point: { latitude: delivery.lat, longitude: delivery.lng } },
    // Required by Fleet Engine — how long the driver is expected to spend at
    // the stop. We don't model this elsewhere yet, so use a flat default.
    taskDuration: "300s",
  };

  try {
    await client.request({
      url: `${BASE_URL}/providers/${projectId}/tasks?${new URLSearchParams({ taskId: delivery.id })}`,
      method: "POST",
      data: body,
    });
  } catch (err) {
    if (!isAlreadyExists(err)) {
      throw new Error(`Fleet Engine: failed to create Task ${delivery.id}: ${errorMessage(err)}`);
    }
  }
}

// Marks a Task closed/succeeded — intended to be called when a delivery is
// marked delivered (not wired up yet; a follow-up phase).
export async function closeTask(deliveryId) {
  const { client, projectId } = await getAuthedClient();
  try {
    await client.request({
      url: `${BASE_URL}/providers/${projectId}/tasks/${deliveryId}?${new URLSearchParams({ updateMask: "state,taskOutcome" })}`,
      method: "PATCH",
      data: { state: "CLOSED", taskOutcome: "SUCCEEDED" },
    });
  } catch (err) {
    throw new Error(`Fleet Engine: failed to close Task ${deliveryId}: ${errorMessage(err)}`);
  }
}
