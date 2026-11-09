# Existing Backend API Inventory

Extracted from the preserved AppDeploy backend snapshot `1793770810412`. These routes form the migration checklist. The Firebase migration branch now contains implementations for the listed business modules; every route still requires build, emulator and role-based verification before production use.

## Health and authentication
- `GET /api/_healthcheck`
- `POST /api/auth/login`
- `POST /api/auth/recover-admin`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `POST /api/auth/change-password`

## Staff and plans
- `GET /api/staff`
- `POST /api/staff`
- `PUT /api/staff/:id`
- `DELETE /api/staff/:id`
- `POST /api/staff/:id/reset-password`
- `GET /api/plans`
- `POST /api/plans`
- `PUT /api/plans/:id`
- `DELETE /api/plans/:id`

## Customers, payments, complaints, and tasks
- `GET /api/customers`
- `POST /api/customers`
- `PUT /api/customers/:id`
- `DELETE /api/customers/:id`
- `GET /api/payments`
- `POST /api/payments`
- `DELETE /api/payments/:id`
- `GET /api/complaints`
- `POST /api/complaints`
- `PUT /api/complaints/:id`
- `DELETE /api/complaints/:id`
- `GET /api/tasks`
- `POST /api/tasks`
- `PUT /api/tasks/:id`
- `DELETE /api/tasks/:id`

## Attendance and location
- `GET /api/attendance`
- `POST /api/attendance/check-in`
- `POST /api/attendance/check-out`
- `POST /api/attendance/admin-start`
- `POST /api/attendance/admin-end`
- `GET /api/locations`
- `POST /api/locations`

## Team communication and field visits
- `GET /api/announcements`
- `POST /api/announcements`
- `DELETE /api/announcements/:id`
- `GET /api/messages`
- `POST /api/messages`
- `DELETE /api/messages/:id`
- `GET /api/groups`
- `POST /api/groups`
- `DELETE /api/groups/:id`
- `GET /api/groups/:id/messages`
- `POST /api/groups/:id/messages`
- `DELETE /api/groups/:id/messages/:messageId`
- `GET /api/visits`
- `POST /api/visits`
- `DELETE /api/visits/:id`

## Finance and audit
- `GET /api/expenses`
- `POST /api/expenses`
- `DELETE /api/expenses/:id`
- `GET /api/invoices`
- `POST /api/invoices/generate`
- `PUT /api/invoices/:id/void`
- `GET /api/audit`

**Total: 59 route declarations.** The migrated backend must preserve route behavior, data validation, role boundaries, staff record scoping, and audit logging—not just endpoint names.

## Current implementation notes (corrected for the active Nexus architecture)

- The active production API is the Node/Express service in `render-backend/`, deployed on Render. The request router is `render-backend/server.ts`; business and authentication handlers are in `render-backend/api-handler.ts` and `render-backend/legacy-routes.ts`.
- Staff and admin sign-in uses K&B user IDs and salted scrypt password hashes verified by the Render API. The API creates opaque expiring sessions stored by hash in Firestore. Firebase Authentication is **not** used for staff/admin sign-in.
- The active API accesses Firestore project `kandb-net-sevice` through the Firebase Admin SDK. Browser Firestore access is denied by `firestore.rules`.
- `functions/` is preserved legacy Firebase Functions source only; it is not the active API and must not be deployed as a parallel backend. `backend/` is a preserved AppDeploy snapshot.
- The route inventory above is a migration/reference checklist from the older AppDeploy backend, not a guarantee that every historical route has an identical active implementation. Verify each current UI call against the active Render handlers and role checks.
- A successful frontend build or route declaration is not proof of live Firestore connectivity, production deployment, or real-device behavior. See `docs/RELEASE_BLOCKERS.md` and `docs/STAFF_LOGIN_DIAGNOSIS.md` for the active setup and release checks.
