# Firebase setup checklist

Target project: `kandb-net-sevice`.

## 1. Firebase Console
1. Confirm the Project ID is exactly `kandb-net-sevice`.
2. Enable Authentication > Sign-in method > Email/Password.
3. Confirm whether Cloud Firestore already exists before creating or changing a database. Preserve any existing collections.
4. Register a Web app in Project settings > General > Your apps.
5. Copy only the public web app configuration into a local `.env.local` file. The repository contains `.env.example`.
6. Never commit a service-account private key, Admin SDK credentials, passwords, or recovery/setup secrets.

## 2. First administrator
The app uses Firebase Authentication with an internal email alias for each user ID:
- Admin ID `Brajraj` maps to `brajraj@accounts.kandbnetservice.in`.
- Staff IDs map to lower-case IDs at `@accounts.kandbnetservice.in`.

Before first use, set these Firebase Functions secrets using a trusted local Firebase CLI session:
- `ADMIN_BOOTSTRAP_SECRET`: a one-time random setup key.
- `ADMIN_RECOVERY_CODE`: a separate private recovery code.

Deploy Functions only after the project and database are confirmed. Then call the one-time `POST /api/auth/bootstrap-admin` endpoint with the setup key and a new admin password of at least 12 characters. The endpoint refuses to run if an admin profile already exists. Do not put either secret in GitHub or the browser app.

## 3. Browser configuration
Copy `.env.example` to `.env.local` and fill in the Firebase Web App values. The expected project ID is enforced by the client. Keep `.env.local` out of Git.

## 4. Backend and access model
- React/Vite uses Firebase Authentication and sends Firebase ID tokens to the Cloud Function.
- Cloud Functions use Firebase Admin SDK and enforce account status and admin/staff role checks.
- Firestore rules deny direct browser reads and writes. All data operations go through the API.
- Firebase Hosting routes `/api/**` to the `api` Cloud Function and serves the React app for other paths.
- Staff accounts are created in Firebase Authentication by an authenticated admin. Passwords are not stored in Firestore.
- Group chat currently loads through the API; realtime subscriptions are not migrated yet.

## 5. Migration and production safety
- The old AppDeploy backend and its source snapshot are retained. Do not delete or disable the old app.
- No old AppDeploy customer, payment, staff, attendance, or finance records have been imported yet.
- Treat the old database as potentially containing important records until a backup and record count are reviewed.
- Do not deploy to production or generate the final APK until the Functions typecheck, frontend build, emulator/API tests, role tests, and data migration plan have been completed.
