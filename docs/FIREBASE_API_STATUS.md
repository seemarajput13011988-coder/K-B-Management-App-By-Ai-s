# Firebase API migration status

The Cloud Functions HTTP entry point is `functions/src/index.ts`; the React API adapter is `src/lib/api.ts`.

## Implemented in the migration branch
- Firebase Admin initialization and Asia South Functions region.
- CORS and no-store response headers.
- Firebase ID-token verification and server-side active-account / role checks.
- Health check, current-user profile, and logout compatibility endpoint.
- Secret-protected one-time admin bootstrap and admin password recovery.
- Firebase Authentication staff provisioning, activation/deactivation and password reset.
- Multiple administrator accounts with protected primary owner, activation/deactivation and audit entries.
- Full-day / half-day attendance selection at shift start, plus reason-required admin corrections with audit history.
- GPS history API for the admin location audit trail; current and historical locations are only collected during active shifts while the staff app is open and permission is granted.
- Firestore-backed staff, plans, customers, payments, complaints, tasks, attendance, foreground shift-scoped GPS, announcements, direct messages, groups, group messages, visits, expenses, invoices and audit endpoints.
- Admin/staff role restrictions and server-side record scoping for the major collections.
- Audit entries for the main create/update/delete and administrative operations.
- React modules now use the Firebase API adapter instead of `@appdeploy/client`.
- Firebase Hosting rewrites `/api/**` to the Cloud Function.
- GitHub Actions workflow added to typecheck the Functions package on migration-branch changes.
- Firebase Web App registration and project identity have been confirmed as `kandb-net-sevice`.
- Android build workflow now uses the confirmed project ID and the app display name K&B Management Nexus.

## Remaining engineering work
- Local `.env.local` still needs to be populated on the build machine with the six public Firebase Web App config values.
- Enable and verify Firebase Authentication Email/Password in the Firebase Console.
- Replace the temporary no-op realtime transport; group messages currently require API refresh.
- Review and test every route against the legacy behavior, including field-level permissions and edge cases.
- Validate the new administrator and attendance correction workflows against Firebase Auth / Firestore Emulator.
- GPS is foreground browser tracking, not background Android tracking; a native background mode would require a separate consent and permission design.
- Add emulator-based API tests for admin and staff roles.
- Run the Android APK workflow after the required GitHub Firebase config secrets are added.
- Review and test the complete data migration process before importing any production records.

## Build verification
- Frontend production build passed in GitHub Actions run #19 on the migration branch.
- Firebase Functions TypeScript build passed in GitHub Actions run #11 on the migration branch.
- These are compile/build checks only; they do not prove live Firebase connectivity, API correctness, emulator behavior, or production readiness.

## Important setup requirements
- Project ID is fixed to `kandb-net-sevice`; the browser client refuses to initialize against a different project.
- Enable Firebase Authentication Email/Password.
- Add the Firebase Web App configuration locally in `.env.local`; never commit it.
- Configure Functions secrets `ADMIN_BOOTSTRAP_SECRET` and `ADMIN_RECOVERY_CODE` before deploying Functions.
- The first admin must be initialized through the one-time secret-protected bootstrap endpoint. Staff accounts are then created by an authenticated admin.
- Firestore rules remain deny-by-default for direct browser access; Functions use the Admin SDK.

## Data and production status
- No Firebase deployment has been performed.
- No APK has been built.
- No AppDeploy customer, payment, staff, attendance or finance data has been imported.
- The old AppDeploy app and its backend source remain available. Do not disable them until backup, migration and acceptance tests are complete.
- Emulator tests, end-to-end tests, and live Firebase verification are still pending.
