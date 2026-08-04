# pharma-fleet Driver (Android)

Native Android app using Google Maps Platform's **Driver SDK** (Last Mile Fleet
Solution / "scheduled tasks" product line) to report a driver's real GPS
location to Fleet Engine. Talks to the existing pharma-fleet Next.js backend
over its REST API — same data, same join logic as the simulated web driver
view at `app/driver/page.js`, just with real location instead of an animated
polyline.

## Not built or run here

This was written and reviewed in a coding environment with no Android Studio,
SDK, emulator, or device — so it's been checked line-by-line against Google's
current Driver SDK docs, but **not compiled**. A few call sites are flagged
`VERIFY IN ANDROID STUDIO` in comments (exact sub-package for `AuthTokenFactory`
and `DeliveryDriverApi`) — these are class names confirmed to exist, just not
independently confirmed at the exact package-path level from doc excerpts
alone. Android Studio's autocomplete will resolve any of these in seconds on
first sync; expect to fix a handful of import lines, not logic.

## One-time setup

1. **Open `driver-android/` as its own project** in Android Studio (not the
   parent `pharma-fleet/` repo — this is a separate Gradle project living as
   a sibling to `app/`/`components/`/`lib/`).
2. **Get an Android-restricted Maps API key.** In Google Cloud Console
   (`mobilityproject-503214`, the same project as the app's other Maps keys),
   create a new API key restricted by **package name + SHA-1 fingerprint**
   (not IP or HTTP referrer — those restriction types don't apply to Android).
   Package name is `com.pharmafleet.driver`; get your debug SHA-1 via
   `./gradlew signingReport` once the project syncs. Enable "Maps SDK for
   Android" on it.
3. Create `driver-android/local.properties` (gitignored) with:
   ```
   MAPS_API_KEY=your-android-restricted-key-here
   ```
4. Run the app against an **emulator** first — its default backend URL
   (`http://10.0.2.2:3000`, see `app/build.gradle.kts`) reaches your host
   machine's `npm run dev` automatically. Start that dev server before
   launching the app. For a physical device on the same Wi-Fi, you'll need to
   point `BACKEND_BASE_URL` at your machine's LAN IP instead (edit the debug
   `buildConfigField` in `app/build.gradle.kts`, or wire it through
   `local.properties` if you switch between the two often).

## Fleet Engine specifics worth knowing before you touch this

- **Auth is a plain OAuth2 bearer token, not a scoped JWT.** `/api/fleet-engine/token`
  (backend) impersonates the `fleet-engine-backend` service account and returns
  its raw access token — which carries that SA's full `deliveryAdmin` scope
  over *every* vehicle/task on the account, not just the one requested. This
  is a deliberate demo-grade trade-off (see that route's comments), not
  something to "fix" here — `FleetEngineAuthTokenFactory.kt` just returns
  whatever string the backend hands it, which is exactly what
  `AuthTokenFactory.getToken()` expects regardless of whether it's a JWT or a
  bearer token.
- **The Navigation SDK is a hard dependency even with no nav UI shown.**
  `DeliveryVehicleReporter` extends the Navigation SDK's
  `NavigationVehicleReporter`, so `DriverContext` can't be built without a
  live `Navigator`. Expect the Navigation SDK's terms-of-use prompt to appear
  on first run — that's expected, not a bug.
- **There's no driver login anywhere in this app**, matching the rest of
  pharma-fleet — the driver picker trusts whichever driver you tap, same as
  `app/driver/page.js`'s `?driverId=` query param. Not production-safe; a real
  deployment needs to authenticate the driver before minting them a token for
  any vehicle.
- **No turn-by-turn navigation UI in this pass** — just the task checklist and
  an online/offline location-reporting toggle, per the original scope.

## Verified independently (not guessed)

Versions and API shapes below were checked against Google's current docs at
scaffold time (May 2026), not pulled from training data — re-check the
[Driver SDK for Android release notes](https://developers.google.com/maps/documentation/mobility/services/resources/relnotes_driver_sdk_android)
if this has sat for a while before bumping anything:

- Driver SDK `transportation-driver:7.1.0`; Navigation SDK must stay within
  `[7.0, 8.0)` per that release.
- `minSdkVersion` 26, `targetSdkVersion` 36 (raised in Driver SDK v7.0.0).
- Kotlin ≥ 2.1 required by the SDK since v6.2.0; AGP 8.13.2 / Gradle 8.13 are
  what the SDK itself uses internally as of v7.1.0.
- `AuthTokenFactory.getToken(AuthTokenContext): String` — returns a raw
  string, runs on the SDK's own location-update thread, and is allowed to
  block (confirmed from Google's own Java example on the authenticate page).
- `DeliveryVehicleReporter.enableLocationTracking()` / `setVehicleState(...)`
  / `disableLocationTracking()` and the `GET /v1/providers/*/deliveryVehicles/*`
  DELETE semantics used elsewhere in this repo's backend were all confirmed
  the same way, not assumed.

Everything else (exact androidx support-library patch versions, OkHttp patch
version, etc.) is a reasonable current pin but wasn't individually
re-verified — low risk, and Android Studio will flag anything stale on sync.
