# Firebase setup checklist

Target project: `kandb-net-service`.

## Firebase Console
1. Confirm the Project ID is exactly `kandb-net-service`.
2. Under Build > Authentication, enable Email/Password only when the authentication migration is ready.
3. Under Build > Firestore Database, create a database only after confirming the intended region with the project owner.
4. Register a Web app in Project settings > General > Your apps and copy its web configuration into a local `.env.local` file.
5. Never commit a service-account private key or Firebase Admin credentials.

## Current repository behavior
- `src/lib/firebase.ts` initializes the Firebase browser SDK only when the required public web configuration is present.
- It checks that the configured project ID matches `kandb-net-service`.
- Firestore rules currently deny all direct browser access. This is intentional until Cloud Functions implement server-side authentication, role checks, validation, and audit logging.
- Existing AppDeploy API calls remain in place during this foundation phase. Do not switch production traffic until all 59 existing API routes have been migrated and tested.

## Data safety
Treat the old AppDeploy database as potentially containing important data until verified. Do not delete the old app, export, overwrite, or import records without a reviewed backup and field mapping.
