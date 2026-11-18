import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidPortalConnectionRequest, isValidPortalPlanChangeRequest, isValidPortalComplaintInput, isValidPortalImageSignature } from './portal-validation.js';

const connection = { name: 'Aarav Patel', phone: '9876543210', state: 'Gujarat', city: 'Ahmedabad', pincode: '382430', address: 'B-8 Gokul Galaxy', planId: 'plan-50' };
test('validates complete connection requests and rejects malformed fields', () => {
  assert.equal(isValidPortalConnectionRequest(connection), true);
  for (const phone of ['987654321', '+919876543210', '98765A3210', '']) assert.equal(isValidPortalConnectionRequest({ ...connection, phone }), false);
  for (const pincode of ['38243', '3824300', '38A430', '']) assert.equal(isValidPortalConnectionRequest({ ...connection, pincode }), false);
});

test('validates customer plan-change requests', () => {
  assert.equal(isValidPortalPlanChangeRequest({ phone: '9876543210', planId: 'plan-50' }), true);
  assert.equal(isValidPortalPlanChangeRequest({ phone: '123', planId: 'plan-50' }), false);
  assert.equal(isValidPortalPlanChangeRequest({ phone: '9876543210', planId: '' }), false);
});

test('requires complaint details and a supported image payload', () => {
  const valid = { phone: '9876543210', subject: 'No internet', details: 'Router has no connection', fileName: 'router.jpg', mimeType: 'image/jpeg', dataBase64: 'A'.repeat(120) };
  assert.equal(isValidPortalComplaintInput(valid), true);
  assert.equal(isValidPortalComplaintInput({ ...valid, mimeType: 'application/pdf' }), false);
  assert.equal(isValidPortalComplaintInput({ ...valid, dataBase64: '' }), false);
  assert.equal(isValidPortalComplaintInput({ ...valid, phone: '123' }), false);
});

test('checks JPEG, PNG and WEBP signatures against declared MIME types', () => {
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]);
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  assert.equal(isValidPortalImageSignature(jpeg, 'image/jpeg'), true);
  assert.equal(isValidPortalImageSignature(png, 'image/png'), true);
  assert.equal(isValidPortalImageSignature(webp, 'image/webp'), true);
  assert.equal(isValidPortalImageSignature(jpeg, 'image/png'), false);
  assert.equal(isValidPortalImageSignature(png, 'image/webp'), false);
  assert.equal(isValidPortalImageSignature(new Uint8Array(), 'image/jpeg'), false);
});
