# Android background tracking and release checklist

## Tracking behavior

- Location tracking starts only after a staff member agrees to location sharing for the active shift.
- Android uses `@capacitor-community/background-geolocation` with a visible foreground-service notification.
- The notification explains that work location is shared with authorised K&B administrators and that tracking stops at checkout.
- Location points are written directly to Firestore by the authenticated staff app. This Spark build does not call Firebase Cloud Functions.
- Firestore rules restrict staff location writes to the signed-in staff member and an attendance record belonging to that member.
- The admin location view returns the latest points for active shifts and refreshes while the admin screen is open.
- If the native location plugin reports a location/permission error, the app records the start of a 15-minute grace period.
- The app attempts to settle an expired grace period when the app or admin next makes an attendance/location request. It is not a server-scheduled cancellation.
- Pending or approved holiday exemptions are not yet enforced in the Spark attendance path; do not promise holiday-based GPS exemption until implemented and tested.

## Android behavior and limitations

This is best-effort background tracking, not a guarantee of uninterrupted live location. Android battery optimisation, OEM task management, force-stop, reboot, app-data clearing, permission changes, GPS being disabled, device power-off, and loss of internet can interrupt updates. The admin view must treat the last point as historical and display its captured time; it must not label a stale point as live.

**Important Spark-plan limitation:** Firebase Spark does not provide Cloud Functions or a trusted scheduled backend. The 15-minute deadline is recorded by the client and is settled only when an app/admin request runs after the deadline. If the phone/app is force-stopped or offline and nobody opens the admin app, cancellation cannot be guaranteed exactly at minute 15. A strict server-enforced timer requires a trusted backend and scheduler, which is outside the current Spark-only scope.

The native plugin needs:
- Capacitor Android configuration with `android.useLegacyBridge: true`.
- A persistent background location notification (`backgroundTitle` and `backgroundMessage`).
- Runtime location permission and Android 13+ notification permission.
- Capacitor native HTTP enabled to avoid WebView background request throttling.
- A physical Android device test. A successful APK compile does not prove device behavior.

Tracking is limited to a disclosed active shift. Staff consent is required, the persistent Android notification remains visible, and tracking must stop at checkout. Do not use hidden tracking or collect location outside working shifts.

## Required real-device acceptance tests

1. Install the APK on a supported Android device and sign in as a test staff account.
2. Agree to location sharing and check in while precise location and notifications are allowed.
3. Confirm the persistent K&B tracking notification appears.
4. Lock the screen and leave the app in the background for at least 15 minutes; confirm fresh timestamped points reach the admin map.
5. Move between locations and verify that the admin map shows updated points and accuracy/timestamps.
6. Disable location services or revoke permission; confirm the app records the grace timer when the native plugin reports the failure.
7. Restore location before 15 minutes; confirm the shift remains active.
8. In a separate test shift, leave location unavailable through the grace period, then trigger an app/admin refresh after the deadline; confirm the shift is marked GPS Cancelled and the admin can restart it. This does not prove exact minute-15 server cancellation.
9. Check out normally; confirm the persistent tracking notification disappears and no later points are accepted.
10. Repeat with battery saver enabled, app backgrounded, and the actual staff phone models used by the business.

Record the Android version, phone model, permission settings, observed update intervals, and any missed updates. Do not call the system production-ready until these tests pass on the devices staff will use.

## Release status and prerequisites

- The Spark branch uses direct Firestore client handlers and restrictive Firestore rules. It does not depend on Cloud Functions routes for the migrated app modules.
- Firestore rules emulator regression tests and web TypeScript/build checks run in GitHub Actions.
- The Android workflow produces an unsigned debug APK artifact for internal testing, not a signed production release.
- Firebase Email/Password Authentication and the Firestore database must be enabled in the K&B Firebase project. The first Super Admin profile must be provisioned by the Firebase project owner; the Spark app cannot securely bootstrap its own first administrator.
- A production APK needs a private signing key managed outside the repository. Never commit the signing key or its password.
- No legacy data has been imported by this migration. The original `firebase-migration` branch and Functions code are retained and are not part of the Spark app build.

## Notifications

- The Spark app polls the in-app notification inbox while the app is open and can show local Android/browser notifications while it is running and permitted.
- It does not currently deliver reliable remote push notifications when the app is fully closed.
- FCM token registration and trusted push sending require a configured Android Firebase app plus a trusted backend. The Spark-only build does not claim that capability.

## Multi-worker Google Maps setup

The admin live-location screen displays all staff location points together when the Google Maps JavaScript API key is available at build time.

1. In the Google Cloud project used for the K&B app, enable **Maps JavaScript API** and configure billing as required by Google.
2. Create a browser/API key restricted to the Maps JavaScript API. Restrict allowed website origins to the production admin domain and the Capacitor WebView origin used by the app (normally `http://localhost/*`); verify the exact origin in the installed Android build before finalising restrictions.
3. Add the key as the GitHub Actions repository secret `VITE_GOOGLE_MAPS_API_KEY`. The Android APK workflow passes this value into the Vite build.
4. For any separate web-hosting build, add the same variable to that hosting provider's build environment and rebuild the site.

This key is a public browser key embedded in the built app, not a server secret. Protect it with API and application restrictions; never use an unrestricted key. If it is absent, the admin page shows a setup notice and keeps the per-worker Google Maps links available rather than pretending a map loaded.

## Customer subscriptions and renewals

- Admins and staff can view renewal history; staff see only subscriptions for customers assigned to them.
- Admins and assigned staff can create renewals. A paid renewal creates its payment-history record in the same Firestore transaction.
- A renewal updates the customer's plan, monthly fee and due date. Existing customer and payment history is preserved.
- Overlapping active subscription periods are rejected inside the Firestore transaction to prevent two simultaneous renewals from racing.
- Admins can change a renewal to Active, Pending, Expired or Cancelled. Renewal records are not hard-deleted.
- A daily Asia/Kolkata scheduled function reminds admins and assigned staff three days before expiry, on the expiry date, and marks overdue active renewals as Expired with a notification.
- The daily reminder requires Cloud Scheduler support and a deployed Firebase Functions environment. It is not active merely because the source code is committed.

## Inventory and stock control

- Admins can create, edit and archive inventory items with SKU, category, unit, stock quantity, minimum-stock alert, unit cost, supplier and storage location.
- Staff can view active inventory items and issue stock to a job with a required reason. Staff do not see unit cost or supplier details and cannot add received stock.
- Admins can record stock received or issued. Every movement stores the before/after quantity, actor, timestamp and reason.
- Stock movements run in a Firestore transaction and reject a stock issue that would make quantity negative. Inventory SKUs are checked for uniqueness inside transactions, including older records.
- When a movement takes stock to or below the minimum level, active admins receive a deduplicated low-stock notification. Inventory history is preserved; items are archived instead of hard-deleted.

## Installation jobs

- Admins can schedule a new connection, upgrade, repair or relocation for a customer and assign an active staff member.
- The assigned staff member receives an in-app/push notification and sees only their own installation jobs.
- Assigned staff can update job progress to Scheduled, In progress or Completed and add progress notes. Only admins can cancel a job.
- Every job creation and update is written to the audit log. Installation history is preserved.
