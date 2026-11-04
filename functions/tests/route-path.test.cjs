const test = require('node:test');
const assert = require('node:assert/strict');
const { routePath } = require('../lib/route-path.js');

test('normalizes direct Cloud Functions paths', () => {
  assert.equal(routePath('/auth/me'), '/api/auth/me');
  assert.equal(routePath('/_healthcheck'), '/api/_healthcheck');
});

test('preserves Firebase Hosting rewrite paths without double-prefixing', () => {
  assert.equal(routePath('/api/auth/me'), '/api/auth/me');
  assert.equal(routePath('/api/auth/me/'), '/api/auth/me');
});

test('leaves the function root unchanged', () => {
  assert.equal(routePath('/'), '/');
});


test('GPS grace period remains open until the full 15 minutes have elapsed', () => {
  const startedAt = '2026-11-04T10:00:00.000Z';
  const { gpsGracePeriodExpired } = require('../lib/route-path.js');
  const start = Date.parse(startedAt);
  assert.equal(gpsGracePeriodExpired(startedAt, start + 14 * 60 * 1000 + 59999), false);
  assert.equal(gpsGracePeriodExpired(startedAt, start + 15 * 60 * 1000), true);
  assert.equal(gpsGracePeriodExpired(startedAt, start + 16 * 60 * 1000), true);
});

test('GPS grace-period check safely rejects missing or invalid timestamps', () => {
  const { gpsGracePeriodExpired } = require('../lib/route-path.js');
  assert.equal(gpsGracePeriodExpired(undefined, Date.now()), false);
  assert.equal(gpsGracePeriodExpired('', Date.now()), false);
  assert.equal(gpsGracePeriodExpired('not-a-date', Date.now()), false);
});


test('task reminders distinguish tomorrow, due today, overdue and future tasks', () => {
  const { taskReminderKind } = require('../lib/route-path.js');
  assert.equal(taskReminderKind('2026-11-05', '2026-11-04', '2026-11-05'), 'upcoming');
  assert.equal(taskReminderKind('2026-11-04', '2026-11-04', '2026-11-05'), 'due-today');
  assert.equal(taskReminderKind('2026-11-03', '2026-11-04', '2026-11-05'), 'overdue');
  assert.equal(taskReminderKind('2026-11-06', '2026-11-04', '2026-11-05'), null);
});


test('only an explicitly server-designated admin is Super Admin', () => {
  const { isSuperAdminAccount } = require('../lib/route-path.js');
  assert.equal(isSuperAdminAccount({ role: 'admin', userId: 'Brajraj' }), false, 'username alone must never grant Super Admin');
  assert.equal(isSuperAdminAccount({ role: 'admin', userId: 'other-admin', isSuperAdmin: true }), true, 'allows the server-designated Super Admin');
  assert.equal(isSuperAdminAccount({ role: 'admin', userId: 'Brajraj', isSuperAdmin: false }), false, 'a regular admin cannot claim the owner username');
  assert.equal(isSuperAdminAccount({ role: 'admin', userId: 'other-admin' }), false, 'regular admins cannot manage admin accounts');
  assert.equal(isSuperAdminAccount({ role: 'staff', userId: 'Brajraj', isSuperAdmin: true }), false, 'staff cannot become Super Admin by setting a flag');
  assert.equal(isSuperAdminAccount({ role: 'staff', userId: 'employee' }), false);
});


test('task reminder scheduler accepts valid ISO date keys and rejects malformed dates', () => {
  const { isValidDateKey } = require('../lib/route-path.js');
  assert.equal(isValidDateKey('2026-11-04'), true);
  assert.equal(isValidDateKey('2026-02-29'), false);
  assert.equal(isValidDateKey('2026-2-04'), false);
  assert.equal(isValidDateKey('not-a-date'), false);
  assert.equal(isValidDateKey(undefined), false);
});


test('subscription date ranges accept valid inclusive dates and reject reversed or malformed dates', () => {
  const { isValidDateRange } = require('../lib/route-path.js');
  assert.equal(isValidDateRange('2026-11-01', '2026-11-30'), true);
  assert.equal(isValidDateRange('2026-11-04', '2026-11-04'), true);
  assert.equal(isValidDateRange('2026-11-30', '2026-11-01'), false);
  assert.equal(isValidDateRange('2026-02-30', '2026-03-01'), false);
  assert.equal(isValidDateRange('not-a-date', '2026-11-01'), false);
});

test('subscription overlap ignores cancelled and expired history', () => {
  const { hasOverlappingSubscription } = require('../lib/route-path.js');
  const existing = [
    { startDate: '2026-10-01', endDate: '2026-10-31', status: 'Active' },
    { startDate: '2026-11-01', endDate: '2026-11-30', status: 'Cancelled' },
    { startDate: '2026-11-01', endDate: '2026-11-30', status: 'Expired' },
  ];
  assert.equal(hasOverlappingSubscription(existing, '2026-10-31', '2026-11-15'), true);
  assert.equal(hasOverlappingSubscription(existing, '2026-11-01', '2026-11-30'), false);
  assert.equal(hasOverlappingSubscription(existing, '2026-12-01', '2026-12-31'), false);
});


test('subscription expiry reminders identify three-day, due-today and overdue dates', () => {
  const { subscriptionExpiryKind } = require('../lib/route-path.js');
  assert.equal(subscriptionExpiryKind('2026-11-07', '2026-11-04', '2026-11-07'), 'due-soon');
  assert.equal(subscriptionExpiryKind('2026-11-04', '2026-11-04', '2026-11-07'), 'due-today');
  assert.equal(subscriptionExpiryKind('2026-11-03', '2026-11-04', '2026-11-07'), 'overdue');
  assert.equal(subscriptionExpiryKind('2026-11-08', '2026-11-04', '2026-11-07'), null);
});


test('inventory stock movements never allow invalid or negative stock', () => {
  const { calculateInventoryBalance } = require('../lib/route-path.js');
  assert.equal(calculateInventoryBalance(10, 'IN', 5), 15);
  assert.equal(calculateInventoryBalance(10, 'OUT', 5), 5);
  assert.equal(calculateInventoryBalance(10, 'OUT', 10), 0);
  assert.equal(calculateInventoryBalance(10, 'OUT', 11), null);
  assert.equal(calculateInventoryBalance(-1, 'IN', 2), null);
  assert.equal(calculateInventoryBalance(10, 'OUT', 0), null);
  assert.equal(calculateInventoryBalance(10, 'ADJUST', 2), null);
});


test('GPS grace period starts only for confirmed location permission or service loss', () => {
  const { isConfirmedGpsLossReason } = require('../lib/route-path.js');
  assert.equal(isConfirmedGpsLossReason('Location permission denied'), true);
  assert.equal(isConfirmedGpsLossReason('GPS location unavailable'), true);
  assert.equal(isConfirmedGpsLossReason('Location permission was turned off'), true);
  assert.equal(isConfirmedGpsLossReason('Phone location services are unavailable'), true);
  assert.equal(isConfirmedGpsLossReason('GPS location request timed out'), false);
  assert.equal(isConfirmedGpsLossReason('Network connection lost'), false);
  assert.equal(isConfirmedGpsLossReason(''), false);
  assert.equal(isConfirmedGpsLossReason(null), false);
});


test('customer ledger posts invoices on creation date and computes chronological balances', () => {
  const { buildCustomerLedger } = require('../lib/route-path.js');
  const result = buildCustomerLedger(
    [
      { id: 'inv-1', customerId: 'c1', amount: 549, createdAt: '2026-11-02T08:00:00.000Z', dueDate: '2026-11-10', period: '2026-11' },
      { id: 'inv-void', customerId: 'c1', amount: 100, createdAt: '2026-11-01', voidedAt: '2026-11-03' },
      { id: 'inv-other', customerId: 'c2', amount: 999, createdAt: '2026-11-01' },
    ],
    [
      { id: 'pay-1', customerId: 'c1', amount: 200, paidAt: '2026-11-03', method: 'UPI' },
      { id: 'pay-other', customerId: 'c2', amount: 999, paidAt: '2026-11-03' },
    ],
    'c1',
  );
  assert.deepEqual(result.items.map(item => [item.type, item.date, item.balance]), [
    ['Invoice', '2026-11-02', 549],
    ['Payment', '2026-11-03', 349],
  ]);
  assert.equal(result.totalBilled, 549);
  assert.equal(result.totalPaid, 200);
  assert.equal(result.outstandingBalance, 349);
});
