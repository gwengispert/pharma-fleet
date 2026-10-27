// Captures turn-by-turn steps for every leg of the running server's
// optimized routes (depot -> 1st stop, stop -> next stop) into
// data/directions-cache.json — one Directions API request per leg, once.
// The drive simulation (lib/driveSimulation.server.js) then shows real
// "Turn right onto …" navigation headers from this cache with no further
// API calls; legs that aren't cached fall back to turns derived from the
// road geometry.
//   npm run sim:capture-directions            (http://localhost:3000)
//   npm run sim:capture-directions -- http://host:port
// Reads GOOGLE_MAPS_API_KEY from the environment or .env.local.
import { readFile, writeFile } from "node:fs/promises";

const baseUrl = process.argv[2] || "http://localhost:3000";
const cacheUrl = new URL("../data/directions-cache.json", import.meta.url);

async function apiKey() {
  if (process.env.GOOGLE_MAPS_API_KEY) return process.env.GOOGLE_MAPS_API_KEY;
  const env = await readFile(new URL("../.env.local", import.meta.url), "utf8").catch(() => "");
  const match = env.match(/^GOOGLE_MAPS_API_KEY=(.+)$/m);
  if (!match) throw new Error("GOOGLE_MAPS_API_KEY is not set (env or .env.local).");
  return match[1].trim();
}

// Must match legKey() in lib/driveSimulation.server.js.
const legKey = (from, to) =>
  `${from.lat.toFixed(5)},${from.lng.toFixed(5)}>${to.lat.toFixed(5)},${to.lng.toFixed(5)}`;

// "Turn <b>right</b> onto <b>El Grande Ave</b><div …>Destination will be on the left</div>"
// -> "Turn right onto El Grande Ave"
function plainInstruction(html) {
  return html
    .replace(/<div[^>]*>.*?<\/div>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

const key = await apiKey();
const state = await (await fetch(`${baseUrl}/api/state/export`)).json();
const depot = { lat: state.settings.depotLat, lng: state.settings.depotLng };
const deliveriesById = new Map(state.deliveries.map((d) => [d.id, d]));
const cache = JSON.parse(await readFile(cacheUrl, "utf8").catch(() => "{}"));

let fetched = 0;
for (const route of Object.values(state.routes)) {
  const stops = route.deliveryIds.map((id) => deliveriesById.get(id)).filter((d) => d?.lat != null);
  for (let i = 0; i < stops.length; i++) {
    const from = i === 0 ? depot : stops[i - 1];
    const to = stops[i];
    const k = legKey(from, to);
    if (cache[k]) continue;

    const params = new URLSearchParams({ origin: `${from.lat},${from.lng}`, destination: `${to.lat},${to.lng}`, key });
    const data = await (await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params}`)).json();
    if (data.status !== "OK") {
      console.error(`  ${to.customerName}: ${data.status} ${data.error_message || ""}`);
      continue;
    }
    const leg = data.routes[0].legs[0];
    cache[k] = {
      durationSeconds: leg.duration.value,
      steps: leg.steps.map((s) => ({
        instruction: plainInstruction(s.html_instructions),
        maneuver: s.maneuver || null,
        distanceMeters: s.distance.value,
        polyline: s.polyline.points,
      })),
    };
    fetched++;
    console.log(`  ${i === 0 ? "Depot" : stops[i - 1].customerName} -> ${to.customerName}: ${leg.steps.length} steps`);
  }
}

await writeFile(cacheUrl, JSON.stringify(cache, null, 2) + "\n");
console.log(`Fetched ${fetched} leg(s); ${Object.keys(cache).length} cached in data/directions-cache.json`);
