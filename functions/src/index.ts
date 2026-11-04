import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';

initializeApp();
const auth = getAuth();
const db = getFirestore();
const adminRecoveryCode = defineSecret('ADMIN_RECOVERY_CODE');
const adminBootstrapSecret = defineSecret('ADMIN_BOOTSTRAP_SECRET');

type Role = 'admin' | 'staff';
type AppUser = { uid: string; id: string; userId: string; displayName: string; role: Role; active: boolean; authTime: number };
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

function routePath(path: string): string {
  return path.replace(/\/+$/, '') || '/';
}
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
    return { uid: decoded.uid, id: decoded.uid, userId: clean(data.userId, 40),
      displayName: clean(data.displayName, 80), role: data.role, active: true, authTime: Number(decoded.auth_time || 0) };
  } catch { return null; }
}
function allow(user: AppUser, roles: Role[], res: any): boolean {
  if (!roles.includes(user.role)) { send(res, 403, { error: 'You do not have permission to perform this action.' }); return false; }
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
        userId: 'Brajraj', displayName: 'Brajraj', role: 'admin', active: true, createdAt: now(),
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

      if (method === 'GET' && path === '/api/auth/me') {
        send(res, 200, { user: { id: user.uid, userId: user.userId, displayName: user.displayName, role: user.role, active: true } }); return;
      }
      if (method === 'POST' && path === '/api/auth/logout') { send(res, 200, { ok: true }); return; }

      // Additional administrator accounts. The original Brajraj owner account cannot be removed here.
      if (path === '/api/admins' && method === 'GET') {
        if (!allow(user, ['admin'], res)) return;
        const admins = (await list('users')).filter(item => item.role === 'admin')
          .map(({ passwordHash, salt, ...safe }) => safe);
        send(res, 200, { items: admins }); return;
      }
      if (path === '/api/admins' && method === 'POST') {
        if (!allow(user, ['admin'], res)) return;
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
        const record = { userId, displayName, role: 'admin', active: true, createdAt: now(), createdBy: user.uid };
        await db.collection('users').doc(account.uid).set(record);
        await audit(user, 'CREATE', 'admin', account.uid, 'Created administrator account ' + userId);
        send(res, 201, { user: { id: account.uid, ...record } }); return;
      }
      if (path.startsWith('/api/admins/')) {
        if (!allow(user, ['admin'], res)) return;
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
          await db.collection('users').doc(id).update({ displayName, active });
          await auth.updateUser(id, { displayName, disabled: !active });
          await audit(user, 'UPDATE', 'staff', id, 'Updated staff profile/status');
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
        if (items.some(item => item.userId === user.uid && item.workDate === workDate)) { send(res, 409, { error: 'Attendance has already been recorded for today.' }); return; }
        const checkInAt = clean(body.capturedAt, 40) || now();
        const dayType = body.dayType === 'Half day' ? 'Half day' : 'Full day';
        const record = { userId: user.uid, displayName: user.displayName, workDate, checkInAt, status: 'Checked in', dayType };
        const ref = await db.collection('attendance').add(record);
        const latitude = Number(body.latitude), longitude = Number(body.longitude);
        if (Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
          await db.collection('locations').add({ userId: user.uid, displayName: user.displayName, latitude, longitude, accuracy: Number(body.accuracy) || 0, capturedAt: checkInAt });
        }
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
          if (existing) { send(res, 409, { error: 'Attendance is already recorded for this staff member today.' }); return; }
          const dayType = body.dayType === 'Half day' ? 'Half day' : 'Full day';
          const record = { userId: staffId, displayName: member.displayName, workDate, checkInAt: now(), status: 'Checked in', dayType, startedByAdmin: user.displayName, attendanceSource: 'Admin' };
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
        if (!shifts.some(item => item.userId === user.uid && item.workDate === today && !item.checkOutAt)) { send(res, 403, { error: 'Location can be shared only during an active shift.' }); return; }
        const record = { userId: user.uid, displayName: user.displayName, latitude, longitude, accuracy: Math.min(Math.max(Number(body.accuracy) || 0, 0), 100000), capturedAt: clean(body.capturedAt, 40) || now() };
        const ref = await db.collection('locations').add(record);
        send(res, 201, { id: ref.id, saved: true }); return;
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

      const notMigrated = ['/api/subscriptions'];
      if (notMigrated.some(base => path === base || path.startsWith(base + '/'))) {
        logger.warn('API route not migrated yet', { method, path, role: user.role });
        send(res,501,{error:'This feature is being migrated and is not available yet.'}); return;
      }
      send(res,404,{error:'This API route was not found.'});
    } catch (error: any) {
      logger.error('API request failed', { message: error?.message || String(error) });
      if (error?.code === 'auth/email-already-exists') { send(res,409,{error:'That staff ID is already in use.'}); return; }
      if (error?.code === 'auth/invalid-password') { send(res,400,{error:'Password must contain at least 10 characters.'}); return; }
      send(res,500,{error:'Something went wrong. Please try again.'});
    }
  },
);
