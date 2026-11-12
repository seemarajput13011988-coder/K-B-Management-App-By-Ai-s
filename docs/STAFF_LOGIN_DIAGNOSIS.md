# K&B Nexus sign-in diagnosis and safe staff account setup

## Active sign-in architecture

The active Nexus app does **not** use Firebase Authentication for staff or administrator sign-in.

1. The React client calls `POST /api/auth/login` on the Render API with the K&B user ID and password.
2. The Render API looks up the account in Firestore collection `users`, checks that it is active, and verifies the password against its salted scrypt hash.
3. The server creates an opaque random session token. Only the SHA-256 hash of that token is stored in Firestore collection `sessions`.
4. Subsequent API requests send the token in the `Authorization: Bearer` header. The server checks the stored session expiry and current account status on every protected request.

Admin sessions last eight hours. Staff sessions last 26 hours to support an administrator-started shift that can extend into the following day. Revoking a user's sessions invalidates their existing tokens.

## Staff registration and approval

- A prospective staff member can submit a public request using `POST /api/staff-registration-requests`.
- A request is not a user account and cannot sign in.
- The request remains pending until an authenticated administrator reviews it.
- Approval requires the administrator to set a temporary password of at least 10 characters. The server creates the staff account and records the review.
- The request-status endpoint requires the private tracking code returned at submission. The tracking code is stored only as a hash.
- The public registration form never accepts a role or administrator capability. It cannot create an admin account.

If a staff member cannot sign in, first check whether the registration request is still pending or rejected, then confirm that the approved account is active and that the temporary password was entered correctly.

## Common responses

- **404 — no account:** the K&B user ID has not been created or approved yet.
- **401 — incorrect credentials or inactive account:** verify the exact K&B user ID, temporary/current password and active status. Ask an administrator to reset the password if necessary.
- **401 — expired or revoked session:** sign in again. The server checks session expiry and account status.
- **403 — insufficient permission:** the account is authenticated but does not have the role/capability required for that operation.
- **503 — primary owner not initialized:** the Render owner-setup environment is incomplete. The business owner must configure the required private environment values in Render; never put them in GitHub or chat.

## Primary administrator protection

The fixed owner account ID is `Brajraj`. Only the server-provisioned primary-super-admin capability can create, update or remove other admin accounts. The server does not trust a role or capability sent by the client. The primary owner account cannot be disabled or deleted through the admin-management API.

## Legacy code and migration boundary

- `render-backend/` is the active API.
- `functions/` is preserved legacy Firebase Functions source and must not be deployed as a parallel API.
- `backend/` is a preserved AppDeploy backend snapshot, not the active Render API.
- Firebase Authentication accounts are not required for the active K&B sign-in flow.
- Existing AppDeploy users and business records have **not** been automatically imported. Back up and reconcile records before any production migration. Do not assume that creating a Firebase Authentication user provisions a Nexus account.

For data migration, preserve stable K&B user IDs and Firestore user-document references, or create and review an explicit old-ID-to-new-ID mapping before changing any references. Never expose customer exports, password hashes, service-account credentials or recovery secrets in this repository.
