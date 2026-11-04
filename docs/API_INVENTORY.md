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

## Current implementation notes
- Sign-in is handled by Firebase Authentication in the browser; the Functions API verifies Firebase ID tokens.
- Admin bootstrap and admin recovery are protected by separate Firebase Functions secrets.
- The password-change route is being moved to Firebase client-side reauthentication and remains pending.
- The business API handlers are implemented in `functions/src/index.ts`; implementation does not mean they have passed compilation or emulator tests.
