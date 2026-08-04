// Server-only client for Fleet Engine (fleetengine.googleapis.com) — the
// backend Google Maps Platform's Driver SDK reports location to. We
// provision DeliveryVehicle and Task entities here to mirror our own
// Vehicle/Delivery/Route store whenever a route is (re)computed, so the
// Android Driver SDK app (added in a later phase) has real entities to
// report location against.
//
// Auth: the identity actually running this server (locally: your ADC user;
// in Cloud Run: the attached service account) rarely holds Fleet Engine
// roles directly — those are typically granted to a dedicated backend
// service account instead (FLEET_ENGINE_BACKEND_SA). If that env var is set,
// we impersonate it via google-auth-library's `Impersonated` client, which
// requires only roles/iam.serviceAccountTokenCreator on that one SA (this
// mirrors the JWT-signer impersonation pattern used for the Driver SDK auth
// endpoint) — no key file, and tokens auto-refresh. If it's not set, we fall
// back to calling Fleet Engine directly as the ambient ADC identity, for
// setups where that identity already holds the Fleet Engine role itself
// (e.g. the Cloud Run service account, as in Route Optimization API's setup).
//
// Field shapes below were verified against Google's current REST reference
// (not assumed from the Route Optimization API's shapes, which differ):
// DeliveryVehicle.lastLocation uses `{ location: { latitude, longitude } }`,
// while Task.plannedLocation (a distinct message type, LocationInfo) uses
// `{ point: { latitude, longitude } }`.

import { GoogleAuth, Impersonated } from "google-auth-library";

const CLOUD_PLATFORM_SCOPE = ["https://www.googleapis.com/auth/cloud-platform"];
const auth = new GoogleAuth({ scopes: CLOUD_PLATFORM_SCOPE });
const BASE_URL = "https://fleetengine.googleapis.com/v1";

async function getAuthedClient() {
  try {
    const sourceClient = await auth.getClient();
    const backendSA = process.env.FLEET_ENGINE_BACKEND_SA;
    const client = backendSA
      ? new Impersonated({
          sourceClient,
          targetPrincipal: backendSA,
          lifetime: 3600,
          delegates: [],
          targetScopes: CLOUD_PLATFORM_SCOPE,
        })
      : sourceClient;
    const projectId =
      process.env.FLEET_ENGINE_PROVIDER_ID || process.env.GOOGLE_CLOUD_PROJECT || (await auth.getProjectId());
    return { client, projectId };
  } catch (err) {
    throw new Error(
      "Could not authenticate to Google Cloud for Fleet Engine. Locally, run " +
        "`gcloud auth application-default login`. Make sure the calling identity has " +
        "roles/iam.serviceAccountTokenCreator on FLEET_ENGINE_BACKEND_SA (if set), and " +
        `that SA has the fleetengine.deliveryAdmin role. (${err.message})`
    );
  }
}

function errorMessage(err) {
  return err.response?.data?.error?.message || err.message;
}

function isAlreadyExists(err) {
  return err.response?.status === 409 || err.response?.data?.error?.status === "ALREADY_EXISTS";
}

function isNotFound(err) {
  return err.response?.status === 404 || err.response?.data?.error?.status === "NOT_FOUND";
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

// Deletes a DeliveryVehicle — called when a vehicle is deleted from the app.
// Idempotent (already-gone is treated as success). Fleet Engine returns
// FAILED_PRECONDITION if open tasks still reference the vehicle.
export async function deleteDeliveryVehicle(vehicleId) {
  const { client, projectId } = await getAuthedClient();
  try {
    await client.request({
      url: `${BASE_URL}/providers/${projectId}/deliveryVehicles/${vehicleId}`,
      method: "DELETE",
    });
  } catch (err) {
    if (!isNotFound(err)) {
      throw new Error(`Fleet Engine: failed to delete DeliveryVehicle ${vehicleId}: ${errorMessage(err)}`);
    }
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

// Marks a Task closed/succeeded — called from the deliveries PATCH route
// when a delivery's status is set to "delivered".
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
