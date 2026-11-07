# K&B Management Nexus API inventory

This document now describes the active Render API, not the preserved AppDeploy/Firebase migration snapshot.

- Active API source: `render-backend/server.ts`, `render-backend/api-handler.ts`, and `render-backend/legacy-routes.ts`.
- Active data store: Firestore through the Firebase Admin SDK in `render-backend/firestore-adapter.ts`.
- Active staff/admin authentication: K&B ID/password with salted scrypt hashes and opaque server-side sessions.
- Legacy sources: `backend/` (AppDeploy snapshot) and `functions/` (old Firebase Functions migration). They are not active deployment targets.
- `firestore.rules` denies direct browser reads/writes; application data access must go through the active API.
- `POST /api/app-updates/check` is a public, read-only Capacitor updater endpoint. It only serves signed-off public release metadata and does not access business records.

## Inventory maintenance

The active route declarations are distributed across `render-backend/api-handler.ts` and `render-backend/legacy-routes.ts`. Keep this document synchronized when routes are added or removed. CI checks should exercise route contracts and role requirements; a route's existence alone is not proof of correct authorization.

## Required release checks

- Verify each sensitive endpoint with no session, staff session, ordinary admin session, and super-admin session as applicable.
- Verify staff scoping and record ownership for customers, tasks, complaints, attendance, GPS, media, messages and groups.
- Verify that multi-document financial operations use Firestore transactions or batched writes where partial completion would corrupt totals.
- Verify server-side validation for all money, dates, state transitions, IDs, uploads and permissions.
- Do not use the legacy API inventory or old migration notes as evidence of active behavior.
