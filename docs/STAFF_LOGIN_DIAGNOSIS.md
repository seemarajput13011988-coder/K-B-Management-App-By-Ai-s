# Staff sign-in diagnosis and safe account migration

## What the preserved AppDeploy app does today

The preserved `main` app imports `@appdeploy/client` in `src/App.tsx` and calls `POST /api/auth/login` with `userId` and `password`. The AppDeploy backend in `backend/index.ts`:

1. Looks up the primary admin by the fixed `admin-primary` record ID, or searches the AppDeploy `users` collection for a matching staff `userId`.
2. Checks that the account is active.
3. Verifies the supplied password against a per-user scrypt hash and salt.
4. Creates an eight-hour random session record in the `sessions` collection.
5. The client stores that session token in browser localStorage and sends it on subsequent API requests.

Therefore, staff login can fail when the AppDeploy user record is absent, inactive, the entered ID does not match the stored ID, or the password does not match the stored hash. A Firebase Authentication user by itself cannot authenticate against this legacy endpoint.

## What the Firebase migration branch does

The migration client maps a staff ID to a Firebase Auth email:

`lowercase(staffUserId)@accounts.kandbnetservice.in`

It then signs in with Firebase Email/Password and calls the Cloud Functions API with a Firebase ID token in the Authorization Bearer header. The server verifies the token with revocation checking and loads `users/{Firebase UID}` from Firestore. A missing profile, inactive profile, or invalid role prevents API access even when Firebase Authentication accepted the password.

This separates two distinct failure cases:

- **Firebase Auth rejects credentials:** the user has not been provisioned in Firebase Authentication, the password is wrong, or Email/Password/provider/domain configuration is incorrect.
- **Firebase Auth accepts credentials but profile loading fails:** the Firebase UID has no corresponding active Firestore `users/{uid}` profile, or the profile role/status is invalid. Do not create a client-side role or let a user self-register as admin to bypass this.

## Safe staff account migration

1. Export and back up the AppDeploy `users` collection and related business collections through an owner-authorized process. Keep the backup outside GitHub.
2. Create a reviewed mapping table containing the legacy AppDeploy user record ID, staff login ID, display name, active state, new Firebase UID, and provisioning status. Never include plaintext passwords or password hashes in a public repository.
3. Create Firebase Authentication accounts for staff with administrator-controlled temporary passwords or a secure password-reset/invitation process. Existing scrypt hashes are not Firebase passwords and must not be copied into Firebase Authentication.
4. Create each matching Firestore `users/{Firebase UID}` profile server-side with the approved `userId`, `displayName`, `role: staff`, and `active` state. Never accept a role from a public registration form.
5. Remap every staff reference (assignments, payments, attendance, tasks, visits, messages, expenses and audit records) using the reviewed UID mapping.
6. Verify a staff member can read only their own/assigned records, and that disabled staff and invalid/expired tokens are rejected.
7. Keep the AppDeploy app and its data available until reconciliation and owner acceptance are complete.

## Current migration limitations to resolve before production

- Existing old passwords are not imported; each account needs a Firebase provisioning/reset path.
- Firebase Auth success plus a missing Firestore profile must produce a clear, recoverable admin-side provisioning diagnosis.
- Automated tests must exercise valid login, invalid credentials/session, revoked/expired ID tokens, admin-vs-staff authorization, and staff record isolation against an emulator or a testable injected auth/data layer. Existing route-path unit tests alone do not prove these security properties.
- Do not delete any records after six months unless the owner explicitly specifies which data categories, retention trigger, legal/accounting constraints, and backup requirements. Customer, payment, invoice, and other business records are excluded by default.
