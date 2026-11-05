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

## 5. GitHub Actions deployment secrets
For Firebase Hosting / Functions deployment, add these in GitHub repository Settings > Secrets and variables > Actions:
- `FIREBASE_SERVICE_ACCOUNT_KANDB_NET_SEVICE`: service-account JSON with the minimum required Firebase deploy permissions.
- `ANDROID_GOOGLE_SERVICES_JSON_BASE64`: Base64-encoded `google-services.json` for the Firebase Android app with package ID `in.kandbnetservice.management`. Register that Android app in Firebase Project Settings, download its `google-services.json`, encode the file, and save the encoded value as this GitHub Actions secret. Without it, the APK can still build, but push notifications while the app is fully closed will not work.
- `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`: public Firebase Web App config values for the Hosting build.

The Android debug APK workflow already uses the public Firebase Web App config supplied in its workflow as a fallback; it does not need a service-account key. Never paste service-account JSON or private credentials into ChatGPT or commit them to Git.

## 6. Migration and production safety
- The old AppDeploy backend and its source snapshot are retained. Do not delete or disable the old app.
- No old AppDeploy customer, payment, staff, attendance, or finance records have been imported yet.
- Treat the old database as potentially containing important records until a backup and record count are reviewed.
- Do not deploy to production or generate the final APK until the Functions typecheck, frontend build, emulator/API tests, role tests, and data migration plan have been completed.


## 7. Zero-cost API hosting (Spark-compatible)
The HTTP API can run as a Netlify Function so the project does not need Firebase Cloud Functions or the Firebase Blaze plan.
1. Create a separate Netlify site connected to this repository and deploy the `spark-free-backend` branch.
2. In Netlify site environment variables, set:
   - `FIREBASE_SERVICE_ACCOUNT_JSON`: the service-account JSON for the Firebase project. Keep this private; never commit it.
   - `ADMIN_BOOTSTRAP_SECRET`: a private initial-admin setup value.
   - `ADMIN_RECOVERY_CODE`: a different private recovery value.
   - `VITE_API_BASE_URL`: the public base URL of this Netlify site, for example `https://your-site.netlify.app`.
   - The six `VITE_FIREBASE_*` web-app values listed in `.env.example`.
3. Redeploy after setting the variables. Netlify Functions run the existing HTTP API using Firebase Admin SDK; Firebase Auth and Firestore remain in project `kandb-net-sevice`.
4. The first Super Admin bootstrap remains one-time and secret-protected. Do not create an admin profile from the browser or allow staff to choose an admin role.
5. Keep Netlify auto-recharge disabled. The Free plan has a hard monthly usage limit and the site can pause when that limit is reached; it should not automatically add paid usage.

This hosting path is a code/configuration change only until the Netlify site, environment variables, and service-account access are configured and a live health check succeeds. No production deployment is claimed by this repository change.
