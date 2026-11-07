# Create the permanent Android release signing key (Windows)

This is a one-time owner setup. The same keystore must be used for every future native Android release of K&B Nexus.

## 1. Generate the keystore on your own Windows PC

Open **PowerShell** (not a public/shared computer). Make a secure backup location first. Run:

```powershell
$Keystore = "$env:USERPROFILE\kb-nexus-release.jks"
keytool -genkeypair -v -keystore $Keystore -alias kb-nexus -keyalg RSA -keysize 4096 -validity 10000
```

- When prompted, create a strong keystore password and key password. They can be the same, but keep them private.
- Record the alias exactly as `kb-nexus`.
- Keep the generated `kb-nexus-release.jks` file in at least two secure offline backups.
- Never upload the keystore to this repository, send it in chat, or put passwords in source code.

If PowerShell says `keytool` is not recognized, install a JDK (the Android Studio bundled JBR also includes keytool) and reopen PowerShell with that JDK's `bin` directory on PATH.

## 2. Convert the keystore to Base64

Run:

```powershell
$Keystore = "$env:USERPROFILE\kb-nexus-release.jks"
[Convert]::ToBase64String([IO.File]::ReadAllBytes($Keystore)) | Set-Clipboard
```

The Base64 text is now on your clipboard. Treat it as a secret; do not paste it into this chat or a public file.

## 3. Add four GitHub Actions secrets

Open the repository:

https://github.com/seemarajput13011988-coder/K-B-Management-App-By-Ai-s

Go to **Settings → Secrets and variables → Actions → New repository secret**. Add these exact names:

| Secret name | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | Paste the Base64 text copied in step 2 |
| `ANDROID_KEYSTORE_PASSWORD` | The keystore password you created |
| `ANDROID_KEY_ALIAS` | `kb-nexus` |
| `ANDROID_KEY_PASSWORD` | The key password you created |

Do not add quotes around values. Do not share the passwords with anyone.

The Android Firebase configuration secret `ANDROID_GOOGLE_SERVICES_JSON_BASE64` is a separate required secret; the successful CI build confirms that this configuration was available to that workflow run. Do not replace it with the signing-key Base64.

## 4. Verify the signed build

After all four secrets are saved, open **Actions → Build private Android APK → Run workflow** and select branch `nexus-release-audit-2026-11-07`.

A successful signed run must show:
- **Assemble signed release APK for installation and future native updates** — success (not skipped).
- Artifact **`kandb-management-nexus-signed-release-apk`** uploaded.

A run that only uploads `kandb-management-nexus-debug-apk` is a CI test build, not the permanent release APK.

## 5. Protect the signing key for future updates

Every future APK that updates this installation must use this exact keystore, alias and passwords. If the keystore is lost, Android cannot install a differently signed APK as an in-place update. Keep the offline backups safe.

This signing setup does not deploy the backend, merge the pull request, or replace physical-phone testing.
