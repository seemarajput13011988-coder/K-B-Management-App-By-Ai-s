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

Before first use, set these private environment variables in the Netlify site:
- `FIREBASE_SERVICE_ACCOUNT_JSON`: Firebase service-account JSON for the project, stored only in Netlify.
- `ADMIN_BOOTSTRAP_SECRET`: a one-time random setup key.
- `ADMIN_RECOVERY_CODE`: a separate private recovery code.

The HTTP API runs as a Netlify Function and uses Firebase Admin SDK to create accounts and write Firestore records. Then call the one-time `POST /api/auth/bootstrap-admin` endpoint with the setup key and a new admin password of at least 12 characters. The endpoint refuses to run if an admin profile already exists. Do not put the service account or either secret in GitHub or the browser app.

## 3. Browser configuration
Copy `.env.example` to `.env.local` and fill in the Firebase Web App values. The expected project ID is enforced by the client. Keep `.env.local` out of Git.

## 4. Backend and access model
- React/Vite and Android use Firebase Authentication and send Firebase ID tokens to the Netlify API Function.
- The Netlify Function uses Firebase Admin SDK and enforces account status and admin/staff role checks.
- Firestore rules deny direct browser reads and writes. App data operations go through the API.
- Netlify hosts both the React app and the API Function. Firebase remains the authentication and database provider.
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
The HTTP API runs as a Netlify Function. Firebase Cloud Functions are not needed for this hosting path.
1. Create a separate Netlify site connected to this repository and deploy the `spark-free-backend` branch.
2. In Netlify site environment variables, set the private values `FIREBASE_SERVICE_ACCOUNT_JSON`, `ADMIN_BOOTSTRAP_SECRET`, and `ADMIN_RECOVERY_CODE`. Also set the public build-time values `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, and `VITE_API_BASE_URL` (the site's own public URL).
3. In GitHub repository Settings > Secrets and variables > Actions > Variables, add `VITE_API_BASE_URL` with the same Netlify site URL. The Android APK workflow uses it at build time.
4. Redeploy after setting the variables. Netlify Functions run the existing HTTP API using Firebase Admin SDK; Firebase Auth and Firestore remain in project `kandb-net-sevice`.
5. The GPS grace-period monitor runs once per minute. Task and subscription reminders run daily at 9:00 AM India time. These scheduled functions only run on the published Netlify deployment.
6. The first Super Admin bootstrap remains one-time and secret-protected. Do not create an admin profile from the browser or allow staff to choose an admin role.
7. Keep Netlify auto-recharge disabled. The Free plan has a hard monthly credit limit and the site pauses when it reaches that limit rather than automatically adding paid usage.

This hosting path is not live until the Netlify site, environment variables, service-account access, and health check are verified. No production deployment is claimed by this repository change.
