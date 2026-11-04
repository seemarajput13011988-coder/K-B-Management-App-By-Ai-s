import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { firebaseAuth } from './firebase';

const API_BASE = import.meta.env.VITE_FIREBASE_FUNCTIONS_URL || 'https://asia-south1-kandb-net-service.cloudfunctions.net/api';
const ACCOUNT_DOMAIN = 'accounts.kandbnetservice.in';
type ApiResult<T = any> = { data: T };

async function request<T = any>(path: string, method: string, payload?: Record<string, unknown>): Promise<ApiResult<T>> {
  if (!firebaseAuth) throw new Error('Firebase is not configured yet. Add the K&B Firebase web app settings before signing in.');
  if (!firebaseAuth.currentUser) await new Promise<void>(resolve => {
    let unsubscribe = () => {};
    unsubscribe = onAuthStateChanged(firebaseAuth, () => { unsubscribe(); resolve(); });
  });
  const currentUser = firebaseAuth.currentUser;
  if (!currentUser) throw new Error('Please sign in again to continue.');
  const token = await currentUser.getIdToken();
  const url = new URL(path, API_BASE);
  url.searchParams.delete('sessionToken');
  const headers: Record<string, string> = { Authorization: 'Bearer ' + token };
  let body: string | undefined;
  if (payload) {
    const safePayload = { ...payload };
    delete safePayload.sessionToken;
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(safePayload);
  }
  const response = await fetch(url.toString(), { method, headers, body, cache: 'no-store' });
  let data: any = {};
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'The request could not be completed. Please try again.');
  return { data };
}
export const api = {
  get: <T = any>(path: string) => request<T>(path, 'GET'),
  post: <T = any>(path: string, payload?: Record<string, unknown>) => request<T>(path, 'POST', payload),
  put: <T = any>(path: string, payload?: Record<string, unknown>) => request<T>(path, 'PUT', payload),
  delete: <T = any>(path: string) => request<T>(path, 'DELETE'),
};
export async function bootstrapAdmin(bootstrapSecret: string, password: string) {
  const url = new URL('/api/auth/bootstrap-admin', API_BASE);
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bootstrapSecret, password }),
    cache: 'no-store',
  });
  let data: any = {};
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Initial admin setup failed.');
  return data;
}
export async function recoverAdminPassword(recoveryCode: string, newPassword: string) {
  const url = new URL('/api/auth/recover-admin', API_BASE);
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 'Brajraj', recoveryCode, newPassword }),
    cache: 'no-store',
  });
  let data: any = {};
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Admin password recovery failed.');
  return data;
}
export async function signInAppUser(userId: string, password: string) {
  if (!firebaseAuth) throw new Error('Firebase is not configured yet. Add the K&B Firebase web app settings first.');
  const id = userId.trim().toLowerCase();
  if (!id) throw new Error('Enter your user ID.');
  await signInWithEmailAndPassword(firebaseAuth, id + '@' + ACCOUNT_DOMAIN, password);
  try {
    const token = await firebaseAuth.currentUser!.getIdToken();
    const profile = await api.get<{ user: { id: string; userId: string; displayName: string; role: 'admin' | 'staff'; active: boolean } }>('/api/auth/me');
    return { token, expiresAt: Date.now() + 3600000, user: profile.data.user };
  } catch (error) {
    await signOut(firebaseAuth);
    throw error;
  }
}
export async function signOutAppUser() { if (firebaseAuth) await signOut(firebaseAuth); }
export const ws = {
  connect() {
    return { connectionId: undefined as string | undefined, ready: Promise.resolve(), onMessage(_callback: (message: any) => void) {}, disconnect() {} };
  },
};
