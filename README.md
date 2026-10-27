# Pharma Fleet

A delivery scheduling and route optimization app for a pharmaceutical distributor, built with Next.js. It has two views:

- **Admin Dashboard** (`/admin`) — register vehicles and drivers, log deliveries across different locations, assign pending deliveries to a vehicle, and compute an optimized (shortest-distance) multi-stop route with Google Maps.
- **Driver View** (`/driver?driverId=...`) — a driver picks their name from the home page and sees their assigned stops in optimized order, a map of the route, a simulated "drive" animation, and can mark each stop delivered.

There's no login — the home page is a simple role picker. Data lives in an in-memory store on the server for the running session; use **Data → Download/Upload state (JSON)** on the admin dashboard to save a session and restore it later (the store resets whenever the dev/prod server restarts).

## Setup

```bash
npm install
cp .env.local.example .env.local
```

### Google Maps API keys

Two keys are used, on purpose, to keep billing exposure low:

| Key | Where | APIs to enable | Restriction |
|---|---|---|---|
| `GOOGLE_MAPS_API_KEY` | Server only (never sent to the browser) | Directions API, Geocoding API | Restrict by server IP address |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Loaded in the browser to render the map | Maps JavaScript API | Restrict by HTTP referrer (e.g. `localhost:3000/*`, your domain) |

Create both in the [Google Cloud Console](https://console.cloud.google.com/google/maps-apis/credentials) under the same project (billing must be enabled), then fill them into `.env.local`. Without these set, the app still runs — the map panel shows an inline message instead of crashing, and delivery/route creation will show a clear error until a key is added.

### Run

```bash
npm run dev
```

Open http://localhost:3000.

### Simulation mode (no Google API calls)

Set `SIMULATION_MODE=true` in `.env.local` and restart the server to demo without using API quota. The store starts from the snapshot in `data/simulation-state.json` (delivered stops are reset to assigned so the driver flow can be replayed), and every server-side Google call is answered locally by `lib/simulation.server.js`:

- **Geocoding**: addresses in the snapshot resolve to their recorded coordinates. Any other address gets a stable fake point near the depot.
- **Optimize route / Auto-assign fleet**: if the stops match a recorded route, the real Google result (order, road polyline, distance, time) is replayed. Otherwise a local heuristic orders the stops and draws straight-line routes. It honors capacity and refrigeration but not time windows.
- **Fleet Engine**: sync calls are skipped.

To refresh the snapshot, run the app normally, set up the data and routes you want, then run `npm run sim:capture` while the server is up. The browser still loads the Maps JavaScript API for the map and address autocomplete.

## How route optimization works

1. Admin sets a **depot address** and a **fuel cost per km** under Settings.
2. Admin adds deliveries (addresses are geocoded to lat/lng automatically on save).
3. Under **Assign & Optimize**, admin picks a vehicle and selects its pending deliveries, then clicks **Optimize route**. This calls the Google **Directions API** server-side with `optimizeWaypoints: true`, which reorders the stops for the shortest total driving distance from the depot and back — the actual cost/time saving. The response's distance is combined with the fuel-cost setting to show an estimated route cost.
4. The driver's view polls the same data and shows the stops in that optimized order, with a map of the route. **Start driving** plays a simulated drive to the next stop along the route's stored road polyline (no real GPS is used in this demo).

## Simulated driving (web + Android in sync)

The drive lives on the server (`/api/simulation/drive`, `lib/driveSimulation.server.js`), so the web driver view, the admin route map and the Android app all show the same vehicle at the same spot. Pressing Start Driving on any of them starts it everywhere.

- Each drive is one leg: depot → first stop, or previous stop → next stop. The leg is cut out of the route's polyline (the real Google one captured in `data/simulation-state.json`, or whatever the last optimize produced), so the van follows actual roads.
- The **admin dashboard** is a full-screen live map of every driver, each in their own color: just a car at the driver's current location (idle drivers park beside the depot) and a floating status card (driving to / at stop, progress, delivered count). The admin sections sit in a left panel, which opens wide for table-heavy sections (toggle with Widen/Narrow panel). Switch between **All drivers** and **Select drivers** to pick which ones are shown. Click a card or car to zoom to that driver.
- Drives run in **real time (1×)** by default. The web driver view and the Android app's ETA card both have a speed control (1×, 2×, 5×, 10×, 30×, 60×) and **Skip to destination**. Speed changes apply mid-drive without the vehicle jumping, are shared by every screen, and carry over to that vehicle's next legs.
- The server only stores the drive's progress at one moment and its speed. Clients poll once a second and animate locally against the server clock, so movement stays smooth and in step.
- On Android, `SIMULATED_DRIVE` in `driver-android/app/build.gradle.kts` (default `true`) makes Start Driving use this instead of Navigation SDK turn-by-turn, which needs no Navigation SDK routing calls.

## Notes / limitations

- Directions API waypoint optimization supports at most ~23 intermediate stops per request.
- Driver location is simulated for demo purposes; wiring up real GPS would mean having the driver's browser post `navigator.geolocation` coordinates to a new endpoint and rendering that instead of the animated marker.
- In-memory storage means concurrent server instances (e.g. serverless deployments with multiple lambdas) would not share state — this is intended for local/demo use with a single running server.
