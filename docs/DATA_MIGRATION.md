# AppDeploy to K&B Nexus Firestore data migration map

This document is a preparation map only. It does not mean records have been exported or imported. The active Nexus app uses the Render API and Firebase Admin SDK to access Firestore project `kandb-net-sevice`. Staff/admin sign-in uses K&B user IDs and salted password hashes managed by the Render API; Firebase Authentication UIDs are **not** part of the active login architecture.

## Collections to back up and reconcile

| Old collection | Nexus Firestore collection | Migration notes |
| --- | --- | --- |
| `users` | `users` | Preserve the approved K&B user ID, display name, role and active state. Preserve stable document IDs where safe, or prepare an explicit ID mapping. Validate password-hash compatibility before any hash migration; otherwise provision/reset passwords through the admin-controlled flow. |
| `sessions` | Not migrated | Invalidate old sessions. Nexus creates new opaque sessions and stores only token hashes. |
| `plans` | `plans` | Preserve plan IDs, provider, speed, data allowance, prices and active/archive state. |
| `customers` | `customers` | Preserve IDs, fees, plan text, status, dates, notes and staff assignment references. |
| `payments` | `payments` | Preserve IDs, amounts, dates, billing month, method and recorder identity. |
| `complaints` | `complaints` | Preserve ticket IDs, customer/staff relation, status, priority, assignment and resolution history. |
| `tasks` | `tasks` | Preserve IDs, assignee, due date, status, creator and completion history. |
| `attendance` | `attendance` | Preserve check-in/out timestamps, work date, staff identity, shift deadlines and admin correction metadata. |
| `locations` | Reviewed location history collections | Review consent, purpose and retention first. Preserve captured timestamps and accuracy only when needed. Never migrate stale points as live locations. |
| `announcements` | `announcements` | Preserve message, author and creation timestamp. |
| `messages` | `messages` | Preserve sender/recipient relationships using the reviewed K&B user-document ID mapping. |
| `chat_groups` | `chat_groups` | Preserve group IDs and map member IDs and creator IDs consistently. |
| `group_messages` | `group_messages` | Preserve group ID, sender reference and timestamps. |
| `visits` | `visits` | Preserve staff and customer references plus visit details. |
| `expenses` | `expenses` | Preserve creator reference, amount, category, date and notes. |
| `invoices` | `invoices` | Preserve invoice IDs, customer references, periods, amounts and void metadata. |
| `audit_logs` | `audit_logs` | Preserve historical actor names and timestamps; map actor IDs only where the matching account is known. |

The exact collection set must be confirmed against a real owner-authorized export before any import. Newer Nexus workspaces may also use subscriptions, payroll, inventory, installations, notifications, media, location requests and other collections; include them only after comparing the actual source export and target schema.

## Required identity mapping

The active app uses Firestore user-document IDs as the stable identity referenced by business records. It does not require Firebase Authentication UIDs.

If user document IDs change during migration, create a reviewed mapping table from each old AppDeploy user-record ID to the new Nexus Firestore user-document ID. Apply that mapping consistently to:

- `customers.assignedTo`
- `payments.recordedBy`
- `complaints.createdBy`, `complaints.assignedTo` and staff references
- `tasks.assignedTo` and `tasks.createdBy`
- `attendance.userId`
- location-history user references
- `messages.senderId` and `messages.recipientId`
- `chat_groups.memberIds` and `chat_groups.createdBy`
- `group_messages.senderId`
- `visits.staffId`
- `expenses.createdBy`
- `invoices.createdBy`
- `audit_logs.actorId`

Do not invent new IDs or rewrite references without a complete mapping and reconciliation report.

## Mandatory migration procedure

1. Obtain an owner-authorized export of all source collections and record counts.
2. Store an untouched backup outside the public GitHub repository.
3. Inspect the export for test records, duplicates, missing references and sensitive data.
4. Confirm the target Firestore project, collection names, document IDs and current data before writing anything.
5. Validate the existing password-hash format. Do not copy hashes blindly; use an administrator-controlled password reset where compatibility is uncertain.
6. Build an old-ID-to-new-ID mapping only if IDs must change, then transform records in a dry run.
7. Produce before/after counts, duplicate reports, unresolved-reference reports and sample relationship checks.
8. Import into a staging project or isolated test collections first.
9. Verify customer/payment relationships, staff scoping, invoices, attendance, chat membership, finance totals and audit history.
10. Obtain explicit owner approval before any production import. Keep the old app and untouched backup available during acceptance testing.

Never commit customer exports, payment records, passwords, password hashes, service-account keys, recovery codes or Android signing keys to GitHub. Deployment must not clear or overwrite existing business collections.
