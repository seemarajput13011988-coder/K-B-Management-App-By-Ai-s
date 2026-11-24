export type Session = {
  token: string;
  expiresAt: number;
  user: {
    id: string;
    userId: string;
    displayName: string;
    role: 'admin' | 'staff';
    active: boolean;
    canManageAdmins?: boolean;
  };
};

const KEY = 'kb-customer-session';

export function getSession(): Session | null {
  for (const storage of [sessionStorage, localStorage]) {
    try {
      const value = JSON.parse(storage.getItem(KEY) || 'null') as Session | null;
      if (value && typeof value.token === 'string' && value.user) return value;
    } catch {
      storage.removeItem(KEY);
    }
  }
  return null;
}

export function saveSession(session: Session): void {
  sessionStorage.setItem(KEY, JSON.stringify(session));
  localStorage.removeItem(KEY);
}

export function clearSession(): void {
  sessionStorage.removeItem(KEY);
  localStorage.removeItem(KEY);
}
