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


// Admin-management access is a server-assigned capability, never a username-derived role.
// The legacy flag is read only to preserve the already-provisioned primary account.
export function hasAdminManagementAccess(user: { role?: unknown; canManageAdmins?: unknown; isSuperAdmin?: unknown }): boolean {
  return user.role === 'admin' && (user.canManageAdmins === true || user.isSuperAdmin === true);
}


export function isValidDateKey(value: unknown): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}



export type PayrollValidationInput = {
  staffUserId: unknown;
  period: unknown;
  amount: unknown;
  paidAt: unknown;
  method: unknown;
};

/** Shared, unit-tested validation for a salary payment before Firestore access. */
export function isValidPayrollInput(input: PayrollValidationInput): boolean {
  const staffUserId = typeof input.staffUserId === 'string' ? input.staffUserId.trim() : '';
  const period = typeof input.period === 'string' ? input.period.trim() : '';
  const paidAt = typeof input.paidAt === 'string' ? input.paidAt.trim() : '';
  const method = typeof input.method === 'string' ? input.method.trim() : '';
  const amount = typeof input.amount === 'number' ? input.amount : Number.NaN;
  const monthMatch = /^(\d{4})-(\d{2})$/.exec(period);
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(paidAt);
  if (!staffUserId || !method || method.length > 50 || !Number.isFinite(amount) || amount <= 0 || amount > 1000000 || !monthMatch || !dateMatch) return false;
  const month = Number(monthMatch[2]);
  if (month < 1 || month > 12) return false;
  return isValidDateKey(paidAt);
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


/** Records become eligible for an admin review six calendar months after saved/created time. */
export function isSixMonthReviewDue(createdAt: unknown, currentTime = Date.now()): boolean {
  if (typeof createdAt !== 'string' || !createdAt.trim()) return false;
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created) || !Number.isFinite(currentTime)) return false;
  const current = new Date(currentTime);
  const cutoffMonthStart = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - 6, 1));
  const lastDay = new Date(Date.UTC(cutoffMonthStart.getUTCFullYear(), cutoffMonthStart.getUTCMonth() + 1, 0)).getUTCDate();
  const cutoff = Date.UTC(
    cutoffMonthStart.getUTCFullYear(),
    cutoffMonthStart.getUTCMonth(),
    Math.min(current.getUTCDate(), lastDay),
    current.getUTCHours(),
    current.getUTCMinutes(),
    current.getUTCSeconds(),
    current.getUTCMilliseconds(),
  );
  return created <= cutoff;
}


/** Calculates a shift deadline in India time. If the configured end time has
 * already passed when a shift starts, the next day's end time is used. */
export function computeShiftDeadline(workDate: string, startedAt: string, endTime: string): string | null {
  if (!isValidDateKey(workDate) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)) return null;
  const started = Date.parse(startedAt);
  const firstDeadline = Date.parse(workDate + 'T' + endTime + ':00+05:30');
  if (!Number.isFinite(started) || !Number.isFinite(firstDeadline)) return null;
  return new Date(firstDeadline <= started ? firstDeadline + 86400000 : firstDeadline).toISOString();
}

export type AttendanceAbsenceDecision = 'create' | 'active-shift' | 'already-absent' | 'already-recorded';

/** Prevents the administrator absence action from replacing an existing attendance record. */
export function attendanceAbsenceDecision(
  existing: Record<string, unknown> | null,
  hasActiveShift: boolean,
): AttendanceAbsenceDecision {
  if (hasActiveShift) return 'active-shift';
  if (!existing) return 'create';
  if (existing.dayType === 'Absent' || String(existing.status || '').toLowerCase() === 'absent') {
    return 'already-absent';
  }
  return 'already-recorded';
}


/** Pending and approved holiday requests both exempt a staff shift from GPS-loss cancellation. */
export function isGpsGraceExemptHolidayStatus(status: unknown): boolean {
  const normalized = String(status || '').toLowerCase();
  return normalized === 'pending' || normalized === 'approved';
}

/** Rejects implausibly old or future client timestamps before treating GPS as live. */
export function isFreshLocationTimestamp(value: unknown, currentTime = Date.now(), maxAgeMs = 5 * 60 * 1000, maxFutureSkewMs = 60 * 1000): boolean {
  if (typeof value !== 'string' || !value.trim() || !Number.isFinite(currentTime)) return false;
  const capturedAt = Date.parse(value);
  if (!Number.isFinite(capturedAt)) return false;
  const age = currentTime - capturedAt;
  return age >= -maxFutureSkewMs && age <= maxAgeMs;
}
