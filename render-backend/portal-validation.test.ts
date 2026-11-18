import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidPortalConnectionRequest } from './portal-validation.js';

const valid = {
  name: 'Aarav Patel',
  phone: '9876543210',
  state: 'Gujarat',
  city: 'Ahmedabad',
  pincode: '382430',
  address: 'B-8 Gokul Galaxy',
  planId: 'plan-50',
};

test('accepts a complete customer portal connection request', () => {
  assert.equal(isValidPortalConnectionRequest(valid), true);
});

test('rejects mobile numbers that are not exactly ten digits', () => {
  for (const phone of ['987654321', '98765432100', '98765A3210', '+919876543210', '']) {
    assert.equal(isValidPortalConnectionRequest({ ...valid, phone }), false);
  }
});

test('rejects invalid postal codes and missing booking fields', () => {
  for (const pincode of ['38243', '3824300', '38A430', '']) {
    assert.equal(isValidPortalConnectionRequest({ ...valid, pincode }), false);
  }
  for (const field of ['name', 'state', 'city', 'address', 'planId'] as const) {
    assert.equal(isValidPortalConnectionRequest({ ...valid, [field]: '' }), false);
  }
});
