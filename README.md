# K&B Customer Management

Private source repository for the K&B NET SERVICE customer and business management app.

## Migration status
- Original AppDeploy source snapshot: being preserved from version 1793770810412.
- Target architecture: React + Vite + Capacitor Android app, Firebase Authentication, Cloud Firestore, Cloud Functions, and Firebase Hosting.
- Existing AppDeploy app and data must remain untouched until the replacement is migrated, tested, and verified.

## Important
The preserved source still contains AppDeploy SDK imports and is not yet the Firebase migration. Do not deploy it as a standalone Firebase app until the backend and client API have been migrated.
