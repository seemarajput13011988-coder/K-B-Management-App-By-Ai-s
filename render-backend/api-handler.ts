import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { buildCustomerLedger, hasOverlappingSubscription, hasAdminManagementAccess, isValidDateKey, isValidDateRange, routePath, subscriptionExpiryKind, taskReminderKind, isSixMonthReviewDue } from './route-path.js';

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '';
if (!serviceAccountJson) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is required on the Render backend.');
const serviceAccount = JSON.parse(serviceAccountJson);
if (serviceAccount.project_id !== 'kandb-net-sevice') throw new Error('Firebase service account must belong to project kandb-net-sevice.');
initializeApp({ credential: cert(serviceAccount), projectId: 'kandb-net-sevice' });
const db = getFirestore();

type Role = 'admin' | 'staff';
type AppUser = { uid: string; id: string; userId: string; displayName: string; role: Role; active: boolean; authTime: number; canManageAdmins?: boolean; salt: string; passwordHash: string };
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

const hashPassword = (password: string, salt: string) => scryptSync(password, salt, 64).toString('hex');
const equalSecret = (a: string, b: string) => {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
const newPasswordFields = (password: string) => {
  const salt = randomBytes(16).toString('hex');
  return { salt, passwordHash: hashPassword(password, salt) };
};
const sessionTokenId = (token: string) => createHash('sha256').update(token).digest('hex');
async function createSession(user: Data) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 8 * 60 * 60 * 1000;
  await db.collection('sessions').doc(sessionTokenId(token)).set({
    userId: user.id, expiresAt, createdAt: now(), authTime: Math.floor(Date.now() / 1000),
  });
  return { token, expiresAt };
}
async function revokeUserSessions(userId: string) {
  const sessions = await db.collection('sessions').where('userId', '==', userId).limit(500).get();
  if (sessions.empty) return;
  const batch = db.batch();
  sessions.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
}
async function requireUser(req: any): Promise<AppUser | null> {
  const header = clean(req.headers.authorization, 4096);
  const token = header.startsWith('Bearer ')
    ? header.slice(7)
    : clean(req.body?.sessionToken, 4096) || clean(req.query?.sessionToken, 4096);
  if (!token) return null;
  try {
    const sessionSnap = await db.collection('sessions').doc(sessionTokenId(token)).get();
    if (!sessionSnap.exists) return null;
    const session = sessionSnap.data()!;
    if (!Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now()) {
      await sessionSnap.ref.delete().catch(() => undefined);
      return null;
    }
    const snap = await db.collection('users').doc(String(session.userId)).get();
    if (!snap.exists) return null;
    const data = snap.data()!;
    if (data.active !== true || !['admin', 'staff'].includes(data.role)) return null;
    return {
      uid: snap.id, id: snap.id, userId: clean(data.userId, 40),
      displayName: clean(data.displayName, 80), role: data.role, active: true,
      authTime: Number(session.authTime || 0), salt: clean(data.salt, 128), passwordHash: clean(data.passwordHash, 256),
      canManageAdmins: hasAdminManagementAccess({ role: data.role, canManageAdmins: data.canManageAdmins, isSuperAdmin: data.isSuperAdmin }),
    };
  } catch { return null; }
}

function allow(user: AppUser, roles: Role[], res: any): boolean {
  if (!roles.includes(user.role)) { send(res, 403, { error: 'You do not have permission to perform this action.' }); return false; }
  return true;
}
function allowSuperAdmin(user: AppUser, res: any): boolean {
  if (user.canManageAdmins !== true) { send(res, 403, { error: 'Only the primary administrator account can create or manage administrator accounts.' }); return false; }
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
const RETENTION_REVIEW_COLLECTIONS: Record<string, string> = {
  customers: 'Customers',
  payments: 'Payments',
  invoices: 'Invoices',
  expenses: 'Expenses',
  subscriptions: 'Subscriptions',
  tasks: 'Tasks',
  attendance: 'Attendance',
  visits: 'Field visits',
  holiday_requests: 'Holiday requests',
};

function retentionCreatedAt(data: Data, createTime?: any): string {
  const raw = data.savedAt ?? data.createdAt ?? data.createdOn;
  if (raw && typeof raw.toDate === 'function') {
    const date = raw.toDate();
    if (date instanceof Date && Number.isFinite(date.getTime())) return date.toISOString();
  }
  if (typeof raw === 'string' && Number.isFinite(Date.parse(raw))) return new Date(raw).toISOString();
  const fallback = createTime && typeof createTime.toDate === 'function' ? createTime.toDate() : null;
  return fallback instanceof Date && Number.isFinite(fallback.getTime()) ? fallback.toISOString() : '';
}

function retentionRecordLabel(data: Data, id: string): string {
  for (const key of ['name', 'title', 'customerName', 'subject', 'itemName', 'sku', 'description']) {
    if (typeof data[key] === 'string' && data[key].trim()) return clean(data[key], 100);
  }
  return id;
}



export export async function apiHandler(req: any, res: any) {
    res.set('Cache-Control', 'no-store');
    const method = req.method.toUpperCase();
    const path = routePath(req.path);
    if (method === 'OPTIONS') { res.status(204).send(''); return; }
    if (method === 'GET' && path === '/api/_healthcheck') {
      send(res, 200, { message: 'Success', service: 'kandb-firebase-api' }); return;
    }

    if (method === 'POST' && path === '/api/auth/login') {
      const input: Data = req.body && typeof req.body === 'object' ? req.body : {};
      const userId = clean(input.userId, 40);
      const password = typeof input.password === 'string' ? input.password : '';
      if (!userId || !password) { send(res, 400, { error: 'Enter your user ID and password.' }); return; }
      const matches = (await list('users')).filter(item => String(item.userId || '').toLowerCase() === userId.toLowerCase());
      if (matches.length !== 1) { send(res, 401, { error: 'The user ID or password is incorrect.' }); return; }
      const userDoc = await db.collection('users').doc(String(matches[0].id)).get();
      if (!userDoc.exists) { send(res, 401, { error: 'The user ID or password is incorrect.' }); return; }
      const record = userDoc.data()!;
      if (record.active !== true || !['admin', 'staff'].includes(record.role) || !record.salt || !record.passwordHash ||
          !equalSecret(hashPassword(password, String(record.salt)), String(record.passwordHash))) {
        send(res, 401, { error: 'The user ID or password is incorrect, or this account needs an administrator password reset.' }); return;
      }
      const user = { id: userDoc.id, ...record };
      const session = await createSession(user);
      send(res, 200, { ...session, user: { id: userDoc.id, userId: clean(record.userId, 40), displayName: clean(record.displayName, 80), role: record.role, active: true, canManageAdmins: record.canManageAdmins === true } }); return;
    }

    if (method === 'POST' && path === '/api/auth/bootstrap-admin') {
      const input = req.body && typeof req.body === 'object' ? req.body : {};
      const bootstrapSecret = typeof input.bootstrapSecret === 'string' ? input.bootstrapSecret : '';
      const password = typeof input.password === 'string' ? input.password : '';
      const configuredSecret = (process.env.ADMIN_BOOTSTRAP_SECRET || '');
      if (!configuredSecret || !equalSecret(bootstrapSecret, configuredSecret)) {
        send(res, 401, { error: 'The one-time admin setup key is incorrect or has not been configured.' }); return;
      }
      if (password.length < 10) { send(res, 400, { error: 'Choose an admin password with at least 10 characters.' }); return; }
      const existing = await db.collection('users').where('role', '==', 'admin').limit(1).get();
      if (!existing.empty) { send(res, 409, { error: 'The admin account is already initialized. Use admin sign in.' }); return; }
      const fields = newPasswordFields(password);
      await db.collection('users').doc('admin-primary').set({
        userId: 'Brajraj', userIdLower: 'brajraj', displayName: 'Brajraj', role: 'admin',
        canManageAdmins: true, active: true, ...fields, createdAt: now(),
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
      const configuredCode = (process.env.ADMIN_RECOVERY_CODE || '');
      if (!configuredCode || !equalSecret(recoveryCode, configuredCode)) {
        send(res, 401, { error: 'The admin recovery code is incorrect or has not been configured.' }); return;
      }
      const admins = await db.collection('users').where('userId', '==', 'Brajraj').where('role', '==', 'admin').limit(1).get();
      if (admins.empty) { send(res, 404, { error: 'The admin account has not been set up yet.' }); return; }
      const adminDoc = admins.docs[0];
      await adminDoc.ref.update(newPasswordFields(newPassword));
      await revokeUserSessions(adminDoc.id);
      await audit({ uid: adminDoc.id, id: adminDoc.id, userId: 'Brajraj', displayName: 'Brajraj', role: 'admin', active: true, authTime: Math.floor(Date.now()/1000), salt:'', passwordHash:'' }, 'RECOVER_PASSWORD', 'admin', adminDoc.id, 'Admin password recovered');
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

      if (path === '/api/retention/review' && method === 'GET') {
        if (!allow(user, ['admin'], res)) return;
        const dueItems: Data[] = [];
        for (const [collection, label] of Object.entries(RETENTION_REVIEW_COLLECTIONS)) {
          const snapshot = await db.collection(collection).get();
          for (const doc of snapshot.docs) {
            const data = doc.data();
            const createdAt = retentionCreatedAt(data, doc.createTime);
            if (createdAt && isSixMonthReviewDue(createdAt)) {
              dueItems.push({ id: doc.id, collection, collectionLabel: label, label: retentionRecordLabel(data, doc.id), createdAt });
            }
          }
        }
        dueItems.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
        send(res, 200, { items: dueItems, count: dueItems.length }); return;
      }

      if (path === '/api/retention/review/delete' && method === 'POST') {
        if (!allow(user, ['admin'], res)) return;
        const collection = clean(body.collection, 80);
        const id = clean(body.id, 160);
        if (body.confirmDelete !== true) { send(res, 400, { error: 'Explicit administrator confirmation is required.' }); return; }
        if (!Object.prototype.hasOwnProperty.call(RETENTION_REVIEW_COLLECTIONS, collection) || !id) {
          send(res, 400, { error: 'This record cannot be deleted through retention review.' }); return;
        }
        const ref = db.collection(collection).doc(id);
        const record = await ref.get();
        if (!record.exists) { send(res, 404, { error: 'The record no longer exists.' }); return; }
        await ref.delete();
        await audit(user, 'RETENTION_DELETE', collection, id, 'Administrator confirmed deletion of ' + RETENTION_REVIEW_COLLECTIONS[collection] + ' record');
        send(res, 200, { deleted: true }); return;
      }

      if (method === 'POST' && path === '/api/auth/change-password') {
        const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
        const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
        if (newPassword.length < 10) { send(res, 400, { error: 'Choose a password with at least 10 characters.' }); return; }
        if (!user.authTime || Date.now() / 1000 - user.authTime > 300) {
          send(res, 401, { error: 'Please sign in again before changing your password.' }); return;
        }
        if (!user.salt || !user.passwordHash || !equalSecret(hashPassword(currentPassword, user.salt), user.passwordHash)) {
          send(res, 401, { error: 'Your current password is incorrect.' }); return;
        }
        await db.collection('users').doc(user.uid).update(newPasswordFields(newPassword));
        await revokeUserSessions(user.uid);
        send(res, 200, { changed: true }); return;
      }

      if (method === 'POST' && path === '/api/auth/change-user-id') {
        if (!user.authTime || Date.now() / 1000 - user.authTime > 300) {
          send(res, 401, { error: 'Please sign in again before changing your user ID.' }); return;
        }
        const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
        const userId = clean(body.userId, 32);
        if (!user.salt || !user.passwordHash || !equalSecret(hashPassword(currentPassword, user.salt), user.passwordHash)) {
          send(res, 401, { error: 'Your current password is incorrect.' }); return;
        }
        if (!/^[a-zA-Z0-9_-]{3,32}$/.test(userId)) {
          send(res, 400, { error: 'Use 3–32 letters, numbers, underscores or hyphens for the user ID.' }); return;
        }
        const existing = (await list('users')).some(item => item.id !== user.uid && String(item.userId).toLowerCase() === userId.toLowerCase());
        if (existing) { send(res, 409, { error: 'That user ID is already in use.' }); return; }
        await db.collection('users').doc(user.uid).update({ userId, userIdLower: userId.toLowerCase() });
        await revokeUserSessions(user.uid);
        await audit(user, 'CHANGE_USER_ID', user.role, user.uid, 'Changed own user ID');
        send(res, 200, { changed: true, userId }); return;
      }
      if (method === 'GET' && path === '/api/auth/me') {
        send(res, 200, { user: { id: user.uid, userId: user.userId, displayName: user.displayName, role: user.role, active: true, canManageAdmins: user.canManageAdmins === true } }); return;
      }
      if (method === 'POST' && path === '/api/auth/logout') { send(res, 200, { ok: true }); return; }

      // Only the original primary administrator account may manage administrator accounts.
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
        if (!/^[a-zA-Z0-9_-]{3,32}$/.test(userId) || userId.toLowerCase() === 'brajraj' || !displayName || password.length < 8) {
          send(res, 400, { error: 'Enter a unique admin ID, name and password with at least 8 characters.' }); return;
        }
        const existing = (await list('users')).some(item => String(item.userId).toLowerCase() === userId.toLowerCase());
        if (existing) { send(res, 409, { error: 'That account ID is already in use.' }); return; }
        const accountId = 'admin-' + randomBytes(10).toString('hex');
        const record = { userId, userIdLower: userId.toLowerCase(), displayName, role: 'admin', canManageAdmins: false, active: true, ...newPasswordFields(password), createdAt: now(), createdBy: user.uid };
        await db.collection('users').doc(accountId).set(record);
        await audit(user, 'CREATE', 'admin', accountId, 'Created administrator account ' + userId);
        const { passwordHash, salt, ...safe } = record;
        send(res, 201, { user: { id: accountId, ...safe } }); return;
      }
      if (path === '/api/customer-ledger' && method === 'GET') {
        if (!allow(user, ['admin'], res)) return;
        const customerId = clean(req.query.customerId, 128);
        const customer = await getDoc('customers', customerId);
        if (!customer) { send(res, 404, { error: 'Customer not found.' }); return; }
        const [invoiceItems, paymentItems] = await Promise.all([list('invoices'), list('payments')]);
        const ledger = buildCustomerLedger(invoiceItems, paymentItems, customerId);
        send(res, 200, {
          customer: { id: customerId, name: String(customer.name || ''), phone: String(customer.phone || ''), plan: String(customer.plan || '') },
          items: ledger.items,
          totalBilled: ledger.totalBilled,
          totalPaid: ledger.totalPaid,
          balance: ledger.outstandingBalance
        }); return;
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
          const invoiceRef = db.collection('invoices').doc(id);
          // Two admins may generate the same billing month at once. Reserve the
          // deterministic invoice ID inside a transaction so only one request
          // creates the invoice and the other safely counts it as already present.
          const wasCreated = await db.runTransaction(async transaction => {
            const current = await transaction.get(invoiceRef);
            if (current.exists) return false;
            transaction.create(invoiceRef, {
              customerId: customer.id,
              customerName: customer.name,
              period,
              dueDate,
              amount: Number(customer.monthlyFee || 0),
              createdAt: now(),
              createdBy: user.uid
            });
            return true;
          });
          if (wasCreated) created++;
        }
        if (created > 0) await audit(user, 'GENERATE', 'invoice_batch', period, 'Generated ' + created + ' monthly invoices for ' + period);
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
          const customerPatch: Data = { plan, monthlyFee: amount, updatedAt: createdAt };
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
      console.error('API request failed', { message: error?.message || String(error) });
      if (error?.code === 'inventory/insufficient') { send(res, 409, { error: error.message }); return; }
      if (error?.code === 'subscription/overlap') { send(res, 409, { error: error.message }); return; }
      if (error?.code === 'auth/email-already-exists') { send(res,409,{error:'That staff ID is already in use.'}); return; }
      if (error?.code === 'auth/invalid-password') { send(res,400,{error:'Password must contain at least 10 characters.'}); return; }
      send(res,500,{error:'Something went wrong. Please try again.'});
    }
}
