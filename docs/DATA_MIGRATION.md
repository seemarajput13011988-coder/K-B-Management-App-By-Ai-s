# AppDeploy to Firebase data migration map

This document is a preparation map only. It does not mean any records have been exported or imported.

## Collections to back up and map

| Old collection | New Firestore collection | Notes |
| --- | --- | --- |
| `users` | `users` | Recreate Firebase Authentication identities; preserve userId, displayName, role and active state. Do not copy old password hashes as Firebase passwords. |
| `sessions` | Not migrated | Old random session tokens must be invalidated; Firebase ID tokens replace them. |
| `plans` | `plans` | Preserve plan document IDs and all plan fields. |
| `customers` | `customers` | Preserve IDs, fees, plan text, status, dates, notes and staff assignment. |
| `payments` | `payments` | Preserve IDs, amounts, dates, month labels, method and recorder identity. |
| `complaints` | `complaints` | Preserve ticket IDs, customer relation, status, priority and assignment. |
| `tasks` | `tasks` | Preserve IDs, assignee, due date, status and creator. |
| `attendance` | `attendance` | Preserve check-in/out timestamps, work date, staff identity and admin correction metadata. |
| `locations` | `locations` | Review retention and consent first; preserve captured timestamps and accuracy only if needed. |
| `announcements` | `announcements` | Preserve message, author and creation timestamp. |
| `messages` | `messages` | Rewrite senderId and recipientId to the new Firebase UIDs. |
| `chat_groups` | `chat_groups` | Rewrite memberIds, createdBy and any user references. |
| `group_messages` | `group_messages` | Rewrite senderId; preserve groupId and timestamps. |
| `visits` | `visits` | Rewrite staffId; preserve customerId and visit details. |
| `expenses` | `expenses` | Rewrite createdBy; preserve amount, category, date and notes. |
| `invoices` | `invoices` | Rewrite createdBy; preserve invoice IDs, customer references, periods and void metadata. |
| `audit_logs` | `audit_logs` | Preserve historical actor names and timestamps; map actorId where a matching account exists. |

## Required identity remapping

Old staff IDs are AppDeploy record IDs, while new staff IDs are Firebase Authentication UIDs. Create a reviewed mapping table before importing and rewrite every user reference consistently:

- `customers.assignedTo`
- `payments.recordedBy`
- `complaints.createdBy` and `complaints.assignedTo`
- `tasks.assignedTo` and `tasks.createdBy`
- `attendance.userId`
- `locations.userId`
- `messages.senderId` and `messages.recipientId`
- `chat_groups.memberIds` and `chat_groups.createdBy`
- `group_messages.senderId`
- `visits.staffId`
- `expenses.createdBy`
- `invoices.createdBy`
- `audit_logs.actorId`

Map the old admin record `admin-primary` to the newly bootstrapped Firebase admin UID.

## Mandatory migration procedure

1. Obtain an owner-authorized export of all old collections and record counts.
2. Store an untouched backup outside the public GitHub repository.
3. Inspect the export for test records, duplicates, missing references and sensitive data.
4. Create Firebase Auth users and record the old-ID to new-UID mapping.
5. Transform records in a dry run and produce before/after counts plus unresolved-reference reports.
6. Import into a staging Firebase project or isolated test collections first.
7. Verify totals, customer/payment relationships, staff scoping, invoices, attendance and audit history.
8. Only after written review, import production records and keep the old app available during acceptance testing.

Never commit customer exports, payment records, passwords, service-account keys or recovery secrets to GitHub.
