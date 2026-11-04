import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getMessaging } from 'firebase-admin/messaging';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';
import { gpsGracePeriodExpired, hasOverlappingSubscription, isSuperAdminAccount, isValidDateKey, isValidDateRange, routePath, taskReminderKind } from './route-path.js';

initializeApp();
const auth = getAuth();
const db = getFirestore();
const adminRecoveryCode = defineSecret('ADMIN_RECOVERY_CODE');
const adminBootstrapSecret = defineSecret('ADMIN_BOOTSTRAP_SECRET');

type Role = 'admin' | 'staff';
type AppUser = { uid: string; id: string; userId: string; displayName: string; role: Role; active: boolean; authTime: number; isSuperAdmin?: boolean };
type Data = Record<string, any>;

const clean = (value: unknown, max = 300): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';
const money = (value: unknown): number => Number(value);
const validMoney = (value: unknown): boolean =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1000000;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const monthPattern = /^\d{4}-\d{2}$/;
const now = () => new Date().toISOString();
const send = (res: any, status: number, body: Data) => { res.status(status).json(body); };


function routeId(path: string, base: string): string {
  return decodeURIComponent(path.slice(base.length + 1));
}
async function requireUser(req: any): Promise<AppUser | null> {
  const header = clean(req.headers.authorization, 4096);
  const token = header.startsWith('Bearer ')
    ? header.slice(7)
    : clean(req.body?.sessionToken, 4096) || clean(req.query?.sessionToken, 4096);
  if (!token) return null;
  try {
    const decoded = await auth.verifyIdToken(token, true);
    const snap = await db.collection('users').doc(decoded.uid).get();
    if (!snap.exists) return null;
    const data = snap.data()!;
    if (data.active !== true || !['admin', 'staff'].includes(data.role)) return null;
    const userId = clean(data.userId, 40);
    return { uid: decoded.uid, id: decoded.uid, userId,
      displayName: clean(data.displayName, 80), role: data.role, active: true, authTime: Number(decoded.auth_time || 0),
      isSuperAdmin: isSuperAdminAccount({ role: data.role, userId, isSuperAdmin: data.isSuperAdmin }) };
  } catch { return null; }
}
function allow(user: AppUser, roles: Role[], res: any): boolean {
  if (!roles.includes(user.role)) { send(res, 403, { error: 'You do not have permission to perform this action.' }); return false; }
  return true;
}
function allowSuperAdmin(user: AppUser, res: any): boolean {
  if (user.isSuperAdmin !== true) { send(res, 403, { error: 'Only the primary Super Admin can create or manage administrator accounts.' }); return false; }
  return true;
}
async function list(collection: string): Promise<Data[]> {
  const snap = await db.collection(collection).limit(1000).get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
async function getDoc(collection: string, id: string): Promise<Data | null> {
  const snap = await db.collection(collection).doc(id).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}
async function audit(user: AppUser, action: string, entityType: string, entityId: string, description: string) {
  await db.collection('audit_logs').add({
    actorId: user.uid, actorName: user.displayName, action, entityType, entityId,
    description: clean(description, 240), createdAt: now(), serverCreatedAt: FieldValue.serverTimestamp(),
  });
}
async function staffFor(userId: string): Promise<Data | null> {
  return getDoc('users', userId);
}
const defaultPlans = [
  { id: 'default-plan-1', name: 'RailWire 30 Mbps', provider: 'RailWire', speed: '30 Mbps', data: '1.5 TB', price: 549, note: 'Popular home plan', connectionType: 'Fiber', featured: true, active: true },
  { id: 'default-plan-2', name: 'RailWire 50 Mbps', provider: 'RailWire', speed: '50 Mbps', data: '2 TB', price: 699, note: 'For multiple devices', connectionType: 'Fiber', featured: false, active: true },
  { id: 'default-plan-3', name: 'RailWire 100 Mbps', provider: 'RailWire', speed: '100 Mbps', data: '3 TB', price: 899, note: 'Heavy usage', connectionType: 'Fiber', featured: false, active: true },
  { id: 'default-plan-4', name: 'BSNL / Air Fibre', provider: 'BSNL / Air Fibre', speed: 'As configured', data: 'Plan based', price: 799, note: 'Custom connection', connectionType: 'Air Fibre', featured: false, active: true },
];

export const api = onRequest(
  { region: 'asia-south1', cors: true, maxInstances: 10, timeoutSeconds: 60, secrets: [adminRecoveryCode, adminBootstrapSecret] },
  async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const method = req.method.toUpperCase();
    const path = routePath(req.path);
    if (method === 'OPTIONS') { res.status(204).send(''); return; }
    if (method === 'GET' && path === '/api/_healthcheck') {
      send(res, 200, { message: 'Success', service: 'kandb-firebase-api' }); return;
    }
    if (method === 'POST' && path === '/api/auth/bootstrap-admin') {
      const input = req.body && typeof req.body === 'object' ? req.body : {};
      const bootstrapSecret = typeof input.bootstrapSecret === 'string' ? input.bootstrapSecret : '';
      const password = typeof input.password === 'string' ? input.password : '';
      const configuredSecret = adminBootstrapSecret.value();
      if (!configuredSecret || bootstrapSecret !== configuredSecret) {
        send(res, 401, { error: 'The one-time admin setup key is incorrect or has not been configured.' }); return;
      }
      if (password.length < 12) {
        send(res, 400, { error: 'Choose an admin password with at least 12 characters.' }); return;
      }
      const existing = await db.collection('users').where('role', '==', 'admin').limit(1).get();
      if (!existing.empty) { send(res, 409, { error: 'The admin account is already initialized. Use admin sign in.' }); return; }
      const email = 'brajraj@accounts.kandbnetservice.in';
      const account = await auth.createUser({ email, password, displayName: 'Brajraj', disabled: false });
      await db.collection('users').doc(account.uid).set({
        userId: 'Brajraj', displayName: 'Brajraj', role: 'admin', isSuperAdmin: true, active: true, createdAt: now(),
      });
      send(res, 201, { initialized: true, userId: 'Brajraj' }); return;
    }

    if (method === 'POST' && path === '/api/auth/recover-admin') {
      const input = req.body && typeof req.body === 'object' ? req.body : {};
      const userId = clean(input.userId, 40);
      const recoveryCode = typeof input.recoveryCode === 'string' ? input.recoveryCode : '';
      const newPassword = typeof input.newPassword === 'string' ? input.newPassword : '';
      if (userId.toLowerCase() !== 'brajraj' || newPassword.length < 10 || !recoveryCode) {
        send(res, 400, { error: 'Enter the admin recovery code and a password with at least 10 characters.' }); return;
      }
      const configuredCode = adminRecoveryCode.value();
      if (!configuredCode || recoveryCode !== configuredCode) {
        send(res, 401, { error: 'The admin recovery code is incorrect or has not been configured.' }); return;
      }
      const admins = await db.collection('users').where('userId', '==', 'Brajraj').where('role', '==', 'admin').limit(1).get();
      if (admins.empty) { send(res, 404, { error: 'The admin account has not been set up yet.' }); return; }
      const adminId = admins.docs[0].id;
      await auth.updateUser(adminId, { password: newPassword });
      await auth.revokeRefreshTokens(adminId);
      await audit({ uid: adminId, id: adminId, userId: 'Brajraj', displayName: 'Brajraj', role: 'admin', active: true, authTime: Math.floor(Date.now() / 1000) }, 'RECOVER_PASSWORD', 'admin', adminId, 'Admin password recovered');
      send(res, 200, { reset: true }); return;
    }

    if (method === 'POST' && path === '/api/staff-registration-requests') {
      const input: Data = req.body && typeof req.body === 'object' ? req.body : {};
      const userId = clean(input.userId, 32);
      const displayName = clean(input.displayName, 80);
      const phone = clean(input.phone, 30);
      const reason = clean(input.reason, 300);
      if (!/^[a-zA-Z0-9_-]{3,32}$/.test(userId) || !displayName) {
        send(res, 400, { error: 'Enter a valid staff ID and your full name.' }); return;
      }
      const userIdLower = userId.toLowerCase();
      const allUsers = await list('users');
      if (allUsers.some(item => String(item.userId || '').toLowerCase() === userIdLower)) {
        send(res, 409, { error: 'This staff ID is already registered. Contact your administrator.' }); return;
      }
      const createdAt = now();
      const trackingCode = randomBytes(24).toString('hex');
      const trackingHash = createHash('sha256').update(trackingCode).digest('hex');
      const ref = db.collection('staff_registration_requests').doc(userIdLower);
      const submitted = await db.runTransaction(async transaction => {
        const previous = await transaction.get(ref);
        if (previous.exists && previous.data()?.status === 'pending') return false;
        transaction.set(ref, { userId, userIdLower, displayName, phone, reason, status: 'pending', createdAt, trackingHash });
        return true;
      });
      if (!submitted) {
        send(res, 409, { error: 'A registration request for this staff ID is already pending. Please wait for the administrator to review it.' }); return;
      }
      const admins = (await list('users')).filter(member => member.active === true && member.role === 'admin');
      await Promise.all(admins.map(member => db.collection('staff_notifications').doc('staff-registration-' + ref.id + '-' + member.id).set({
        recipientId: member.id, recipientRole: 'admin', type: 'staff-registration', title: 'New staff access request',
        message: displayName + ' requested staff access with ID ' + userId + '.', createdAt, read: false, relatedId: ref.id
      }, { merge: true })));
      send(res, 201, { id: ref.id, trackingCode, status: 'pending', message: 'Your request has been submitted. An administrator must approve it before you can sign in.' }); return;
    }

    if (method === 'GET' && path === '/api/staff-registration-requests/status') {
      const requestId = clean(req.query.requestId, 64).toLowerCase();
      const trackingCode = clean(req.query.trackingCode, 128);
      if (!requestId || !trackingCode) { send(res, 400, { error: 'A request ID and tracking code are required.' }); return; }
      const request = await getDoc('staff_registration_requests', requestId);
      const storedHash = String(request?.trackingHash || '');
      const suppliedHash = createHash('sha256').update(trackingCode).digest('hex');
      const stored = Buffer.from(storedHash, 'hex'), supplied = Buffer.from(suppliedHash, 'hex');
      if (!request || stored.length !== supplied.length || !timingSafeEqual(stored, supplied)) {
        send(res, 404, { error: 'Registration request not found.' }); return;
      }
      send(res, 200, { status: request.status, createdAt: request.createdAt, reviewedAt: request.reviewedAt || null, reviewedByName: request.reviewedByName || null }); return;
    }

    try {
      const user = await requireUser(req);
      if (!user) { send(res, 401, { error: 'Please sign in again to continue.' }); return; }
      const body: Data = req.body && typeof req.body === 'object' ? req.body : {};

      if (method === 'POST' && path === '/api/auth/change-password') {
        const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
        if (newPassword.length < 10) { send(res, 400, { error: 'Choose a password with at least 10 characters.' }); return; }
        if (!user.authTime || Date.now() / 1000 - user.authTime > 300) {
          send(res, 401, { error: 'Please sign in again before changing your password.' }); return;
        }
        await auth.updateUser(user.uid, { password: newPassword });
        await auth.revokeRefreshTokens(user.uid);
        send(res, 200, { changed: true }); return;
      }

      if (method === 'POST' && path === '/api/auth/change-user-id') {
        if (!user.authTime || Date.now() / 1000 - user.authTime > 300) {
          send(res, 401, { error: 'Please sign in again before changing your user ID.' }); return;
        }
        const userId = clean(body.userId, 32);
        if (!/^[a-zA-Z0-9_-]{3,32}$/.test(userId)) {
          send(res, 400, { error: 'Use 3–32 letters, numbers, underscores or hyphens for the user ID.' }); return;
        }
        const existing = (await list('users')).some(item => item.id !== user.uid && String(item.userId).toLowerCase() === userId.toLowerCase());
        if (existing) { send(res, 409, { error: 'That user ID is already in use.' }); return; }
        const email = userId.toLowerCase() + '@accounts.kandbnetservice.in';
        // Preserve the primary Super Admin flag when the legacy Brajraj ID is renamed.
        const preserveSuperAdmin = isSuperAdminAccount(user);
        await auth.updateUser(user.uid, { email });
        await db.collection('users').doc(user.uid).update({
          userId,
          ...(preserveSuperAdmin ? { isSuperAdmin: true } : {}),
        });
        await audit(user, 'CHANGE_USER_ID', user.role, user.uid, 'Changed own user ID');
        send(res, 200, { changed: true, userId }); return;
      }
      if (method === 'GET' && path === '/api/auth/me') {
        send(res, 200, { user: { id: user.uid, userId: user.userId, displayName: user.displayName, role: user.role, active: true, isSuperAdmin: user.isSuperAdmin === true } }); return;
      }
      if (method === 'POST' && path === '/api/auth/logout') { send(res, 200, { ok: true }); return; }

      // Only the primary Super Admin may view, create, update or disable administrator accounts.
      if (path === '/api/admins' && method === 'GET') {
        if (!allowSuperAdmin(user, res)) return;
        const admins = (await list('users')).filter(item => item.role === 'admin')
          .map(({ passwordHash, salt, ...safe }) => safe);
        send(res, 200, { items: admins }); return;
      }
      if (path === '/api/admins' && method === 'POST') {
        if (!allowSuperAdmin(user, res)) return;
        const userId = clean(body.userId, 32);
        const displayName = clean(body.displayName, 80);
        const password = typeof body.password === 'string' ? body.password : '';
        if (!/^[a-zA-Z0-9_-]{3,32}$/.test(userId) || userId.toLowerCase() === 'brajraj' || !displayName || password.length < 12) {
          send(res, 400, { error: 'Enter a unique admin ID, name and password with at least 12 characters.' }); return;
        }
        const existing = (await list('users')).some(item => String(item.userId).toLowerCase() === userId.toLowerCase());
        if (existing) { send(res, 409, { error: 'That account ID is already in use.' }); return; }
        const email = userId.toLowerCase() + '@accounts.kandbnetservice.in';
        const account = await auth.createUser({ email, password, displayName, disabled: false });
        const record = { userId, displayName, role: 'admin', isSuperAdmin: false, active: true, createdAt: now(), createdBy: user.uid };
        await db.collection('users').doc(account.uid).set(record);
        await audit(user, 'CREATE', 'admin', account.uid, 'Created administrator account ' + userId);
        send(res, 201, { user: { id: account.uid, ...record } }); return;
      }
      if (path.startsWith('/api/admins/')) {
        if (!allowSuperAdmin(user, res)) return;
        const id = routeId(path, '/api/admins');
        const target = await getDoc('users', id);
        if (!target || target.role !== 'admin') { send(res, 404, { error: 'Administrator account not found.' }); return; }
        if (String(target.userId).toLowerCase() === 'brajraj') { send(res, 403, { error: 'The primary owner account is protected.' }); return; }
        if (method === 'PUT') {
          if (id === user.uid && body.active === false) { send(res, 400, { error: 'You cannot deactivate your own account.' }); return; }
          const displayName = clean(body.displayName, 80) || target.displayName;
          const active = typeof body.active === 'boolean' ? body.active : target.active === true;
          await db.collection('users').doc(id).update({ displayName, active });
          await auth.updateUser(id, { displayName, disabled: !active });
          if (!active) await auth.revokeRefreshTokens(id);
          await audit(user, 'UPDATE', 'admin', id, 'Updated administrator profile/status');
          send(res, 200, { updated: true }); return;
        }
        if (method === 'DELETE') {
          if (id === user.uid) { send(res, 400, { error: 'You cannot remove your own account.' }); return; }
          await auth.updateUser(id, { disabled: true });
          await auth.revokeRefreshTokens(id);
          await db.collection('users').doc(id).update({ active: false, deletedAt: now() });
          await audit(user, 'DISABLE', 'admin', id, 'Disabled administrator account');
          send(res, 200, { deleted: true }); return;
        }
      }

      if (path === '/api/staff-registration-requests' && method === 'GET') {
        if (!allow(user, ['admin'], res)) return;
        const items = (await list('staff_registration_requests')).map(({ trackingHash, ...safe }) => safe).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        send(res, 200, { items }); return;
      }
      if (path.startsWith('/api/staff-registration-requests/') && method === 'PUT') {
        if (!allow(user, ['admin'], res)) return;
        const id = routeId(path, '/api/staff-registration-requests');
        const request = await getDoc('staff_registration_requests', id);
        if (!request || request.status !== 'pending') { send(res, 404, { error: 'Pending registration request not found.' }); return; }
        const decision = body.status === 'approved' ? 'approved' : body.status === 'rejected' ? 'rejected' : '';
        if (!decision) { send(res, 400, { error: 'Choose approve or reject.' }); return; }
        if (decision === 'rejected') {
          await db.collection('staff_registration_requests').doc(id).update({ status: 'rejected', reviewedAt: now(), reviewedBy: user.uid, reviewedByName: user.displayName });
          await audit(user, 'REJECT_STAFF_REGISTRATION', 'staff_registration_request', id, 'Rejected staff registration for ' + String(request.userId || 'unknown user'));
          send(res, 200, { updated: true, status: 'rejected' }); return;
        }
        const password = typeof body.password === 'string' ? body.password : '';
        if (password.length < 10) { send(res, 400, { error: 'Set a temporary password with at least 10 characters before approving.' }); return; }
        const userId = clean(request.userId, 32);
        const userIdLower = userId.toLowerCase();
        const users = await list('users');
        if (users.some(item => String(item.userId || '').toLowerCase() === userIdLower)) {
          send(res, 409, { error: 'This staff ID has already been registered. Reject or close this duplicate request.' }); return;
        }
        const email = userIdLower + '@accounts.kandbnetservice.in';
        let account: Awaited<ReturnType<typeof auth.createUser>> | undefined;
        try {
          account = await auth.createUser({ email, password, displayName: clean(request.displayName, 80), disabled: false });
          const record = { userId, displayName: clean(request.displayName, 80), role: 'staff', active: true, createdAt: now(), registrationRequestId: id };
          await db.collection('users').doc(account.uid).set(record);
          await db.collection('staff_registration_requests').doc(id).update({ status: 'approved', reviewedAt: now(), reviewedBy: user.uid, reviewedByName: user.displayName, approvedUserId: account.uid });
          await audit(user, 'APPROVE_STAFF_REGISTRATION', 'staff_registration_request', id, 'Approved staff registration and created account ' + userId);
          send(res, 200, { updated: true, status: 'approved', user: { id: account.uid, ...record } }); return;
        } catch (error) {
          if (account?.uid) {
            await db.collection('users').doc(account.uid).delete().catch(() => undefined);
            await auth.deleteUser(account.uid).catch(() => undefined);
          }
          await db.collection('staff_registration_requests').doc(id).update({
            status: 'pending', reviewedAt: FieldValue.delete(), reviewedBy: FieldValue.delete(),
            reviewedByName: FieldValue.delete(), approvedUserId: FieldValue.delete()
          }).catch(() => undefined);
          throw error;
        }
      }

      // Staff accounts are Firebase Authentication users. Passwords never enter Firestore.
      if (path === '/api/staff' && method === 'GET') {
        if (!allow(user, ['admin'], res)) return;
        const users = (await list('users')).filter(item => item.role === 'staff')
          .map(({ passwordHash, salt, ...safe }) => safe);
        send(res, 200, { items: users }); return;
      }
      if (path === '/api/staff' && method === 'POST') {
        if (!allow(user, ['admin'], res)) return;
        const userId = clean(body.userId, 32);
        const displayName = clean(body.displayName, 80);
        const password = typeof body.password === 'string' ? body.password : '';
        if (!/^[a-zA-Z0-9_-]{3,32}$/.test(userId) || !displayName || password.length < 10) {
          send(res, 400, { error: 'Enter a 3–32 character staff ID, name and password of at least 10 characters.' }); return;
        }
        const existing = (await list('users')).some(item => String(item.userId).toLowerCase() === userId.toLowerCase());
        if (existing) { send(res, 409, { error: 'That staff ID is already in use.' }); return; }
        const email = userId.toLowerCase() + '@accounts.kandbnetservice.in';
        const account = await auth.createUser({ email, password, displayName, disabled: false });
        const record = { userId, displayName, role: 'staff', active: true, createdAt: now() };
        await db.collection('users').doc(account.uid).set(record);
        await audit(user, 'CREATE', 'staff', account.uid, 'Created staff account ' + userId);
        send(res, 201, { user: { id: account.uid, ...record } }); return;
      }
      if (path.startsWith('/api/staff/')) {
        if (!allow(user, ['admin'], res)) return;
        const suffix = path.slice('/api/staff/'.length);
        const reset = suffix.endsWith('/reset-password');
        const id = reset ? suffix.slice(0, -'/reset-password'.length) : suffix;
        const target = await getDoc('users', id);
        if (!target || target.role !== 'staff') { send(res, 404, { error: 'Staff account not found.' }); return; }
        if (reset && method === 'POST') {
          const password = typeof body.password === 'string' ? body.password : '';
          if (password.length < 10) { send(res, 400, { error: 'Choose a password with at least 10 characters.' }); return; }
          await auth.updateUser(id, { password });
          await auth.revokeRefreshTokens(id);
          await audit(user, 'RESET_PASSWORD', 'staff', id, 'Reset staff password');
          send(res, 200, { reset: true }); return;
        }
        if (method === 'PUT') {
          const displayName = clean(body.displayName, 80) || target.displayName;
          const active = typeof body.active === 'boolean' ? body.active : target.active === true;
          const updates: Data = { displayName, active };
          const authUpdates: Data = { displayName, disabled: !active };
          if (body.userId !== undefined) {
            const userId = clean(body.userId, 32);
            if (!/^[a-zA-Z0-9_-]{3,32}$/.test(userId)) {
              send(res, 400, { error: 'Use 3–32 letters, numbers, underscores or hyphens for the user ID.' }); return;
            }
            const existing = (await list('users')).some(item => item.id !== id && String(item.userId).toLowerCase() === userId.toLowerCase());
            if (existing) { send(res, 409, { error: 'That user ID is already in use.' }); return; }
            updates.userId = userId;
            authUpdates.email = userId.toLowerCase() + '@accounts.kandbnetservice.in';
          }
          await auth.updateUser(id, authUpdates);
          await db.collection('users').doc(id).update(updates);
          await audit(user, 'UPDATE', 'staff', id, body.userId !== undefined ? 'Updated staff profile and user ID' : 'Updated staff profile/status');
          send(res, 200, { updated: true }); return;
        }
        if (method === 'DELETE') {
          await auth.updateUser(id, { disabled: true });
          await db.collection('users').doc(id).update({ active: false, deletedAt: now() });
          const customers = await list('customers');
          const batch = db.batch();
          let unassigned = 0;
          for (const customer of customers.filter(item => item.assignedTo === id)) {
            batch.update(db.collection('customers').doc(customer.id), { assignedTo: '', assignedToName: '' }); unassigned++;
          }
          if (unassigned) await batch.commit();
          await audit(user, 'DISABLE', 'staff', id, 'Disabled staff account and unassigned ' + unassigned + ' customers');
          send(res, 200, { deleted: true, unassignedCustomers: unassigned, historyPreserved: true }); return;
        }
      }

      if (path === '/api/plans' && method === 'GET') {
        let items = await list('plans');
        if (!items.length) {
          const batch = db.batch();
          for (const plan of defaultPlans) { const { id, ...data } = plan; batch.set(db.collection('plans').doc(id), data); }
          await batch.commit(); items = await list('plans');
        }
        send(res, 200, { items: user.role === 'admin' ? items : items.filter(item => item.active === true) }); return;
      }
      if (path === '/api/plans' && method === 'POST') {
        if (!allow(user, ['admin'], res)) return;
        const name = clean(body.name, 80), provider = clean(body.provider, 60), speed = clean(body.speed, 40);
        const data = clean(body.data, 40), connectionType = clean(body.connectionType, 40), price = money(body.price);
        if (!name || !provider || !speed || !data || !connectionType || !validMoney(price)) {
          send(res, 400, { error: 'Enter a plan name, provider, speed, data limit, connection type and valid monthly price.' }); return;
        }
        const duplicate = (await list('plans')).some(item => String(item.name).toLowerCase() === name.toLowerCase());
        if (duplicate) { send(res, 409, { error: 'A plan with this name already exists.' }); return; }
        const record = { name, provider, speed, data, price, note: clean(body.note, 180), connectionType, featured: body.featured === true, active: true };
        const ref = await db.collection('plans').add(record);
        await audit(user, 'CREATE', 'plan', ref.id, 'Created plan ' + name);
        send(res, 201, { id: ref.id, ...record }); return;
      }
      if (path.startsWith('/api/plans/')) {
        if (!allow(user, ['admin'], res)) return;
        const id = routeId(path, '/api/plans');
        const existing = await getDoc('plans', id);
        if (!existing) { send(res, 404, { error: 'Plan not found.' }); return; }
        if (method === 'PUT') {
          const name = clean(body.name, 80), provider = clean(body.provider, 60), speed = clean(body.speed, 40);
          const data = clean(body.data, 40), connectionType = clean(body.connectionType, 40), price = money(body.price);
          if (!name || !provider || !speed || !data || !connectionType || !validMoney(price)) {
            send(res, 400, { error: 'Enter valid plan details and monthly price.' }); return;
          }
          const duplicate = (await list('plans')).some(item => item.id !== id && String(item.name).toLowerCase() === name.toLowerCase());
          if (duplicate) { send(res, 409, { error: 'Another plan already uses this name.' }); return; }
          await db.collection('plans').doc(id).update({ name, provider, speed, data, price, note: clean(body.note, 180), connectionType, featured: body.featured === true, active: body.active !== false });
          await audit(user, 'UPDATE', 'plan', id, 'Updated plan ' + name);
          send(res, 200, { updated: true }); return;
        }
        if (method === 'DELETE') {
          const customers = await list('customers');
          if (customers.some(item => String(item.plan || '').toLowerCase() === String(existing.name).toLowerCase())) {
            send(res, 409, { error: 'This plan is linked to customers. Archive it to preserve their history.' }); return;
          }
          const plans = await list('plans');
          if (plans.length <= 1) { send(res, 409, { error: 'Keep at least one plan in the catalogue.' }); return; }
          await db.collection('plans').doc(id).delete();
          await audit(user, 'DELETE', 'plan', id, 'Deleted plan ' + String(existing.name));
          send(res, 200, { deleted: true }); return;
        }
      }

      if (path === '/api/customers' && method === 'GET') {
        const items = await list('customers');
        send(res, 200, { items: user.role === 'admin' ? items : items.filter(item => item.assignedTo === user.uid) }); return;
      }
      if (path === '/api/customers' && method === 'POST') {
        if (!allow(user, ['admin'], res)) return;
        const name = clean(body.name, 100), phone = clean(body.phone, 30), address = clean(body.address, 300);
        const plan = clean(body.plan, 100), monthlyFee = money(body.monthlyFee);
        if (!name || !phone || !address || !plan || !validMoney(monthlyFee) || !datePattern.test(clean(body.dueDate, 10))) {
          send(res, 400, { error: 'Enter customer name, phone, address, plan, valid monthly fee and due date.' }); return;
        }
        const assignedTo = clean(body.assignedTo, 128);
        let assignedToName = '';
        if (assignedTo) {
          const staff = await staffFor(assignedTo);
          if (!staff || staff.role !== 'staff' || staff.active !== true) { send(res, 400, { error: 'Select an active staff member.' }); return; }
          assignedToName = clean(staff.displayName, 80);
        }
        const record = { name, phone, address, plan, monthlyFee, status: ['Active','Inactive','Suspended'].includes(body.status) ? body.status : 'Active',
          joinedAt: clean(body.joinedAt, 10) || now().slice(0,10), dueDate: clean(body.dueDate,10), notes: clean(body.notes,1000), assignedTo, assignedToName, createdAt: now() };
        const ref = await db.collection('customers').add(record);
        await audit(user, 'CREATE', 'customer', ref.id, 'Created customer ' + name);
        send(res, 201, { id: ref.id, ...record }); return;
      }
      if (path.startsWith('/api/customers/')) {
        const id = routeId(path, '/api/customers'), existing = await getDoc('customers', id);
        if (!existing) { send(res, 404, { error: 'Customer not found.' }); return; }
        if (user.role === 'staff' && existing.assignedTo !== user.uid) { send(res, 403, { error: 'You can access only customers assigned to you.' }); return; }
        if (method === 'PUT') {
          if (user.role === 'staff') {
            const staffPatch = {
              phone: clean(body.phone, 30),
              address: clean(body.address, 300),
              notes: clean(body.notes, 1000),
              updatedAt: now(),
            };
            await db.collection('customers').doc(id).update(staffPatch);
            await audit(user, 'UPDATE', 'customer', id, 'Updated contact details for assigned customer ' + String(existing.name));
            send(res, 200, { updated: true }); return;
          }
          const patch: Data = {};
          const allowed = ['name','phone','address','plan','monthlyFee','status','joinedAt','dueDate','notes'];
          for (const key of allowed) if (body[key] !== undefined) patch[key] = key === 'monthlyFee' ? money(body[key]) : key === 'notes' ? clean(body[key],1000) : clean(body[key], key === 'address' ? 300 : 120);
          if (patch.monthlyFee !== undefined && !validMoney(patch.monthlyFee)) { send(res,400,{error:'Enter a valid monthly fee.'}); return; }
          if (body.assignedTo !== undefined) {
            if (!allow(user,['admin'],res)) return;
            const staffId = clean(body.assignedTo,128), staff = staffId ? await staffFor(staffId) : null;
            if (staffId && (!staff || staff.role !== 'staff' || staff.active !== true)) { send(res,400,{error:'Select an active staff member.'}); return; }
            patch.assignedTo = staffId; patch.assignedToName = staff ? clean(staff.displayName,80) : '';
          }
          patch.updatedAt = now();
          await db.collection('customers').doc(id).update(patch);
          await audit(user,'UPDATE','customer',id,'Updated customer ' + String(existing.name));
          send(res,200,{updated:true}); return;
        }
        if (method === 'DELETE') {
          if (!allow(user,['admin'],res)) return;
          await db.collection('customers').doc(id).delete();
          await audit(user,'DELETE','customer',id,'Deleted customer ' + String(existing.name));
          send(res,200,{deleted:true}); return;
        }
      }

      if (path === '/api/payments' && method === 'GET') {
        const items = await list('payments');
        send(res,200,{items:user.role === 'admin' ? items : items.filter(item => item.recordedBy === user.uid)}); return;
      }
      if (path === '/api/payments' && method === 'POST') {
        const customerId = clean(body.customerId,128), amount = money(body.amount);
        const customer = await getDoc('customers',customerId);
        if (!customer || !validMoney(amount) || amount <= 0 || !clean(body.method,40) || !datePattern.test(clean(body.paidAt,10)) || !clean(body.month,40)) {
          send(res,400,{error:'Enter a valid customer, amount, payment method, payment date and billing month.'}); return;
        }
        if (user.role === 'staff' && customer.assignedTo !== user.uid) { send(res,403,{error:'You can record payments only for your assigned customers.'}); return; }
        const record = { customerId, customerName: clean(customer.name,100), amount, method: clean(body.method,40), paidAt: clean(body.paidAt,10), month: clean(body.month,40), recordedBy: user.uid, recordedByName: user.displayName, createdAt: now() };
        const ref = await db.collection('payments').add(record);
        await audit(user,'CREATE','payment',ref.id,'Recorded payment of ₹' + amount + ' for ' + record.customerName);
        send(res,201,{id:ref.id,...record}); return;
      }

      if (path.startsWith('/api/payments/') && method === 'DELETE') {
        if (!allow(user, ['admin'], res)) return;
        const id = routeId(path, '/api/payments');
        const payment = await getDoc('payments', id);
        if (!payment) { send(res, 404, { error: 'Payment record not found.' }); return; }
        await db.collection('payments').doc(id).delete();
        await audit(user, 'DELETE', 'payment', id, 'Deleted payment of ₹' + String(payment.amount) + ' for ' + String(payment.customerName || 'customer'));
        send(res, 200, { deleted: true }); return;
      }

      if (path === '/api/complaints' && method === 'GET') {
        const items = await list('complaints');
        send(res,200,{items:user.role === 'admin' ? items : items.filter(item => item.assignedTo === user.uid || item.createdBy === user.uid)}); return;
      }
      if (path === '/api/complaints' && method === 'POST') {
        const subject = clean(body.subject,120), details = clean(body.details,1500), priority = ['Low','Normal','High','Urgent'].includes(body.priority) ? body.priority : 'Normal';
        if (!subject || !details) { send(res,400,{error:'Enter a complaint subject and details.'}); return; }
        const customerId = clean(body.customerId,128), customer = customerId ? await getDoc('customers',customerId) : null;
        if (customerId && !customer) { send(res,404,{error:'Customer not found.'}); return; }
        if (user.role === 'staff' && customer && customer.assignedTo !== user.uid) { send(res,403,{error:'You can raise complaints only for assigned customers.'}); return; }
        const record = { customerId, customerName: clean(body.customerName,100) || clean(customer?.name,100), subject, details, priority, status:'Open', createdAt:now(), createdBy:user.uid, createdByName:user.displayName, assignedTo:'', assignedToName:'' };
        const ref = await db.collection('complaints').add(record);
        await audit(user,'CREATE','complaint',ref.id,'Created complaint: ' + subject);
        send(res,201,{id:ref.id,...record}); return;
      }

      if (path.startsWith('/api/complaints/') && (method === 'PUT' || method === 'DELETE')) {
        if (!allow(user, ['admin'], res)) return;
        const id = routeId(path, '/api/complaints');
        const existing = await getDoc('complaints', id);
        if (!existing) { send(res, 404, { error: 'Complaint not found.' }); return; }

        if (method === 'PUT') {
          const status = clean(body.status, 30);
          if (status && !['Open', 'In progress', 'Resolved'].includes(status)) {
            send(res, 400, { error: 'Choose a valid complaint status.' }); return;
          }
          const patch: Data = { updatedAt: now() };
          if (status) patch.status = status;
          if (Object.prototype.hasOwnProperty.call(body, 'assignedTo')) {
            const assignedTo = clean(body.assignedTo, 128);
            const staff = assignedTo ? await staffFor(assignedTo) : null;
            if (assignedTo && (!staff || staff.role !== 'staff' || staff.active !== true)) {
              send(res, 400, { error: 'Choose an active staff member for this ticket.' }); return;
            }
            patch.assignedTo = assignedTo;
            patch.assignedToName = staff ? clean(staff.displayName, 80) : '';
          }
          await db.collection('complaints').doc(id).update(patch);
          await audit(user, 'UPDATE', 'complaint', id, 'Updated service ticket: ' + String(existing.subject || 'Complaint'));
          send(res, 200, { updated: true }); return;
        }

        await db.collection('complaints').doc(id).delete();
        await audit(user, 'DELETE', 'complaint', id, 'Deleted service ticket: ' + String(existing.subject || 'Complaint'));
        send(res, 200, { deleted: true }); return;
      }

      if (path === '/api/tasks' && method === 'GET') {
        const items = await list('tasks');
        send(res,200,{items:user.role === 'admin' ? items : items.filter(item => item.assignedTo === user.uid)}); return;
      }
      if (path === '/api/tasks' && method === 'POST') {
        if (!allow(user,['admin'],res)) return;
        const title = clean(body.title,120), assignedTo = clean(body.assignedTo,128), dueDate = clean(body.dueDate,10);
        const staff = await staffFor(assignedTo);
        if (!title || !staff || staff.role !== 'staff' || staff.active !== true || !datePattern.test(dueDate)) {
          send(res,400,{error:'Enter a task title, select an active staff member and choose a valid due date.'}); return;
        }
        const record = { title, details:clean(body.details,1500), assignedTo, assignedToName:clean(staff.displayName,80),
          priority:['Low','Normal','High'].includes(body.priority) ? body.priority : 'Normal', dueDate,
          status:'Pending', createdAt:now(), createdBy:user.uid, createdByName:user.displayName };
        const ref = await db.collection('tasks').add(record);
        await db.collection('staff_notifications').add({ recipientId: assignedTo, recipientRole: 'staff', type: 'task-assigned', title: 'New work assigned', message: title + ' · Due ' + dueDate, createdAt: now(), read: false, relatedId: ref.id });
        await audit(user,'CREATE','task',ref.id,'Assigned task ' + title + ' to ' + record.assignedToName);
        send(res,201,{id:ref.id,...record}); return;
      }
      if (path.startsWith('/api/tasks/')) {
        const id = routeId(path,'/api/tasks'), existing = await getDoc('tasks',id);
        if (!existing) { send(res,404,{error:'Task not found.'}); return; }
        if (user.role === 'staff' && existing.assignedTo !== user.uid) { send(res,403,{error:'You can update only your assigned tasks.'}); return; }
        if (method === 'PUT') {
          const status = clean(body.status,30);
          if (status && !['Pending','In progress','Completed'].includes(status)) { send(res,400,{error:'Choose a valid task status.'}); return; }
          if (user.role === 'staff' && Object.keys(body).some(key => key !== 'status')) { send(res,403,{error:'Staff can update task status only.'}); return; }
          const patch: Data = {};
          if (status) patch.status = status;
          if (user.role === 'admin') {
            if (body.title !== undefined) patch.title = clean(body.title,120);
            if (body.details !== undefined) patch.details = clean(body.details,1500);
            if (body.dueDate !== undefined && datePattern.test(clean(body.dueDate,10))) patch.dueDate = clean(body.dueDate,10);
          }
          patch.updatedAt = now();
          await db.collection('tasks').doc(id).update(patch);
          const changedStatus = !!status && status !== existing.status;
          const notificationRecipients = user.role === 'staff'
            ? (await list('users')).filter(member => member.active === true && member.role === 'admin').map(member => ({ id: member.id, role: 'admin' }))
            : existing.assignedTo ? [{ id: String(existing.assignedTo), role: 'staff' }] : [];
          if (changedStatus || (user.role === 'admin' && Object.keys(patch).some(key => ['title','details','dueDate'].includes(key)))) {
            const updateTitle = changedStatus ? 'Work status updated' : 'Work details updated';
            const updateMessage = changedStatus ? String(existing.title) + ' is now ' + status + '.' : String(patch.title || existing.title) + ' was updated by ' + user.displayName + '.';
            await Promise.all(notificationRecipients.map(recipient => db.collection('staff_notifications').add({ recipientId: recipient.id, recipientRole: recipient.role, type: 'task-update', title: updateTitle, message: updateMessage.slice(0,180), createdAt: now(), read: false, relatedId: id })));
          }
          await audit(user,'UPDATE','task',id,'Updated task ' + String(existing.title) + (changedStatus ? ' to ' + status : ''));
          send(res,200,{updated:true}); return;
        }
        if (method === 'DELETE') {
          if (!allow(user,['admin'],res)) return;
          await db.collection('tasks').doc(id).delete();
          await audit(user,'DELETE','task',id,'Deleted task ' + String(existing.title));
          send(res,200,{deleted:true}); return;
        }
      }

      const indiaDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      if (path === '/api/holidays' && method === 'GET') {
        const requests = await list('holiday_requests');
        const items = user.role === 'admin' ? requests : requests.filter(item => item.userId === user.uid);
        send(res, 200, { items: items.sort((a,b) => String(b.createdAt||'').localeCompare(String(a.createdAt||''))) }); return;
      }
      if (path === '/api/holidays' && method === 'POST') {
        if (!allow(user, ['staff'], res)) return;
        const startDate = clean(body.startDate, 10), endDate = clean(body.endDate, 10), reason = clean(body.reason, 300);
        if (!datePattern.test(startDate) || !datePattern.test(endDate) || endDate < startDate || !reason) { send(res, 400, { error: 'Choose a valid holiday date range and enter a reason.' }); return; }
        const duplicate = (await list('holiday_requests')).some(item => item.userId === user.uid && ['pending','approved'].includes(String(item.status)) && String(item.startDate) <= endDate && String(item.endDate) >= startDate);
        if (duplicate) { send(res, 409, { error: 'A pending or approved holiday already covers part of these dates.' }); return; }
        const record = { userId: user.uid, displayName: user.displayName, startDate, endDate, reason, status: 'pending', createdAt: now() };
        const ref = await db.collection('holiday_requests').add(record);
        const admins = (await list('users')).filter(member => member.active === true && member.role === 'admin');
        await Promise.all(admins.map(member => db.collection('staff_notifications').add({ recipientId: member.id, recipientRole: 'admin', type: 'holiday-request', title: 'New holiday request', message: user.displayName + ' requested leave from ' + startDate + ' to ' + endDate + '.', createdAt: now(), read: false, relatedId: ref.id })));
        await audit(user, 'HOLIDAY_REQUEST', 'holiday', ref.id, 'Requested holiday from ' + startDate + ' to ' + endDate);
        send(res, 201, { id: ref.id, ...record }); return;
      }
      if (path.startsWith('/api/holidays/') && method === 'PUT') {
        if (!allow(user, ['admin'], res)) return;
        const id = routeId(path, '/api/holidays'), request = await getDoc('holiday_requests', id);
        const status = body.status === 'approved' ? 'approved' : body.status === 'rejected' ? 'rejected' : '';
        if (!request || !status) { send(res, 400, { error: 'Choose a valid holiday request and decision.' }); return; }
        await db.collection('holiday_requests').doc(id).update({ status, reviewedAt: now(), reviewedBy: user.uid, reviewedByName: user.displayName, reviewNote: clean(body.reviewNote, 240) });
        await db.collection('staff_notifications').add({ recipientId: request.userId, recipientRole: 'staff', type: 'holiday-decision', title: 'Holiday request ' + status, message: 'Your holiday request from ' + request.startDate + ' to ' + request.endDate + ' was ' + status + '.' + (clean(body.reviewNote, 240) ? ' Note: ' + clean(body.reviewNote, 240) : ''), createdAt: now(), read: false, relatedId: id });
        await audit(user, 'HOLIDAY_' + status.toUpperCase(), 'holiday', id, status + ' holiday request for ' + request.displayName);
        send(res, 200, { updated: true, status }); return;
      }
      if (path.startsWith('/api/attendance/') && path.endsWith('/day-type') && method === 'PUT') {
        if (!allow(user, ['admin'], res)) return;
        const id = decodeURIComponent(path.slice('/api/attendance/'.length, -'/day-type'.length));
        const record = await getDoc('attendance', id);
        const dayType = body.dayType === 'Half day' ? 'Half day' : body.dayType === 'Full day' ? 'Full day' : '';
        const reason = clean(body.reason, 300);
        if (!record || !dayType || !reason) { send(res, 400, { error: 'Choose Full day or Half day and enter a correction reason.' }); return; }
        await db.collection('attendance').doc(id).update({ dayType, correctionReason: reason, correctedBy: user.uid, correctedAt: now() });
        await audit(user, 'ATTENDANCE_CORRECTION', 'attendance', id, 'Changed attendance to ' + dayType + ': ' + reason);
        send(res, 200, { updated: true }); return;
      }
      if (path === '/api/attendance' && method === 'GET') {
        const items = await list('attendance');
        send(res, 200, { items: user.role === 'admin' ? items : items.filter(item => item.userId === user.uid) }); return;
      }
      if (path === '/api/attendance/check-in' && method === 'POST') {
        if (!allow(user, ['staff'], res)) return;
        const workDate = indiaDate(), items = await list('attendance');
        if (items.some(item => item.userId === user.uid && item.workDate === workDate)) { send(res, 409, { error: 'Attendance already exists today. Ask an admin to restart a GPS-cancelled shift.' }); return; }
        const latitude = Number(body.latitude), longitude = Number(body.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) { send(res, 403, { error: 'Enable location permission and obtain a GPS fix before starting your shift.' }); return; }
        const checkInAt = now();
        const dayType = body.dayType === 'Half day' ? 'Half day' : 'Full day';
        const record = { userId: user.uid, displayName: user.displayName, workDate, checkInAt, status: 'Checked in', dayType, gpsStatus: 'active', shiftEvents: [] };
        const ref = await db.collection('attendance').add(record);
        await db.collection('locations').add({ userId: user.uid, displayName: user.displayName, latitude, longitude, accuracy: Number(body.accuracy) || 0, capturedAt: checkInAt });
        send(res, 201, { id: ref.id, ...record }); return;
      }
      if (path === '/api/attendance/check-out' && method === 'POST') {
        if (!allow(user, ['staff'], res)) return;
        const workDate = indiaDate(), items = await list('attendance');
        const record = items.find(item => item.userId === user.uid && item.workDate === workDate);
        if (!record) { send(res, 400, { error: 'Check in before checking out.' }); return; }
        if (record.checkOutAt) { send(res, 409, { error: 'You have already checked out today.' }); return; }
        await db.collection('attendance').doc(record.id).update({ checkOutAt: now(), status: 'Completed' });
        send(res, 200, { updated: true }); return;
      }
      if ((path === '/api/attendance/admin-start' || path === '/api/attendance/admin-end') && method === 'POST') {
        if (!allow(user, ['admin'], res)) return;
        const staffId = clean(body.userId, 128), member = await staffFor(staffId);
        if (!member || member.role !== 'staff' || member.active !== true) { send(res, 400, { error: 'Choose an active staff member.' }); return; }
        const workDate = indiaDate(), items = await list('attendance');
        const existing = items.find(item => item.userId === staffId && item.workDate === workDate);
        if (path.endsWith('admin-start')) {
          if (existing && !existing.gpsRestartRequired) { send(res, 409, { error: 'Attendance is already recorded for this staff member today.' }); return; }
          if (existing && existing.gpsRestartRequired) {
            const resumedAt = now();
            await db.collection('attendance').doc(existing.id).update({ checkInAt: resumedAt, checkOutAt: null, status: 'Checked in', gpsCancelled: false, gpsRestartRequired: false, gpsStatus: 'active', restartedByAdmin: user.displayName, restartedAt: resumedAt, shiftEvents: FieldValue.arrayUnion({ type: 'admin-restart-after-gps-cancel', at: resumedAt, by: user.displayName }) });
            await audit(user, 'ADMIN_RESTART_GPS_SHIFT', 'attendance', existing.id, 'Restarted GPS-cancelled shift for ' + member.displayName);
            send(res, 200, { id: existing.id, restarted: true }); return;
          }
          const dayType = body.dayType === 'Half day' ? 'Half day' : 'Full day';
          const record = { userId: staffId, displayName: member.displayName, workDate, checkInAt: now(), status: 'Checked in', dayType, startedByAdmin: user.displayName, attendanceSource: 'Admin', gpsStatus: 'active' };
          const ref = await db.collection('attendance').add(record);
          await audit(user, 'ADMIN_START', 'attendance', ref.id, 'Started shift for ' + member.displayName);
          send(res, 201, { id: ref.id, ...record }); return;
        }
        if (!existing) { send(res, 400, { error: 'Start this staff member’s shift before ending it.' }); return; }
        if (existing.checkOutAt) { send(res, 409, { error: 'This staff member has already ended today’s shift.' }); return; }
        await db.collection('attendance').doc(existing.id).update({ checkOutAt: now(), status: 'Completed', endedByAdmin: user.displayName });
        await audit(user, 'ADMIN_END', 'attendance', existing.id, 'Ended shift for ' + member.displayName);
        send(res, 200, { updated: true }); return;
      }
      if (path === '/api/attendance/gps-lost' && method === 'POST') {
        if (!allow(user, ['staff'], res)) return;
        const workDate = indiaDate(), shifts = await list('attendance');
        const active = shifts.find(item => item.userId === user.uid && item.workDate === workDate && !item.checkOutAt && !item.gpsRestartRequired);
        if (!active) { send(res, 200, { monitoring: false, reason: 'no-active-shift' }); return; }
        const requests = await list('holiday_requests');
        const exempt = requests.some(item => item.userId === user.uid && ['pending','approved'].includes(String(item.status)) && String(item.startDate) <= workDate && String(item.endDate) >= workDate);
        if (exempt) { send(res, 200, { monitoring: false, reason: 'holiday-exempt' }); return; }
        const startedAt = active.gpsIssueStartedAt || now();
        if (!active.gpsIssueStartedAt) {
          await db.collection('attendance').doc(active.id).update({ gpsIssueStartedAt: startedAt, gpsStatus: 'grace-period', gpsIssueReason: clean(body.reason, 160) || 'GPS signal unavailable', gpsReminderStage: 0 });
          await db.collection('staff_notifications').doc(active.id + '-gps-0').set({ recipientId: user.uid, type: 'gps-reminder', title: 'Turn your GPS back on', message: 'Your shift is still active. Turn GPS/location back on within 15 minutes to avoid automatic shift cancellation.', createdAt: startedAt, read: false, attendanceId: active.id }, { merge: true });
        }
        const deadlineAt = new Date(new Date(startedAt).getTime() + 15 * 60 * 1000).toISOString();
        send(res, 200, { monitoring: true, cancelled: false, startedAt, deadlineAt, remainingSeconds: Math.max(0, Math.ceil((new Date(deadlineAt).getTime() - Date.now()) / 1000)) }); return;
      }
      if (path === '/api/locations/history' && method === 'GET') {
        if (!allow(user, ['admin'], res)) return;
        const history = (await list('locations')).sort((a, b) => String(b.capturedAt || '').localeCompare(String(a.capturedAt || ''))).slice(0, 500);
        send(res, 200, { items: history }); return;
      }
      if (path === '/api/locations' && method === 'GET') {
        if (!allow(user, ['admin'], res)) return;
        const [locations, attendance] = await Promise.all([list('locations'), list('attendance')]), today = indiaDate();
        const activeIds = new Set(attendance.filter(item => item.workDate === today && !item.checkOutAt).map(item => String(item.userId)));
        const latest = new Map<string, Data>();
        for (const item of locations) if (activeIds.has(String(item.userId))) {
          const old = latest.get(String(item.userId));
          if (!old || String(item.capturedAt || '') > String(old.capturedAt || '')) latest.set(String(item.userId), item);
        }
        send(res, 200, { items: Array.from(latest.values()) }); return;
      }
      if (path === '/api/locations' && method === 'POST') {
        if (!allow(user, ['staff'], res)) return;
        const latitude = Number(body.latitude), longitude = Number(body.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) { send(res, 400, { error: 'A valid GPS location is required.' }); return; }
        const shifts = await list('attendance'), today = indiaDate();
        const active = shifts.find(item => item.userId === user.uid && item.workDate === today && !item.checkOutAt && !item.gpsRestartRequired);
        if (!active) { send(res, 403, { error: 'Location can be shared only during an active, authorized shift.' }); return; }

        // Save the point and clear the GPS grace timer in one transaction. This
        // prevents the scheduled 15-minute cancellation from racing a GPS restore.
        const locationRef = db.collection('locations').doc();
        const attendanceRef = db.collection('attendance').doc(active.id);
        const record = { userId: user.uid, displayName: user.displayName, latitude, longitude, accuracy: Math.min(Math.max(Number(body.accuracy) || 0, 0), 100000), capturedAt: now() };
        const outcome = await db.runTransaction(async transaction => {
          const latest = await transaction.get(attendanceRef);
          const current = latest.data();
          if (!latest.exists || !current || current.userId !== user.uid || current.workDate !== today || current.checkOutAt || current.gpsRestartRequired) {
            return { saved: false, restored: false, expired: false };
          }
          const issueStartedAt = current.gpsIssueStartedAt ? new Date(String(current.gpsIssueStartedAt)).getTime() : null;
          if (issueStartedAt !== null && gpsGracePeriodExpired(current.gpsIssueStartedAt)) {
            return { saved: false, restored: false, expired: true };
          }
          transaction.create(locationRef, record);
          if (issueStartedAt !== null) {
            const restoredAt = now();
            transaction.update(attendanceRef, {
              gpsIssueStartedAt: FieldValue.delete(),
              gpsStatus: 'active',
              gpsIssueReason: FieldValue.delete(),
              gpsReminderStage: FieldValue.delete(),
              gpsRestoredAt: restoredAt,
              shiftEvents: FieldValue.arrayUnion({ type: 'gps-restored', at: restoredAt })
            });
            return { saved: true, restored: true, expired: false };
          }
          return { saved: true, restored: false, expired: false };
        });

        if (outcome.expired) {
          send(res, 409, { error: 'The 15-minute GPS grace period has expired. Contact an administrator to restart your shift.' }); return;
        }
        if (!outcome.saved) {
          send(res, 403, { error: 'Location can be shared only during an active, authorized shift.' }); return;
        }
        if (outcome.restored) {
          const resolvedAt = now();
          const oldReminders = (await list('staff_notifications')).filter(item => item.attendanceId === active.id && String(item.type || '').startsWith('gps-'));
          await Promise.all(oldReminders.map(item => db.collection('staff_notifications').doc(item.id).update({ read: true, resolvedAt })));
          await db.collection('staff_notifications').add({ recipientId: user.uid, recipientRole: 'staff', type: 'gps-restored', title: 'GPS restored', message: 'Your location is back on. Your shift continues normally.', createdAt: resolvedAt, read: false, attendanceId: active.id });
        }
        send(res, 201, { id: locationRef.id, saved: true, gpsRestored: outcome.restored }); return;
      }

      if (path === '/api/push-tokens' && method === 'POST') {
        const token = clean(body.token, 4096);
        if (token.length < 20) { send(res, 400, { error: 'A valid device push token is required.' }); return; }
        const tokenId = createHash('sha256').update(token).digest('hex');
        const tokenRef = db.collection('push_tokens').doc(tokenId);
        if (body.action === 'unregister') {
          const existing = await tokenRef.get();
          if (existing.exists && existing.data()?.userId === user.uid) await tokenRef.delete();
          send(res, 200, { unregistered: true }); return;
        }
        const existing = await tokenRef.get();
        await tokenRef.set({
          userId: user.uid,
          token,
          platform: clean(body.platform, 20) || 'android',
          createdAt: existing.exists ? existing.data()?.createdAt || now() : now(),
          updatedAt: now()
        }, { merge: true });
        send(res, 201, { registered: true }); return;
      }

      if (path === '/api/notifications' && method === 'GET') {
        const all = await list('staff_notifications');
        const items = all.filter(item => item.recipientId === user.uid || (user.role === 'admin' && item.recipientRole === 'admin')).sort((a,b) => String(b.createdAt||'').localeCompare(String(a.createdAt||''))).slice(0,100);
        send(res,200,{items}); return;
      }
      if (path.startsWith('/api/notifications/') && method === 'PUT') {
        const id = routeId(path,'/api/notifications'), item = await getDoc('staff_notifications',id);
        if (!item || (item.recipientId !== user.uid && !(user.role === 'admin' && item.recipientRole === 'admin'))) { send(res,404,{error:'Notification not found.'}); return; }
        await db.collection('staff_notifications').doc(id).update({ read: true, readAt: now() });
        send(res,200,{updated:true}); return;
      }
      if (path === '/api/announcements' && method === 'GET') {
        const items = (await list('announcements')).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        send(res, 200, { items }); return;
      }
      if (path === '/api/announcements' && method === 'POST') {
        if (!allow(user, ['admin'], res)) return;
        const title = clean(body.title, 120), message = clean(body.message, 2000);
        if (!title || !message) { send(res, 400, { error: 'Enter an announcement title and message.' }); return; }
        const record = { title, message, createdAt: now(), createdBy: user.uid, createdByName: user.displayName };
        const ref = await db.collection('announcements').add(record);
        const recipients = (await list('users')).filter(member => member.active === true && ['staff','admin'].includes(String(member.role)));
        await Promise.all(recipients.map(member => db.collection('staff_notifications').add({ recipientId: member.id, recipientRole: member.role, type: 'announcement', title, message: message.slice(0, 180), createdAt: now(), read: false, relatedId: ref.id })));
        await audit(user, 'CREATE', 'announcement', ref.id, 'Published announcement: ' + title);
        send(res, 201, { id: ref.id, ...record }); return;
      }
      if (path.startsWith('/api/announcements/') && method === 'DELETE') {
        if (!allow(user, ['admin'], res)) return;
        const id = routeId(path, '/api/announcements'), existing = await getDoc('announcements', id);
        if (!existing) { send(res, 404, { error: 'Announcement not found.' }); return; }
        await db.collection('announcements').doc(id).delete();
        await audit(user, 'DELETE', 'announcement', id, 'Deleted announcement');
        send(res, 200, { deleted: true }); return;
      }
      if (path === '/api/messages' && method === 'GET') {
        const all = await list('messages');
        const items = user.role === 'admin' ? all : all.filter(item => item.senderId === user.uid || item.recipientId === user.uid);
        send(res, 200, { items: items.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))) }); return;
      }
      if (path === '/api/messages' && method === 'POST') {
        const message = clean(body.message, 1500), recipientId = user.role === 'admin' ? clean(body.recipientId, 128) : 'admin-primary';
        if (!message) { send(res, 400, { error: 'Write a message before sending.' }); return; }
        let recipientName = 'K&B Administrator';
        if (user.role === 'admin') {
          const recipient = await staffFor(recipientId);
          if (!recipient || recipient.role !== 'staff' || recipient.active !== true) { send(res, 400, { error: 'Choose an active staff member.' }); return; }
          recipientName = clean(recipient.displayName, 80);
        }
        const record = { senderId: user.uid, senderName: user.displayName, recipientId, recipientName, message, createdAt: now() };
        const ref = await db.collection('messages').add(record);
        const notificationRecipients = user.role === 'admin'
          ? [{ id: recipientId, role: 'staff' }]
          : (await list('users')).filter(member => member.active === true && member.role === 'admin').map(member => ({ id: member.id, role: 'admin' }));
        await Promise.all(notificationRecipients.map(recipient => db.collection('staff_notifications').add({ recipientId: recipient.id, recipientRole: recipient.role, type: 'direct-message', title: 'New message from ' + user.displayName, message: message.slice(0, 180), createdAt: now(), read: false, relatedId: ref.id })));
        send(res, 201, { id: ref.id, ...record }); return;
      }
      if (path.startsWith('/api/messages/') && method === 'DELETE') {
        if (!allow(user, ['admin'], res)) return;
        const id = routeId(path, '/api/messages'), existing = await getDoc('messages', id);
        if (!existing) { send(res, 404, { error: 'Message not found.' }); return; }
        await db.collection('messages').doc(id).delete();
        send(res, 200, { deleted: true }); return;
      }
      if (path === '/api/groups' && method === 'GET') {
        const all = await list('chat_groups');
        const items = user.role === 'admin' ? all : all.filter(group => Array.isArray(group.memberIds) && group.memberIds.includes(user.uid));
        send(res, 200, { items: items.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))) }); return;
      }
      if (path === '/api/groups' && method === 'POST') {
        if (!allow(user, ['admin'], res)) return;
        const name = clean(body.name, 60);
        const ids: string[] = Array.isArray(body.memberIds) ? Array.from(new Set(body.memberIds.filter((value: unknown) => typeof value === 'string' && value.length > 0))).slice(0, 100) as string[] : [];
        if (!name || !ids.length) { send(res, 400, { error: 'Enter a group name and select at least one staff member.' }); return; }
        const docs = await Promise.all(ids.map(id => staffFor(id)));
        const members = docs.filter((member): member is Data => !!member && member.role === 'staff' && member.active === true);
        if (members.length !== ids.length) { send(res, 400, { error: 'One or more selected staff accounts are unavailable. Refresh the staff list.' }); return; }
        const record = { name, memberIds: [user.uid, ...ids], memberNames: [user.displayName, ...members.map(member => clean(member.displayName, 80))], createdAt: now(), createdBy: user.uid, createdByName: user.displayName };
        const ref = await db.collection('chat_groups').add(record);
        send(res, 201, { id: ref.id, ...record }); return;
      }
      if (path.startsWith('/api/groups/')) {
        const parts = path.split('/').filter(Boolean), groupId = decodeURIComponent(parts[2] || ''), group = await getDoc('chat_groups', groupId);
        if (!group) { send(res, 404, { error: 'Group not found.' }); return; }
        if (parts.length === 3 && method === 'DELETE') {
          if (!allow(user, ['admin'], res)) return;
          const messages = (await list('group_messages')).filter(item => item.groupId === groupId);
          const batch = db.batch();
          for (const item of messages) batch.delete(db.collection('group_messages').doc(item.id));
          if (messages.length) await batch.commit();
          await db.collection('chat_groups').doc(groupId).delete();
          send(res, 200, { deleted: true }); return;
        }
        if (user.role !== 'admin' && !(Array.isArray(group.memberIds) && group.memberIds.includes(user.uid))) { send(res, 403, { error: 'You are not a member of this group.' }); return; }
        if (parts[3] === 'messages' && parts.length === 4 && method === 'GET') {
          const items = (await list('group_messages')).filter(item => item.groupId === groupId).sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
          send(res, 200, { items }); return;
        }
        if (parts[3] === 'messages' && parts.length === 4 && method === 'POST') {
          const message = clean(body.message, 1500);
          if (!message) { send(res, 400, { error: 'Write a message before sending.' }); return; }
          const record = { groupId, senderId: user.uid, senderName: user.displayName, message, createdAt: now() };
          const ref = await db.collection('group_messages').add(record);
          const memberIds = (Array.isArray(group.memberIds) ? group.memberIds : []).filter((id: string) => id !== user.uid);
          const memberProfiles = await Promise.all(memberIds.map((id: string) => staffFor(id)));
          const recipients = memberProfiles.filter((member): member is Data => !!member && member.active === true && ['staff','admin'].includes(String(member.role)));
          await Promise.all(recipients.map(member => db.collection('staff_notifications').add({ recipientId: member.id, recipientRole: member.role, type: 'group-message', title: 'New group message · ' + clean(group.name, 60), message: message.slice(0, 180), createdAt: now(), read: false, relatedId: ref.id })));
          send(res, 201, { id: ref.id, ...record }); return;
        }
        if (parts[3] === 'messages' && parts.length === 5 && method === 'DELETE') {
          if (!allow(user, ['admin'], res)) return;
          const id = decodeURIComponent(parts[4]), message = await getDoc('group_messages', id);
          if (!message || message.groupId !== groupId) { send(res, 404, { error: 'Group message not found.' }); return; }
          await db.collection('group_messages').doc(id).delete();
          send(res, 200, { deleted: true }); return;
        }
      }

      if (path === '/api/payroll' && method === 'GET') {
        if (!allow(user, ['admin'], res)) return;
        const period = clean(req.query.period, 7);
        if (!monthPattern.test(period) || Number(period.slice(5, 7)) < 1 || Number(period.slice(5, 7)) > 12) { send(res, 400, { error: 'Select a valid payroll month.' }); return; }
        const items = (await list('payroll')).filter(item => item.period === period).sort((a, b) => String(a.staffName || '').localeCompare(String(b.staffName || '')));
        send(res, 200, { items }); return;
      }
      if (path === '/api/payroll' && method === 'POST') {
        if (!allow(user, ['admin'], res)) return;
        const staffUserId = clean(body.staffUserId, 128), period = clean(body.period, 7);
        const amount = money(body.amount), paidAt = clean(body.paidAt, 10), methodName = clean(body.method, 40);
        const member = staffUserId ? await staffFor(staffUserId) : null;
        if (!member || member.role !== 'staff' || member.active !== true) { send(res, 400, { error: 'Choose an active staff member.' }); return; }
        if (!monthPattern.test(period) || Number(period.slice(5, 7)) < 1 || Number(period.slice(5, 7)) > 12 || !isValidDateKey(paidAt) || paidAt.slice(0, 7) !== period || !validMoney(amount) || amount <= 0 || !methodName) {
          send(res, 400, { error: 'Enter a valid payroll month, payment date, amount and payment method.' }); return;
        }
        const key = staffUserId + '|' + period;
        const id = 'pay-' + createHash('sha256').update(key).digest('hex').slice(0, 32);
        const payrollRef = db.collection('payroll').doc(id);
        const expenseRef = db.collection('expenses').doc('salary-' + id);
        const createdAt = now();
        const record = { staffUserId, staffName: clean(member.displayName, 80), period, amount, paidAt, method: methodName, notes: clean(body.notes, 300), createdBy: user.uid, createdByName: user.displayName, createdAt };
        const expense = { title: 'Salary - ' + record.staffName + ' (' + period + ')', category: 'Salary', amount, spentAt: paidAt, method: methodName, notes: record.notes, createdBy: user.uid, createdByName: user.displayName, createdAt, payrollId: id, staffUserId };
        const created = await db.runTransaction(async transaction => {
          const existing = await transaction.get(payrollRef);
          const existingExpense = await transaction.get(expenseRef);
          if (existing.exists || existingExpense.exists) return false;
          transaction.create(payrollRef, record);
          transaction.create(expenseRef, expense);
          return true;
        });
        if (!created) { send(res, 409, { error: 'Salary is already recorded for this staff member and month.' }); return; }
        await audit(user, 'CREATE', 'payroll', id, 'Recorded salary of ₹' + amount + ' for ' + record.staffName + ' (' + period + ')');
        send(res, 201, { id, ...record }); return;
      }

      if (path === '/api/expenses' && method === 'GET') {
        if (!allow(user, ['admin'], res)) return;
        const items = (await list('expenses')).sort((a, b) => String(b.spentAt || '').localeCompare(String(a.spentAt || '')));
        send(res, 200, { items }); return;
      }
      if (path === '/api/expenses' && method === 'POST') {
        if (!allow(user, ['admin'], res)) return;
        const title = clean(body.title, 120), category = clean(body.category, 60), amount = money(body.amount), spentAt = clean(body.spentAt, 10), methodName = clean(body.method, 40);
        if (!title || !category || !validMoney(amount) || amount <= 0 || !datePattern.test(spentAt) || !methodName) { send(res, 400, { error: 'Enter a valid expense title, category, amount, date and payment method.' }); return; }
        const record = { title, category, amount, spentAt, method: methodName, notes: clean(body.notes, 300), createdBy: user.uid, createdByName: user.displayName, createdAt: now() };
        const ref = await db.collection('expenses').add(record);
        await audit(user, 'CREATE', 'expense', ref.id, 'Recorded ' + category + ' expense of ₹' + amount);
        send(res, 201, { id: ref.id, ...record }); return;
      }
      if (path.startsWith('/api/expenses/') && method === 'DELETE') {
        if (!allow(user, ['admin'], res)) return;
        const id = routeId(path, '/api/expenses'), item = await getDoc('expenses', id);
        if (!item) { send(res, 404, { error: 'Expense not found.' }); return; }
        // Payroll creates a linked expense entry as part of the same transaction.
        // Do not let the general cash-book delete action orphan a salary payment.
        if (item.payrollId) {
          send(res, 409, { error: 'This expense is linked to a staff salary record. Salary ledger entries cannot be deleted from the general expense list.' });
          return;
        }
        await db.collection('expenses').doc(id).delete();
        await audit(user, 'DELETE', 'expense', id, 'Deleted expense: ' + String(item.title || 'Expense'));
        send(res, 200, { deleted: true }); return;
      }
      if (path === '/api/invoices' && method === 'GET') {
        if (!allow(user, ['admin'], res)) return;
        const period = clean(req.query.period, 7);
        if (!monthPattern.test(period)) { send(res, 400, { error: 'Select a valid billing month.' }); return; }
        const [invoiceItems, payments] = await Promise.all([list('invoices'), list('payments')]);
        const monthLabel = new Date(period + '-01T12:00:00').toLocaleString('en-IN', { month: 'long', year: 'numeric' });
        const items = invoiceItems.filter(item => item.period === period).map(item => {
          const paidAmount = payments.filter(payment => payment.customerId === item.customerId && (payment.month === monthLabel || String(payment.paidAt || '').slice(0, 7) === period)).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
          const amount = Number(item.amount || 0);
          return { ...item, paidAmount: item.voidedAt ? 0 : paidAmount, status: item.voidedAt ? 'Void' : paidAmount >= amount ? 'Paid' : paidAmount > 0 ? 'Partially paid' : 'Unpaid' };
        });
        send(res, 200, { items }); return;
      }
      if (path === '/api/invoices/generate' && method === 'POST') {
        if (!allow(user, ['admin'], res)) return;
        const period = clean(body.period, 7);
        if (!monthPattern.test(period)) { send(res, 400, { error: 'Select a valid billing month.' }); return; }
        const [customers, invoices] = await Promise.all([list('customers'), list('invoices')]);
        const existing = new Set(invoices.map(item => String(item.customerId) + '|' + String(item.period)));
        const active = customers.filter(customer => customer.status === 'Active');
        let created = 0;
        for (const customer of active) {
          const key = String(customer.id) + '|' + period;
          if (existing.has(key)) continue;
          const [year, month] = period.split('-').map(Number);
          const dueDay = datePattern.test(String(customer.dueDate || '')) ? Number(String(customer.dueDate).slice(-2)) : 10;
          const dueDate = period + '-' + String(Math.min(Math.max(dueDay, 1), new Date(year, month, 0).getDate())).padStart(2, '0');
          const id = 'inv-' + Buffer.from(key).toString('base64url').slice(0, 32);
          await db.collection('invoices').doc(id).create({ customerId: customer.id, customerName: customer.name, period, dueDate, amount: Number(customer.monthlyFee || 0), createdAt: now(), createdBy: user.uid });
          created++;
        }
        await audit(user, 'GENERATE', 'invoice_batch', period, 'Generated ' + created + ' monthly invoices for ' + period);
        send(res, 200, { created, skippedExisting: Math.max(0, active.length - created) }); return;
      }
      if (path.startsWith('/api/invoices/') && path.endsWith('/void') && method === 'PUT') {
        if (!allow(user, ['admin'], res)) return;
        const id = decodeURIComponent(path.slice('/api/invoices/'.length, -'/void'.length)), invoice = await getDoc('invoices', id);
        if (!invoice) { send(res, 404, { error: 'Invoice not found.' }); return; }
        await db.collection('invoices').doc(id).update({ voidedAt: now(), voidedBy: user.uid });
        await audit(user, 'VOID', 'invoice', id, 'Voided invoice for ' + String(invoice.customerName || 'customer') + ' (' + String(invoice.period || '') + ')');
        send(res, 200, { voided: true }); return;
      }
      if (path === '/api/audit' && method === 'GET') {
        if (!allow(user, ['admin'], res)) return;
        const items = (await list('audit_logs')).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, 300);
        send(res, 200, { items }); return;
      }
      if (path === '/api/visits' && method === 'GET') {
        const items = await list('visits');
        send(res, 200, { items: user.role === 'admin' ? items : items.filter(item => item.staffId === user.uid) }); return;
      }
      if (path === '/api/visits' && method === 'POST') {
        if (!allow(user, ['staff'], res)) return;
        const customerId = clean(body.customerId, 128), customer = await getDoc('customers', customerId);
        if (!customer) { send(res, 404, { error: 'Customer not found.' }); return; }
        if (customer.assignedTo !== user.uid) { send(res, 403, { error: 'You can record visits only for your assigned customers.' }); return; }
        const purpose = clean(body.purpose, 120);
        if (!purpose) { send(res, 400, { error: 'Enter the visit purpose.' }); return; }
        const record = { customerId, customerName: customer.name, purpose, notes: clean(body.notes, 1200), visitedAt: clean(body.visitedAt, 40) || now(), staffId: user.uid, staffName: user.displayName };
        const ref = await db.collection('visits').add(record);
        send(res, 201, { id: ref.id, ...record }); return;
      }
      if (path.startsWith('/api/visits/') && method === 'DELETE') {
        if (!allow(user, ['admin'], res)) return;
        const id = routeId(path, '/api/visits'), visit = await getDoc('visits', id);
        if (!visit) { send(res, 404, { error: 'Visit record not found.' }); return; }
        await db.collection('visits').doc(id).delete();
        await audit(user, 'DELETE', 'visit', id, 'Deleted field visit for ' + String(visit.customerName || 'customer'));
        send(res, 200, { deleted: true }); return;
      }

      if (path === '/api/subscriptions' && method === 'GET') {
        const subscriptions = await list('subscriptions');
        if (user.role === 'admin') {
          send(res, 200, { items: subscriptions.sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || ''))) }); return;
        }
        const customers = await list('customers');
        const assignedCustomerIds = new Set(customers.filter(item => item.assignedTo === user.uid).map(item => item.id));
        send(res, 200, { items: subscriptions.filter(item => assignedCustomerIds.has(String(item.customerId))).sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || ''))) }); return;
      }
      if (path === '/api/subscriptions' && method === 'POST') {
        if (!allow(user, ['admin', 'staff'], res)) return;
        const customerId = clean(body.customerId, 128), customer = await getDoc('customers', customerId);
        const plan = clean(body.plan, 100), startDate = clean(body.startDate, 10), endDate = clean(body.endDate, 10);
        const amount = money(body.amount), paymentStatus = body.paymentStatus === 'Paid' ? 'Paid' : 'Pending';
        const paidAt = clean(body.paidAt, 10), paymentMethod = clean(body.paymentMethod, 40);
        if (!customer || !plan || !isValidDateRange(startDate, endDate) || !validMoney(amount) || amount <= 0) {
          send(res, 400, { error: 'Choose a customer and plan, enter valid start/end dates and a renewal amount.' }); return;
        }
        if (user.role === 'staff' && customer.assignedTo !== user.uid) {
          send(res, 403, { error: 'You can renew only customers assigned to you.' }); return;
        }
        if (paymentStatus === 'Paid' && (!isValidDateKey(paidAt) || !paymentMethod)) {
          send(res, 400, { error: 'A paid renewal needs a valid payment date and payment method.' }); return;
        }
        const subscriptionRef = db.collection('subscriptions').doc();
        const paymentRef = paymentStatus === 'Paid' ? db.collection('payments').doc() : null;
        const createdAt = now();
        const record = {
          customerId, customerName: clean(customer.name, 100), plan, startDate, endDate, amount,
          status: 'Active', paymentStatus, createdAt, createdBy: user.uid, createdByName: user.displayName,
          paidAt: paymentStatus === 'Paid' ? paidAt : '', paymentMethod: paymentStatus === 'Paid' ? paymentMethod : ''
        };
        await db.runTransaction(async transaction => {
          const customerRef = db.collection('customers').doc(customerId);
          const subscriptionQuery = db.collection('subscriptions').where('customerId', '==', customerId);
          const [latestCustomer, existingSubscriptions] = await Promise.all([
            transaction.get(customerRef),
            transaction.get(subscriptionQuery)
          ]);
          if (!latestCustomer.exists) throw new Error('Customer no longer exists.');
          if (hasOverlappingSubscription(existingSubscriptions.docs.map(document => document.data()), startDate, endDate)) {
            const overlapError = new Error('This renewal overlaps an existing active subscription. Check the current expiry date first.') as Error & { code: string };
            overlapError.code = 'subscription/overlap';
            throw overlapError;
          }
          transaction.create(subscriptionRef, record);
          const currentDueDate = String(latestCustomer.data()?.dueDate || '');
          const customerPatch: Data = { plan, updatedAt: createdAt };
          if (!currentDueDate || endDate >= currentDueDate) customerPatch.dueDate = endDate;
          transaction.update(customerRef, customerPatch);
          if (paymentRef) transaction.create(paymentRef, {
            customerId, customerName: clean(customer.name, 100), amount, method: paymentMethod, paidAt,
            month: paidAt.slice(0, 7), recordedBy: user.uid, recordedByName: user.displayName,
            createdAt, subscriptionId: subscriptionRef.id
          });
        });
        await audit(user, 'CREATE', 'subscription', subscriptionRef.id, 'Created ' + plan + ' renewal for ' + clean(customer.name, 100));
        send(res, 201, { id: subscriptionRef.id, ...record, paymentId: paymentRef?.id || null }); return;
      }
      if (path.startsWith('/api/subscriptions/')) {
        if (!allow(user, ['admin'], res)) return;
        const id = routeId(path, '/api/subscriptions'), existing = await getDoc('subscriptions', id);
        if (!existing) { send(res, 404, { error: 'Subscription not found.' }); return; }
        if (method === 'PUT') {
          const status = clean(body.status, 20);
          if (!['Active', 'Pending', 'Expired', 'Cancelled'].includes(status)) {
            send(res, 400, { error: 'Choose Active, Pending, Expired or Cancelled.' }); return;
          }
          await db.collection('subscriptions').doc(id).update({ status, notes: clean(body.notes, 500), updatedAt: now(), updatedBy: user.uid });
          await audit(user, 'UPDATE', 'subscription', id, 'Changed renewal status to ' + status);
          send(res, 200, { updated: true }); return;
        }
        if (method === 'DELETE') {
          send(res, 405, { error: 'Renewal history is preserved. Change the status to Cancelled instead.' }); return;
        }
      }

      send(res,404,{error:'This API route was not found.'});
    } catch (error: any) {
      logger.error('API request failed', { message: error?.message || String(error) });
      if (error?.code === 'subscription/overlap') { send(res, 409, { error: error.message }); return; }
      if (error?.code === 'auth/email-already-exists') { send(res,409,{error:'That staff ID is already in use.'}); return; }
      if (error?.code === 'auth/invalid-password') { send(res,400,{error:'Password must contain at least 10 characters.'}); return; }
      send(res,500,{error:'Something went wrong. Please try again.'});
    }
  },
);
export const enforceGpsGracePeriod = onSchedule({ schedule: 'every 1 minutes', timeZone: 'Asia/Kolkata', region: 'asia-south1' }, async () => {
  const records = await list('attendance');
  const requests = await list('holiday_requests');
  const currentTime = Date.now();
  for (const item of records) {
    if (!item.gpsIssueStartedAt || item.checkOutAt || item.gpsRestartRequired) continue;
    const issueTime = new Date(item.gpsIssueStartedAt).getTime();
    if (!Number.isFinite(issueTime)) continue;
    const elapsed = currentTime - issueTime;
    const exempt = requests.some(request => request.userId === item.userId && ['pending','approved'].includes(String(request.status)) && String(request.startDate) <= String(item.workDate) && String(request.endDate) >= String(item.workDate));
    if (exempt) continue;
    const reminderStages = [{ minute: 5, stage: 1, message: 'GPS is still unavailable. Please turn it back on within 10 minutes.' }, { minute: 10, stage: 2, message: 'Only 5 minutes remain. Turn GPS/location back on to keep your shift active.' }, { minute: 14, stage: 3, message: 'Final reminder: your shift will be cancelled in about 1 minute if GPS is not restored.' }];
    const attendanceRef = db.collection('attendance').doc(item.id);
    for (const reminder of reminderStages) {
      if (elapsed < reminder.minute * 60000) continue;
      const notificationRef = db.collection('staff_notifications').doc(item.id + '-gps-' + reminder.stage);
      const reminderAt = now();
      const didNotify = await db.runTransaction(async transaction => {
        const latest = await transaction.get(attendanceRef);
        const current = latest.data();
        const currentIssueTime = new Date(String(current?.gpsIssueStartedAt || '')).getTime();
        if (!latest.exists || !current || !current.gpsIssueStartedAt || current.gpsIssueStartedAt !== item.gpsIssueStartedAt || current.checkOutAt || current.gpsRestartRequired || !Number.isFinite(currentIssueTime) || Date.now() - currentIssueTime < reminder.minute * 60000 || Number(current.gpsReminderStage || 0) >= reminder.stage) return false;
        transaction.update(attendanceRef, { gpsReminderStage: reminder.stage });
        transaction.set(notificationRef, { recipientId: item.userId, recipientRole: 'staff', type: 'gps-reminder', title: 'GPS reminder', message: reminder.message, createdAt: reminderAt, read: false, attendanceId: item.id }, { merge: true });
        return true;
      });
      if (!didNotify) continue;
    }
    if (elapsed >= 15 * 60000) {
      const cancelledAt = now();
      const cancellationNotificationRef = db.collection('staff_notifications').doc(item.id + '-gps-cancelled');
      const cancellationAuditRef = db.collection('audit_logs').doc('gps-cancelled-' + item.id);
      const didCancel = await db.runTransaction(async transaction => {
        const latest = await transaction.get(attendanceRef);
        const current = latest.data();
        const currentIssueTime = new Date(String(current?.gpsIssueStartedAt || '')).getTime();
        if (!latest.exists || !current || !current.gpsIssueStartedAt || current.checkOutAt || current.gpsRestartRequired || !Number.isFinite(currentIssueTime) || Date.now() - currentIssueTime < 15 * 60000) return false;
        transaction.update(attendanceRef, { checkOutAt: cancelledAt, status: 'Cancelled - GPS unavailable', gpsStatus: 'disabled', gpsCancelled: true, gpsRestartRequired: true, gpsCancelledAt: cancelledAt, gpsCancellationReason: current.gpsIssueReason || 'GPS was not restored within 15 minutes', shiftEvents: FieldValue.arrayUnion({ type: 'gps-cancelled', at: cancelledAt, reason: 'GPS was not restored within 15 minutes' }) });
        transaction.set(cancellationNotificationRef, { recipientId: item.userId, recipientRole: 'staff', type: 'gps-cancelled', title: 'Shift cancelled', message: 'Your shift was cancelled because GPS was not restored within 15 minutes. Contact an admin to restart it.', createdAt: cancelledAt, read: false, attendanceId: item.id }, { merge: true });
        transaction.set(cancellationAuditRef, { actorId: 'system', actorName: 'K&B Attendance Monitor', action: 'GPS_CANCEL_SHIFT', entityType: 'attendance', entityId: item.id, description: 'Automatically cancelled shift after the 15-minute GPS grace period', createdAt: cancelledAt, serverCreatedAt: FieldValue.serverTimestamp() }, { merge: true });
        return true;
      });
      if (!didCancel) continue;

    }
  }
});


// Send each assigned worker one reminder when a task is due tomorrow and one
// overdue reminder if it remains incomplete. Deterministic document IDs make
// repeated scheduler invocations safe.
export const sendTaskDueReminders = onSchedule({ schedule: '0 9 * * *', timeZone: 'Asia/Kolkata', region: 'asia-south1' }, async () => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const [year, month, day] = today.split('-').map(Number);
  const tomorrow = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
  const tasks = await list('tasks');

  for (const task of tasks) {
    const dueDate = String(task.dueDate || '');
    const assignedTo = String(task.assignedTo || '');
    if (!task.id || !assignedTo || !isValidDateKey(dueDate) || task.status === 'Completed') continue;

    const reminderKind = taskReminderKind(dueDate, today, tomorrow);
    if (!reminderKind) continue;

    const notificationId = 'task-reminder-' + String(task.id) + '-' + reminderKind + '-' + dueDate;
    const notificationRef = db.collection('staff_notifications').doc(notificationId);
    const createdAt = now();
    await db.runTransaction(async transaction => {
      const existing = await transaction.get(notificationRef);
      if (existing.exists) return;
      const title = reminderKind === 'upcoming' ? 'Task due tomorrow' : reminderKind === 'due-today' ? 'Task due today' : 'Task overdue';
      const message = reminderKind === 'upcoming'
        ? String(task.title || 'Assigned task') + ' is due tomorrow (' + dueDate + ').'
        : reminderKind === 'due-today'
          ? String(task.title || 'Assigned task') + ' is due today (' + dueDate + ').'
          : String(task.title || 'Assigned task') + ' was due on ' + dueDate + ' and is still incomplete.';
      transaction.create(notificationRef, {
        recipientId: assignedTo,
        recipientRole: 'staff',
        type: reminderKind === 'overdue' ? 'task-overdue' : 'task-reminder',
        title,
        message,
        createdAt,
        read: false,
        relatedId: String(task.id)
      });
    });
  }
});


// Every server-created staff notification is also delivered through FCM to
// that user's registered devices. Message previews are intentionally omitted
// from lock-screen push payloads for privacy.
export const deliverStaffPushNotifications = onDocumentCreated({ document: 'staff_notifications/{notificationId}', region: 'asia-south1' }, async event => {
  const notification = event.data?.data();
  const recipientId = String(notification?.recipientId || '');
  if (!recipientId) return;

  const tokenSnapshot = await db.collection('push_tokens').where('userId', '==', recipientId).limit(500).get();
  if (tokenSnapshot.empty) return;

  const tokenDocs = tokenSnapshot.docs;
  const tokens = tokenDocs.map(doc => String(doc.data().token || '')).filter(Boolean);
  if (!tokens.length) return;

  const type = String(notification?.type || '');
  const title = String(notification?.title || 'K&B Management Nexus').slice(0, 120);
  const body = ['direct-message', 'group-message'].includes(type)
    ? 'You have a new message. Open K&B Management Nexus to view it.'
    : String(notification?.message || 'You have a new update.').slice(0, 180);

  const response = await getMessaging().sendEachForMulticast({
    tokens,
    notification: { title, body },
    data: {
      notificationId: String(event.params.notificationId),
      type,
      relatedId: String(notification?.relatedId || '')
    },
    android: { priority: 'high' }
  });

  const staleTokenDeletes: Promise<unknown>[] = [];
  response.responses.forEach((result, index) => {
    if (!result.success && ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(String(result.error?.code || ''))) {
      const matchingDoc = tokenDocs.find(doc => doc.data().token === tokens[index]);
      if (matchingDoc) staleTokenDeletes.push(matchingDoc.ref.delete());
    }
  });
  if (staleTokenDeletes.length) await Promise.all(staleTokenDeletes);
  logger.info('Push notification delivery attempted', {
    notificationId: event.params.notificationId,
    recipientId,
    successCount: response.successCount,
    failureCount: response.failureCount
  });
});
