# Firebase data platform and K&B sign-in setup

Target Firebase project: `kandb-net-sevice`.

## Architecture

- **Sign-in:** K&B username/password credentials (admin and staff IDs) verified by Cloud Functions.
- **Sessions:** random, opaque 256-bit tokens; only SHA-256 token hashes and expiry metadata are stored in Firestore.
- **Data:** Cloud Firestore stores users, password salt/hash, sessions, customers, payments, attendance, tasks, inventory, finance, messages and other app records.
- **Backend:** Firebase Cloud Functions uses Firebase Admin SDK to access Firestore and enforces role and staff-record permissions on the server.
- **Firebase Authentication:** not used by the application. Do not enable or create Firebase Auth users for K&B staff login.
- **Firestore rules:** direct client reads/writes are denied. App data access goes through Cloud Functions.

## 1. Firebase Console

1. Confirm the project ID is exactly `kandb-net-sevice`.
2. Confirm Cloud Firestore exists before creating or changing a database. Preserve existing collections.
3. Do not change Firebase Authentication settings for this application.
4. Never commit service-account private keys, Admin SDK credentials, passwords, or recovery/setup secrets.

## 2. Initial administrator

The initial owner account uses the K&B login ID `Brajraj`. Initialize it once through the protected `POST /api/auth/bootstrap-admin` endpoint after configuring the Functions secret `ADMIN_BOOTSTRAP_SECRET`. The endpoint stores a salted scrypt password hash in Firestore under the primary admin profile and refuses to initialize if an admin already exists.

Configure `ADMIN_RECOVERY_CODE` separately for the protected owner password-recovery endpoint. Never put either secret in the browser app or commit them to Git.

## 3. Staff accounts and existing credentials

- Staff sign in with their existing K&B staff ID and password.
- Passwords are verified server-side using scrypt; plaintext passwords are never stored.
- New staff passwords are salted and hashed before being written to Firestore.
- Old AppDeploy scrypt hashes can be retained only if the complete user record (including its original salt and password hash) is exported securely and imported into the matching Firestore user document. Do not assume records were imported merely because profile data exists.
- Any profile without a valid `salt` and `passwordHash` must receive an administrator-managed password reset before the account can sign in.
- Do not put password hashes or user exports in GitHub issues, PR comments, or chat.

## 4. Backend configuration and deployment

- `VITE_FIREBASE_FUNCTIONS_URL`: HTTPS URL of the deployed K&B API Cloud Function.
- GitHub repository secret `FIREBASE_SERVICE_ACCOUNT_KANDB_NET_SEVICE`: service-account JSON with minimum Firebase deployment permissions. Keep it in GitHub Actions repository secrets only.
- `ADMIN_BOOTSTRAP_SECRET` and `ADMIN_RECOVERY_CODE`: Firebase Functions secrets set through a trusted owner-controlled Firebase CLI session.
- Cloud Functions region: `asia-south1`.
- Firestore rules deny direct browser reads/writes; do not loosen these rules to fix API errors.

## 5. Safe migration and backup

1. Export and back up AppDeploy users and all business collections.
2. Preserve the original AppDeploy system and data during staged migration.
3. Import user IDs, roles, active states, display names and the original scrypt salt/hash only through an owner-controlled secure migration process.
4. Reconcile document IDs and all staff references (assignments, attendance, visits, tasks, payments and audit entries) before cutover.
5. Verify admin/staff login, session expiry/revocation, role checks and staff-only data access against sample data.
6. Keep a recoverable backup until the owner approves cutover.

No six-month automatic deletion is permitted. The dashboard only flags old records for admin review; deletion requires an explicit admin confirmation for each record. Customer, payment, invoice, accounting and other business records must never be automatically removed.

## 6. Android APK

Build the APK through the repository's Android GitHub Actions workflow. No Firebase Authentication client setup is required. Keep Android signing credentials and any service-account files out of source control.
