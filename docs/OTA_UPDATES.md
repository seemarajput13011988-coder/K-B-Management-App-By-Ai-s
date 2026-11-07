# K&B Management Nexus — Android live updates

## What updates automatically

The Android app uses Capacitor Updater (Capacitor 7-compatible release) with a self-hosted update check on the K&B Render API. When the app starts, the native updater checks the latest compatible release, downloads the web bundle over HTTPS, verifies its SHA-256 checksum, applies it behind the native splash screen and rolls back if the new JavaScript bundle does not report that it is ready.

The updater is configured for `onLaunch`: an update available when the app is opened is applied before the React workspace is shown. If the update service is unreachable, the installed working bundle remains available; the app does not lock staff out because the phone is offline.

## What does not update over the air

OTA applies only to web assets: HTML, CSS, JavaScript and other web resources. Native Android changes—new Capacitor plugins, Java/Kotlin code, permissions, foreground services, notification integration, or native SDK changes—still require a new Android package installed through Android's package installer. The first APK containing the updater is a one-time bootstrap requirement; subsequent web-only fixes/features can be released without repeatedly downloading APKs.

## Release flow

1. Merge reviewed frontend changes into `main`.
2. The `.github/workflows/ota-release.yml` workflow type-checks and builds the web app.
3. Capgo CLI creates a plugin-compatible zip and its SHA-256 checksum.
4. GitHub Actions publishes an immutable `nexus-ota-v1.0.N` release with `kandb-nexus-bundle.zip` and `kandb-nexus-metadata.json`.
5. The Render API endpoint `POST /api/app-updates/check` reads the latest release metadata and returns the version, HTTPS download URL and checksum to the native updater.

The Render API reads public GitHub release metadata and caches it for two minutes. No private signing key or app data is stored in the release. The checksum protects against accidental/corrupt downloads; it is not a substitute for repository access controls and release review.

## Required first install

The current installed APK predates this OTA integration. Build and install one new APK after the updater changes have passed CI. That APK installs the native updater and splash-screen integration. After that, web-only updates are distributed by the server workflow.

## Safe-release rules

- Do not include native plugin, Android manifest, Java/Kotlin or permission changes in an OTA-only release.
- Keep the previous working bundle available for automatic rollback.
- Do not publish OTA bundles from draft PRs or non-main branches.
- If an update changes server API contracts, deploy a backward-compatible Render API first, then publish the web bundle.
- Verify the OTA release endpoint and at least one real Android device update before staff rollout.
- Keep API compatibility with the installed native binary. A web bundle must not call native plugin methods that are absent from that APK.
