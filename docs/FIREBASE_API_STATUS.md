# Legacy Firebase Functions API status

The active K&B Management Nexus API is the Render Node service in `render-backend/`. The React client in `src/lib/api.ts` calls that API using `VITE_API_BASE_URL`.

The `functions/` directory is retained as legacy source from an earlier migration attempt. It is **not** the active API and must not be deployed alongside the Render backend. The active API uses K&B ID/password sessions and Firebase Admin SDK access to Firestore; it does not use Firebase Authentication for staff/admin sign-in.

Do not use `VITE_FIREBASE_FUNCTIONS_URL` or deploy the legacy Cloud Functions as the app backend. Static Firebase Hosting, if used, serves the built frontend only. API requests go directly to the Render API.
