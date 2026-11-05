# K&B Render backend deployment

## Architecture

- React + Capacitor frontend remains in this repository.
- The Render Node web service runs the API.
- Firebase Admin SDK connects the backend to Firestore project `kandb-net-sevice`.
- K&B ID/password authentication is app-managed. Firebase Authentication is not used for sign-in.
- Existing Firestore records are not cleared or migrated by deployment.
- The six-month retention screen is an admin reminder only. There is no automatic or UI-triggered deletion.

## Initial Render service

The root `render.yaml` describes one new free Node web service in Singapore. It is separate from the existing Render services. The service is created from the `render-backend` directory and exposes `/api/_healthcheck`.

After the initial Blueprint sync, add these values on the new service's Render Environment page:

- `FIREBASE_SERVICE_ACCOUNT_JSON`: the complete service-account JSON for project `kandb-net-sevice`. Keep it private.
- `ADMIN_INITIAL_PASSWORD`: the initial owner password. It must match the password used for the first sign-in as `Brajraj`. The server stores only a salted hash in Firestore.
- `ADMIN_RECOVERY_CODE`: a separate strong recovery code. Store it securely for owner recovery.

Render generates `JOB_SECRET` from the Blueprint. The API uses it to protect `POST /internal/jobs/tick`.

Do not put any of these secret values in Git, this documentation, screenshots, issues, or ChatGPT.

## APK and map/push configuration

Before the Render-connected APK workflow can produce an APK, add the GitHub Actions repository secret:

- `K_B_RENDER_API_URL`: the full HTTPS base URL of the new Render service (no trailing path).

For map and push functionality, also configure:

- `VITE_GOOGLE_MAPS_API_KEY`: a Google Maps key configured for the app's Android package.
- `ANDROID_GOOGLE_SERVICES_JSON_BASE64`: base64-encoded Firebase Android `google-services.json` for package `kandbnet.service2010`.

The APK workflow deliberately stops if `K_B_RENDER_API_URL` is missing, so it cannot silently package a build that still targets the old Functions endpoint.

## Background jobs and free-tier limit

The service runs the GPS grace monitor while the process is awake. It sends reminders at 5, 10 and 14 minutes and cancels an eligible shift at 15 minutes, excluding qualifying holiday requests. Task and subscription reminders and pending push delivery are also checked by this worker.

A free Render web service can sleep when idle. An in-process timer does not run while the service is asleep. The keepalive workflow in this branch is not active as a GitHub scheduled workflow until it is deliberately merged into the repository's default branch. Consequently, do not promise exact 15-minute GPS enforcement while the free service can sleep. A continuously available paid worker/scheduler or an approved, monitored wake-up schedule is needed for production-grade timing.

## Verification status

The Render branch's backend typecheck and frontend production build passed in GitHub Actions. Those checks do not replace Firestore emulator tests, live API/role checks, Android background-location acceptance tests, or push delivery tests. Keep the release PR in draft until those checks and the final APK are complete.
