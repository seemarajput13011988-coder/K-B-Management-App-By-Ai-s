# Vypaar Management: Multi-business architecture and migration plan

## Why this change is required

The current application is not safely multi-business. The Render backend has two request paths:

- `render-backend/api-handler.ts` handles the newer Firestore-backed routes.
- `render-backend/legacy-routes.ts` handles most operational CRUD routes.

The current authenticated session identifies a user, but operational records are stored in shared top-level Firestore collections. A visual business selector alone would not isolate data. Every read, write, update, delete, export, background job, and derived report must be constrained to the selected business and verified membership.

The current invoice workspace also contains a fixed K&B NET SERVICE profile. That profile must become business-specific configuration rather than a global constant.

## Target account and business model

An account is a login identity. A business is a separate workspace owned by or shared with one or more accounts.

### Firestore records

**`businesses/{businessId}`**
- `name`, `legalName`, `businessType`, `status`
- `ownerUserId`, `createdAt`, `updatedAt`
- `defaultCurrency` (default INR), `timezone` (default Asia/Kolkata)
- `settings` (non-sensitive display and operational preferences)

**`business_memberships/{membershipId}`**
- `businessId`, `userId`, `role`, `status`
- `permissions` (explicit capability flags)
- `createdAt`, `updatedAt`, `invitedBy`

A membership is the authority to access a business. A user may have memberships in multiple businesses. Staff access is also business-specific; a staff member must not gain access to another business merely because the same login exists.

**`sessions/{tokenHash}`**
- Existing session identity and expiry fields
- `activeBusinessId` set only after the server validates an active membership
- Session switching must be server-side and must not accept a business ID as proof of access.

**`business_settings/{businessId}`**
- `invoiceProfile`: legal name, display name, GSTIN, address, state, state code, phone, email, website, bank/UPI details and invoice prefix
- `appearance`: theme/accent preferences if these are business-level
- `documentDefaults`: payment terms, notes, tax defaults

Sensitive payment credentials must not be stored in plain text in this document. Use the existing secret-management approach for server-only secrets.

## Business-owned data

The following records must carry a server-controlled `businessId` and be scoped to the active business:

- Customers, plans, payments, invoices, complaints and customer media
- Tasks, staff assignments, attendance, holidays, field visits and live-location records
- Expenses, payroll, inventory, inventory movements and installations
- Announcements, messages, groups, notifications and business audit events
- Subscriptions and all business-specific reports/exports

Global account identity and authentication records remain account-scoped. Business membership and business role checks are separate from global login authentication.

## Request authorization contract

1. Authenticate the user from the existing server-validated session.
2. Resolve `activeBusinessId` from the session, not from a client-supplied body field.
3. Load the membership for `(activeBusinessId, userId)`; reject missing, inactive or revoked memberships.
4. Resolve the user's role and permissions from that membership.
5. Scope every business-data query and document lookup to `activeBusinessId`.
6. On create, set `businessId` on the server. Ignore or reject client attempts to override it.
7. On update/delete, verify the target document belongs to the active business before mutation.
8. Include the business ID in audit records, exports, notifications, background jobs and idempotency keys.

A staff role in one business must not imply admin privileges in another. The existing primary administrator safeguard must remain intact during the transition.

## API contract

- `GET /api/businesses`: list only active memberships and their business summaries.
- `POST /api/businesses`: create a business and its owner membership atomically.
- `GET /api/businesses/:businessId`: read only after membership validation.
- `PUT /api/businesses/:businessId`: update permitted profile/settings fields.
- `POST /api/businesses/:businessId/switch`: validate membership, update the server session's active business and return the selected business summary.
- `GET /api/businesses/:businessId/members` and member-management routes: owner/admin only, with explicit permission checks.

The frontend must clear business-scoped cached state when switching business, then reload all active-business data. Do not reuse previous-business arrays while the new business is loading.

## Invoice architecture

Replace the fixed module-level K&B business constant with the active business's validated `invoiceProfile`. The invoice generator must:

- Load the active business profile from the backend.
- Allow permitted admins to edit and save the profile in business settings.
- Generate invoice numbers within the business and financial-year sequence.
- Include the business ID and invoice profile snapshot on each saved invoice.
- Preserve the profile snapshot on historical invoices so later profile edits do not rewrite old documents.
- Use the active business's state and state code for CGST/SGST versus IGST calculations.
- Keep customer selection, line items, discounts, tax mode, totals, PDF export and invoice history scoped to the same business.

Do not publish invoices with the current hard-coded K&B identity as a generic default for every business.

## Migration strategy

The migration must be additive, resumable and non-destructive.

1. Inventory all collections, direct Firestore queries, scheduled jobs, exports and legacy routes.
2. Create a dry-run migration that reports record counts and ownership mappings without changing data.
3. Create one legacy/default business for the existing operator and map current admin/staff accounts to it.
4. Backfill `businessId` on existing operational records in bounded batches, preserving document IDs and timestamps.
5. Verify every legacy record has exactly one business assignment; quarantine ambiguous records for manual review rather than guessing.
6. Add server-side business membership checks and scoped query helpers to both API handler paths.
7. Migrate scheduled jobs and background tasks to require a business context.
8. Enable the business switcher only after every operational route is scoped and the isolation tests pass.
9. Keep a rollback plan and exportable pre-migration counts. Do not delete or overwrite legacy data during rollout.

## Frontend behavior

- Show a clear business switcher in the workspace header/sidebar.
- Display the active business name in the shell and on business-specific pages.
- Provide a business management screen for authorized admins.
- Reset search, selected records, pagination, filters, open modals and cached summaries when switching.
- Search and sort only records from the active business.
- Keep the app usable on narrow Android screens and desktop layouts.
- Preserve language and personal appearance preferences where appropriate; keep business-level settings separate from user-level preferences.

## Privacy, terms and consent

The policy and terms pages must use the final operator identity and verified contact details before publication. Store acceptance as an audit event containing the account/user ID, document type, document version, timestamp and acceptance source. Do not treat a generic disclaimer as a replacement for statutory privacy obligations or actual security controls.

## Required verification before release

- Two businesses under one account show separate customers, plans, invoices, payments, staff, expenses, inventory and reports.
- Switching businesses clears all previous business data from the UI before the new data appears.
- A user with no membership cannot read, modify, export or delete another business's records by changing URL, query, body or document IDs.
- Staff permissions remain restricted to their assigned business and role.
- Existing records remain available after migration and keep their original document IDs.
- Invoice numbering is unique per business and financial year; GST split and PDF identity match the active business.
- Search, sort, filters, counts, exports, notifications and background jobs remain business-scoped.
- Repeat backend tests and frontend type-check/build checks; run route-isolation tests at least five times.
- Do not enable production business switching or run the migration until the isolation checks pass.

## Current implementation status

This document records the target architecture and verified migration risks. It does not claim that multi-business isolation, migration, or business-specific invoicing has already been implemented. The initial working branch currently contains the first search improvements and dark-appearance coverage; the multi-business backend and UI work remains a separate coordinated implementation phase.
