# K&B Management Nexus — Architecture Rebuild

Status: audit and architecture baseline
Branch: nexus-architecture-rebuild-2026-11-17
Base: main (94a2bb3c54e8b425319c946f1bd5cd94ff68ab1c)

## Confirmed current architecture

- Web client: React 19 + Vite + TypeScript.
- Android package: Capacitor 7 WebView, app ID `kandbnet.service2010`.
- Web hosting: Firebase Hosting static Vite build.
- Active API: Express/Node service in `render-backend/`, hosted on Render.
- Database: Firestore project `kandb-net-sevice`, accessed through Firebase Admin SDK on the API.
- Sign-in: K&B user ID/password sessions handled by the Render API; Firebase Authentication is not the active sign-in path.
- OTA: Capgo Capacitor Updater checks the Render OTA endpoint and installs web bundles. Native plugin or Android manifest changes still require a signed APK.

## Audit findings from repository inspection

1. `src/App.tsx` is approximately 172 KB / 2,610 lines and combines application shell, session restoration, navigation, login, workspace orchestration and substantial feature UI.
2. `src/index.css` is approximately 108 KB / 2,181 lines with about 1,203 selector blocks, 54 media queries, repeated selector definitions (including `.content`, `.top-actions`, `.sidebar`, `.topbar`, `.modal`) and 26 `!important` declarations.
3. The existing bright-premium branch adds `src/nexus-theme.css` (about 11 KB / 141 lines) and imports it after `index.css`. It primarily overrides existing selectors; it does not replace the underlying layout architecture. Do not use this stylesheet as the foundation for another layer of overrides.
4. The frontend uses a Capacitor WebView. It is not currently a native Jetpack Compose UI. Preserve the existing Capacitor/OTA path unless a separately approved native migration is planned.
5. The active API entry point is `render-backend/server.ts`; `backend/` is a preserved AppDeploy snapshot and `functions/` is legacy source. Do not deploy either as a parallel active backend.
6. Render auto-deploy is disabled. Never deploy backend changes without a reviewed change and explicit release approval.
7. Firebase Hosting serves the built frontend; it does not proxy the active API to Firebase Functions.
8. Google Maps usage is via external Maps URLs for coordinates; the current documentation says no Maps JavaScript API key or billing account is required. Google Fonts are loaded at runtime as an optional third-party dependency.

## Rebuild principles

- Feature-first information architecture: every screen must be placed according to user task frequency, role, risk and workflow—not added wherever space exists.
- Mobile-first application shell: persistent, thumb-reachable primary navigation; clear task flows; compact secondary actions; correct Android back handling; safe-area and keyboard support.
- Separate responsive compositions for phone, tablet and desktop. Share domain logic and design tokens, not a forced one-layout-fits-all DOM tree.
- Feature modules own their own view state and presentation. Shared shell owns only session, permissions, global navigation, global notifications and appearance preferences.
- Design system is token-based and component-based, not a second global stylesheet. No broad selector overrides, arbitrary positioning patches or unscoped feature CSS.
- Use semantic HTML and accessible controls; minimum 48dp touch targets on Android; visible keyboard focus; reduced-motion support.
- Festival themes are a presentation layer with constrained tokens and artwork slots; they must not override layout geometry, stacking order or interaction states.
- Keep business logic and API contracts separate from presentation. Preserve current backend routes and Firestore schema unless a separately reviewed migration proves necessary.
- Preserve role authorization, super-admin restrictions, consent-based shift-scoped GPS, attendance, salary, finance, invoices, notifications, language preferences, dark mode and OTA behavior.

## Planned work sequence

### Phase 0 — complete the audit
- Read every frontend workspace, API client, route inventory, server router, jobs, Firestore adapter, tests and deployment workflow.
- Inspect active Render service health, recent deploys, events, request logs and environment-variable names (never reveal secret values).
- Verify Firebase Hosting target and Firebase project configuration.
- Record the navigation map, feature ownership map, API-to-feature map and regression test matrix.

### Phase 1 — application architecture
- Define role-aware navigation and feature taxonomy.
- Extract app shell, route/navigation state, shared primitives, design tokens and feature modules.
- Define explicit responsive breakpoints and screen compositions.
- Add architecture tests and visual regression checkpoints before replacing legacy styles.

### Phase 2 — rebuild in vertical slices
- Start with sign-in, app shell, dashboard and one complete high-use workflow.
- Validate phone interaction and desktop layout before migrating the next workflow.
- Migrate each feature with its existing API contract and permission boundaries intact.
- Remove old CSS only after all consumers have migrated and visual/regression checks pass.

### Phase 3 — cross-system verification
- Run frontend type-check/build and backend type-check/tests.
- Run API contract and role-boundary tests.
- Verify Firestore reads/writes against the intended project without destructive data changes.
- Test Android startup, app resume, back navigation, permissions, GPS lifecycle, notifications and OTA rollback on a physical device.
- Test website layouts at phone, tablet and desktop widths.
- Review screenshots and console/network errors before release.

### Phase 4 — release
- Keep this work on the rebuild branch.
- Do not merge to `main`, deploy Firebase Hosting, trigger Render deployment, publish OTA or distribute APK until checks pass and the owner explicitly approves release.

## Non-negotiable data and safety constraints

- No Firestore collection clearing, bulk overwrite, schema migration or import during UI rebuild.
- No secrets, service-account JSON, passwords, recovery codes, job secrets or signing keys in Git.
- Do not weaken server authorization to make UI flows easier.
- Do not alter working GPS behavior without a dedicated acceptance plan and physical-device verification.
- Any backend change requires route contract tests and a separate reviewed release plan.
