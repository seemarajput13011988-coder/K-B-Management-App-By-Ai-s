# K&B Management Nexus

K&B NET SERVICE workforce, customer, operations and finance management application.

## Platform architecture

- K&B username/password login for admin and staff (not Firebase Authentication).
- Firebase Cloud Firestore for application records and user credential hashes.
- Firebase Cloud Functions API with server-side session validation, role authorization and staff-record access checks.
- Firestore direct client access is denied; app data operations go through Cloud Functions.
- Android APK build workflow is maintained in GitHub Actions.

## Security and migration

- Passwords are salted and hashed with scrypt on the server.
- Sessions use opaque random tokens; the server stores only their SHA-256 hashes and expiry.
- Existing AppDeploy credentials require a secure user-record migration or administrator password reset; Firebase Auth account creation is not part of the migration.
- Back up AppDeploy data before import. Do not overwrite the original app or records until staged reconciliation and owner approval.
- No automatic record deletion. Six-month-old records are surfaced to admins for review and can only be deleted after explicit confirmation.

See `docs/FIREBASE_SETUP.md` and `docs/STAFF_LOGIN_DIAGNOSIS.md` for setup and migration details.
