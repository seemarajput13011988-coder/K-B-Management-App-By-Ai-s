# K&B Nexus over-the-air updates

## What updates without an APK

The Capacitor Updater runtime downloads the web bundle (HTML, CSS, JavaScript and web assets) from the K&B Render API. This covers ordinary UI, workflow and web-code fixes. It does not replace Android native code, permissions, native plugins, background services, app identity or signing configuration. Those changes require a newly built and installed APK.

## Startup behavior

On Android startup, Nexus calls the updater readiness acknowledgement immediately, then checks the self-hosted endpoint. If a newer web bundle is advertised, the app displays an update-only screen, downloads the bundle, verifies its SHA-256 checksum and activates it. If activation fails after a bundle is selected, the updater's native rollback mechanism can restore the previous bundle. If the update service is unreachable before it advertises an update, the last known-good app opens rather than locking staff out due to a network outage. If a specific update has been advertised but its download fails, the app remains on the update screen and offers retry.

## Release publishing

The workflow `.github/workflows/ota-release.yml` runs only for relevant changes pushed to `main`. It builds the Vite app, uses the official Capgo CLI to create a compatible bundle archive, calculates its SHA-256 checksum and publishes `nexus-update.zip` plus `ota-manifest.json` as a GitHub Release tagged `nexus-ota-1.0.<run-number>`.

The Render endpoint `POST /api/app-updates/check` reads the newest non-draft `nexus-ota-*` release from this repository and returns the version, bundle URL and checksum. It validates the app ID, platform, semantic version, checksum and HTTPS GitHub download host. The release list is cached briefly to avoid unnecessary GitHub API requests.

## First installation and activation

The OTA runtime and its native plugin must be present in the installed APK before OTA updates can work. Therefore, the first APK containing this updater is a one-time installation. After that, web-only changes can be published through the OTA release workflow.

The Render API must also be deployed once with the OTA check endpoint before the first OTA APK is distributed. This repository's Render Blueprint intentionally has automatic deployment disabled; the API deploy is a deliberate release step.

## Safety rules

- Do not use OTA for native Android source, permissions, plugin or background-service changes.
- Do not publish an OTA bundle until frontend and backend checks pass.
- Keep a known-good previous bundle available for rollback.
- Publish only from reviewed commits on `main`.
- Do not treat OTA as a replacement for physical-device acceptance tests.
- The app fails open only when the update server is unreachable before it has advertised a specific update. Once an update is advertised, the update gate remains active until the update installs or the user retries.
