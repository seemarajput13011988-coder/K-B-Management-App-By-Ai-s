import test from 'node:test';
import assert from 'node:assert/strict';
import { computeShiftDeadline, isFreshLocationTimestamp, isValidPayrollInput } from '../render-backend/route-path.js';

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
