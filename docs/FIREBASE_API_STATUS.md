# Firebase API migration status

The Spark-compatible HTTP API entry point is `netlify/functions/api.ts`, which calls the extracted shared API handler in `functions/src/http-api.ts`. The legacy Firebase Cloud Functions entry point remains in `functions/src/index.ts` for reference but is not the deployment target on the free plan. The React API adapter is `src/lib/api.ts`.

## Implemented in the migration branch
- Firebase Admin initialization and Asia South Functions region.
- CORS and no-store response headers.
- Firebase ID-token verification and server-side active-account / role checks.
- Health check, current-user profile, and logout compatibility endpoint.
- Secret-protected one-time admin bootstrap and admin password recovery.
- Firebase Authentication staff provisioning, activation/deactivation and password reset.
- Public staff access requests with duplicate-pending protection and a private tracking code for the requester to check Submitted / Pending / Approved / Rejected status. Admins can approve requests by creating a Firebase Auth account with a temporary password, or reject them. Passwords and plaintext tracking codes are never stored in registration request documents. Admins receive an in-app notification for each new request.
- Multiple administrator accounts with protected primary owner, activation/deactivation and audit entries.
- Full-day / half-day attendance selection at shift start, plus reason-required admin corrections with audit history.
- Shift-scoped GPS: browser builds update while the staff page is visible; the Android app uses the Capacitor background-geolocation foreground service with a persistent notification and native HTTP uploads while a shift is active. Staff consent is required for check-in and for shifts started by an admin. Location access is limited to authorised admins. This is best-effort: force-stop, phone shutdown, revoked permission, disabled location services, battery restrictions and network loss can interrupt updates; show last update time rather than claim continuous coverage.
- Firestore-backed staff, plans, customers, payments, complaints, tasks, attendance, shift-scoped GPS, announcements, direct messages, groups, group messages, visits, expenses, invoices and audit endpoints.
- Admin/staff role restrictions and server-side record scoping for the major collections.
- Audit entries for the main create/update/delete and administrative operations.
- React modules now use the Firebase API adapter instead of `@appdeploy/client`.
- Firebase Hosting rewrites `/api/**` to the Cloud Function.
- Notifications are stored server-side and polled while the app is open. Android local notifications display newly received alerts while the app is running. FCM push delivery when the app is fully closed is not configured yet.
- GitHub Actions workflow added to typecheck the Functions package on migration-branch changes.
- Firebase Web App registration and project identity have been confirmed as `kandb-net-sevice`.
- Android build workflow uses the confirmed project ID and app display name K&B Management Nexus; debug APK builds successfully in GitHub Actions run #39.

## Remaining engineering work
- Local `.env.local` still needs to be populated on the build machine with the six public Firebase Web App config values.
- Enable and verify Firebase Authentication Email/Password in the Firebase Console.
- Replace the temporary no-op realtime transport; group messages currently require API refresh.
- Review and test every route against the legacy behavior, including field-level permissions and edge cases.
- Validate the new administrator and attendance correction workflows against Firebase Auth / Firestore Emulator.
- A debug APK has been built successfully, but real-device acceptance tests are still required (screen locked, app backgrounded, GPS off/on, permission revoked, network loss, shift checkout and admin-start consent).
- Add emulator-based API tests for admin and staff roles.
- The Android debug APK artifact from run #39 / commit `b2adcc4f` was downloaded and verified. It is debug-signed for testing, not a stable release-signed APK.
- Review and test the complete data migration process before importing any production records.

## Build verification
- Latest frontend production build passed in GitHub Actions run #41 (commit `b2adcc4f`).
- Latest Firebase Functions TypeScript build passed in GitHub Actions run #42 (commit `3cfa0a5f`).
- Android debug APK build and artifact upload passed in GitHub Actions run #39 (commit `b2adcc4f`).
- These are compile/build checks only; they do not prove live Firebase connectivity, API correctness, emulator behavior, or production readiness.

## Important setup requirements
- Project ID is fixed to `kandb-net-sevice`; the browser client refuses to initialize against a different project.
- Enable Firebase Authentication Email/Password.
- Add the Firebase Web App configuration locally in `.env.local`; never commit it.
- Configure Functions secrets `ADMIN_BOOTSTRAP_SECRET` and `ADMIN_RECOVERY_CODE` before deploying Functions.
- The first admin must be initialized through the one-time secret-protected bootstrap endpoint. Staff accounts are then created by an authenticated admin.
- Firestore rules remain deny-by-default for direct browser access; Functions use the Admin SDK.

## Data and production status
- No Firebase Hosting or Cloud Functions production deployment has been performed.
- A debug APK has been built; no physical-device test has been confirmed.
- No AppDeploy customer, payment, staff, attendance or finance data has been imported.
- The old AppDeploy app and its backend source remain available. Do not disable them until backup, migration and acceptance tests are complete.
- Emulator tests, end-to-end tests, and live Firebase verification are still pending.


## Zero-cost hosting migration
- New working branch: `spark-free-backend`.
- The API handler has been extracted for Netlify Functions and reads private setup values from Netlify environment variables.
- The app API client now calls the Netlify Function path using `VITE_API_BASE_URL`.
- Firebase Cloud Functions and Firebase Hosting deployment workflows are disabled on this branch to avoid accidental Blaze-plan deployment.
- The Netlify site, service-account environment variable, public API URL, first-admin bootstrap, and live health check are not configured or verified yet.
- The Netlify Free plan has a fixed monthly credit limit. If the limit is reached, the site can pause until the next billing cycle; keep auto-recharge disabled.
