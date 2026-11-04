export function routePath(path: string): string {
  const normalized = path.replace(/\/+$/, '') || '/';
  // Direct Cloud Functions URLs remove the exported function name from req.path,
  // while Firebase Hosting rewrites preserve the incoming /api prefix.
  if (normalized === '/api' || normalized.startsWith('/api/')) return normalized;
  return normalized === '/' ? normalized : '/api' + normalized;
}


export function gpsGracePeriodExpired(issueStartedAt: unknown, currentTime = Date.now()): boolean {
  if (typeof issueStartedAt !== 'string' || !issueStartedAt) return false;
  const startedAt = Date.parse(issueStartedAt);
  return Number.isFinite(startedAt) && currentTime - startedAt >= 15 * 60 * 1000;
}


export function taskReminderKind(dueDate: string, today: string, tomorrow: string): 'upcoming' | 'due-today' | 'overdue' | null {
  if (dueDate === tomorrow) return 'upcoming';
  if (dueDate === today) return 'due-today';
  if (dueDate < today) return 'overdue';
  return null;
}


// Super Admin is a server-assigned privilege, never a username-derived role.
// In particular, changing an account's display/login ID to "Brajraj" must not
// grant administrator-management permissions.
export function isSuperAdminAccount(user: { role?: unknown; userId?: unknown; isSuperAdmin?: unknown }): boolean {
  return user.role === 'admin' && user.isSuperAdmin === true;
}


export function isValidDateKey(value: unknown): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}


export function isValidDateRange(startDate: unknown, endDate: unknown): boolean {
  return isValidDateKey(startDate) && isValidDateKey(endDate) && String(endDate) >= String(startDate);
}

export function hasOverlappingSubscription(
  existing: Array<{ startDate?: unknown; endDate?: unknown; status?: unknown }>,
  startDate: string,
  endDate: string,
): boolean {
  return existing.some(item =>
    !['Cancelled', 'Expired'].includes(String(item.status)) &&
    typeof item.startDate === 'string' &&
    typeof item.endDate === 'string' &&
    item.startDate <= endDate &&
    item.endDate >= startDate
  );
}
