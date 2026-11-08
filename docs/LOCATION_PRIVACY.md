# K&B Management Nexus — staff location notice

This is an operational notice for the private K&B staff app. The business owner should review it with staff before enabling live location features.

## When location is collected
- Location is collected only while the server confirms an active work shift.
- Before staff check in, the app explains the location requirement and requests Android/browser location permission if it has not already been granted.
- If an administrator starts a shift, the staff member is prompted for permission when opening the app. If permission is denied or location is unavailable, GPS restoration reminders are sent at 5, 10 and 14 minutes; if service is not restored within 15 minutes, the shift is automatically cancelled and an administrator must restart it.
- On Android, a persistent system notification remains visible while the background location service is active.
- In the browser version, location updates are foreground-only while the page is open.
- Location sharing stops at checkout, automatic checkout, GPS cancellation or when the server ends the shift.

## What is collected
- Latitude and longitude.
- Approximate location accuracy.
- Server-recorded capture time.
- Staff account identity and display name, linked to the active attendance record.
- GPS availability / restoration and shift-cancellation events.

## Who can see it and why
- Only authenticated, active administrator accounts can read team live locations and location history.
- Location is used for work attendance, field-work coordination and shift verification.
- Staff can see the tracking status in the app and the Android system notification while tracking is active.

## Important limits
- Tracking is best-effort, not guaranteed. Phone shutdown, force-stop, revoked permissions, disabled location services, battery restrictions and lack of network can interrupt updates.
- A missing update must be displayed as stale / unavailable, not treated as proof of a person's location.
- A location point is not proof that a person performed a task or was physically present at a precise indoor location.

## Retention and access review
The owner must decide and communicate a location-history retention period before production use. Do not retain detailed movement history indefinitely by default. Provide a process for staff to ask the administrator about location records and corrections.

## Before live use
1. Review this notice with staff and obtain their informed agreement.
2. Test permission prompts and the persistent notification on the actual Android versions and phone brands used by staff.
3. Test checkout, GPS-off / restore, permission revocation and network loss.
4. Confirm who has administrator access and periodically review that access.
5. Set a retention period and implement deletion before collecting production location history at scale.
