# K&B Management Nexus — desktop web release

The existing React/Vite application is browser-capable. Its desktop layout uses the same authenticated workspaces and calls the existing Render API; it does not create a second database or a separate set of staff/customer records.

## Desktop preview

The `desktop-web-2026-11-12` branch builds the same web frontend and deploys a Firebase Hosting preview channel. The preview workflow is `.github/workflows/desktop-web-preview.yml`.

Before the preview workflow can deploy, add this GitHub Actions repository secret:

- `FIREBASE_SERVICE_ACCOUNT_KAND_B_NET_SEVICE`: a Firebase service-account JSON key authorized to deploy Hosting for project `kandb-net-sevice`.

The workflow uses Node.js 22, `npm ci`, and `npm run build`, with the existing Render API URL. It deploys only to the expiring `desktop-preview` Hosting channel, not to the production channel.

## Production URL

The intended production Hosting URL is `https://kandb-net-sevice.web.app`. It is not considered live until a production Hosting deployment succeeds and the URL is verified.

## Compatibility and safeguards

- Admin and staff login continue to use the existing Render API and server-side role authorization.
- Existing Firestore data and backend services are not migrated or modified by the frontend hosting workflow.
- The Android app and its Capacitor GPS/native tracking implementation are not changed by this web preview workflow.
- Browser GPS permissions and background tracking differ from Android native tracking. Do not assume Android background GPS behavior is available in a desktop browser.
