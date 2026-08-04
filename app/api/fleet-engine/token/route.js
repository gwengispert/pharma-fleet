import { NextResponse } from "next/server";
import { GoogleAuth, Impersonated } from "google-auth-library";
import { listVehicles } from "@/lib/store";

// Mints a short-lived OAuth2 bearer access token for the Android Driver
// SDK's AuthTokenFactory to present to Fleet Engine.
//
// Auth: impersonates FLEET_ENGINE_BACKEND_SA — the same backend SA and
// pattern lib/fleetEngine.server.js already uses for server-to-server Fleet
// Engine calls (roles/fleetengine.deliveryAdmin on the SA,
// roles/iam.serviceAccountTokenCreator on the calling identity). No
// dedicated signer SA or extra IAM grant needed.
//
// Trade-off: unlike a Fleet Engine JWT's `authorization.deliveryvehicleid`
// claim, a plain OAuth2 access token can't be scoped to a single vehicle —
// this token carries the backend SA's full deliveryAdmin access to every
// vehicle/task on the account, not just the one requested below. Chosen
// deliberately for this demo; a real deployment handing tokens to untrusted
// driver devices should go back to the scoped-JWT approach.
//
// Demo-grade: trusts the vehicleId query param with no driver
// authentication. A real deployment must authenticate the calling driver
// before minting a token for their vehicle.
const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
const TOKEN_LIFETIME_SECONDS = 3600; // IAM Credentials API's max for direct (non-chained) impersonation

export async function GET(request) {
  const vehicleId = request.nextUrl.searchParams.get("vehicleId");
  if (!vehicleId) {
    return NextResponse.json({ error: "vehicleId query param is required" }, { status: 400 });
  }

  const vehicle = listVehicles().find((v) => v.id === vehicleId);
  if (!vehicle) {
    return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
  }

  const backendSA = process.env.FLEET_ENGINE_BACKEND_SA;
  if (!backendSA) {
    return NextResponse.json({ error: "FLEET_ENGINE_BACKEND_SA is not configured" }, { status: 500 });
  }

  try {
    const sourceClient = await auth.getClient();
    const client = new Impersonated({
      sourceClient,
      targetPrincipal: backendSA,
      lifetime: TOKEN_LIFETIME_SECONDS,
      delegates: [],
      targetScopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
    const { token } = await client.getAccessToken();

    return NextResponse.json({
      token,
      expiration: new Date(client.credentials.expiry_date).toISOString(),
    });
  } catch (err) {
    const detail = err.response?.data?.error?.message || err.message;
    return NextResponse.json({ error: `Failed to mint Fleet Engine token: ${detail}` }, { status: 502 });
  }
}
