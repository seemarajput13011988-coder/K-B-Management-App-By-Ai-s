# K&B Management Nexus — release blockers and owner setup

The application source and CI build are maintained on the `firebase-migration` branch. A successful build is not a production release. The following items require access to the Firebase / Google Cloud owner account and must not be replaced with guessed credentials.

## 1. Firebase Android push notifications

In Firebase Console, open project `kandb-net-sevice` → Project settings → Your apps. Register an Android app with the exact package ID:

`kandbnet.service2010`

Download that app's `google-services.json`. In the GitHub repository, open Settings → Secrets and variables → Actions → New repository secret:

- Name: `ANDROID_GOOGLE_SERVICES_JSON_BASE64`
- Value: Base64 encoding of the complete JSON file.

Windows PowerShell (run locally in the folder containing the downloaded file):

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes(".\google-services.json"))
```

Copy the output directly into the GitHub secret form. Do not paste the file or encoded value into a chat, issue, commit, or source file. Rebuild the APK after adding the secret. The workflow currently allows a debug build without this secret, but that APK does not have Android FCM configured.

## 2. Google Maps for the admin live staff map

In the Google Cloud project used by K&B:

1. Enable Maps JavaScript API and configure billing if Google requires it.
2. Create a browser API key restricted to Maps JavaScript API.
3. Restrict application origins to the production Hosting domain and the verified Android Capacitor WebView origin. Do not leave the key unrestricted.
4. Add a GitHub Actions repository secret named `VITE_GOOGLE_MAPS_API_KEY`.
5. Rebuild the web app and Android APK after adding the key.

The key is a public browser key embedded in the app bundle. It must be restricted by API and application origin; it is not a private server credential.

## 3. Firebase deployment credentials

The manual Functions and Hosting deployment workflows require this GitHub Actions repository secret:

- `FIREBASE_SERVICE_ACCOUNT_KANDB_NET_SEVICE`

The value must be the service-account JSON for project `kandb-net-sevice`, with the minimum permissions needed to deploy Firebase Functions and Hosting. The account owner should create and add it directly in GitHub Actions secrets. Never commit it or send it through chat.

Before deploying, the Firebase owner must also confirm:
- Email/Password sign-in is enabled in Firebase Authentication.
- Firestore is enabled in the intended production project and the existing data has been backed up.
- Firebase Functions secrets `ADMIN_BOOTSTRAP_SECRET` and `ADMIN_RECOVERY_CODE` are set in the project.
- Cloud Scheduler / required Google Cloud APIs and billing are enabled for scheduled GPS grace-period and subscription reminder functions.
- The primary admin account and recovery procedure are ready.

Deploy Functions before Hosting so the Hosting `/api/**` rewrite has a deployed API target.

## 4. GPS and notification acceptance

GPS is intentionally transparent and shift-scoped: staff must consent, Android shows a persistent foreground-service notification, and tracking stops at checkout. Android may interrupt location updates because of force-stop, phone shutdown, battery controls, disabled location, revoked permissions, or network loss. The server must display the last captured timestamp and must not treat an old point as live.

The 15-minute GPS grace timer starts only after the app reports a confirmed location/permission failure. It cannot reliably infer that a worker manually disabled GPS if Android force-stops the app or the phone loses power/network before the app can report the change. Do not automatically cancel a shift solely because a location timestamp is stale; that can incorrectly penalise workers for connectivity or device issues.

Before business use, test on the actual Android phones:
- Background and locked-screen tracking for at least 15 minutes.
- GPS/permission disabled and restored within the grace window.
- GPS unavailable through the full grace window.
- Checkout stops tracking.
- Push notification received while the app is backgrounded and fully closed.
- Admin map shows all active staff with accurate timestamps.

## 5. Current code/build state

- Latest code branch: `firebase-migration`.
- Latest verified Firebase Functions tests: 14 passed, 0 failed (commit `1cf9f89311bf537925327ad19dc0042c289c2121`).
- Latest Android debug APK workflow: successful; artifact is a debug build, not a signed production APK.
- Latest web production build check: successful on the preceding UI commit.
- Hosting deployment workflow now uses the confirmed public Firebase Web App configuration, so those public values no longer need separate GitHub secrets.
- No production deployment or physical-device acceptance test is claimed by these build checks.

## 6. Production Android signing

A production APK requires a private Android signing key and passwords. The owner must keep these outside the repository and configure a protected release-signing workflow. Never upload signing credentials to chat or commit them to source control.
