# Firebase API migration status

The Cloud Functions HTTP entry point is `functions/src/index.ts`; the React API adapter is `src/lib/api.ts`.

## Implemented in the migration branch
- Firebase Admin initialization and Asia South Functions region.
- CORS and no-store response headers.
- Firebase ID-token verification and server-side active-account / role checks.
- Health check, current-user profile, and logout compatibility endpoint.
- Secret-protected one-time admin bootstrap and admin password recovery.
- Firebase Authentication staff provisioning, activation/deactivation and password reset.
- Firestore-backed staff, plans, customers, payments, complaints, tasks, attendance, foreground shift-scoped GPS, announcements, direct messages, groups, group messages, visits, expenses, invoices and audit endpoints.
- Admin/staff role restrictions and server-side record scoping for the major collections.
- Audit entries for the main create/update/delete and administrative operations.
- React modules now use the Firebase API adapter instead of `@appdeploy/client`.
- Firebase Hosting rewrites `/api/**` to the Cloud Function.
- GitHub Actions workflow added to typecheck the Functions package on migration-branch changes.

## Remaining engineering work
- Password changes now require client-side reauthentication and a recent Firebase auth timestamp before the server updates the password.
- Replace the temporary no-op realtime transport; group messages currently require API refresh.
- Review and test every route against the legacy behavior, including field-level permissions and edge cases.
- Run the GitHub Actions typecheck and the frontend production build, then fix all compile errors.
- Add emulator-based API tests for admin and staff roles.
- Android debug-APK workflow is ready but has not been run; add the required Firebase web config secrets first.

## Important setup requirements
- Project ID is fixed to `kandb-net-service`; the browser client refuses to initialize against a different project.
- Enable Firebase Authentication Email/Password.
- Add the Firebase Web App configuration locally in `.env.local`.
- Configure Functions secrets `ADMIN_BOOTSTRAP_SECRET` and `ADMIN_RECOVERY_CODE` before deploying Functions.
- The first admin must be initialized through the one-time secret-protected bootstrap endpoint. Staff accounts are then created by an authenticated admin.
- Firestore rules remain deny-by-default for direct browser access; Functions use the Admin SDK.

## Data and production status
- No Firebase deployment has been performed.
- No APK has been built.
- No AppDeploy customer, payment, staff, attendance or finance data has been imported.
- The old AppDeploy app and its backend source remain available. Do not disable them until backup, migration and acceptance tests are complete.
- The backend has not yet been verified by a successful build or emulator test; code written is not equivalent to a tested production service.
