import { CapacitorHttp } from '@capacitor/core';
import { browserLocalPersistence, EmailAuthProvider, onAuthStateChanged, reauthenticateWithCredential, setPersistence, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { firebaseAuth } from './firebase';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
function apiUrl(path: string) {
  if (!API_BASE) throw new Error('The K&B API address is not configured yet. The project owner must finish the Netlify setup.');
  return new URL(path, API_BASE);
}
const ACCOUNT_DOMAIN = 'accounts.kandbnetservice.in';
type ApiResult<T = any> = { data: T };

async function request<T = any>(path: string, method: string, payload?: Record<string, unknown>): Promise<ApiResult<T>> {
  if (!firebaseAuth) throw new Error('Firebase is not configured yet. Add the K&B Firebase web app settings before signing in.');
  const auth = firebaseAuth;
  if (!auth.currentUser) await new Promise<void>(resolve => {
    let unsubscribe = () => {};
    unsubscribe = onAuthStateChanged(auth, () => { unsubscribe(); resolve(); });
  });
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Please sign in again to continue.');
  const token = await currentUser.getIdToken();
  const url = apiUrl(path);
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
export async function nativeApiPost<T = any>(path: string, payload: Record<string, unknown>): Promise<ApiResult<T>> {
  if (!firebaseAuth?.currentUser) throw new Error('Please sign in again to continue location sharing.');
  const token = await firebaseAuth.currentUser.getIdToken();
  const url = apiUrl(path);
  url.searchParams.delete('sessionToken');
  const response = await CapacitorHttp.post({
    url: url.toString(),
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    data: payload,
    connectTimeout: 15000,
    readTimeout: 15000
  });
  const data: any = response.data || {};
  if (response.status < 200 || response.status >= 300) {
    const error = new Error(typeof data.error === 'string' ? data.error : 'The location update could not be sent.') as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return { data: data as T };
}
export async function submitStaffRegistrationRequest(input: { userId: string; displayName: string; phone?: string; reason?: string }) {
  const url = apiUrl('/api/staff-registration-requests');
  const response = await fetch(url.toString(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), cache: 'no-store' });
  let data: any = {};
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Could not submit your staff registration request.');
  return data as { id: string; trackingCode: string; status: 'pending'; message: string };
}

export async function getStaffRegistrationStatus(requestId: string, trackingCode: string) {
  const url = apiUrl('/api/staff-registration-requests/status');
  url.searchParams.set('requestId', requestId);
  url.searchParams.set('trackingCode', trackingCode);
  const response = await fetch(url.toString(), { method: 'GET', cache: 'no-store' });
  let data: any = {};
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Could not check registration status.');
  return data as { status: 'pending'|'approved'|'rejected'; createdAt: string; reviewedAt?: string | null; reviewedByName?: string | null };
}
export const api = {
  get: <T = any>(path: string) => request<T>(path, 'GET'),
  post: <T = any>(path: string, payload?: Record<string, unknown>) => request<T>(path, 'POST', payload),
  put: <T = any>(path: string, payload?: Record<string, unknown>) => request<T>(path, 'PUT', payload),
  delete: <T = any>(path: string) => request<T>(path, 'DELETE'),
};
export async function bootstrapAdmin(bootstrapSecret: string, password: string) {
  const url = apiUrl('/api/auth/bootstrap-admin');
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
  const url = apiUrl('/api/auth/recover-admin');
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
function firebaseSignInError(error: unknown): Error {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : '';
  const messages: Record<string, string> = {
    'auth/invalid-credential': 'Firebase rejected this user ID or password. Check the password, and confirm that the matching account has been created in Firebase Authentication. Old-system passwords are not automatically imported.',
    'auth/user-not-found': 'This account does not exist in Firebase Authentication yet. The project owner must provision the existing Brajraj account, or an admin must create this staff account.',
    'auth/wrong-password': 'The password is incorrect for this Firebase account.',
    'auth/configuration-not-found': 'Firebase Authentication has not been initialized for project kandb-net-sevice, or it has no Email/Password provider configuration. The project owner must open Firebase Console → Authentication, choose Get started if shown, then enable Email/Password under Sign-in method.',
    'auth/operation-not-allowed': 'Email/Password sign-in is disabled in Firebase Console. The project owner must enable Authentication → Sign-in method → Email/Password.',
    'auth/invalid-api-key': 'The APK has an invalid Firebase API key. Rebuild it with the Web App configuration from project kandb-net-sevice.',
    'auth/app-not-authorized': 'This Firebase app is not authorized for the configured API key. Check the Firebase project Web App configuration and API key restrictions.',
    'auth/unauthorized-domain': 'Firebase rejected this app domain. Check Authentication → Settings → Authorized domains for the configured Firebase project.',
    'auth/network-request-failed': 'Firebase could not be reached. Check the phone internet connection, date and time, then try again.',
    'auth/too-many-requests': 'Firebase temporarily blocked sign-in attempts. Wait a while before trying again.',
    'auth/invalid-email': 'The generated Firebase account email is invalid. Check the user ID and account configuration.',
  };
  const message = messages[code] || (error instanceof Error ? error.message : 'Firebase sign-in failed. Check the Firebase project configuration and account setup.');
  const result = new Error(message) as Error & { code?: string };
  if (code) result.code = code;
  return result;
}

export async function signInAppUser(userId: string, password: string) {
  if (!firebaseAuth) throw new Error('Firebase is not configured in this APK. Rebuild it with the Web App settings for project kandb-net-sevice.');
  const id = userId.trim().toLowerCase();
  if (!id) throw new Error('Enter your user ID.');
  try {
    // Keep the Firebase session available after Android closes and reopens the app.
    await setPersistence(firebaseAuth, browserLocalPersistence);
    await signInWithEmailAndPassword(firebaseAuth, id + '@' + ACCOUNT_DOMAIN, password);
  } catch (error) {
    throw firebaseSignInError(error);
  }
  try {
    const currentUser = firebaseAuth.currentUser;
    if (!currentUser) throw new Error('Firebase sign-in completed but no authenticated user session was returned. Please sign in again.');
    const token = await currentUser.getIdToken();
    const profile = await api.get<{ user: { id: string; userId: string; displayName: string; role: 'admin' | 'staff'; active: boolean; isSuperAdmin?: boolean } }>('/api/auth/me');
    return { token, expiresAt: Date.now() + 3600000, user: profile.data.user };
  } catch (error) {
    await signOut(firebaseAuth);
    const detail = error instanceof Error ? error.message : 'Unknown server response.';
    throw new Error('Firebase accepted the sign-in, but the K&B account profile could not be loaded: ' + detail);
  }
}
export async function changeAppUserId(currentPassword: string, newUserId: string) {
  if (!firebaseAuth?.currentUser?.email) throw new Error('Please sign in again to change your user ID.');
  const userId = newUserId.trim();
  if (!/^[a-zA-Z0-9_-]{3,32}$/.test(userId)) throw new Error('Use 3–32 letters, numbers, underscores or hyphens.');
  const user = firebaseAuth.currentUser;
  const email = user.email;
  if (!email) throw new Error('This account does not have a sign-in email. Contact an administrator.');
  const credential = EmailAuthProvider.credential(email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await api.post('/api/auth/change-user-id', { userId });
  await signOut(firebaseAuth);
}
export async function changeAppPassword(currentPassword: string, newPassword: string) {
  if (!firebaseAuth?.currentUser?.email) throw new Error('Please sign in again to change your password.');
  if (newPassword.length < 10) throw new Error('Choose a password with at least 10 characters.');
  const user = firebaseAuth.currentUser;
  const email = user.email;
  if (!email) throw new Error('This account does not have a sign-in email. Contact an administrator.');
  const credential = EmailAuthProvider.credential(email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await user.getIdToken(true);
  await api.post('/api/auth/change-password', { newPassword });
  await signOut(firebaseAuth);
}
export async function signOutAppUser() { if (firebaseAuth) await signOut(firebaseAuth); }
export const ws = {
  connect() {
    return { connectionId: undefined as string | undefined, ready: Promise.resolve(), onMessage(_callback: (message: any) => void) {}, disconnect() {} };
  },
};
