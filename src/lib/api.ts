import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { firebaseAuth } from './firebase';

const API_BASE = import.meta.env.VITE_FIREBASE_FUNCTIONS_URL
  || 'https://asia-south1-kandb-net-service.cloudfunctions.net/api';
const ACCOUNT_DOMAIN = 'accounts.kandbnetservice.in';

type ApiResult<T = any> = { data: T };
type RequestOptions = { method: string; body?: Record<string, unknown> };

async function request<T = any>(path: string, options: RequestOptions = { method: 'GET' }): Promise<ApiResult<T>> {
  if (!firebaseAuth) {
    throw new Error('Firebase is not configured yet. Add the K&B Firebase web app settings before signing in.');
  }
  const currentUser = firebaseAuth.currentUser;
  if (!currentUser) throw new Error('Please sign in again to continue.');
  const token = await currentUser.getIdToken();
  const url = new URL(path, API_BASE);
  url.searchParams.delete('sessionToken');
  const headers: Record<string, string> = { Authorization: 'Bearer ' + token };
  let body: string | undefined;
  if (options.body) {
    const { sessionToken: _ignored, ...safeBody } = options.body;
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(safeBody);
  }
  const response = await fetch(url.toString(), { method: options.method, headers, body, cache: 'no-store' });
  let data: any = {};
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'The request could not be completed. Please try again.');
  return { data };
}

export const api = {
  get: <T = any>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T = any>(path: string, body?: Record<string, unknown>) => request<T>(path, { method: 'POST', body }),
  put: <T = any>(path: string, body?: Record<string, unknown>) => request<T>(path, { method: 'PUT', body }),
  delete: <T = any>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export async function signInAppUser(userId: string, password: string) {
  if (!firebaseAuth) throw new Error('Firebase is not configured yet. Add the K&B Firebase web app settings first.');
  const normalizedId = userId.trim().toLowerCase();
  if (!normalizedId) throw new Error('Enter your user ID.');
  const credential = await signInWithEmailAndPassword(firebaseAuth, normalizedId + '@' + ACCOUNT_DOMAIN, password);
  const token = await credential.user.getIdToken();
  const profile = await api.get<{ user: { id: string; userId: string; displayName: string; role: 'admin' | 'staff'; active: boolean } }>('/api/auth/me');
  return { token, expiresAt: Date.now() + 60 * 60 * 1000, user: profile.data.user };
}

export async function signOutAppUser() {
  if (firebaseAuth) await signOut(firebaseAuth);
}

// Firebase Functions currently provides the group-message API. This compatibility
// connection intentionally degrades to manual refresh until realtime is migrated.
export const ws = {
  connect() {
    return {
      connectionId: undefined as string | undefined,
      ready: Promise.resolve(),
      onMessage(_callback: (message: any) => void) { /* realtime transport not enabled yet */ },
      disconnect() { /* no persistent connection was opened */ },
    };
  },
};
