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
