# K&B Customer Management

Source repository for the K&B NET SERVICE customer and business management app.

## Current migration branch
Work is being carried out on `firebase-migration`. The original AppDeploy implementation remains on `main`; do not deploy or overwrite it as part of the Firebase migration.

## Target architecture
- React + Vite web application.
- Capacitor Android wrapper for a privately distributed APK.
- Firebase Authentication for admin and staff sign-in.
- Cloud Firestore for application records.
- Cloud Functions for authenticated, role-checked API operations.
- Firebase Hosting for the web app and API rewrite.

## Current progress
- Core Firestore API route groups and Firebase ID-token authorization have been implemented.
- React API calls and sign-in have been switched to the Firebase adapter on the migration branch.
- A secret-protected first-admin setup and recovery flow is included.
- Additional admin account creation and deactivation are supported; the primary owner account is protected.
- Attendance supports full-day / half-day selection and reason-required admin corrections.
- Admin Team Operations includes active-shift location visibility and history. Android uses a visible native background location service with consent; browser tracking is foreground-only. Live location is best-effort and must be verified on real devices.
- Finance includes a six-month collections-versus-expenses chart and mobile-friendly visual refinements.
- Web build, Functions typecheck and manual Android APK workflows are included.
- Group chat currently refreshes from the API; realtime transport remains pending.

## Before using or deploying
1. Confirm Firebase project `kandb-net-sevice` and verify Authentication / Firestore state.
2. Add the Firebase Web App config to local `.env.local`; do not commit it.
3. Configure Functions secrets `ADMIN_BOOTSTRAP_SECRET` and `ADMIN_RECOVERY_CODE`.
4. Run the build workflows and emulator tests. The latest web build and Functions typecheck results are tracked in GitHub Actions.
5. Back up and review old AppDeploy data before importing anything.

## Safety and data integrity
- Firestore direct browser access is denied; data access goes through Cloud Functions.
- Never commit service-account keys, customer exports, passwords or recovery/setup secrets.
- No old customer, payment, staff, attendance or finance records have been imported.
- Do not disable the old AppDeploy app until migration and acceptance testing are complete.

See `MIGRATION_PLAN.md`, `docs/FIREBASE_SETUP.md`, `docs/FIREBASE_API_STATUS.md` and `docs/DATA_MIGRATION.md`.
