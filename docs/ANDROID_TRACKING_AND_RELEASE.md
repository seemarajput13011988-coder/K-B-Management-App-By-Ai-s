# Android background tracking and release checklist

## Tracking behavior

- Location tracking starts only after a staff member agrees to location sharing for the active shift.
- Android uses `@capacitor-community/background-geolocation` with a visible foreground-service notification.
- The notification explains that work location is shared with authorised K&B administrators and that tracking stops at checkout.
- Location points are sent to the Render API, which stores operational data in Firestore, using Capacitor's native HTTP transport.
- The server accepts points only from an authenticated staff account with an active shift for the current India work date.
- The admin location API returns the latest points only for active shifts.
- Checkout or server rejection for an ended shift causes the app watcher to be removed.
- If the native location plugin reports a location/permission error, the app asks the server to start the 15-minute GPS grace period.
- The Render job monitor processes GPS reminders and the 15-minute grace period when the protected job-tick endpoint is called by the scheduled GitHub Actions keepalive workflow.
- Pending or approved holiday requests for the work date are exempt from GPS cancellation.

## Android behavior and limitations

This is best-effort background tracking, not a guarantee of uninterrupted live location. Android battery optimisation, OEM task management, force-stop, reboot, app-data clearing, permission changes, GPS being disabled, device power-off, and loss of internet can interrupt updates. The admin view must treat the last point as historical and display its captured time; it must not label a stale point as live.

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
4. Lock the screen and leave the app in the background for at least 15 minutes; confirm fresh timestamped points reach the admin staff-location list.
5. Move between locations and verify that the selected staff member's latest point, accuracy and timestamp update, and that the Google Maps button opens that exact coordinate.
6. Disable location services or revoke permission; confirm the server starts the grace timer after the native plugin reports the failure.
7. Restore location before 15 minutes; confirm the shift remains active and old GPS reminder notifications are resolved.
8. In a separate test shift, leave location unavailable through the grace period; confirm the server cancels the shift and the admin can restart it.
9. Check out normally; confirm the persistent tracking notification disappears and no later points are accepted.
10. Repeat with battery saver enabled, app backgrounded, and the actual staff phone models used by the business.

Record the Android version, phone model, permission settings, observed update intervals, and any missed updates. Do not call the system production-ready until these tests pass on the devices staff will use.

## Release status and prerequisites

- Web and Functions CI checks are separate from live Firebase integration tests.
- The Android workflow produces a debug APK artifact; it is for internal testing, not a signed production release.
- Before release, confirm the existing Firestore database and its region, Render service environment values, GitHub Actions secrets and API role checks. App sign-in is Firestore-backed; Firebase Authentication is not used for login.
- The GPS grace-period and reminder job tick uses the GitHub Actions scheduled keepalive workflow and the Render API. No Google Maps billing account or Maps API key is required. The scheduled workflow must be on the repository's default branch and `K_B_JOB_SECRET` must match the Render `JOB_SECRET`.
- The Render API must be deployed and reachable before the Android or Hosting build is used.
- Do not run production deployment until test accounts, backup/data review, and API/role tests are complete.
- The old AppDeploy app and `main` branch are retained. No legacy data has been imported by this migration.
- A production APK needs a private signing key managed outside the repository. Never commit the signing key or its password.


## Push notification setup

The app now registers Android FCM device tokens and the Functions backend sends a push notification whenever a document is created in `staff_notifications`. Direct and group message previews are not included in lock-screen notification text.

Before push delivery can work:
1. In Firebase project `kandb-net-sevice`, register an Android app with package name `kandbnet.service2010`.
2. Download that Android app's `google-services.json` file.
3. Base64-encode the file locally and add the resulting value as the GitHub Actions repository secret `ANDROID_GOOGLE_SERVICES_JSON_BASE64`. Do not commit the JSON file to this public repository.
4. Confirm the Render API is live and configured with Firebase Admin credentials for Firestore and FCM delivery.
5. Install a build containing the Firebase Android configuration, sign in, allow notifications, and verify a test push while the app is backgrounded and fully closed.

The APK workflow can still compile without the secret, but that build will not be push-ready. Push delivery is not considered verified until a real Android device receives a test message while the app is not open.

## Staff location in Google Maps

Each staff member's location card shows the latest location shared during their active shift. The admin selects **View location in Google Maps** to open that staff member's latitude and longitude in Google Maps.

This uses a standard Google Maps URL. It does not load the paid Maps JavaScript API and does not require a Google Maps API key, Google Cloud billing account, or payment details. The app does not embed a live Google map canvas; the button opens Google Maps externally.

## Customer subscriptions and renewals

- Admins and staff can view renewal history; staff see only subscriptions for customers assigned to them.
- Admins and assigned staff can create renewals. A paid renewal creates its payment-history record in the same Firestore transaction.
- A renewal updates the customer's plan, monthly fee and due date. Existing customer and payment history is preserved.
- Overlapping active subscription periods are rejected inside the Firestore transaction to prevent two simultaneous renewals from racing.
- Admins can change a renewal to Active, Pending, Expired or Cancelled. Renewal records are not hard-deleted.
- A daily Asia/Kolkata scheduled function reminds admins and assigned staff three days before expiry, on the expiry date, and marks overdue active renewals as Expired with a notification.
- The daily reminder is processed by the Render job monitor through the scheduled GitHub Actions keepalive workflow. It is not active until the workflow runs from the repository's default branch and its `K_B_JOB_SECRET` matches Render's `JOB_SECRET`.

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
