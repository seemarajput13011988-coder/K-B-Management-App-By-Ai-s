# Firebase and Android Migration Plan

## Baseline preserved
The complete 16-file source snapshot from AppDeploy version 1793770810412 is preserved on `main`. The original AppDeploy application and its data are not to be deleted or changed during migration.

## Current architecture found in source
- React 19 + Vite + TypeScript frontend.
- The preserved legacy backend uses `@appdeploy/sdk`.
- The migration branch now has a Firebase Auth-aware API adapter; legacy AppDeploy SDK imports were removed from the React modules.
- Existing backend includes password hashing, sessions, role checks, audit logging, business modules, and realtime subscriptions.
- The current migration branch targets Firebase project `kandb-net-sevice`.

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
Authentication and staff accounts; customers; plans; payments; dashboards; attendance and admin corrections; consent-based shift-scoped GPS (native Android foreground service with persistent notification; browser foreground fallback); tasks; complaints; announcements; direct messages and group chat; field visits; finance and invoices; expenses; CSV exports; audit logs; language and theme preferences.

## Current blockers / inputs needed
- Enable Firebase Authentication Email/Password and verify Firestore in the confirmed project.
- Set the Functions secrets `ADMIN_BOOTSTRAP_SECRET` and `ADMIN_RECOVERY_CODE`.
- Add the `FIREBASE_SERVICE_ACCOUNT_KANDB_NET_SEVICE` GitHub Actions secret and the public Firebase Web App config secrets before deploying Hosting / Functions.
- A secure export and reviewed backup of the current AppDeploy data are still required before live-data migration.
- Install the debug APK on a test Android phone and complete the background GPS / notification acceptance tests.
- A stable signing key is needed before shipping release APK updates; the current artifact is debug-signed.

## Status
- [x] Preserve the AppDeploy source snapshot on `main`.
- [x] Create a separate `firebase-migration` working branch.
- [x] Confirm Firebase project ID `kandb-net-sevice` and register the Web App.
- [x] Add Firebase browser SDK initialization scaffold with a project-ID guard.
- [x] Add deny-by-default Firestore rules and Firebase Hosting configuration.
- [x] Add Capacitor Android app configuration and dependencies.
- [x] Add secure Cloud Functions HTTP API foundation and ID-token verification.
- [x] Port the core Firestore-backed API route groups and Firebase ID-token authentication checks.
- [x] Switch React API calls and sign-in to Firebase Authentication / Cloud Functions.
- [x] Add a GitHub Actions Functions typecheck workflow; the latest recorded typecheck passed.
- [x] Add a frontend production build workflow; the latest recorded build passed.
- [x] Configure the Android workflow to use the confirmed project and app identity.
- [x] Add native Android background GPS with a persistent notification, consent gating and native HTTP delivery.
- [x] Enable Capacitor native HTTP and legacy bridge for Android background tracking.
- [x] Add notifications for staff-to-admin messages, group messages, task updates and holiday decisions.
- [ ] Add local Firebase Web App config and enable Email/Password authentication.
- [ ] Configure Functions secrets and verify the API using emulators.
- [ ] Finish password-change flow, realtime chat transport, and full role/edge-case review.
- [ ] Migrate and verify data.
- [x] Build and download a debug APK artifact from GitHub Actions (run #41970912048, 5 Nov 2026, commit `0b80b424`). Latest workflow passed the web build, Functions build and 14 automated tests before assembling the APK.
- [ ] Configure FCM for Android: add `ANDROID_GOOGLE_SERVICES_JSON_BASE64` after registering package `kandbnet.service2010`; the latest workflow confirmed this secret is currently missing.
- [ ] Install the APK on a test phone and complete the Android GPS / notifications acceptance checklist.
- [ ] Create a stable app-signing key through a secure local process before distributing updateable release APKs.
- [ ] Configure FCM push notifications for delivery while the app is fully closed, if required.
- [ ] Test web and Android flows for admin and staff.
- [ ] Deploy Hosting and Functions only after approval and all safety checks.
