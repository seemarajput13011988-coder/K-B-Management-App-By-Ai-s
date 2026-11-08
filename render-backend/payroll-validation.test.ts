import test from 'node:test';
import assert from 'node:assert/strict';
import { attendanceAbsenceDecision, calculateInventoryBalance, computeShiftDeadline, gpsGracePeriodExpired, hasAdminManagementAccess, hasOverlappingSubscription, isConfirmedGpsLossReason, isFreshLocationTimestamp, isValidDateRange, isValidPayrollInput, subscriptionExpiryKind, taskReminderKind } from '../render-backend/route-path.js';

const valid = {
  staffUserId: 'staff-record-123',
  period: '2026-11',
  amount: 12500.5,
  paidAt: '2026-11-06',
  method: 'Bank transfer',
};

test('accepts a complete valid salary payment', () => {
  assert.equal(isValidPayrollInput(valid), true);
});

test('accepts valid whole-number salary amounts', () => {
  assert.equal(isValidPayrollInput({ ...valid, amount: 1000000 }), true);
});

test('rejects missing staff, month, date, amount or payment method', () => {
  for (const patch of [
    { staffUserId: '' },
    { period: '' },
    { paidAt: '' },
    { amount: 0 },
    { method: '' },
  ]) assert.equal(isValidPayrollInput({ ...valid, ...patch }), false);
});

test('rejects malformed or impossible months and dates', () => {
  for (const patch of [
    { period: '2026-00' },
    { period: '2026-13' },
    { period: '26-11' },
    { paidAt: '2026-02-30' },
    { paidAt: '06-11-2026' },
  ]) assert.equal(isValidPayrollInput({ ...valid, ...patch }), false);
});

test('rejects non-finite, negative and over-limit amounts', () => {
  for (const amount of [Number.NaN, Number.POSITIVE_INFINITY, -1, 0, 1000000.01]) {
    assert.equal(isValidPayrollInput({ ...valid, amount }), false);
  }
});

test('rejects a missing or excessively long payment method', () => {
  assert.equal(isValidPayrollInput({ ...valid, method: 'x'.repeat(51) }), false);
});

test('custom shift deadline follows the configured India-time end time', () => {
  assert.equal(
    computeShiftDeadline('2026-11-07', '2026-11-07T03:30:00.000Z', '20:30'),
    '2026-11-07T15:00:00.000Z',
  );
});

test('admin-started after-hours shift ends at the next configured end time', () => {
  assert.equal(
    computeShiftDeadline('2026-11-07', '2026-11-07T17:00:00.000Z', '20:30'),
    '2026-11-08T15:00:00.000Z',
  );
});

test('rejects invalid shift dates, times and start timestamps', () => {
  assert.equal(computeShiftDeadline('2026-02-30', '2026-11-07T03:30:00.000Z', '20:30'), null);
  assert.equal(computeShiftDeadline('2026-11-07', '2026-11-07T03:30:00.000Z', '25:00'), null);
  assert.equal(computeShiftDeadline('2026-11-07', 'not-a-date', '20:30'), null);
});

test('GPS timestamp validation rejects stale, invalid and future readings', () => {
  const now = Date.parse('2026-11-07T12:00:00.000Z');
  assert.equal(isFreshLocationTimestamp('2026-11-07T11:59:00.000Z', now), true);
  assert.equal(isFreshLocationTimestamp('2026-11-07T11:50:00.000Z', now), false);
  assert.equal(isFreshLocationTimestamp('2026-11-07T12:05:00.000Z', now), false);
  assert.equal(isFreshLocationTimestamp('2026-11-07T12:00:30.000Z', now), true);
  assert.equal(isFreshLocationTimestamp('2026-11-07T12:02:00.000Z', now), false);
  assert.equal(isFreshLocationTimestamp('invalid', now), false);
});

test('normalizes API paths without duplicating the API prefix', async () => {
  const { routePath } = await import('../render-backend/route-path.js');
  assert.equal(routePath('/api/attendance/'), '/api/attendance');
  assert.equal(routePath('/attendance'), '/api/attendance');
  assert.equal(routePath('/'), '/');
});

test('enforces the GPS restoration grace period at exactly 15 minutes', () => {
  const now = Date.parse('2026-11-07T12:15:00.000Z');
  assert.equal(gpsGracePeriodExpired('2026-11-07T12:00:00.000Z', now), true);
  assert.equal(gpsGracePeriodExpired('2026-11-07T12:00:01.000Z', now), false);
  assert.equal(gpsGracePeriodExpired('invalid', now), false);
});

test('admin-management access requires an admin role and server capability', () => {
  assert.equal(hasAdminManagementAccess({ role: 'admin', canManageAdmins: true }), true);
  assert.equal(hasAdminManagementAccess({ role: 'admin', isSuperAdmin: true }), true);
  assert.equal(hasAdminManagementAccess({ role: 'staff', canManageAdmins: true }), false);
  assert.equal(hasAdminManagementAccess({ role: 'admin' }), false);
});

test('validates inclusive date ranges and rejects reversed ranges', () => {
  assert.equal(isValidDateRange('2026-11-07', '2026-11-07'), true);
  assert.equal(isValidDateRange('2026-11-07', '2026-11-08'), true);
  assert.equal(isValidDateRange('2026-11-08', '2026-11-07'), false);
  assert.equal(isValidDateRange('2026-02-30', '2026-03-01'), false);
});


test('administrator absence marking preserves existing attendance records', () => {
  assert.equal(attendanceAbsenceDecision(null, false), 'create');
  assert.equal(attendanceAbsenceDecision({ status: 'Checked in' }, true), 'active-shift');
  assert.equal(attendanceAbsenceDecision({ status: 'Absent', dayType: 'Absent' }, false), 'already-absent');
  assert.equal(attendanceAbsenceDecision({ status: 'Completed', checkOutAt: '2026-11-08T13:00:00.000Z' }, false), 'already-recorded');
});

test('subscription overlap ignores cancelled and expired records', () => {
  assert.equal(hasOverlappingSubscription([{ startDate: '2026-11-01', endDate: '2026-11-30', status: 'Active' }], '2026-11-15', '2026-12-15'), true);
  assert.equal(hasOverlappingSubscription([{ startDate: '2026-11-01', endDate: '2026-11-30', status: 'Cancelled' }], '2026-11-15', '2026-12-15'), false);
  assert.equal(hasOverlappingSubscription([{ startDate: '2026-11-01', endDate: '2026-11-30', status: 'Expired' }], '2026-11-15', '2026-12-15'), false);
});

test('inventory movements cannot make stock negative or accept invalid quantities', () => {
  assert.equal(calculateInventoryBalance(10, 'IN', 5), 15);
  assert.equal(calculateInventoryBalance(10, 'OUT', 5), 5);
  assert.equal(calculateInventoryBalance(10, 'OUT', 11), null);
  assert.equal(calculateInventoryBalance(10, 'OUT', 0), null);
  assert.equal(calculateInventoryBalance(10, 'UNKNOWN', 1), null);
});

test('only recognized GPS-loss reasons are accepted', () => {
  assert.equal(isConfirmedGpsLossReason('GPS location unavailable'), true);
  assert.equal(isConfirmedGpsLossReason('Battery low'), false);
});

test('task and subscription reminders classify date boundaries correctly', () => {
  assert.equal(taskReminderKind('2026-11-08', '2026-11-07', '2026-11-08'), 'upcoming');
  assert.equal(taskReminderKind('2026-11-07', '2026-11-07', '2026-11-08'), 'due-today');
  assert.equal(taskReminderKind('2026-11-06', '2026-11-07', '2026-11-08'), 'overdue');
  assert.equal(subscriptionExpiryKind('2026-11-10', '2026-11-07', '2026-11-10'), 'due-soon');
  assert.equal(subscriptionExpiryKind('2026-11-07', '2026-11-07', '2026-11-10'), 'due-today');
  assert.equal(subscriptionExpiryKind('2026-11-06', '2026-11-07', '2026-11-10'), 'overdue');
});
