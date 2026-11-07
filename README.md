# K&B Management Nexus

K&B NET SERVICE management app for customers, staff, attendance, field operations, finance and service delivery.

## Active application architecture

- **Frontend:** React 19, Vite, TypeScript and Capacitor for Android.
- **API:** the Node/Express service in `render-backend/` (Render).
- **Database:** Firebase Cloud Firestore, accessed by the Render service through the Firebase Admin SDK.
- **Sign-in:** K&B user ID and password, verified server-side with salted scrypt hashes and opaque, expiring sessions. Firebase Authentication is not used for staff/admin login.
- **Authorization:** role checks and the primary-super-admin restriction are enforced by the API, not just by hiding UI controls.
- **Browser hosting:** Firebase Hosting may serve the static Vite build. Its configuration does not route API calls to Cloud Functions; the app calls the Render API.

The active frontend API URL defaults to `https://kandb-management-nexus-api-zv7f.onrender.com` and can be overridden with `VITE_API_BASE_URL`.

## Included workspaces

Overview and analytics; customers and plans; payments and complaints; tasks; staff accounts and registration approvals; attendance, corrections and shift scheduling; consent-based shift-scoped GPS; team messages, groups and announcements; visits; calendar and festival themes; subscriptions; installations; inventory; GST invoice PDF maker; finance, customer ledgers, expenses and payroll; notifications; audit and retention review.

## Important release notes

- `functions/` contains legacy Firebase Functions code from an earlier migration attempt. It is not the active API and must not be deployed as a second backend.
- `backend/` contains the preserved AppDeploy source. The active Render service is built from `render-backend/`.
- Render Blueprint auto-deploy is disabled. A production backend deployment must be deliberately triggered after review.
- The five-minute GitHub scheduled workflow calls the protected Render job endpoint. Configure GitHub secret `K_B_JOB_SECRET` to match Render environment variable `JOB_SECRET`.
- CI builds and a debug APK are not proof of real-device GPS, push delivery, data migration or production readiness. Complete the acceptance checklist before distributing a release APK.
- Existing business records must be backed up and reconciled before any data migration. No deployment should clear or overwrite Firestore data.

See `docs/RENDER_BACKEND_SETUP.md`, `docs/ANDROID_TRACKING_AND_RELEASE.md` and `docs/RELEASE_BLOCKERS.md`.
