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

## How route optimization works

1. Admin sets a **depot address** and a **fuel cost per km** under Settings.
2. Admin adds deliveries (addresses are geocoded to lat/lng automatically on save).
3. Under **Assign & Optimize**, admin picks a vehicle and selects its pending deliveries, then clicks **Optimize route**. This calls the Google **Directions API** server-side with `optimizeWaypoints: true`, which reorders the stops for the shortest total driving distance from the depot and back — the actual cost/time saving. The response's distance is combined with the fuel-cost setting to show an estimated route cost.
4. The driver's view polls the same data and shows the stops in that optimized order, with a map of the route and a simulated vehicle marker animating along it (no real GPS is used in this demo).

## Notes / limitations

- Directions API waypoint optimization supports at most ~23 intermediate stops per request.
- Driver location is simulated for demo purposes; wiring up real GPS would mean having the driver's browser post `navigator.geolocation` coordinates to a new endpoint and rendering that instead of the animated marker.
- In-memory storage means concurrent server instances (e.g. serverless deployments with multiple lambdas) would not share state — this is intended for local/demo use with a single running server.
