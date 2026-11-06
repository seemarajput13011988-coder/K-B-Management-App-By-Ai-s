import { CapacitorHttp } from '@capacitor/core';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://kandb-management-nexus-api-zv7f.onrender.com';
type ApiResult<T = any> = { data: T };
type LocalSession = { token: string; expiresAt: number; user: { id: string; userId: string; displayName: string; role: 'admin'|'staff'; active: boolean; canManageAdmins?: boolean } };
function storedToken(): string {
  try { return (JSON.parse(sessionStorage.getItem('kb-customer-session') || 'null') as LocalSession | null)?.token || ''; }
  catch { return ''; }
}
async function request<T = any>(path: string, method: string, payload?: Record<string, unknown>): Promise<ApiResult<T>> {
  const url = new URL(path, API_BASE);
  url.searchParams.delete('sessionToken');
  const token = storedToken();
  const headers: Record<string, string> = {};
  let body: string | undefined;
  if (payload) {
    const safePayload = { ...payload };
    delete safePayload.sessionToken;
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(safePayload);
  }
  if (token) headers.Authorization = 'Bearer ' + token;
  const response = await fetch(url.toString(), { method, headers, body, cache: 'no-store' });
  const responseText = await response.text();
  let data: any = {};
  try { data = responseText ? JSON.parse(responseText) : {}; } catch { data = {}; }
  if (!response.ok) {
    if (typeof data.error === 'string' && data.error.trim()) throw new Error(data.error);
    throw new Error(`K&B server returned HTTP ${response.status}. Check that the K&B API service is available.`);
  }
  return { data };
}
export async function nativeApiPost<T = any>(path: string, payload: Record<string, unknown>): Promise<ApiResult<T>> {
  const token = storedToken();
  if (!token) throw new Error('Please sign in again to continue location sharing.');
  const url = new URL(path, API_BASE);
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
  const url = new URL('/api/staff-registration-requests', API_BASE);
  const response = await fetch(url.toString(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), cache: 'no-store' });
  let data: any = {};
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Could not submit your staff registration request.');
  return data as { id: string; trackingCode: string; status: 'pending'; message: string };
}

export async function getStaffRegistrationStatus(requestId: string, trackingCode: string) {
  const url = new URL('/api/staff-registration-requests/status', API_BASE);
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
export async function signInAppUser(userId: string, password: string, role: 'admin'|'staff') {
  const url = new URL('/api/auth/login', API_BASE);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 45000);
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: userId.trim(), password }),
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Sign-in took too long. Please check your internet connection and try again.');
    }
    throw new Error('Could not reach the K&B server. Check your internet connection and try again.');
  } finally {
    window.clearTimeout(timeout);
  }
  let data: any = {};
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Sign-in failed. Check your user ID and password.');
  if (!data.user || data.user.role !== role) {
    await fetch(new URL('/api/auth/logout', API_BASE).toString(), {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + data.token },
      body: JSON.stringify({ sessionToken: data.token }), cache: 'no-store',
    }).catch(() => undefined);
    throw new Error(role === 'admin' ? 'This account is not an admin account. Choose Staff Sign In instead.' : 'This account is not a staff account. Choose Admin Sign In instead.');
  }
  return data as LocalSession;
}
export async function changeAppUserId(currentPassword: string, newUserId: string) {
  const userId = newUserId.trim();
  if (!/^[a-zA-Z0-9_-]{3,32}$/.test(userId)) throw new Error('Use 3–32 letters, numbers, underscores or hyphens.');
  await api.post('/api/auth/change-user-id', { currentPassword, userId });
  sessionStorage.removeItem('kb-customer-session');
}
export async function changeAppPassword(currentPassword: string, newPassword: string) {
  if (newPassword.length < 10) throw new Error('Choose a password with at least 10 characters.');
  await api.post('/api/auth/change-password', { currentPassword, newPassword });
  sessionStorage.removeItem('kb-customer-session');
}
export async function signOutAppUser() {
  const token = storedToken();
  if (!token) return;
  const url = new URL('/api/auth/logout', API_BASE);
  await fetch(url.toString(), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ sessionToken: token }), cache: 'no-store' }).catch(() => undefined);
}
export const ws = {
  connect() {
    return { connectionId: undefined as string | undefined, ready: Promise.resolve(), onMessage(_callback: (message: any) => void) {}, disconnect() {} };
  },
};
