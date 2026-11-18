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


import { isValidPortalPlanChangeRequest } from './portal-validation.js';

test('accepts a valid customer plan-change request', () => {
  assert.equal(isValidPortalPlanChangeRequest({ phone: '9876543210', planId: 'plan-50' }), true);
});

test('rejects malformed customer plan-change requests', () => {
  for (const phone of ['987654321', '+919876543210', '98765A3210', '']) {
    assert.equal(isValidPortalPlanChangeRequest({ phone, planId: 'plan-50' }), false);
  }
  assert.equal(isValidPortalPlanChangeRequest({ phone: '9876543210', planId: '' }), false);
});


import { isValidPortalComplaintInput } from './portal-validation.js';

test('accepts a complete customer portal complaint with a supported image', () => {
  assert.equal(isValidPortalComplaintInput({
    phone: '9876543210', subject: 'No internet', details: 'Router has no connection',
    fileName: 'router.jpg', mimeType: 'image/jpeg', dataBase64: 'A'.repeat(120),
  }), true);
});

test('rejects portal complaints without valid identity fields or required photo', () => {
  const valid = { phone: '9876543210', subject: 'No internet', details: 'Router has no connection', fileName: 'router.jpg', mimeType: 'image/jpeg', dataBase64: 'A'.repeat(120) };
  assert.equal(isValidPortalComplaintInput({ ...valid, phone: '123' }), false);
  assert.equal(isValidPortalComplaintInput({ ...valid, mimeType: 'application/pdf' }), false);
  assert.equal(isValidPortalComplaintInput({ ...valid, dataBase64: '' }), false);
  assert.equal(isValidPortalComplaintInput({ ...valid, dataBase64: 'not-base64!!!' }), false);
  assert.equal(isValidPortalComplaintInput({ ...valid, details: '' }), false);
});
