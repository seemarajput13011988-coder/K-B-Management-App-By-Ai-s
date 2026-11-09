import test from 'node:test';
import assert from 'node:assert/strict';
import { hasAdminManagementAccess } from './route-path.js';

test('primary owner legacy super-admin flag retains admin-management access', () => {
  assert.equal(hasAdminManagementAccess({ role: 'admin', isSuperAdmin: true }), true);
});

test('primary owner current capability retains admin-management access', () => {
  assert.equal(hasAdminManagementAccess({ role: 'admin', canManageAdmins: true }), true);
});

test('ordinary admins cannot manage administrator accounts', () => {
  assert.equal(hasAdminManagementAccess({ role: 'admin' }), false);
  assert.equal(hasAdminManagementAccess({ role: 'admin', canManageAdmins: false }), false);
});

test('staff cannot gain administrator management access through flags', () => {
  assert.equal(hasAdminManagementAccess({ role: 'staff', canManageAdmins: true, isSuperAdmin: true }), false);
});
