# Android background tracking and release checklist

## Tracking behavior

- Location tracking starts only after a staff member agrees to location sharing for the active shift.
- Android uses `@capacitor-community/background-geolocation` with a visible foreground-service notification.
- The notification explains that work location is shared with authorised K&B administrators and that tracking stops at checkout.
- Location points are sent to the Firebase API using Capacitor's native HTTP transport.
- The server accepts points only from an authenticated staff account with an active shift for the current India work date.
- The admin location API returns the latest points only for active shifts.
- Checkout or server rejection for an ended shift causes the app watcher to be removed.
- If the native location plugin reports a location/permission error, the app asks the server to start the 15-minute GPS grace period.
- The server scheduler sends reminders and cancels the shift after the grace period if no valid location point is received.
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
4. Lock the screen and leave the app in the background for at least 15 minutes; confirm fresh timestamped points reach the admin map.
5. Move between locations and verify that the admin map shows updated points and accuracy/timestamps.
6. Disable location services or revoke permission; confirm the server starts the grace timer after the native plugin reports the failure.
7. Restore location before 15 minutes; confirm the shift remains active and old GPS reminder notifications are resolved.
8. In a separate test shift, leave location unavailable through the grace period; confirm the server cancels the shift and the admin can restart it.
9. Check out normally; confirm the persistent tracking notification disappears and no later points are accepted.
10. Repeat with battery saver enabled, app backgrounded, and the actual staff phone models used by the business.

Record the Android version, phone model, permission settings, observed update intervals, and any missed updates. Do not call the system production-ready until these tests pass on the devices staff will use.

## Release status and prerequisites

- Web and Functions CI checks are separate from live Firebase integration tests.
- The Android workflow produces a debug APK artifact; it is for internal testing, not a signed production release.
- Before Firebase deployment, confirm Email/Password Authentication, the existing Firestore database and its region, Functions secrets, service-account permissions, and Cloud Scheduler/billing requirements.
- The scheduled GPS grace-period function requires Cloud Scheduler support. Confirm the project's billing plan and required Google Cloud APIs before deploying it.
- Deploy Functions before Hosting rewrites are used.
- Do not run production deployment until test accounts, backup/data review, and API/role tests are complete.
- The old AppDeploy app and `main` branch are retained. No legacy data has been imported by this migration.
- A production APK needs a private signing key managed outside the repository. Never commit the signing key or its password.
