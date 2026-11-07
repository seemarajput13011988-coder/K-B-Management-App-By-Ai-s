# K&B Management Nexus — consolidated release plan

## Active system

The active app is the React/Vite/Capacitor frontend with the Node API in `render-backend/`. The Render API uses Firebase Admin SDK to access Firestore project `kandb-net-sevice`. K&B user ID/password sign-in is app-managed; Firebase Authentication and the legacy Cloud Functions API are not part of the active request path.

- Browser and Android clients call the Render API through `VITE_API_BASE_URL`.
- Firestore direct client access remains denied by `firestore.rules`.
- `functions/` is preserved legacy source only; do not deploy it as a parallel API.
- `backend/` is the preserved AppDeploy backend snapshot; it is not the Render service entry point.
- `render.yaml` defines the Render API service and has auto-deploy disabled.

## Workspaces in the active frontend

Customers, plans, payments, complaints, tasks, staff and admin accounts, registration requests, attendance and corrections, shift scheduling, GPS tracking, announcements, direct/group chat, visits, calendar/festival themes, subscriptions, installations, inventory, GST invoice PDF generation, finance, ledgers, expenses, payroll, notifications, audit and retention review.

## Safety and data rules

1. Keep the primary super-admin as the only account allowed to create or manage additional admin accounts. Enforce this in the server API.
2. Staff location is disclosed and collected only during an active shift after consent. Android shows a persistent foreground-service notification. Treat stale location as stale, never as live.
3. Do not delete or overwrite existing Firestore records as part of deployment. Back up and reconcile data before any import.
4. Never commit service-account JSON, owner passwords, recovery codes, job secrets or Android signing keys.
5. Do not call a debug APK a production release. Use a protected signing key for updateable releases.
6. The free Render service can sleep. Scheduled job checks are best-effort and depend on the default-branch GitHub workflow and matching job secrets.

## Verification recorded on the latest Nexus work branch

- Frontend TypeScript check and Vite production build passed.
- Render backend type-check and 18 automated tests passed.
- Live API smoke checks passed for health, protected routes and selected attendance/GPS/registration route contracts.
- Android debug APK build completed successfully.

These checks do not replace full browser end-to-end tests, Firestore data-integrity tests, physical Android GPS acceptance, notification/push delivery tests, or production data reconciliation.

## Remaining release gates

- Confirm Render environment values: `FIREBASE_SERVICE_ACCOUNT_JSON`, `ADMIN_INITIAL_PASSWORD`, `ADMIN_RECOVERY_CODE`, and `JOB_SECRET`.
- Add GitHub Actions secret `K_B_JOB_SECRET` with the same value as Render `JOB_SECRET`.
- Confirm the five-minute scheduler is enabled from the default branch and its job endpoint succeeds.
- Add `ANDROID_GOOGLE_SERVICES_JSON_BASE64` if Android FCM push is required, then verify delivery on a physical device.
- Install the debug APK on the actual staff phone models and complete the GPS/notification checklist.
- Back up and reconcile existing production records before switching users to the app.
- Create and securely store a production Android signing key before distributing signed release builds.
- Verify the actual hosting target and deliberately deploy only after owner review.
