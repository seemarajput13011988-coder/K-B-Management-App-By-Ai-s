# Firebase API migration status

The Cloud Functions HTTP entry point is in `functions/src/index.ts`.

## Implemented
- Firebase Admin initialization.
- Asia South (Mumbai) Functions region.
- CORS and no-store response headers.
- Firebase ID-token verification.
- Server-side user profile and active-account checks.
- Health check and authenticated current-user endpoint.
- Audit helper for future write operations.
- Explicit 501 responses for legacy route groups not migrated yet; no accidental open data access.

## Not yet implemented
The existing 59 AppDeploy routes still need their Firestore implementations, validation, role scoping, and tests. Authentication login/account provisioning also needs the secure bootstrap flow. The React app has not yet been switched from AppDeploy API calls.

## Compatibility decision
The existing frontend passes a `sessionToken`. During migration the API accepts that field only if it is a valid Firebase ID token; the frontend adapter must be updated to acquire and refresh Firebase ID tokens before traffic is switched. Legacy random session tokens are not accepted.

Do not deploy or change production traffic until the full route inventory has been implemented and tested in the Firebase Emulator Suite.
