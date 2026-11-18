import assert from 'node:assert/strict';
import test from 'node:test';
import { businessCollectionPath } from './business-namespace.js';

test('legacy business keeps existing top-level records readable', () => {
  assert.deepEqual(businessCollectionPath('customers','legacy-default'), ['customers']);
  assert.deepEqual(businessCollectionPath('invoices','legacy-default'), ['invoices']);
});

test('new businesses receive independent collection namespaces', () => {
  assert.deepEqual(businessCollectionPath('customers','biz-alpha'), ['businesses','biz-alpha','customers']);
  assert.deepEqual(businessCollectionPath('customers','biz-beta'), ['businesses','biz-beta','customers']);
  assert.notDeepEqual(
    businessCollectionPath('customers','biz-alpha'),
    businessCollectionPath('customers','biz-beta'),
  );
});

test('identity and business registry collections stay global', () => {
  for (const name of ['users','sessions','businesses','business_memberships','staff_registration_requests']) {
    assert.deepEqual(businessCollectionPath(name,'biz-alpha'), [name]);
  }
});

test('missing business context never silently routes to another tenant', () => {
  assert.deepEqual(businessCollectionPath('customers'), ['customers']);
});
