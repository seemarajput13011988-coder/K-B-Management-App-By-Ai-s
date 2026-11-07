import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidDateKey, isValidPayrollInput } from '../render-backend/route-path.js';

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

test('accepts valid attendance work-date keys', () => {
  for (const date of ['2026-11-07', '2024-02-29', '2000-01-01']) {
    assert.equal(isValidDateKey(date), true);
  }
});

test('rejects malformed and impossible attendance work-date keys', () => {
  for (const date of ['\\\\2026-11-07', '2026-2-07', '2026-02-29', '2026-13-01', '', null, 20261107]) {
    assert.equal(isValidDateKey(date), false);
  }
});
