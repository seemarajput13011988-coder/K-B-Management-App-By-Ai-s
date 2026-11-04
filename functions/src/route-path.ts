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


export function subscriptionExpiryKind(
  endDate: string,
  today: string,
  threeDaysAhead: string,
): 'due-soon' | 'due-today' | 'overdue' | null {
  if (endDate < today) return 'overdue';
  if (endDate === today) return 'due-today';
  if (endDate === threeDaysAhead) return 'due-soon';
  return null;
}


export function calculateInventoryBalance(currentQuantity: unknown, movementType: unknown, movementQuantity: unknown): number | null {
  const current = Number(currentQuantity);
  const amount = Number(movementQuantity);
  if (!Number.isInteger(current) || current < 0 || !Number.isInteger(amount) || amount <= 0) return null;
  if (movementType === 'IN') return current + amount;
  if (movementType === 'OUT' && amount <= current) return current - amount;
  return null;
}


export function isConfirmedGpsLossReason(reason: unknown): boolean {
  return typeof reason === 'string' && [
    'Location permission denied',
    'GPS location unavailable',
    'Location permission was turned off',
    'Phone location services are unavailable',
  ].includes(reason);
}


export type CustomerLedgerEntry = {
  id: string;
  date: string;
  type: 'Invoice' | 'Payment';
  description: string;
  debit: number;
  credit: number;
  reference: string;
};

export function buildCustomerLedger(
  invoices: Array<Record<string, any>>,
  payments: Array<Record<string, any>>,
  customerId: string,
): { items: Array<CustomerLedgerEntry & { balance: number }>; totalBilled: number; totalPaid: number; outstandingBalance: number } {
  const entries: CustomerLedgerEntry[] = [];
  for (const invoice of invoices) {
    if (invoice.customerId !== customerId || invoice.voidedAt) continue;
    const amount = Number(invoice.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    entries.push({
      id: 'invoice-' + String(invoice.id || ''),
      // Record the actual posting date, not the future due date.
      date: String(invoice.createdAt || invoice.dueDate || '').slice(0, 10),
      type: 'Invoice',
      description: 'Monthly service invoice · ' + String(invoice.period || ''),
      debit: amount,
      credit: 0,
      reference: String(invoice.id || ''),
    });
  }
  for (const payment of payments) {
    if (payment.customerId !== customerId) continue;
    const amount = Number(payment.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    entries.push({
      id: 'payment-' + String(payment.id || ''),
      date: String(payment.paidAt || payment.createdAt || '').slice(0, 10),
      type: 'Payment',
      description: 'Payment received · ' + String(payment.method || 'Other') + (payment.month ? ' · ' + String(payment.month) : ''),
      debit: 0,
      credit: amount,
      reference: String(payment.id || ''),
    });
  }
  entries.sort((a, b) => a.date.localeCompare(b.date) || (a.type === b.type ? 0 : a.type === 'Invoice' ? -1 : 1) || a.id.localeCompare(b.id));
  let balance = 0;
  const items = entries.map(entry => {
    balance = Math.round((balance + entry.debit - entry.credit) * 100) / 100;
    return { ...entry, balance };
  });
  const totalBilled = Math.round(items.reduce((sum, item) => sum + item.debit, 0) * 100) / 100;
  const totalPaid = Math.round(items.reduce((sum, item) => sum + item.credit, 0) * 100) / 100;
  return { items, totalBilled, totalPaid, outstandingBalance: Math.round((totalBilled - totalPaid) * 100) / 100 };
}
