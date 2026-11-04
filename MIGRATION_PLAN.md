# Firebase and Android Migration Plan

## Baseline preserved
The complete 16-file source snapshot from AppDeploy version 1793770810412 is preserved on `main`. The original AppDeploy application and its data are not to be deleted or changed during migration.

## Current architecture found in source
- React 19 + Vite + TypeScript frontend.
- Existing frontend API calls use `@appdeploy/client`.
- Existing backend routes and data persistence use `@appdeploy/sdk`.
- Existing backend includes password hashing, sessions, role checks, audit logging, business modules, and realtime subscriptions.
- The current source is not Firebase-backed yet.

## Target architecture
- React + Vite frontend.
- Capacitor Android wrapper for the private APK.
- Firebase Authentication for identity and secure session lifecycle.
- Cloud Firestore for application records.
- Cloud Functions for server-side APIs, role enforcement, validation, and audit writes.
- Firebase Hosting for the browser-based admin portal and web app.
- GitHub Actions for repeatable Android APK builds.

## Migration rules
1. Confirm the correct Firebase project ID before configuring Firebase.
2. Export and back up all existing AppDeploy collections before any production data migration.
3. Build a data mapping and migration script; preserve record IDs, relationships, timestamps, assignment fields, and audit history.
4. Port every API route and its authorization checks before switching the frontend.
5. Keep the old app available until the new backend, web build, and APK pass verification.
6. Never put Firebase Admin credentials or service-account private keys in frontend code or this repository.
7. Use Firestore Security Rules and server-side authorization; do not trust role values supplied by the client.

## Modules to preserve and verify
Authentication and staff accounts; customers; plans; payments; dashboards; attendance and admin corrections; consent-based foreground GPS; tasks; complaints; announcements; direct messages and group chat; field visits; finance and invoices; expenses; CSV exports; audit logs; language and theme preferences.

## Current blockers / inputs needed
- Correct Firebase Project ID for this K&B Customer Management app.
- Confirm whether the Firebase project already has Authentication and Firestore enabled.
- A secure export of the current AppDeploy data is still required before live-data migration.

## Status
- [x] Verify repository is private/public as configured and connected with push access.
- [x] Preserve all 16 source files from the current AppDeploy snapshot on `main`.
- [x] Create a separate `firebase-migration` working branch.
- [x] Add Firebase browser SDK initialization scaffold with a project-ID guard.
- [x] Add deny-by-default Firestore rules and Firebase Hosting configuration.
- [x] Add Capacitor Android app configuration and dependencies.
- [ ] Configure the confirmed Firebase project and register its web app.
- [x] Add secure Cloud Functions HTTP API foundation and ID-token verification.
- [ ] Port backend APIs and authentication.
- [ ] Migrate and verify data.
- [ ] Add Capacitor Android build and CI.
- [ ] Test web and Android flows for admin and staff.
