# Whole-application audit — 7 November 2026

## Scope and source reviewed
Audit target: `fixes-session-gps-ui-2026-11-06` at commit `dc7b8b57ae967782c29b89ab246091a6d80d13a7`. The repository default branch is `main`; this audit branch is not the production default. No production data or deployment configuration was changed by this audit.

Reviewed the repository tree, README and migration/release/location documentation, React app shell and API client, attendance/GPS workspaces, finance, invoice, inventory, subscription, installation and calendar workspaces, Render API dispatch, legacy attendance routes, scheduled jobs, Firestore adapter/rules, Firebase Functions API, and current GitHub Actions results.

## Confirmed architectural risks

1. **Two backend implementations are active in the same Render server.** `render-backend/server.ts` sends selected route families to `apiHandler`, sends other requests to `legacyHandler`, and falls back to `apiHandler`. This means the route dispatcher determines which of two implementations owns a feature. Attendance and staff live-location are currently handled through the legacy route path, while auth, admin/staff account and several other feature families use the Firestore-session API handler. This split is a major source of inconsistent behavior and makes a single route inventory insufficient.
2. **The migration documentation does not describe the active frontend transport accurately.** `src/lib/api.ts` sends normal app API traffic to the Render service. `src/lib/firebase.ts` initializes the Firebase browser app/Firestore, but explicitly says the K&B session API is used for authentication. README and migration docs variously describe Cloud Functions/Firebase Authentication as the live API architecture. These descriptions must be reconciled before any production cutover; do not switch services based on documentation alone.
3. **Attendance is not one atomic state transition.** Staff check-in reads the attendance collection, checks for a same-day record, then writes a new record. The check is not in a Firestore transaction, so simultaneous/retried requests can race. UI derives shift state from the latest matching record and the `checkOutAt` field, while automatic checkout and GPS grace jobs independently update attendance. This needs a single server-owned state transition contract and idempotency.
4. **GPS status and attendance success are separate today.** The staff check-in endpoint creates attendance and returns success without starting or confirming GPS. Native tracking is started later by `StaffLocationResponder`; errors are mostly swallowed or reported separately. The admin GPS workspace polls the last stored point and labels it fresh/stale, which is not equivalent to proving the phone's foreground service is running.
5. **GPS consent messaging is inconsistent.** `docs/LOCATION_PRIVACY.md` describes a consent prompt and admin-start consent flow, while `src/GpsTrackingWorkspace.tsx` currently tells admins that no location-request notification or staff confirmation is sent. This must be corrected before business use; location collection must remain transparent and consent-based.
6. **Automatic checkout depends on scheduled backend execution.** `render-backend/jobs.ts` runs checkout and GPS grace handling in scheduled ticks. A successful API build does not prove the scheduled service is running at 7 PM. The release notes themselves describe Render free-plan scheduling as best-effort. Shift closure must be server-enforced on reads/actions as well as scheduled, with the scheduler as a cleanup mechanism.
7. **The UI is spread across a very large app shell and separate workspaces.** `src/App.tsx` is a very large component containing navigation, dashboard, permissions, data loading, many modals and staff GPS responder logic. Feature workspaces independently load and mutate overlapping business data. This creates multiple refresh/state paths and contributes to screens showing different values after edits.
8. **Realtime is not currently realtime.** `src/lib/api.ts` exports a `ws.connect()` stub that immediately resolves and never sends messages. Screens rely on polling/manual refresh. Any UI that implies live synchronization must be labeled and implemented accordingly.
9. **Data loading uses fixed list limits.** The backend adapter and route handlers frequently list a fixed maximum (often 500–1000) without a shared pagination contract. Larger businesses can silently miss records in dashboards, attendance, finance and reports.
10. **Documentation and workflows are inconsistent.** The repo default branch is `main`, while this active branch contains the recent fixes. There are multiple Android workflows with different triggers and build requirements. The release docs refer to another branch as the latest code branch. Branch/deployment ownership must be made explicit before a release.

## Whole-app work plan

### P0 — correctness and data integrity
- Define one authoritative attendance state machine and API contract.
- Make check-in, check-out, admin start/end, GPS cancellation/restart and 7 PM auto-checkout idempotent and transaction-safe.
- Ensure all attendance reads use the same India work-date and latest-record rules.
- Ensure a staff shift cannot be displayed as completed immediately after successful check-in.
- Add regression tests for normal start/end, duplicate taps, retries, next-day restart, admin override, GPS failure/recovery and auto-checkout.
- Verify location service start/stop acknowledgement and server-side freshness separately from attendance.

### P1 — backend consistency and security
- Build a route-to-handler matrix for all API routes and remove ambiguous duplicate ownership only after comparing behavior and authorization.
- Verify every route's role checks, ownership scoping, input validation, audit logging and failure behavior.
- Verify admin creation remains restricted to the primary administrator server-side.
- Add tests against the actual backend adapter/Firestore emulator for concurrency, authorization, record isolation and cross-module consistency.
- Reconcile Render vs Firebase Functions architecture and update docs only after the live deployment target is confirmed.

### P2 — module and data integrity audit
- Audit customers, plans, payments, subscriptions, invoices, expenses, payroll, inventory, installations, complaints, tasks, visits, holidays, messages, groups, notifications and audit records.
- Check relationships, duplicate submissions, deletes/voids, calculations, date/time zones, staff ownership, stale state and report totals.
- Add pagination or explicit record limits with visible warnings; do not silently truncate business data.
- Verify CSV/PDF exports against saved records and financial totals.

### P3 — UI/UX consolidation
- Map every admin/staff route and current navigation entry.
- Reduce dashboard to essential summary cards and primary actions.
- Use one consistent page header, spacing, typography, forms, status labels and mobile navigation.
- Separate advanced admin tools from daily staff actions.
- Ensure every save/edit/delete updates the relevant shared data view or clearly reports a refresh failure.
- Test narrow Android screens, keyboard overlap, scrolling, dialogs and bottom navigation.

### P4 — release and device acceptance
- Run frontend typecheck/build, backend typecheck/tests, route contract tests and APK build.
- Install on an actual Android device and verify permissions, background service, task removal, reboot, battery restrictions, network loss and recovery.
- Verify server scheduler operation and exact 7 PM checkout behavior.
- Do not claim production readiness from CI success alone.

## Current CI evidence
At the audit commit, the latest GitHub Actions run `42343152636` completed successfully for backend typecheck/tests, frontend build and API smoke test. The keepalive job was skipped. These checks do not include a physical Android GPS test, a Firestore emulator end-to-end attendance test, or proof that the scheduled 7 PM job ran on a production day.

## Guardrails
- Do not touch `main`, the old Appp5 repository, production data, Firebase secrets or Render environment variables as part of routine fixes.
- Do not delete or migrate business records without an owner-approved backup and reconciliation.
- Do not claim a fix is complete until its regression test passes; distinguish automated checks from physical-device checks.
- Keep the app's location collection transparent, shift-scoped and consent-based.
