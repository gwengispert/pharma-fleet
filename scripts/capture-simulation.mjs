// Snapshots the running server's state into data/simulation-state.json, the
// fixture SIMULATION_MODE replays instead of calling Google. Run it while
// `npm run dev` is up with the data (and optimized routes) you want frozen:
//   npm run sim:capture            (defaults to http://localhost:3000)
//   npm run sim:capture -- http://host:port
import { writeFile } from "node:fs/promises";

const baseUrl = process.argv[2] || "http://localhost:3000";
const res = await fetch(`${baseUrl}/api/state/export`);
if (!res.ok) {
  console.error(`Export failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}
const state = await res.json();
const out = new URL("../data/simulation-state.json", import.meta.url);
await writeFile(out, JSON.stringify(state, null, 2) + "\n");
console.log(
  `Captured ${state.vehicles.length} vehicles, ${state.drivers.length} drivers, ` +
    `${state.deliveries.length} deliveries, ${Object.keys(state.routes).length} routes -> data/simulation-state.json`
);
