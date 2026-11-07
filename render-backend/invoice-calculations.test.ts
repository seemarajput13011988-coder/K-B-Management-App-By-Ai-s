import test from 'node:test';
import assert from 'node:assert/strict';
import { invoiceExtraLineTotal, invoiceGrandTotal, invoiceLineTotal } from '../src/lib/invoice-calculations.js';

test('exclusive GST is added to customer payable when reverse charge is off', () => {
  assert.equal(invoiceLineTotal(1000, 180, 'exclusive', false), 1180);
  assert.equal(invoiceGrandTotal(1000, 180, false), 1180);
});

test('inclusive GST remains inside the entered amount', () => {
  assert.equal(invoiceLineTotal(1180, 180, 'inclusive', false), 1180);
  assert.equal(invoiceGrandTotal(1000, 180, false), 1180);
});

test('reverse-charge GST is disclosed but excluded from amount payable to K&B', () => {
  assert.equal(invoiceLineTotal(1000, 180, 'exclusive', true), 1000);
  assert.equal(invoiceExtraLineTotal(500, 90, true), 500);
  assert.equal(invoiceGrandTotal(1500, 270, true), 1500);
});

test('invoice grand total rounds to two decimal places', () => {
  assert.equal(invoiceGrandTotal(100.105, 18.018, false), 118.12);
});
