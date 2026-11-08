# K&B Nexus over-the-air updates

## What updates without an APK

The Capacitor Updater runtime downloads a compressed ZIP of the web bundle (HTML, CSS, JavaScript and web assets) from the K&B Render API. This covers ordinary UI, workflow and web-code fixes. It is a complete compressed web bundle, not a file-by-file delta patch; the self-hosted updater protocol does not support delta/manifest downloads in this manual mode. It is still much smaller than rebuilding and downloading the full Android APK, but the ZIP contains the complete web app. It does not replace Android native code, permissions, native plugins, background services, app identity or signing configuration. Those changes require a newly built and installed APK.

## Startup behavior

On Android startup, Nexus checks the self-hosted endpoint before mounting the usable app. If a newer web bundle is advertised, the currently running bundle is acknowledged as healthy, then Nexus displays an update-only screen, downloads the bundle, verifies its SHA-256 checksum and activates it. The new bundle is acknowledged only after the actual React app mounts successfully. If it fails to initialize, the updater's native rollback mechanism can restore the retained previous bundle. The update check has an 8-second timeout. If the endpoint is unreachable, stalls, or fails before advertising an update, the last known-good app opens rather than locking staff out due to a network outage. If a specific update has been advertised but its download fails, the app remains on the update screen and offers retry.

## Release publishing

The workflow `.github/workflows/ota-release.yml` runs only for relevant changes pushed to `main`. It builds the Vite app, uses the official Capgo CLI to create a compatible bundle archive, calculates its SHA-256 checksum and publishes `nexus-update.zip` plus `ota-manifest.json` as a GitHub Release tagged `nexus-ota-1.0.<run-number>`.

The Render endpoint `POST /api/app-updates/check` reads the newest non-draft `nexus-ota-*` release from this repository and returns the version, bundle URL and checksum. It validates the app ID, platform, semantic version, checksum and HTTPS GitHub download host. The release list is cached for five minutes to reduce unnecessary GitHub API requests.

## Stable Android signing key

The Android debug APK is for automated CI verification only. It is not the distribution build for users who need in-place native upgrades. Configure one persistent release keystore through GitHub Actions secrets:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

The Android workflow builds a signed release APK only when all four are present. Back up the keystore securely; never commit it or paste its passwords into chat, source files, issues or logs. Every future native APK must use this same signing key or Android will refuse an in-place upgrade.

If a previously installed APK was signed with a different temporary debug key, Android cannot update it in place with the new release key. That old installation may require one final uninstall/reinstall before the stable signed build is installed. Business records are stored on the server, but local session state will be cleared.

## First installation and activation

The OTA runtime and its native plugin must be present in the installed APK before OTA updates can work. Therefore, the first APK containing this updater is a one-time installation. After that, web-only changes can be published through the OTA release workflow.

The Render API must also be deployed once with the OTA check endpoint before the first OTA APK is distributed. This repository's Render Blueprint intentionally has automatic deployment disabled; the API deploy is a deliberate release step.

## Safety rules

- Do not use OTA for native Android source, permissions, plugin or background-service changes.
- Do not publish an OTA bundle until frontend and backend checks pass.
- Keep a known-good previous bundle available for rollback.
- Publish only from reviewed commits on `main`.
- Do not treat OTA as a replacement for physical-device acceptance tests.
- The app fails open only when the update server is unreachable before it has advertised a specific update. Once an update is advertised, the update gate remains active until the update installs or the user retries. The previous bundle is retained locally for rollback.
