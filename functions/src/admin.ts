import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!getApps().length) {
  if (serviceAccountJson) {
    initializeApp({ credential: cert(JSON.parse(serviceAccountJson)), projectId: 'kandb-net-sevice' });
  } else {
    // Firebase Functions can use its built-in service identity; Netlify must provide the JSON env var.
    initializeApp();
  }
}

export const auth = getAuth();
export const db = getFirestore();
export { FieldValue };
export const now = () => new Date().toISOString();

export async function list(collection: string): Promise<Array<Record<string, any>>> {
  const snap = await db.collection(collection).limit(1000).get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
