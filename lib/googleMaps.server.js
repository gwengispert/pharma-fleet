// Server-only helpers that call the Google Maps HTTP APIs directly with the
// secret server API key (GOOGLE_MAPS_API_KEY). Never import this from client
// components — it reads process.env.GOOGLE_MAPS_API_KEY.

const DIRECTIONS_URL = "https://maps.googleapis.com/maps/api/directions/json";
const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";

function getApiKey() {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    throw new Error(
      "GOOGLE_MAPS_API_KEY is not set. Add it to .env.local (see .env.local.example)."
    );
  }
  return key;
}

export async function geocodeAddress(address) {
  const key = getApiKey();
  const url = `${GEOCODE_URL}?address=${encodeURIComponent(address)}&key=${key}`;
  const res = await fetch(url);
  const data = await res.json();

  if (data.status !== "OK" || !data.results?.length) {
    throw new Error(
      `Geocoding failed for "${address}": ${data.status}${data.error_message ? " - " + data.error_message : ""}`
    );
  }

  const { lat, lng } = data.results[0].geometry.location;
  const formattedAddress = data.results[0].formatted_address;
  return { lat, lng, formattedAddress };
}

// Computes an optimized multi-stop route from the depot, through all
// `waypoints` (reordered for shortest total distance/time via
// optimizeWaypoints), back to the depot. Returns ordering + totals + polyline.
export async function optimizeRoute({ origin, waypoints, destination }) {
  const key = getApiKey();

  if (!waypoints.length) {
    throw new Error("At least one delivery stop is required to optimize a route.");
  }
  if (waypoints.length > 23) {
    throw new Error(
      "Google Directions supports at most 23 intermediate waypoints per request."
    );
  }

  const originStr = `${origin.lat},${origin.lng}`;
  const destinationStr = destination ? `${destination.lat},${destination.lng}` : originStr;
  const waypointsStr =
    "optimize:true|" + waypoints.map((w) => `${w.lat},${w.lng}`).join("|");

  const params = new URLSearchParams({
    origin: originStr,
    destination: destinationStr,
    waypoints: waypointsStr,
    key,
  });

  const res = await fetch(`${DIRECTIONS_URL}?${params.toString()}`);
  const data = await res.json();

  if (data.status !== "OK" || !data.routes?.length) {
    throw new Error(
      `Directions request failed: ${data.status}${data.error_message ? " - " + data.error_message : ""}`
    );
  }

  const route = data.routes[0];
  const totalDistanceMeters = route.legs.reduce((sum, leg) => sum + leg.distance.value, 0);
  const totalDurationSeconds = route.legs.reduce((sum, leg) => sum + leg.duration.value, 0);

  return {
    waypointOrder: route.waypoint_order, // indices into the original `waypoints` array
    polyline: route.overview_polyline.points,
    totalDistanceMeters,
    totalDurationSeconds,
    legs: route.legs.map((leg) => ({
      distanceMeters: leg.distance.value,
      distanceText: leg.distance.text,
      durationSeconds: leg.duration.value,
      durationText: leg.duration.text,
      startAddress: leg.start_address,
      endAddress: leg.end_address,
    })),
  };
}
