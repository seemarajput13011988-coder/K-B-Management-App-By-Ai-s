type ApiResponse<T = any> = { data: T };

const API_BASE = (import.meta.env.VITE_MANAGEMENT_API_BASE_URL || 'https://kandb-management-nexus-api-zv7f.onrender.com').replace(/\\/$/, '');

async function request<T = any>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
  const response = await fetch(API_BASE + path, {
    method,
    headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(typeof data?.error === 'string' ? data.error : 'The K&B service is temporarily unavailable.') as Error & { response?: { status: number; data: unknown } };
    error.response = { status: response.status, data };
    throw error;
  }
  return { data };
}

export const api = {
  get: <T = any>(path: string) => request<T>('GET', path),
  post: <T = any>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T = any>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T = any>(path: string) => request<T>('DELETE', path),
};
