import { getApp, getApps, initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Firebase is used as the data platform only. Application sign-in is handled
// by the K&B username/password session API; Firebase Authentication is not used.
export const expectedFirebaseProjectId = 'kandb-net-sevice';
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
export const firebaseConfigured = Boolean(config.apiKey && config.projectId === expectedFirebaseProjectId && config.appId);
export const firebaseApp = firebaseConfigured ? (getApps().length ? getApp() : initializeApp(config)) : null;
export const firestore = firebaseApp ? getFirestore(firebaseApp) : null;
if (config.projectId && config.projectId !== expectedFirebaseProjectId) {
  console.error('Firebase project mismatch. Expected kandb-net-sevice; received ' + config.projectId);
}
