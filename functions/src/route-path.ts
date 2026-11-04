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


export function isSuperAdminAccount(user: { role?: unknown; userId?: unknown; isSuperAdmin?: unknown }): boolean {
  if (user.role !== 'admin') return false;
  return user.isSuperAdmin === true || (typeof user.userId === 'string' && user.userId.trim().toLowerCase() === 'brajraj');
}
