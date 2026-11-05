import { readFile } from 'node:fs/promises';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc } from 'firebase/firestore';

const projectId = 'demo-kandb-rules';
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'users/super'), { userId: 'Brajraj', displayName: 'Owner', role: 'admin', isSuperAdmin: true, active: true });
    await setDoc(doc(db, 'users/admin'), { userId: 'Manager', displayName: 'Manager', role: 'admin', isSuperAdmin: false, active: true });
    await setDoc(doc(db, 'users/staff'), { userId: 'Worker', displayName: 'Worker', role: 'staff', active: true });
    await setDoc(doc(db, 'users/inactive'), { userId: 'Inactive', displayName: 'Inactive', role: 'staff', active: false });
    await setDoc(doc(db, 'chat_groups/team'), { name: 'Team', memberIds: ['staff', 'admin'], memberNames: ['Worker', 'Manager'], createdAt: '2026-11-05T00:00:00.000Z', createdBy: 'admin', createdByName: 'Manager' });
    await setDoc(doc(db, 'group_messages/message-1'), { groupId: 'team', senderId: 'staff', senderName: 'Worker', message: 'Hello', createdAt: '2026-11-05T00:00:00.000Z' });
  });
});

after(async () => { await env?.cleanup(); });

test('staff cannot read the directory or promote/deactivate themselves', async () => {
  const db = env.authenticatedContext('staff').firestore();
  await assertSucceeds(getDoc(doc(db, 'users/staff')));
  await assertFails(getDocs(collection(db, 'users')));
  await assertFails(updateDoc(doc(db, 'users/staff'), { role: 'admin', isSuperAdmin: true }));
  await assertFails(updateDoc(doc(db, 'users/staff'), { active: false }));
});

test('ordinary admins can create staff but cannot create administrators', async () => {
  const db = env.authenticatedContext('admin').firestore();
  await assertSucceeds(setDoc(doc(db, 'users/new-staff'), {
    userId: 'NewWorker', displayName: 'New Worker', role: 'staff', active: true,
    createdAt: '2026-11-05T00:00:00.000Z', createdBy: 'admin',
  }));
  await assertFails(setDoc(doc(db, 'users/new-admin'), {
    userId: 'NewAdmin', displayName: 'New Admin', role: 'admin', isSuperAdmin: false,
    active: true, createdAt: '2026-11-05T00:00:00.000Z', createdBy: 'admin',
  }));
});

test('only the primary Super Admin can create a non-super administrator', async () => {
  const db = env.authenticatedContext('super').firestore();
  await assertSucceeds(setDoc(doc(db, 'users/secondary-admin'), {
    userId: 'Secondary', displayName: 'Secondary Admin', role: 'admin', isSuperAdmin: false,
    active: true, createdAt: '2026-11-05T00:00:00.000Z', createdBy: 'super',
  }));
  await assertFails(setDoc(doc(db, 'users/forbidden-super'), {
    userId: 'AnotherOwner', displayName: 'Another Owner', role: 'admin', isSuperAdmin: true,
    active: true, createdAt: '2026-11-05T00:00:00.000Z', createdBy: 'super',
  }));
});

test('regular admins cannot disable administrator accounts', async () => {
  const db = env.authenticatedContext('admin').firestore();
  await assertFails(updateDoc(doc(db, 'users/super'), { active: false }));
  await assertFails(updateDoc(doc(db, 'users/admin'), { active: false }));
});

test('staff can settle an expired GPS grace shift but cannot forge an ordinary cancellation', async () => {
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'attendance/shift-staff'), {
      userId: 'staff', displayName: 'Worker', workDate: '2026-11-05',
      checkInAt: '2026-11-05T08:00:00.000Z', status: 'Checked in',
      gpsStatus: 'grace-period', gpsIssueStartedAt: '2026-11-05T08:10:00.000Z',
      gpsIssueReason: 'GPS location unavailable',
    });
  });
  const db = env.authenticatedContext('staff').firestore();
  await assertSucceeds(updateDoc(doc(db, 'attendance/shift-staff'), {
    checkOutAt: '2026-11-05T08:25:00.000Z', status: 'GPS Cancelled',
    gpsStatus: 'cancelled', gpsCancelled: true, gpsRestartRequired: true,
    gpsCancelledAt: '2026-11-05T08:26:00.000Z',
    gpsIssueDeadlineAt: '2026-11-05T08:25:00.000Z',
  }));
  await assertFails(updateDoc(doc(db, 'attendance/shift-staff'), {
    status: 'GPS Cancelled', gpsStatus: 'cancelled', gpsCancelled: true,
    gpsRestartRequired: true,
  }));
});

test('announcement publishing is admin-only', async () => {
  const payload = { title: 'Office update', message: 'Team meeting at 10 AM', createdAt: '2026-11-05T00:00:00.000Z', createdBy: 'admin', createdByName: 'Manager' };
  await assertSucceeds(setDoc(doc(env.authenticatedContext('admin').firestore(), 'announcements/a1'), payload));
  await assertFails(setDoc(doc(env.authenticatedContext('staff').firestore(), 'announcements/a2'), { ...payload, createdBy: 'staff' }));
});

test('group messages are visible only to group members', async () => {
  const memberDb = env.authenticatedContext('staff').firestore();
  const outsiderDb = env.authenticatedContext('inactive').firestore();
  await assertSucceeds(getDoc(doc(memberDb, 'group_messages/message-1')));
  await assertFails(getDoc(doc(outsiderDb, 'group_messages/message-1')));
});

test('public registration requests accept pending records only', async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertSucceeds(setDoc(doc(db, 'staff_registration_requests/newworker'), {
    userId: 'NewWorker', userIdLower: 'newworker', displayName: 'New Worker',
    phone: '', reason: '', status: 'pending', createdAt: '2026-11-05T00:00:00.000Z',
    requestId: 'a'.repeat(48), statusId: 'b'.repeat(48),
  }));
  await assertFails(setDoc(doc(db, 'staff_registration_requests/admin'), {
    userId: 'Admin', userIdLower: 'admin', displayName: 'Admin',
    phone: '', reason: '', status: 'approved', createdAt: '2026-11-05T00:00:00.000Z',
    requestId: 'c'.repeat(48), statusId: 'd'.repeat(48),
  }));
});
