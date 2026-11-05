import { router, json, error, db, secrets, firestore, FieldValue } from './firestore-adapter.js';
import type { RouterMiddleware } from './firestore-adapter.js';
import { isConfirmedGpsLossReason, isValidDateRange } from './route-path.js';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
const notifySubscribers = async (..._args: unknown[]) => undefined; // Live updates are refreshed through the authenticated API.

type Role = 'admin' | 'staff';
type UserRecord = {
  id: string;
  userId: string;
  displayName: string;
  role: Role;
  active: boolean;
  salt: string;
  passwordHash: string;
  createdAt: string;
};
type SafeUser = Pick<UserRecord, 'id' | 'userId' | 'displayName' | 'role' | 'active'>;
type Customer = {
  id: string;
  name: string;
  phone: string;
  address: string;
  plan: string;
  monthlyFee: number;
  status: string;
  joinedAt: string;
  dueDate: string;
  notes?: string;
  assignedTo?: string;
  assignedToName?: string;
};
type Payment = {
  customerId: string;
  customerName: string;
  amount: number;
  method: string;
  paidAt: string;
  month: string;
  recordedBy?: string;
  recordedByName?: string;
};
type Complaint = {
  customerId?: string;
  customerName?: string;
  subject: string;
  details: string;
  priority: string;
  status: string;
  createdAt: string;
  createdBy?: string;
  createdByName?: string;
  assignedTo?: string;
  assignedToName?: string;
};
type SessionRecord = { userId: string; expiresAt: number };
type TaskRecord = { title: string; details: string; assignedTo: string; assignedToName: string; priority: string; dueDate: string; status: string; createdAt: string; createdBy: string; createdByName: string };
type PlanRecord = { id?: string; name: string; provider: string; speed: string; data: string; price: number; note: string; connectionType: string; featured: boolean; active: boolean };
const defaultPlans: PlanRecord[] = [
  { name: 'RailWire 30 Mbps', provider: 'RailWire', speed: '30 Mbps', data: '1.5 TB', price: 549, note: 'Popular home plan', connectionType: 'Fiber', featured: true, active: true },
  { name: 'RailWire 50 Mbps', provider: 'RailWire', speed: '50 Mbps', data: '2 TB', price: 699, note: 'For multiple devices', connectionType: 'Fiber', featured: false, active: true },
  { name: 'RailWire 100 Mbps', provider: 'RailWire', speed: '100 Mbps', data: '3 TB', price: 899, note: 'Heavy usage', connectionType: 'Fiber', featured: false, active: true },
  { name: 'BSNL / Air Fibre', provider: 'BSNL / Air Fibre', speed: 'As configured', data: 'Plan based', price: 799, note: 'Custom connection', connectionType: 'Air Fibre', featured: false, active: true },
];
type Handler = (ctx: Parameters<RouterMiddleware>[0], user: UserRecord) => Promise<ReturnType<typeof json> | ReturnType<typeof error>>;

const cleanText = (value: unknown, max = 300) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';
const validMoney = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1000000;
const safeUser = (user: UserRecord): SafeUser => ({
  id: user.id,
  userId: user.userId,
  displayName: user.displayName,
  role: user.role,
  active: user.active,
});
const hashPassword = (password: string, salt: string) =>
  scryptSync(password, salt, 64).toString('hex');
const equalSecret = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
const newPasswordFields = (password: string) => {
  const salt = randomBytes(16).toString('hex');
  return { salt, passwordHash: hashPassword(password, salt) };
};
const tokenId = (token: string) => createHash('sha256').update(token).digest('hex');

async function createSession(user: UserRecord) {
  const token = randomBytes(32).toString('hex');
  const id = tokenId(token);
  const expiresAt = Date.now() + 8 * 60 * 60 * 1000;
  const [created] = await db.tx.add('sessions', [{ id, userId: user.id, expiresAt }]);
  if (!created) throw new Error('Could not create a secure session.');
  return { token, expiresAt };
}

async function currentUser(ctx: Parameters<RouterMiddleware>[0]): Promise<UserRecord | null> {
  const body = (ctx.body || {}) as Record<string, unknown>;
  const authorization = cleanText(ctx.headers?.authorization, 4096);
  const bearerToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const token = bearerToken || cleanText(body.sessionToken, 200) || cleanText(ctx.query.sessionToken, 200);
  if (!token) return null;
  const [session] = await db.get<SessionRecord>('sessions', [tokenId(token)], { consistent: true });
  if (!session || session.expiresAt <= Date.now()) return null;
  const [user] = await db.get<UserRecord>('users', [session.userId], { consistent: true });
  if (!user || !user.active) return null;
  return user;
}

function protectedRoute(roles: Role[], handler: Handler): RouterMiddleware[] {
  return [async ctx => {
    const user = await currentUser(ctx);
    if (!user) return error('Your session has expired. Please sign in again.', 401);
    if (!roles.includes(user.role)) return error('You do not have permission to perform this action.', 403);
    return handler(ctx, user);
  }];
}

async function writeAudit(user: UserRecord, action: string, entityType: string, entityId: string, description: string) {
  await db.add('audit_logs', [{
    actorId: user.id,
    actorName: user.displayName,
    action,
    entityType,
    entityId,
    description: cleanText(description, 240),
    createdAt: new Date().toISOString(),
  }]);
}

async function loadAdmin() {
  const [admin] = await db.get<UserRecord>('users', ['admin-primary'], { consistent: true });
  return admin;
}

async function signIn(userId: string, password: string) {
  let user: UserRecord | null = null;
  if (userId.toLowerCase() === 'brajraj') {
    user = await loadAdmin();
    if (!user) {
      const names = await secrets.listSecretNames();
      if (!names.includes('ADMIN_INITIAL_PASSWORD')) {
        throw new Error('Admin setup is incomplete. Secure password setup is required.');
      }
      const initialPassword = await secrets.readSecret('ADMIN_INITIAL_PASSWORD');
      if (!equalSecret(password, initialPassword)) return null;
      const fields = newPasswordFields(password);
      const candidate: UserRecord = {
        id: 'admin-primary',
        userId: 'Brajraj',
        displayName: 'Brajraj',
        role: 'admin',
        active: true,
        ...fields,
        createdAt: new Date().toISOString(),
      };
      const [created] = await db.tx.add('users', [candidate as unknown as Record<string, unknown>]);
      user = created ? candidate : await loadAdmin();
    }
  } else {
    const result = await db.list<UserRecord>('users', { limit: 200 });
    user = result.items.find(item => item.userId.toLowerCase() === userId.toLowerCase()) || null;
  }
  if (!user || !user.active) return null;
  if (!equalSecret(hashPassword(password, user.salt), user.passwordHash)) return null;
  return user;
}

export const handler = router({
  'GET /api/_healthcheck': [async () => json({ message: 'Success' })],

  // Public staff registration: a tracking code is returned once and only its hash is stored.
  'POST /api/staff-registration-requests': [async ({ body }) => {
    const input = (body || {}) as Record<string, unknown>;
    const userId = cleanText(input.userId, 32);
    const displayName = cleanText(input.displayName, 80);
    const phone = cleanText(input.phone, 30);
    const reason = cleanText(input.reason, 300);
    if (!/^[a-zA-Z0-9_-]{3,32}$/.test(userId) || !displayName) {
      return error('Enter a valid staff ID and your full name.', 400);
    }
    const userIdLower = userId.toLowerCase();
    const allUsers = await db.list<UserRecord>('users', { limit: 1000 });
    if (allUsers.items.some(item => String(item.userId || '').toLowerCase() === userIdLower)) {
      return error('This staff ID is already registered. Contact your administrator.', 409);
    }
    const createdAt = new Date().toISOString();
    const trackingCode = randomBytes(24).toString('hex');
    const trackingHash = createHash('sha256').update(trackingCode).digest('hex');
    const requestRef = firestore.collection('staff_registration_requests').doc(userIdLower);
    let submitted = false;
    await firestore.runTransaction(async transaction => {
      const previous = await transaction.get(requestRef);
      if (previous.exists && previous.data()?.status === 'pending') return;
      transaction.set(requestRef, {
        userId, userIdLower, displayName, phone, reason,
        status: 'pending', createdAt, trackingHash,
      });
      submitted = true;
    });
    if (!submitted) {
      return error('A registration request for this staff ID is already pending. Please wait for the administrator to review it.', 409);
    }
    const admins = allUsers.items.filter(member => member.active === true && member.role === 'admin');
    await Promise.all(admins.map(member => firestore.collection('staff_notifications')
      .doc('staff-registration-' + userIdLower + '-' + member.id).set({
        recipientId: member.id, recipientRole: 'admin', type: 'staff-registration',
        title: 'New staff access request',
        message: displayName + ' requested staff access with ID ' + userId + '.',
        createdAt, read: false, relatedId: userIdLower,
      }, { merge: true })));
    return json({
      id: userIdLower, trackingCode, status: 'pending',
      message: 'Your request has been submitted. An administrator must approve it before you can sign in.',
    }, 201);
  }],

  'GET /api/staff-registration-requests/status': [async ({ query }) => {
    const requestId = cleanText(query.requestId, 64).toLowerCase();
    const trackingCode = cleanText(query.trackingCode, 128);
    if (!requestId || !trackingCode) return error('A request ID and tracking code are required.', 400);
    const [request] = await db.get<Record<string, unknown>>('staff_registration_requests', [requestId], { consistent: true });
    const storedHash = String(request?.trackingHash || '');
    const suppliedHash = createHash('sha256').update(trackingCode).digest('hex');
    const stored = Buffer.from(storedHash, 'hex');
    const supplied = Buffer.from(suppliedHash, 'hex');
    if (!request || stored.length !== supplied.length || !timingSafeEqual(stored, supplied)) {
      return error('Registration request not found.', 404);
    }
    return json({
      status: request.status,
      createdAt: request.createdAt,
      reviewedAt: request.reviewedAt || null,
      reviewedByName: request.reviewedByName || null,
    });
  }],

  'GET /api/staff-registration-requests': protectedRoute(['admin'], async () => {
    const result = await db.list<Record<string, unknown>>('staff_registration_requests', { limit: 500 });
    const items = result.items
      .map(({ trackingHash, ...safe }) => safe)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return json({ items });
  }),

  'PUT /api/staff-registration-requests/:id': protectedRoute(['admin'], async ({ body, params }, admin) => {
    const input = (body || {}) as Record<string, unknown>;
    const status = cleanText(input.status, 20).toLowerCase();
    const password = typeof input.password === 'string' ? input.password : '';
    if (!['approved', 'rejected'].includes(status)) {
      return error('Choose approve or reject for this registration request.', 400);
    }
    if (status === 'approved' && password.length < 10) {
      return error('Set a temporary password with at least 10 characters before approving.', 400);
    }
    const requestId = cleanText(params.id, 64).toLowerCase();
    const requestRef = firestore.collection('staff_registration_requests').doc(requestId);
    const [existing] = await db.get<Record<string, unknown>>('staff_registration_requests', [requestId], { consistent: true });
    if (!existing) return error('Staff registration request not found.', 404);
    if (existing.status !== 'pending') return error('This registration request has already been reviewed.', 409);
    const userId = cleanText(existing.userId, 32);
    const userIdLower = userId.toLowerCase();
    const allUsers = await db.list<UserRecord>('users', { limit: 1000 });
    if (status === 'approved' && allUsers.items.some(item => String(item.userId || '').toLowerCase() === userIdLower)) {
      return error('This staff ID is already registered. Reject this request and ask the person to contact an administrator.', 409);
    }
    const reviewedAt = new Date().toISOString();
    const userIdForDoc = 'staff-' + randomBytes(12).toString('hex');
    const userRecord: Record<string, unknown> = {
      id: userIdForDoc,
      userId,
      userIdLower,
      displayName: cleanText(existing.displayName, 80),
      phone: cleanText(existing.phone, 30),
      role: 'staff',
      active: true,
      canManageAdmins: false,
      ...newPasswordFields(password),
      createdAt: reviewedAt,
      createdBy: admin.id,
    };
    const reviewApplied = await firestore.runTransaction(async transaction => {
      const latest = await transaction.get(requestRef);
      if (!latest.exists || latest.data()?.status !== 'pending') return false;
      if (status === 'approved') {
        const userRef = firestore.collection('users').doc(userIdForDoc);
        transaction.create(userRef, userRecord);
      }
      transaction.update(requestRef, {
        status,
        reviewedAt,
        reviewedBy: admin.id,
        reviewedByName: admin.displayName,
        ...(status === 'approved' ? { createdUserId: userIdForDoc } : {}),
      });
      return true;
    });
    if (!reviewApplied) {
      return error('This registration request was already reviewed. Refresh the list.', 409);
    }
    const createdUser = status === 'approved';
    if (createdUser) {
      await firestore.collection('staff_notifications').add({
        recipientId: userIdForDoc, recipientRole: 'staff', type: 'staff-registration-approved',
        title: 'Staff access approved',
        message: 'Your staff account has been approved. You can now sign in using your staff ID and the temporary password shared by the administrator.',
        relatedId: requestId, createdAt: reviewedAt, read: false,
      });
    }
    await writeAudit(admin, status === 'approved' ? 'APPROVE_STAFF_REGISTRATION' : 'REJECT_STAFF_REGISTRATION',
      'staff_registration_request', requestId, 'Staff registration request ' + status + ' for ' + userId);
    return json({ updated: true, status, ...(createdUser ? { userId, userRecordId: userIdForDoc } : {}) });
  }),

  'POST /api/auth/login': [async ({ body }) => {
    const input = (body || {}) as Record<string, unknown>;
    const userId = cleanText(input.userId, 40);
    const password = typeof input.password === 'string' ? input.password : '';
    if (!userId || password.length < 1) return error('Enter your user ID and password.', 400);
    try {
      const user = await signIn(userId, password);
      if (!user) return error('The user ID or password is incorrect.', 401);
      const session = await createSession(user);
      return json({ ...session, user: safeUser(user) });
    } catch (err) {
      return error(err instanceof Error ? err.message : 'Sign-in is temporarily unavailable.', 503);
    }
  }],

  'POST /api/auth/recover-admin': [async ({ body }) => {
    const input = (body || {}) as Record<string, unknown>;
    const userId = cleanText(input.userId, 40);
    const recoveryCode = typeof input.recoveryCode === 'string' ? input.recoveryCode : '';
    const newPassword = typeof input.newPassword === 'string' ? input.newPassword : '';
    if (userId.toLowerCase() !== 'brajraj' || newPassword.length < 10) {
      return error('Use the admin ID and a new password with at least 10 characters.', 400);
    }
    const names = await secrets.listSecretNames();
    if (!names.includes('ADMIN_RECOVERY_CODE')) return error('Admin recovery has not been configured.', 503);
    const configuredCode = await secrets.readSecret('ADMIN_RECOVERY_CODE');
    if (!equalSecret(recoveryCode, configuredCode)) return error('The recovery code is incorrect.', 401);
    const fields = newPasswordFields(newPassword);
    let admin = await loadAdmin();
    if (!admin) {
      const candidate: UserRecord = {
        id: 'admin-primary',
        userId: 'Brajraj',
        displayName: 'Brajraj',
        role: 'admin',
        active: true,
        ...fields,
        createdAt: new Date().toISOString(),
      };
      const [created] = await db.tx.add('users', [candidate as unknown as Record<string, unknown>]);
      if (!created) return error('Admin account could not be initialized. Please retry.', 409);
      admin = candidate;
    } else {
      const [updated] = await db.tx.update('users', [{
        id: admin.id,
        record: fields,
      }], { patch: true });
      if (!updated) return error('Could not reset the admin password.', 500);
    }
    const sessions = await db.list<SessionRecord & { id: string }>('sessions', { limit: 500 });
    const ids = sessions.items.filter(item => item.userId === admin.id).map(item => item.id);
    if (ids.length) await db.delete('sessions', ids);
    return json({ reset: true });
  }],

  'GET /api/auth/me': protectedRoute(['admin', 'staff'], async (_ctx, user) => json({ user: safeUser(user) })),

  'POST /api/auth/logout': protectedRoute(['admin', 'staff'], async ctx => {
    const body = (ctx.body || {}) as Record<string, unknown>;
    const token = cleanText(body.sessionToken, 200);
    if (token) await db.delete('sessions', [tokenId(token)]);
    return json({ ok: true });
  }),

  'POST /api/auth/change-password': protectedRoute(['admin', 'staff'], async (ctx, user) => {
    const input = (ctx.body || {}) as Record<string, unknown>;
    const currentPassword = typeof input.currentPassword === 'string' ? input.currentPassword : '';
    const newPassword = typeof input.newPassword === 'string' ? input.newPassword : '';
    if (newPassword.length < 10) return error('Choose a password with at least 10 characters.', 400);
    if (!equalSecret(hashPassword(currentPassword, user.salt), user.passwordHash)) {
      return error('Your current password is incorrect.', 401);
    }
    const fields = newPasswordFields(newPassword);
    const [updated] = await db.tx.update('users', [{ id: user.id, record: fields }], { patch: true });
    if (!updated) return error('Could not update the password.', 500);
    const sessions = await db.list<SessionRecord & { id: string }>('sessions', { limit: 500 });
    const ids = sessions.items.filter(item => item.userId === user.id).map(item => item.id);
    if (ids.length) await db.delete('sessions', ids);
    return json({ changed: true });
  }),

  'GET /api/staff': protectedRoute(['admin'], async () => {
    const result = await db.list<UserRecord>('users', { limit: 200 });
    return json({ items: result.items.filter(user => user.role === 'staff').map(safeUser) });
  }),

  'POST /api/staff': protectedRoute(['admin'], async ({ body }) => {
    const input = (body || {}) as Record<string, unknown>;
    const userId = cleanText(input.userId, 32);
    const displayName = cleanText(input.displayName, 80);
    const password = typeof input.password === 'string' ? input.password : '';
    if (!/^[a-zA-Z0-9_-]{3,32}$/.test(userId) || !displayName || password.length < 10) {
      return error('Use a 3–32 character staff ID, a name and a password of at least 10 characters.', 400);
    }
    const existing = await db.list<UserRecord>('users', { limit: 200 });
    if (existing.items.some(user => user.userId.toLowerCase() === userId.toLowerCase())) {
      return error('That user ID is already in use.', 409);
    }
    const fields = newPasswordFields(password);
    const user: UserRecord = {
      id: 'staff-' + randomBytes(10).toString('hex'),
      userId,
      displayName,
      role: 'staff',
      active: true,
      ...fields,
      createdAt: new Date().toISOString(),
    };
    const [created] = await db.tx.add('users', [user as unknown as Record<string, unknown>]);
    return created ? json({ user: safeUser(user) }, 201) : error('Could not create the staff account.', 500);
  }),

  'PUT /api/staff/:id': protectedRoute(['admin'], async ({ params, body }) => {
    const input = (body || {}) as Record<string, unknown>;
    const [target] = await db.get<UserRecord>('users', [params.id], { consistent: true });
    if (!target || target.role !== 'staff') return error('Staff account not found.', 404);
    const displayName = cleanText(input.displayName, 80) || target.displayName;
    const active = typeof input.active === 'boolean' ? input.active : target.active;
    const [updated] = await db.tx.update('users', [{ id: target.id, record: { displayName, active } }], { patch: true });
    return updated ? json({ updated: true }) : error('Could not update staff account.', 500);
  }),

  'DELETE /api/staff/:id': protectedRoute(['admin'], async ({ params }) => {
    const [target] = await db.get<UserRecord>('users', [params.id], { consistent: true });
    if (!target || target.role !== 'staff') return error('Staff account not found.', 404);
    const customers = await db.list<Record<string, unknown>>('customers', { limit: 500 });
    const assigned = customers.items.filter(item => item.assignedTo === target.id);
    if (assigned.length) await db.tx.update('customers', assigned.map(item => ({ id: String(item.id), record: { assignedTo: '', assignedToName: '' } })), { patch: true });
    const sessions = await db.list<SessionRecord & { id: string }>('sessions', { limit: 500 });
    const sessionIds = sessions.items.filter(item => item.userId === target.id).map(item => item.id);
    if (sessionIds.length) await db.delete('sessions', sessionIds);
    const [deleted] = await db.delete('users', [target.id]);
    return deleted ? json({ deleted: true, unassignedCustomers: assigned.length, historyPreserved: true }) : error('Could not delete staff account.', 500);
  }),

  'POST /api/staff/:id/reset-password': protectedRoute(['admin'], async ({ params, body }) => {
    const input = (body || {}) as Record<string, unknown>;
    const password = typeof input.password === 'string' ? input.password : '';
    if (password.length < 10) return error('Password must be at least 10 characters.', 400);
    const [target] = await db.get<UserRecord>('users', [params.id], { consistent: true });
    if (!target || target.role !== 'staff') return error('Staff account not found.', 404);
    const fields = newPasswordFields(password);
    const [updated] = await db.tx.update('users', [{ id: target.id, record: fields }], { patch: true });
    if (!updated) return error('Could not reset the staff password.', 500);
    const sessions = await db.list<SessionRecord & { id: string }>('sessions', { limit: 500 });
    const ids = sessions.items.filter(item => item.userId === target.id).map(item => item.id);
    if (ids.length) await db.delete('sessions', ids);
    return json({ reset: true });
  }),

  'GET /api/plans': protectedRoute(['admin', 'staff'], async (_ctx, user) => {
    let result = await db.list<PlanRecord>('plans', { limit: 200 });
    if (!result.items.length) {
      await db.tx.add('plans', defaultPlans.map((plan, index) => ({ id: 'default-plan-' + (index + 1), ...plan })));
      result = await db.list<PlanRecord>('plans', { limit: 200 });
    }
    const items = user.role === 'admin' ? result.items : result.items.filter(plan => plan.active);
    return json({ items });
  }),

  'POST /api/plans': protectedRoute(['admin'], async ({ body }) => {
    const input = (body || {}) as Record<string, unknown>;
    const name = cleanText(input.name, 80);
    const provider = cleanText(input.provider, 60);
    const speed = cleanText(input.speed, 40);
    const data = cleanText(input.data, 40);
    const price = Number(input.price);
    const connectionType = cleanText(input.connectionType, 40);
    if (!name || !provider || !speed || !data || !connectionType || !validMoney(price)) return error('Enter a plan name, provider, speed, data limit, connection type and valid monthly price.', 400);
    const existing = await db.list<PlanRecord>('plans', { limit: 200 });
    if (existing.items.some(plan => plan.name.toLowerCase() === name.toLowerCase())) return error('A plan with this name already exists.', 409);
    const record: PlanRecord = { name, provider, speed, data, price, note: cleanText(input.note, 180), connectionType, featured: input.featured === true, active: true };
    const [id] = await db.add('plans', [record as unknown as Record<string, unknown>]);
    return id ? json({ id, ...record }, 201) : error('Could not create this plan.', 500);
  }),

  'PUT /api/plans/:id': protectedRoute(['admin'], async ({ params, body }) => {
    const input = (body || {}) as Record<string, unknown>;
    const [existing] = await db.get<PlanRecord>('plans', [params.id], { consistent: true });
    if (!existing) return error('Plan not found.', 404);
    const name = cleanText(input.name, 80);
    const provider = cleanText(input.provider, 60);
    const speed = cleanText(input.speed, 40);
    const data = cleanText(input.data, 40);
    const price = Number(input.price);
    const connectionType = cleanText(input.connectionType, 40);
    if (!name || !provider || !speed || !data || !connectionType || !validMoney(price)) return error('Enter valid plan details and monthly price.', 400);
    const others = await db.list<PlanRecord>('plans', { limit: 200 });
    if (others.items.some(plan => plan.id !== params.id && plan.name.toLowerCase() === name.toLowerCase())) return error('Another plan already uses this name.', 409);
    const record = { name, provider, speed, data, price, note: cleanText(input.note, 180), connectionType, featured: input.featured === true, active: input.active !== false };
    const [updated] = await db.tx.update('plans', [{ id: params.id, record, }], { patch: true });
    return updated ? json({ updated: true }) : error('Could not update this plan.', 500);
  }),

  'DELETE /api/plans/:id': protectedRoute(['admin'], async ({ params }) => {
    const [plan] = await db.get<PlanRecord>('plans', [params.id], { consistent: true });
    if (!plan) return error('Plan not found.', 404);
    const customers = await db.list<Record<string, unknown>>('customers', { limit: 500 });
    if (customers.items.some(customer => String(customer.plan || '').toLowerCase() === plan.name.toLowerCase())) return error('This plan is linked to existing customers. Archive it instead to preserve their plan history.', 409);
    const allPlans = await db.list<PlanRecord>('plans', { limit: 200 });
    if (allPlans.items.length <= 1) return error('Keep at least one plan in the plan catalogue.', 409);
    const [deleted] = await db.delete('plans', [params.id]);
    return deleted ? json({ deleted: true }) : error('Could not delete this plan.', 500);
  }),

  'GET /api/customers': protectedRoute(['admin', 'staff'], async (_ctx, user) => {
    const result = await db.list<Customer>('customers', { limit: 200 });
    const items = user.role === 'admin'
      ? result.items
      : result.items.filter(customer => customer.assignedTo === user.id);
    return json({ items });
  }),

  'POST /api/customers': protectedRoute(['admin'], async ({ body }) => {
    const input = (body || {}) as Customer;
    const assignedTo = cleanText(input.assignedTo, 100);
    let assignedToName = '';
    if (assignedTo) {
      const [staff] = await db.get<UserRecord>('users', [assignedTo], { consistent: true });
      if (!staff || staff.role !== 'staff' || !staff.active) return error('Select an active staff account.', 400);
      assignedToName = staff.displayName;
    }
    const record = {
      name: cleanText(input.name, 100),
      phone: cleanText(input.phone, 20),
      address: cleanText(input.address, 300),
      plan: cleanText(input.plan, 100),
      monthlyFee: Number(input.monthlyFee),
      status: ['Active', 'Inactive', 'Suspended'].includes(input.status) ? input.status : 'Active',
      joinedAt: cleanText(input.joinedAt, 20),
      dueDate: cleanText(input.dueDate, 20),
      notes: cleanText(input.notes, 500),
      assignedTo,
      assignedToName,
    };
    if (!record.name || !record.phone || !record.address || !record.plan || !validMoney(record.monthlyFee)) {
      return error('Please provide a valid name, phone, address, plan and monthly fee.', 400);
    }
    const [id] = await db.add('customers', [record as unknown as Record<string, unknown>]);
    return id ? json({ id, ...record }, 201) : error('Could not create customer.', 500);
  }),

  'PUT /api/customers/:id': protectedRoute(['admin', 'staff'], async ({ params, body }, user) => {
    const input = (body || {}) as Customer;
    const [existing] = await db.get<Customer>('customers', [params.id], { consistent: true });
    if (!existing) return error('Customer not found.', 404);
    if (user.role === 'staff') {
      if (existing.assignedTo !== user.id) return error('This customer is not assigned to your account.', 403);
      const limited = {
        phone: cleanText(input.phone, 20),
        address: cleanText(input.address, 300),
        notes: cleanText(input.notes, 500),
      };
      const [updated] = await db.tx.update('customers', [{ id: params.id, record: limited }], { patch: true });
      return updated ? json({ updated: true }) : error('Could not update customer.', 500);
    }
    const assignedTo = cleanText(input.assignedTo, 100);
    let assignedToName = '';
    if (assignedTo) {
      const [staff] = await db.get<UserRecord>('users', [assignedTo], { consistent: true });
      if (!staff || staff.role !== 'staff' || !staff.active) return error('Select an active staff account.', 400);
      assignedToName = staff.displayName;
    }
    const record = {
      name: cleanText(input.name, 100),
      phone: cleanText(input.phone, 20),
      address: cleanText(input.address, 300),
      plan: cleanText(input.plan, 100),
      monthlyFee: Number(input.monthlyFee),
      status: ['Active', 'Inactive', 'Suspended'].includes(input.status) ? input.status : 'Active',
      joinedAt: cleanText(input.joinedAt, 20),
      dueDate: cleanText(input.dueDate, 20),
      notes: cleanText(input.notes, 500),
      assignedTo,
      assignedToName,
    };
    if (!record.name || !record.phone || !record.address || !record.plan || !validMoney(record.monthlyFee)) {
      return error('Invalid customer details.', 400);
    }
    const [updated] = await db.update('customers', [{ id: params.id, record: record as unknown as Record<string, unknown> }]);
    return updated ? json({ id: params.id, ...record }) : error('Could not update customer.', 500);
  }),

  'DELETE /api/customers/:id': protectedRoute(['admin'], async ({ params }) => {
    const [deleted] = await db.delete('customers', [params.id]);
    return deleted ? json({ deleted: true }) : error('Customer not found.', 404);
  }),

  'DELETE /api/payments/:id': protectedRoute(['admin'], async ({ params }, user) => {
    const [payment] = await db.get<Payment>('payments', [params.id], { consistent: true });
    if (!payment) return error('Payment record not found.', 404);
    const [deleted] = await db.delete('payments', [params.id]);
    if (!deleted) return error('Could not delete payment.', 500);
    await writeAudit(user, 'DELETE', 'payment', params.id, 'Deleted payment of ₹' + payment.amount + ' for ' + payment.customerName);
    return json({ deleted: true });
  }),

  'GET /api/payments': protectedRoute(['admin', 'staff'], async (_ctx, user) => {
    const result = await db.list<Payment>('payments', { limit: 200 });
    return json({ items: user.role === 'admin' ? result.items : result.items.filter(item => item.recordedBy === user.id) });
  }),

  'POST /api/payments': protectedRoute(['admin', 'staff'], async ({ body }, user) => {
    const input = (body || {}) as Payment;
    const [customer] = await db.get<Customer>('customers', [cleanText(input.customerId, 128)], { consistent: true });
    if (!customer) return error('Customer not found.', 404);
    if (user.role === 'staff' && customer.assignedTo !== user.id) return error('You can only record payments for your assigned customers.', 403);
    const record: Payment = {
      customerId: cleanText(input.customerId, 128),
      customerName: customer.name,
      amount: Number(input.amount),
      method: cleanText(input.method, 40),
      paidAt: cleanText(input.paidAt, 20),
      month: cleanText(input.month, 40),
      recordedBy: user.id,
      recordedByName: user.displayName,
    };
    if (!validMoney(record.amount) || record.amount <= 0 || !record.method || !record.month) {
      return error('Please provide valid payment details.', 400);
    }
    const [id] = await db.add('payments', [record as unknown as Record<string, unknown>]);
    if (!id) return error('Could not record payment.', 500);
    await writeAudit(user, 'CREATE', 'payment', id, 'Recorded payment of ₹' + record.amount + ' for ' + customer.name);
    return json({ id, ...record }, 201);
  }),

  'GET /api/complaints': protectedRoute(['admin', 'staff'], async (_ctx, user) => {
    const result = await db.list<Complaint>('complaints', { limit: 200 });
    if (user.role === 'admin') return json({ items: result.items });
    const customers = await db.list<Customer>('customers', { limit: 200 });    const assignedIds = new Set(customers.items.filter(item => item.assignedTo === user.id).map(item => item.id));
    return json({ items: result.items.filter(item => assignedIds.has(item.customerId) || item.assignedTo === user.id) });
  }),

  'POST /api/complaints': protectedRoute(['admin', 'staff'], async ({ body }, user) => {
    const input = (body || {}) as Complaint;
    const customerId = cleanText(input.customerId, 128);
    let customer: Customer | undefined;
    if (customerId) {
      const [foundCustomer] = await db.get<Customer>('customers', [customerId], { consistent: true });
      customer = foundCustomer;
      if (!customer) return error('Customer not found.', 404);
      if (user.role === 'staff' && customer.assignedTo !== user.id) return error('You can only submit complaints for assigned customers.', 403);
    }
    const record: Complaint = {
      ...(customerId ? { customerId } : {}),
      customerName: customer?.name || cleanText(input.customerName, 150) || 'General complaint',
      subject: cleanText(input.subject, 150),
      details: cleanText(input.details, 1000),
      priority: ['Low', 'Normal', 'High'].includes(input.priority) ? input.priority : 'Normal',
      status: 'Open',
      createdAt: cleanText(input.createdAt, 20),
      createdBy: user.id,
      createdByName: user.displayName,
    };
    if (!record.subject) return error('A complaint subject is required.', 400);
    const [id] = await db.add('complaints', [record as unknown as Record<string, unknown>]);
    return id ? json({ id, ...record }, 201) : error('Could not create complaint.', 500);
  }),

  'PUT /api/complaints/:id': protectedRoute(['admin'], async ({ params, body }, user) => {
    const input = (body || {}) as Complaint;
    const status = ['Open', 'In progress', 'Resolved'].includes(input.status) ? input.status : 'Open';
    const [existing] = await db.get<Complaint>('complaints', [params.id], { consistent: true });
    if (!existing) return error('Complaint not found.', 404);
    const assignedTo = cleanText(input.assignedTo, 128);
    let assignedToName: string | undefined;
    if (assignedTo) {
      const [member] = await db.get<UserRecord>('users', [assignedTo], { consistent: true });
      if (!member || member.role !== 'staff' || !member.active) return error('Choose an active staff member for this ticket.', 400);
      assignedToName = member.displayName;
    }
    const patch: Record<string, unknown> = { status };
    if (Object.prototype.hasOwnProperty.call(input, 'assignedTo')) {
      patch.assignedTo = assignedTo;
      patch.assignedToName = assignedToName || '';
    }
    const [updated] = await db.tx.update('complaints', [{ id: params.id, record: patch }], { patch: true });
    if (updated) await writeAudit(user, 'UPDATE', 'ticket', params.id, 'Updated service ticket: ' + existing.subject);
    return updated ? json({ updated: true }) : error('Could not update complaint.', 500);
  }),

  'DELETE /api/complaints/:id': protectedRoute(['admin'], async ({ params }, user) => {
    const [ticket] = await db.get<Complaint>('complaints', [params.id], { consistent: true });
    if (!ticket) return error('Service ticket not found.', 404);
    const [deleted] = await db.delete('complaints', [params.id]);
    if (!deleted) return error('Could not delete service ticket.', 500);
    await writeAudit(user, 'DELETE', 'ticket', params.id, 'Deleted service ticket: ' + ticket.subject);
    return json({ deleted: true });
  }),

  'GET /api/tasks': protectedRoute(['admin', 'staff'], async (_ctx, user) => {
    const result = await db.list<TaskRecord>('tasks', { limit: 200 });
    const items = user.role === 'admin' ? result.items : result.items.filter(task => task.assignedTo === user.id);
    return json({ items });
  }),

  'POST /api/tasks': protectedRoute(['admin'], async ({ body }, user) => {
    const input = (body || {}) as Record<string, unknown>;
    const title = cleanText(input.title, 120);
    const details = cleanText(input.details, 1000);
    const assignedTo = cleanText(input.assignedTo, 100);
    const dueDate = cleanText(input.dueDate, 20);
    const priority = ['Low', 'Normal', 'High'].includes(String(input.priority)) ? String(input.priority) : 'Normal';
    if (!title || !assignedTo || !/^\\d{4}-\\d{2}-\\d{2}$/.test(dueDate)) return error('Enter a task title, active staff member and valid due date.', 400);
    const [staffMember] = await db.get<UserRecord>('users', [assignedTo], { consistent: true });
    if (!staffMember || staffMember.role !== 'staff' || !staffMember.active) return error('Choose an active staff account.', 400);
    const record: TaskRecord = { title, details, assignedTo, assignedToName: staffMember.displayName, priority, dueDate, status: 'Pending', createdAt: new Date().toISOString().slice(0, 10), createdBy: user.id, createdByName: user.displayName };
    const [id] = await db.add('tasks', [record as unknown as Record<string, unknown>]);
    return id ? json({ id, ...record }, 201) : error('Could not assign task.', 500);
  }),

  'PUT /api/tasks/:id': protectedRoute(['admin', 'staff'], async ({ params, body }, user) => {
    const input = (body || {}) as Record<string, unknown>;
    const status = ['Pending', 'In progress', 'Completed'].includes(String(input.status)) ? String(input.status) : '';
    if (!status) return error('Choose a valid task status.', 400);
    const [task] = await db.get<TaskRecord>('tasks', [params.id], { consistent: true });
    if (!task) return error('Task not found.', 404);
    if (user.role === 'staff' && task.assignedTo !== user.id) return error('You can update only tasks assigned to your account.', 403);
    const [updated] = await db.tx.update('tasks', [{ id: params.id, record: { status } }], { patch: true });
    return updated ? json({ updated: true }) : error('Could not update task.', 500);
  }),

  'DELETE /api/tasks/:id': protectedRoute(['admin'], async ({ params }, user) => {
    const [task] = await db.get<TaskRecord>('tasks', [params.id], { consistent: true });
    if (!task) return error('Task not found.', 404);
    const [deleted] = await db.delete('tasks', [params.id]);
    if (!deleted) return error('Could not delete task.', 500);
    await writeAudit(user, 'DELETE', 'task', params.id, 'Deleted task: ' + task.title);
    return json({ deleted: true });
  }),

  'GET /api/attendance': protectedRoute(['admin', 'staff'], async (_ctx, user) => {
    const result = await db.list<Record<string, unknown>>('attendance', { limit: 500 });
    return json({ items: user.role === 'admin' ? result.items : result.items.filter(item => item.userId === user.id) });
  }),

  'POST /api/attendance/check-in': protectedRoute(['staff'], async ({ body }, user) => {
    const input = (body || {}) as Record<string, unknown>;
    const workDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const result = await db.list<Record<string, unknown>>('attendance', { limit: 500 });
    if (result.items.some(item => item.userId === user.id && item.workDate === workDate)) return error('Attendance has already been recorded for today.', 409);
    const record: Record<string, unknown> = { userId: user.id, displayName: user.displayName, workDate, checkInAt: cleanText(input.capturedAt, 40) || new Date().toISOString(), status: 'Checked in' };
    const [id] = await db.add('attendance', [record]);
    if (!id) return error('Could not save your check-in.', 500);
    const latitude = Number(input.latitude);
    const longitude = Number(input.longitude);
    if (Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
      await db.add('locations', [{ attendanceId: id, userId: user.id, displayName: user.displayName, latitude, longitude, accuracy: Number(input.accuracy) || 0, capturedAt: record.checkInAt }]);
    }
    return json({ id, ...record }, 201);
  }),

  'PUT /api/attendance/:id/day-type': protectedRoute(['admin'], async ({ body, params }, admin) => {
    const input = (body || {}) as Record<string, unknown>;
    const dayType = input.dayType === 'Half day' ? 'Half day' : input.dayType === 'Full day' ? 'Full day' : '';
    const reason = cleanText(input.reason, 300);
    if (!dayType || reason.length < 3) return error('Choose a day type and provide a correction reason.', 400);
    const [attendance] = await db.get<Record<string, unknown>>('attendance', [params.id], { consistent: true });
    if (!attendance) return error('Attendance record not found.', 404);
    const [updated] = await db.tx.update('attendance', [{
      id: params.id,
      record: {
        dayType,
        correctionReason: reason,
        correctedAt: new Date().toISOString(),
        correctedBy: admin.id,
        correctedByName: admin.displayName,
      },
    }], { patch: true });
    if (!updated) return error('Could not save the attendance correction.', 500);
    await writeAudit(admin, 'CORRECT_ATTENDANCE', 'attendance', params.id, 'Changed day type to ' + dayType + ': ' + reason);
    return json({ updated: true });
  }),

  'POST /api/attendance/gps-lost': protectedRoute(['staff'], async ({ body }, user) => {
    const reason = cleanText(body?.reason, 100);
    if (!isConfirmedGpsLossReason(reason)) {
      return error('A confirmed location permission or phone location-service loss is required.', 400);
    }
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    const [attendanceResult, holidayResult] = await Promise.all([
      db.list<Record<string, unknown>>('attendance', { limit: 1000 }),
      db.list<Record<string, unknown>>('holiday_requests', { limit: 500 }),
    ]);
    const todays = attendanceResult.items
      .filter(item => item.userId === user.id && item.workDate === today)
      .sort((a, b) => String(b.checkInAt || '').localeCompare(String(a.checkInAt || '')));
    const active = todays.find(item => !item.checkOutAt);
    if (!active) {
      const latest = todays[0];
      return json({ monitoring: false, reason: latest?.gpsRestartRequired || latest?.gpsCancelled ? 'restart-required' : 'no-active-shift' });
    }
    const holidayExempt = holidayResult.items.some(request =>
      request.userId === user.id &&
      ['pending', 'approved'].includes(String(request.status)) &&
      String(request.startDate || '') <= today &&
      String(request.endDate || '') >= today
    );
    if (holidayExempt) return json({ monitoring: false, reason: 'holiday-exempt' });

    const attendanceRef = firestore.collection('attendance').doc(String(active.id));
    let outcome: { monitoring: boolean; reason?: string; deadlineAt?: string; remainingSeconds?: number } = {
      monitoring: false, reason: 'no-active-shift',
    };
    await firestore.runTransaction(async transaction => {
      const snapshot = await transaction.get(attendanceRef);
      if (!snapshot.exists) {
        outcome = { monitoring: false, reason: 'no-active-shift' };
        return;
      }
      const latest = snapshot.data() || {};
      if (latest.checkOutAt) {
        outcome = { monitoring: false, reason: 'no-active-shift' };
        return;
      }
      if (latest.gpsRestartRequired === true || latest.gpsCancelled === true) {
        outcome = { monitoring: false, reason: 'restart-required' };
        return;
      }
      const existingTime = typeof latest.gpsIssueStartedAt === 'string'
        ? Date.parse(latest.gpsIssueStartedAt)
        : Number.NaN;
      const startedAt = Number.isFinite(existingTime) ? existingTime : Date.now();
      const startedAtIso = new Date(startedAt).toISOString();
      const updates: Record<string, unknown> = {
        gpsIssueReason: reason,
        gpsStatus: 'disabled',
      };
      if (!Number.isFinite(existingTime)) {
        updates.gpsIssueStartedAt = startedAtIso;
        updates.gpsIssueId = randomBytes(12).toString('hex');
        updates.gpsReminderStage = 0;
        updates.shiftEvents = FieldValue.arrayUnion({
          type: 'gps-lost', at: startedAtIso, reason,
        });
      }
      transaction.update(attendanceRef, updates);
      outcome = {
        monitoring: true,
        deadlineAt: new Date(startedAt + 15 * 60 * 1000).toISOString(),
        remainingSeconds: Math.max(0, Math.ceil((startedAt + 15 * 60 * 1000 - Date.now()) / 1000)),
      };
    });
    return json(outcome);
  }),

  'POST /api/attendance/check-out': protectedRoute(['staff'], async (_ctx, user) => {
    const workDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const result = await db.list<Record<string, unknown>>('attendance', { limit: 1000 });
    const existing = result.items
      .filter(item => item.userId === user.id && item.workDate === workDate && !item.checkOutAt)
      .sort((a, b) => String(b.checkInAt || '').localeCompare(String(a.checkInAt || '')))[0];
    if (!existing) return error('There is no active shift to check out.', 400);
    const [updated] = await db.tx.update('attendance', [{
      id: String(existing.id),
      record: {
        checkOutAt: new Date().toISOString(),
        status: 'Completed',
        gpsStatus: existing.gpsIssueStartedAt ? 'disabled-at-checkout' : (existing.gpsStatus || 'enabled'),
        gpsIssueStartedAt: FieldValue.delete(),
        gpsIssueId: FieldValue.delete(),
        gpsIssueReason: FieldValue.delete(),
        gpsReminderStage: FieldValue.delete(),
      },
    }], { patch: true });
    return updated ? json({ updated: true }) : error('Could not save your check-out.', 500);
  }),

  'POST /api/attendance/admin-start': protectedRoute(['admin'], async ({ body }, admin) => {
    const input = (body || {}) as Record<string, unknown>;
    const staffId = cleanText(input.userId, 128);
    const [member] = await db.get<UserRecord>('users', [staffId], { consistent: true });
    if (!member || member.role !== 'staff' || !member.active) return error('Choose an active staff member.', 400);
    const workDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const result = await db.list<Record<string, unknown>>('attendance', { limit: 1000 });
    const todays = result.items
      .filter(item => item.userId === member.id && item.workDate === workDate)
      .sort((a, b) => String(b.checkInAt || '').localeCompare(String(a.checkInAt || '')));
    const latest = todays[0];
    const gpsRestartAllowed = Boolean(latest && (
      latest.gpsRestartRequired === true ||
      latest.gpsCancelled === true ||
      String(latest.status || '').toLowerCase().includes('cancelled - gps')
    ));
    if (latest && !gpsRestartAllowed) {
      return error(latest.checkOutAt
        ? 'Attendance is already completed for this staff member today.'
        : 'This staff member already has an active shift.', 409);
    }
    const record: Record<string, unknown> = {
      userId: member.id,
      displayName: member.displayName,
      workDate,
      checkInAt: new Date().toISOString(),
      status: 'Checked in',
      startedByAdmin: admin.displayName,
      attendanceSource: 'Admin',
      dayType: input.dayType === 'Half day' ? 'Half day' : 'Full day',
    };
    if (gpsRestartAllowed && latest) {
      record.restartOfAttendanceId = String(latest.id);
      record.restartedAfterGpsCancellation = true;
    }
    const [id] = await db.add('attendance', [record]);
    return id ? json({ id, ...record }, 201) : error('Could not start this staff shift.', 500);
  }),

  'POST /api/attendance/admin-end': protectedRoute(['admin'], async ({ body }, admin) => {
    const input = (body || {}) as Record<string, unknown>;
    const staffId = cleanText(input.userId, 128);
    const workDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const result = await db.list<Record<string, unknown>>('attendance', { limit: 1000 });
    const existing = result.items
      .filter(item => item.userId === staffId && item.workDate === workDate && !item.checkOutAt)
      .sort((a, b) => String(b.checkInAt || '').localeCompare(String(a.checkInAt || '')))[0];
    if (!existing) return error('There is no active shift for this staff member.', 400);
    const [updated] = await db.tx.update('attendance', [{
      id: String(existing.id),
      record: {
        checkOutAt: new Date().toISOString(),
        status: 'Completed',
        endedByAdmin: admin.displayName,
        gpsIssueStartedAt: FieldValue.delete(),
        gpsIssueId: FieldValue.delete(),
        gpsIssueReason: FieldValue.delete(),
        gpsReminderStage: FieldValue.delete(),
      },
    }], { patch: true });
    return updated ? json({ updated: true }) : error('Could not end this staff shift.', 500);
  }),

  'GET /api/holidays': protectedRoute(['admin', 'staff'], async (_ctx, user) => {
    const result = await db.list<Record<string, unknown>>('holiday_requests', { limit: 500 });
    const items = user.role === 'admin'
      ? result.items
      : result.items.filter(item => item.userId === user.id);
    items.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return json({ items });
  }),

  'POST /api/holidays': protectedRoute(['staff'], async ({ body }, user) => {
    const input = (body || {}) as Record<string, unknown>;
    const startDate = cleanText(input.startDate, 10);
    const endDate = cleanText(input.endDate, 10);
    const reason = cleanText(input.reason, 300);
    if (!isValidDateRange(startDate, endDate) || reason.length < 3) {
      return error('Choose a valid holiday date range and provide a reason.', 400);
    }
    const current = await db.list<Record<string, unknown>>('holiday_requests', { limit: 500 });
    const overlaps = current.items.some(item =>
      item.userId === user.id &&
      ['pending', 'approved'].includes(String(item.status)) &&
      String(item.startDate || '') <= endDate &&
      String(item.endDate || '') >= startDate
    );
    if (overlaps) return error('You already have a pending or approved holiday request for part of these dates.', 409);
    const record = {
      userId: user.id,
      displayName: user.displayName,
      startDate,
      endDate,
      reason,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    const [id] = await db.add('holiday_requests', [record]);
    if (!id) return error('Could not submit the holiday request.', 500);
    const users = await db.list<UserRecord>('users', { limit: 500 });
    const admins = users.items.filter(member => member.role === 'admin' && member.active === true);
    await Promise.all(admins.map(admin => db.add('staff_notifications', [{
      recipientId: admin.id,
      recipientRole: 'admin',
      type: 'holiday-request',
      title: 'New holiday request',
      message: user.displayName + ' requested leave from ' + startDate + ' to ' + endDate + '.',
      relatedId: id,
      createdAt: new Date().toISOString(),
      read: false,
    }])));
    await writeAudit(user, 'CREATE', 'holiday_request', id, 'Submitted holiday request from ' + startDate + ' to ' + endDate);
    return json({ id, ...record }, 201);
  }),

  'PUT /api/holidays/:id': protectedRoute(['admin'], async ({ body, params }, admin) => {
    const status = cleanText(body?.status, 20).toLowerCase();
    if (!['approved', 'rejected'].includes(status)) {
      return error('Choose approve or reject for this holiday request.', 400);
    }
    const [existing] = await db.get<Record<string, unknown>>('holiday_requests', [params.id], { consistent: true });
    if (!existing) return error('Holiday request not found.', 404);
    if (existing.status !== 'pending') return error('This holiday request has already been reviewed.', 409);
    const reviewedAt = new Date().toISOString();
    const [updated] = await db.tx.update('holiday_requests', [{
      id: params.id,
      record: {
        status,
        reviewedAt,
        reviewedBy: admin.id,
        reviewedByName: admin.displayName,
      },
    }], { patch: true });
    if (!updated) return error('Could not update this holiday request.', 500);
    const label = status === 'approved' ? 'approved' : 'rejected';
    await db.add('staff_notifications', [{
      recipientId: String(existing.userId || ''),
      recipientRole: 'staff',
      type: 'holiday-' + status,
      title: 'Holiday request ' + label,
      message: 'Your holiday request for ' + String(existing.startDate || '') + ' to ' + String(existing.endDate || '') + ' was ' + label + '.',
      relatedId: params.id,
      createdAt: reviewedAt,
      read: false,
    }]);
    await writeAudit(admin, 'UPDATE', 'holiday_request', params.id, 'Holiday request ' + label);
    return json({ updated: true, status });
  }),

  'GET /api/locations': protectedRoute(['admin'], async () => {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    const [locationResult, attendanceResult] = await Promise.all([
      db.list<Record<string, unknown>>('locations', { limit: 1000 }),
      db.list<Record<string, unknown>>('attendance', { limit: 1000 }),
    ]);
    const latestShiftByStaff = new Map<string, Record<string, unknown>>();
    const todays = attendanceResult.items
      .filter(item => item.workDate === today)
      .sort((a, b) => String(a.checkInAt || '').localeCompare(String(b.checkInAt || '')));
    for (const shift of todays) {
      if (shift.userId) latestShiftByStaff.set(String(shift.userId), shift);
    }
    const activeShiftIds = new Set(
      Array.from(latestShiftByStaff.values())
        .filter(shift => !shift.checkOutAt && shift.gpsRestartRequired !== true && shift.gpsCancelled !== true)
        .map(shift => String(shift.id)),
    );
    const latestLocationByStaff = new Map<string, Record<string, unknown>>();
    for (const point of locationResult.items) {
      const attendanceId = String(point.attendanceId || '');
      const userId = String(point.userId || '');
      if (!userId || !attendanceId || !activeShiftIds.has(attendanceId)) continue;
      const previous = latestLocationByStaff.get(userId);
      if (!previous || String(point.capturedAt || '') > String(previous.capturedAt || '')) {
        latestLocationByStaff.set(userId, point);
      }
    }
    return json({ items: Array.from(latestLocationByStaff.values()) });
  }),

  'GET /api/locations/history': protectedRoute(['admin'], async () => {
    const result = await db.list<Record<string, unknown>>('locations', { limit: 1000 });
    const items = result.items
      .sort((a, b) => String(b.capturedAt || '').localeCompare(String(a.capturedAt || '')))
      .slice(0, 300);
    return json({ items });
  }),

  'POST /api/locations': protectedRoute(['staff'], async ({ body }, user) => {
    const input = (body || {}) as Record<string, unknown>;
    const latitude = Number(input.latitude);
    const longitude = Number(input.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      return error('A valid GPS location is required.', 400);
    }
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    const shifts = await db.list<Record<string, unknown>>('attendance', { limit: 1000 });
    const active = shifts.items
      .filter(item => item.userId === user.id && item.workDate === today && !item.checkOutAt)
      .sort((a, b) => String(b.checkInAt || '').localeCompare(String(a.checkInAt || '')))[0];
    if (!active || active.gpsRestartRequired === true || active.gpsCancelled === true) {
      return error('Location can be shared only during an active, authorised shift.', 403);
    }

    const attendanceRef = firestore.collection('attendance').doc(String(active.id));
    const locationRef = firestore.collection('locations').doc();
    const capturedAt = new Date().toISOString();
    const record = {
      attendanceId: String(active.id),
      userId: user.id,
      displayName: user.displayName,
      latitude,
      longitude,
      accuracy: Math.min(Math.max(Number(input.accuracy) || 0, 0), 100000),
      capturedAt,
    };
    let saved = false;
    let gpsRestored = false;
    await firestore.runTransaction(async transaction => {
      const snapshot = await transaction.get(attendanceRef);
      if (!snapshot.exists) return;
      const shift = snapshot.data() || {};
      if (shift.checkOutAt || shift.gpsRestartRequired === true || shift.gpsCancelled === true) return;
      gpsRestored = Boolean(shift.gpsIssueStartedAt);
      transaction.create(locationRef, record);
      if (gpsRestored) {
        transaction.update(attendanceRef, {
          gpsIssueStartedAt: FieldValue.delete(),
          gpsIssueId: FieldValue.delete(),
          gpsIssueReason: FieldValue.delete(),
          gpsReminderStage: FieldValue.delete(),
          gpsStatus: 'enabled',
          gpsRestoredAt: capturedAt,
          shiftEvents: FieldValue.arrayUnion({ type: 'gps-restored', at: capturedAt }),
        });
      }
      saved = true;
    });
    if (!saved) return error('Location can be shared only during an active shift.', 403);
    return json({ id: locationRef.id, saved: true, gpsRestored }, 201);
  }),

  'GET /api/announcements': protectedRoute(['admin', 'staff'], async () => {
    const result = await db.list<Record<string, unknown>>('announcements', { limit: 100 });
    return json({ items: result.items.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))) });
  }),

  'POST /api/announcements': protectedRoute(['admin'], async ({ body }, user) => {
    const input = (body || {}) as Record<string, unknown>;
    const title = cleanText(input.title, 120);
    const message = cleanText(input.message, 2000);
    if (!title || !message) return error('Enter an announcement title and message.', 400);
    const record = { title, message, createdAt: new Date().toISOString(), createdBy: user.id, createdByName: user.displayName };
    const [id] = await db.add('announcements', [record]);
    return id ? json({ id, ...record }, 201) : error('Could not publish announcement.', 500);
  }),

  'DELETE /api/announcements/:id': protectedRoute(['admin'], async ({ params }) => {
    const [deleted] = await db.delete('announcements', [params.id]);
    return deleted ? json({ deleted: true }) : error('Announcement not found.', 404);
  }),

  'GET /api/messages': protectedRoute(['admin', 'staff'], async (_ctx, user) => {
    const result = await db.list<Record<string, unknown>>('messages', { limit: 300 });
    const items = user.role === 'admin' ? result.items : result.items.filter(item => item.senderId === user.id || item.recipientId === user.id);
    return json({ items: items.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))) });
  }),

  'POST /api/messages': protectedRoute(['admin', 'staff'], async ({ body }, user) => {
    const input = (body || {}) as Record<string, unknown>;
    const message = cleanText(input.message, 1500);
    const recipientId = user.role === 'admin' ? cleanText(input.recipientId, 128) : 'admin-primary';
    if (!message) return error('Write a message before sending.', 400);
    let recipientName = 'K&B Administrator';
    if (user.role === 'admin') {
      const [recipient] = await db.get<UserRecord>('users', [recipientId], { consistent: true });
      if (!recipient || recipient.role !== 'staff' || !recipient.active) return error('Choose an active staff member.', 400);
      recipientName = recipient.displayName;
    }
    const record = { senderId: user.id, senderName: user.displayName, recipientId, recipientName, message, createdAt: new Date().toISOString() };
    const [id] = await db.add('messages', [record]);
    return id ? json({ id, ...record }, 201) : error('Could not send message.', 500);
  }),

  'DELETE /api/messages/:id': protectedRoute(['admin'], async ({ params }) => {
    const [deleted] = await db.delete('messages', [params.id]);
    return deleted ? json({ deleted: true }) : error('Message not found.', 404);
  }),

  'GET /api/groups': protectedRoute(['admin', 'staff'], async (_ctx, user) => {
    const result = await db.list<Record<string, unknown>>('chat_groups', { limit: 100 });
    const items = user.role === 'admin' ? result.items : result.items.filter(group => Array.isArray(group.memberIds) && group.memberIds.includes(user.id));
    return json({ items: items.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))) });
  }),

  'POST /api/groups': protectedRoute(['admin'], async ({ body }, user) => {
    const input = (body || {}) as Record<string, unknown>;
    const name = cleanText(input.name, 60);
    const requestedIds = Array.isArray(input.memberIds) ? Array.from(new Set(input.memberIds.filter((value): value is string => typeof value === 'string' && value.length > 0))).slice(0, 100) : [];
    if (!name) return error('Enter a group name.', 400);
    if (!requestedIds.length) return error('Select at least one staff member for the group.', 400);
    const members = await db.get<UserRecord>('users', requestedIds, { consistent: true });
    const validMembers = members.filter((member): member is UserRecord => !!member && member.role === 'staff' && member.active);
    if (validMembers.length !== requestedIds.length) return error('One or more selected staff accounts are unavailable. Refresh the staff list.', 400);
    const memberIds = [user.id, ...validMembers.map(member => member.id)];
    const memberNames = [user.displayName, ...validMembers.map(member => member.displayName)];
    const record = { name, memberIds, memberNames, createdAt: new Date().toISOString(), createdBy: user.id, createdByName: user.displayName };
    const [id] = await db.add('chat_groups', [record]);
    return id ? json({ id, ...record }, 201) : error('Could not create the group.', 500);
  }),

  'DELETE /api/groups/:id': protectedRoute(['admin'], async ({ params }) => {
    const [group] = await db.get<Record<string, unknown>>('chat_groups', [params.id], { consistent: true });
    if (!group) return error('Group not found.', 404);
    const messages = await db.list<Record<string, unknown>>('group_messages', { limit: 500 });
    const messageIds = messages.items.filter(item => item.groupId === params.id).map(item => String(item.id));
    if (messageIds.length) await db.delete('group_messages', messageIds);
    const [deleted] = await db.delete('chat_groups', [params.id]);
    return deleted ? json({ deleted: true }) : error('Could not delete this group.', 500);
  }),

  'GET /api/groups/:id/messages': protectedRoute(['admin', 'staff'], async ({ params }, user) => {
    const [group] = await db.get<Record<string, unknown>>('chat_groups', [params.id], { consistent: true });
    if (!group) return error('Group not found.', 404);
    if (user.role !== 'admin' && !(Array.isArray(group.memberIds) && group.memberIds.includes(user.id))) return error('You are not a member of this group.', 403);
    const result = await db.list<Record<string, unknown>>('group_messages', { limit: 300 });
    const items = result.items.filter(item => item.groupId === params.id).sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
    return json({ items });
  }),

  'POST /api/groups/:id/messages': protectedRoute(['admin', 'staff'], async ({ params, body }, user) => {
    const [group] = await db.get<Record<string, unknown>>('chat_groups', [params.id], { consistent: true });
    if (!group) return error('Group not found.', 404);
    if (user.role !== 'admin' && !(Array.isArray(group.memberIds) && group.memberIds.includes(user.id))) return error('You are not a member of this group.', 403);
    const input = (body || {}) as Record<string, unknown>;
    const message = cleanText(input.message, 1500);
    if (!message) return error('Write a message before sending.', 400);
    const record = { groupId: params.id, senderId: user.id, senderName: user.displayName, message, createdAt: new Date().toISOString() };
    const [id] = await db.add('group_messages', [record]);
    if (!id) return error('Could not send the group message.', 500);
    await notifySubscribers('groupchat', params.id, { changed: true });
    return json({ id, ...record }, 201);
  }),

  'DELETE /api/groups/:id/messages/:messageId': protectedRoute(['admin'], async ({ params }) => {
    const [message] = await db.get<Record<string, unknown>>('group_messages', [params.messageId], { consistent: true });
    if (!message || message.groupId !== params.id) return error('Group message not found.', 404);
    const [deleted] = await db.delete('group_messages', [params.messageId]);
    if (deleted) await notifySubscribers('groupchat', params.id, { changed: true });
    return deleted ? json({ deleted: true }) : error('Could not delete this group message.', 500);
  }),

  'GET /api/expenses': protectedRoute(['admin'], async () => {
    const result = await db.list<Record<string, unknown>>('expenses', { limit: 500 });
    return json({ items: result.items.sort((a, b) => String(b.spentAt || '').localeCompare(String(a.spentAt || ''))) });
  }),

  'POST /api/expenses': protectedRoute(['admin'], async ({ body }, user) => {
    const input = (body || {}) as Record<string, unknown>;
    const title = cleanText(input.title, 120);
    const category = cleanText(input.category, 60);
    const amount = Number(input.amount);
    const spentAt = cleanText(input.spentAt, 20);
    const method = cleanText(input.method, 40);
    if (!title || !category || !validMoney(amount) || amount <= 0 || !/^\\d{4}-\\d{2}-\\d{2}$/.test(spentAt) || !method) return error('Enter a valid expense title, category, amount, date and payment method.', 400);
    const record = { title, category, amount, spentAt, method, notes: cleanText(input.notes, 300), createdBy: user.id, createdByName: user.displayName, createdAt: new Date().toISOString() };
    const [id] = await db.add('expenses', [record]);
    if (!id) return error('Could not save expense.', 500);
    await writeAudit(user, 'CREATE', 'expense', id, 'Recorded ' + category + ' expense of ₹' + amount);
    return json({ id, ...record }, 201);
  }),

  'DELETE /api/expenses/:id': protectedRoute(['admin'], async ({ params }, user) => {
    const [expense] = await db.get<Record<string, unknown>>('expenses', [params.id], { consistent: true });
    if (!expense) return error('Expense not found.', 404);
    const [deleted] = await db.delete('expenses', [params.id]);
    if (!deleted) return error('Could not delete expense.', 500);
    await writeAudit(user, 'DELETE', 'expense', params.id, 'Deleted expense: ' + String(expense.title || 'Expense'));
    return json({ deleted: true });
  }),

  'PUT /api/invoices/:id/void': protectedRoute(['admin'], async ({ params }, user) => {
    const [invoice] = await db.get<Record<string, unknown>>('invoices', [params.id], { consistent: true });
    if (!invoice) return error('Invoice not found.', 404);
    const [updated] = await db.tx.update('invoices', [{ id: params.id, record: { voidedAt: new Date().toISOString(), voidedBy: user.id } }], { patch: true });
    if (updated) await writeAudit(user, 'VOID', 'invoice', params.id, 'Voided invoice for ' + String(invoice.customerName || 'customer') + ' (' + String(invoice.period || '') + ')');
    return updated ? json({ voided: true }) : error('Could not void invoice.', 500);
  }),

  'GET /api/invoices': protectedRoute(['admin'], async ({ query }) => {
    const period = cleanText(query.period, 7);
    if (!/^\\d{4}-\\d{2}$/.test(period)) return error('Select a valid billing month.', 400);
    const [invoiceResult, paymentResult] = await Promise.all([
      db.list<Record<string, unknown>>('invoices', { limit: 500 }),
      db.list<Payment>('payments', { limit: 500 })
    ]);
    const monthLabel = new Date(period + '-01T12:00:00').toLocaleString('en-IN', { month: 'long', year: 'numeric' });
    const items = invoiceResult.items.filter(item => item.period === period).map(item => {
      const paidAmount = paymentResult.items.filter(payment => payment.customerId === item.customerId && (payment.month === monthLabel || payment.paidAt?.slice(0, 7) === period)).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
      const amount = Number(item.amount || 0);
      const status = item.voidedAt ? 'Void' : paidAmount >= amount ? 'Paid' : paidAmount > 0 ? 'Partially paid' : 'Unpaid';
      return { ...item, paidAmount: item.voidedAt ? 0 : paidAmount, status };
    });
    return json({ items });
  }),

  'POST /api/invoices/generate': protectedRoute(['admin'], async ({ body }, user) => {
    const input = (body || {}) as Record<string, unknown>;
    const period = cleanText(input.period, 7);
    if (!/^\\d{4}-\\d{2}$/.test(period)) return error('Select a valid billing month.', 400);
    const customers = await db.list<Customer>('customers', { limit: 500 });
    const existing = await db.list<Record<string, unknown>>('invoices', { limit: 500 });
    const existingKeys = new Set(existing.items.map(item => String(item.customerId) + '|' + String(item.period)));
    const active = customers.items.filter(customer => customer.status === 'Active');
    let created = 0;
    for (const customer of active) {
      const key = customer.id + '|' + period;
      if (existingKeys.has(key)) continue;
      const [year, month] = period.split('-').map(Number);
      const dueDay = customer.dueDate && /^\\d{4}-\\d{2}-\\d{2}$/.test(customer.dueDate) ? Number(customer.dueDate.slice(-2)) : 10;
      const maxDay = new Date(year, month, 0).getDate();
      const dueDate = period + '-' + String(Math.min(Math.max(dueDay, 1), maxDay)).padStart(2, '0');
      const id = 'inv-' + createHash('sha256').update(key).digest('hex').slice(0, 32);
      const [saved] = await db.tx.add('invoices', [{ id, customerId: customer.id, customerName: customer.name, period, dueDate, amount: Number(customer.monthlyFee || 0), createdAt: new Date().toISOString(), createdBy: user.id }]);
      if (saved) created += 1;
    }
    await writeAudit(user, 'GENERATE', 'invoice_batch', period, 'Generated ' + created + ' monthly invoices for ' + period);
    return json({ created, skippedExisting: Math.max(0, active.length - created) });
  }),

  'GET /api/audit': protectedRoute(['admin'], async () => {
    const result = await db.list<Record<string, unknown>>('audit_logs', { limit: 300 });
    return json({ items: result.items.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))) });
  }),

  'DELETE /api/visits/:id': protectedRoute(['admin'], async ({ params }, user) => {
    const [visit] = await db.get<Record<string, unknown>>('visits', [params.id], { consistent: true });
    if (!visit) return error('Visit record not found.', 404);
    const [deleted] = await db.delete('visits', [params.id]);
    if (!deleted) return error('Could not delete visit record.', 500);
    await writeAudit(user, 'DELETE', 'visit', params.id, 'Deleted field visit for ' + String(visit.customerName || 'customer'));
    return json({ deleted: true });
  }),

  'GET /api/visits': protectedRoute(['admin', 'staff'], async (_ctx, user) => {
    const result = await db.list<Record<string, unknown>>('visits', { limit: 300 });
    return json({ items: user.role === 'admin' ? result.items : result.items.filter(item => item.staffId === user.id) });
  }),

  'POST /api/visits': protectedRoute(['staff'], async ({ body }, user) => {
    const input = (body || {}) as Record<string, unknown>;
    const customerId = cleanText(input.customerId, 128);
    const [customer] = await db.get<Customer>('customers', [customerId], { consistent: true });
    if (!customer) return error('Customer not found.', 404);
    if (customer.assignedTo !== user.id) return error('You can record visits only for your assigned customers.', 403);
    const purpose = cleanText(input.purpose, 120);
    if (!purpose) return error('Enter the visit purpose.', 400);
    const record = { customerId, customerName: customer.name, purpose, notes: cleanText(input.notes, 1200), visitedAt: cleanText(input.visitedAt, 40) || new Date().toISOString(), staffId: user.id, staffName: user.displayName };
    const [id] = await db.add('visits', [record]);
    return id ? json({ id, ...record }, 201) : error('Could not save the visit record.', 500);
  }),
});