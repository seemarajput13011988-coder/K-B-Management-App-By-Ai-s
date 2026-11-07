import { router, json, error, db, secrets, firestore, FieldValue } from './firestore-adapter.js';
import type { RouterMiddleware } from './firestore-adapter.js';
import { computeShiftDeadline, isConfirmedGpsLossReason, isFreshLocationTimestamp, isValidDateRange } from './route-path.js';
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
  phone?: string;
  monthlySalary?: number;
};
type SafeUser = Pick<UserRecord, 'id' | 'userId' | 'displayName' | 'role' | 'active' | 'createdAt' | 'phone' | 'monthlySalary'>;
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
  id?: string;
  complaintFor: 'Customer' | 'Staff';
  customerId?: string;
  customerName?: string;
  staffId?: string;
  staffName?: string;
  subject: string;
  details: string;
  priority: string;
  status: string;
  createdAt: string;
  createdBy?: string;
  createdByName?: string;
  assignedTo?: string;
  assignedToName?: string;
  locationText?: string;
  latitude?: number;
  longitude?: number;
  resolvedBy?: string;
  resolvedByName?: string;
  resolvedAt?: string;
  resolutionDetails?: string;
};
type SessionRecord = { userId: string; expiresAt: number };
type TaskRecord = { title: string; details: string; assignedTo: string; assignedToName: string; priority: string; dueDate: string; status: string; createdAt: string; createdBy: string; createdByName: string; updatedAt?: string; updatedBy?: string; updatedByName?: string; completedAt?: string; completedBy?: string; completedByName?: string };
type PlanRecord = { id?: string; name: string; provider: string; speed: string; data: string; price: number; note: string; details?: string; connectionType: string; featured: boolean; active: boolean };
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
  createdAt: user.createdAt,
  phone: user.phone || '',
  monthlySalary: Number.isFinite(Number(user.monthlySalary)) ? Number(user.monthlySalary) : 0,
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
  if (!session || !Number.isFinite(Number(session.expiresAt)) || Number(session.expiresAt) <= Date.now()) return null;
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


type EvidenceInput = { fileName?: unknown; mimeType?: unknown; dataBase64?: unknown };
async function saveEvidenceFiles(collectionName: string, parentField: string, parentId: string, user: UserRecord, rawFiles: unknown[]) {
  if (rawFiles.length > 2) throw new Error('Attach no more than one photo and one video.');
  const prepared = rawFiles.map((raw, index) => {
    const file = (raw || {}) as EvidenceInput;
    const fileName = cleanText(file.fileName, 120) || ('evidence-' + (index + 1));
    const mimeType = cleanText(file.mimeType, 100).toLowerCase();
    const dataBase64 = typeof file.dataBase64 === 'string' ? file.dataBase64 : '';
    if (!/^image\/(jpeg|png|webp)$|^video\/(mp4|webm|quicktime|3gpp)$/.test(mimeType)) throw new Error('Use JPG, PNG or WEBP photos, or MP4, WEBM or MOV videos.');
    const maxBytes = mimeType.startsWith('image/') ? 2 * 1024 * 1024 : 8 * 1024 * 1024;
    if (!dataBase64 || dataBase64.length > Math.ceil(maxBytes * 4 / 3) + 8) throw new Error('An attachment is empty or too large.');
    const buffer = Buffer.from(dataBase64, 'base64');
    if (!buffer.length || buffer.length > maxBytes || buffer.toString('base64').replace(/=+$/, '') !== dataBase64.replace(/=+$/, '')) throw new Error('Attachment data is invalid or exceeds the allowed size.');
    return { fileName, mimeType, dataBase64, size: buffer.length, mediaId: randomBytes(12).toString('hex') };
  });
  const collection = firestore.collection(collectionName);
  const batch = firestore.batch();
  const createdAt = new Date().toISOString();
  const metadata = prepared.map(file => {
    const chunkSize = 400000;
    const chunkCount = Math.ceil(file.dataBase64.length / chunkSize);
    batch.set(collection.doc(), { [parentField]: parentId, mediaId: file.mediaId, chunkIndex: -1, fileName: file.fileName, mimeType: file.mimeType, size: file.size, chunkCount, createdAt, uploadedBy: user.id, uploadedByName: user.displayName });
    for (let index = 0; index < chunkCount; index += 1) batch.set(collection.doc(), { [parentField]: parentId, mediaId: file.mediaId, chunkIndex: index, data: file.dataBase64.slice(index * chunkSize, (index + 1) * chunkSize) });
    return { mediaId: file.mediaId, fileName: file.fileName, mimeType: file.mimeType, size: file.size, createdAt };
  });
  if (prepared.length) await batch.commit();
  return metadata;
}
async function readEvidenceFile(collectionName: string, parentField: string, parentId: string, mediaId: string) {
  const snapshot = await firestore.collection(collectionName).where(parentField, '==', parentId).where('mediaId', '==', mediaId).get();
  if (snapshot.empty) return null;
  const docs = snapshot.docs.map(doc => doc.data()).sort((a, b) => Number(a.chunkIndex) - Number(b.chunkIndex));
  const metadata = docs.find(doc => Number(doc.chunkIndex) === -1);
  if (!metadata) return null;
  return { fileName: metadata.fileName, mimeType: metadata.mimeType, dataBase64: docs.filter(doc => Number(doc.chunkIndex) >= 0).map(doc => String(doc.data || '')).join('') };
}

function indiaDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

function shiftDueAt(item: Record<string, unknown>, fallbackEndTime = '19:00'): number {
  const savedDeadline = Date.parse(String(item.autoCheckoutAt || item.scheduledEndAt || ''));
  if (Number.isFinite(savedDeadline)) return savedDeadline;
  const deadline = computeShiftDeadline(
    String(item.workDate || ''),
    String(item.checkInAt || ''),
    typeof item.shiftEndTime === 'string' ? item.shiftEndTime : fallbackEndTime,
  );
  return deadline ? Date.parse(deadline) : Number.NaN;
}

function computeAutoCheckoutAt(workDate: string, startedAt: string, endTime: string): string {
  const deadline = computeShiftDeadline(workDate, startedAt, endTime);
  if (!deadline) throw new Error('Could not calculate the automatic shift end time.');
  return deadline;
}
async function getWorkforceSettings() {
  const snapshot = await firestore.collection('app_settings').doc('workforce').get();
  const data = snapshot.data() || {};
  const validTime = (value: unknown, fallback: string) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fallback;
  return { shiftStartTime: validTime(data.shiftStartTime, '08:00'), shiftEndTime: validTime(data.shiftEndTime, '19:00') };
}
function timeToMinutes(value: string) {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function isOpenShift(item: Record<string, unknown>): boolean {
  return !item.checkOutAt && item.dayType !== 'Absent' &&
    !item.gpsRestartRequired && !item.gpsCancelled &&
    !String(item.status || '').toLowerCase().includes('cancelled') &&
    !String(item.status || '').toLowerCase().includes('completed');
}

function findOpenShift(items: Record<string, unknown>[], userId: string) {
  return items
    .filter(item => item.userId === userId && isOpenShift(item))
    .sort((a, b) => String(b.checkInAt || '').localeCompare(String(a.checkInAt || '')))[0];
}

function findActiveShift(items: Record<string, unknown>[], userId: string, now = Date.now(), fallbackEndTime = '19:00') {
  return items
    .filter(item => item.userId === userId && isOpenShift(item) && shiftDueAt(item, fallbackEndTime) > now)
    .sort((a, b) => String(b.checkInAt || '').localeCompare(String(a.checkInAt || '')))[0];
}

async function listAttendanceForUser(userId: string): Promise<Record<string, unknown>[]> {
  const snapshot = await firestore.collection('attendance').where('userId', '==', userId).get();
  const items: Record<string, unknown>[] = snapshot.docs.map(doc => ({
    ...(doc.data() as Record<string, unknown>), id: doc.id,
  }));
  return items.sort((a, b) => String(b.checkInAt || '').localeCompare(String(a.checkInAt || '')));
}

async function listRecentAttendance(limit = 500): Promise<Record<string, unknown>[]> {
  const snapshot = await firestore.collection('attendance').orderBy('checkInAt', 'desc').limit(limit).get();
  return snapshot.docs.map(doc => ({ ...(doc.data() as Record<string, unknown>), id: doc.id }));
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

  'GET /api/workforce-settings': protectedRoute(['admin', 'staff'], async (_ctx, user) => {
    return json({ ...(await getWorkforceSettings()), timezone: 'Asia/Kolkata', adminOverrideAllowed: user.role === 'admin' });
  }),
  'PUT /api/workforce-settings': protectedRoute(['admin'], async ({ body }, admin) => {
    const input = (body || {}) as Record<string, unknown>;
    const startTime = cleanText(input.shiftStartTime, 5), endTime = cleanText(input.shiftEndTime, 5);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) || timeToMinutes(startTime) >= timeToMinutes(endTime)) {
      return error('Choose valid shift times. The start time must be earlier than the end time.', 400);
    }
    const updatedAt = new Date().toISOString();
    await firestore.collection('app_settings').doc('workforce').set({ shiftStartTime: startTime, shiftEndTime: endTime, updatedAt, updatedBy: admin.id, updatedByName: admin.displayName }, { merge: true });
    // Apply the new end time to every currently open shift, not only shifts created later.
    const activeShifts = await firestore.collection('attendance').where('status', '==', 'Checked in').get();
    let rescheduledShifts = 0;
    for (let offset = 0; offset < activeShifts.docs.length; offset += 400) {
      const batch = firestore.batch();
      let batchWrites = 0;
      for (const document of activeShifts.docs.slice(offset, offset + 400)) {
        const shift = document.data();
        if (shift.checkOutAt || shift.dayType === 'Absent' || shift.gpsRestartRequired || shift.gpsCancelled) continue;
        const deadline = computeShiftDeadline(String(shift.workDate || ''), String(shift.checkInAt || ''), endTime);
        if (!deadline) continue;
        batch.update(document.ref, { shiftStartTime: startTime, shiftEndTime: endTime, autoCheckoutAt: deadline, scheduledEndAt: deadline, scheduleUpdatedAt: updatedAt });
        batchWrites += 1;
        rescheduledShifts += 1;
      }
      if (batchWrites) await batch.commit();
    }
    await writeAudit(admin, 'UPDATE', 'workforce_settings', 'workforce', 'Changed staff shift window to ' + startTime + '–' + endTime + ' India time and rescheduled ' + rescheduledShifts + ' active shifts.');
    return json({ shiftStartTime: startTime, shiftEndTime: endTime, updatedAt, rescheduledShifts });
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
    const monthlySalary = input.monthlySalary === undefined ? Number(target.monthlySalary || 0) : Number(input.monthlySalary);
    if (!Number.isFinite(monthlySalary) || monthlySalary < 0 || monthlySalary > 1000000) return error('Monthly salary must be between ₹0 and ₹10,00,000.', 400);
    const [updated] = await db.tx.update('users', [{ id: target.id, record: { displayName, active, monthlySalary } }], { patch: true });
    return updated ? json({ updated: true, monthlySalary }) : error('Could not update staff account.', 500);
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
    const record: PlanRecord = { name, provider, speed, data, price, note: cleanText(input.note, 180), details: cleanText(input.details, 1000), connectionType, featured: input.featured === true, active: true };
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
    const record = { name, provider, speed, data, price, note: cleanText(input.note, 180), details: cleanText(input.details, 1000), connectionType, featured: input.featured === true, active: input.active !== false };
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
    if (!record.name || !/^\d{10}$/.test(record.phone) || !record.address || !record.plan || !validMoney(record.monthlyFee)) {
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
      if (!/^\d{10}$/.test(limited.phone)) return error('Enter a 10-digit mobile number using numbers only.', 400);
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
    if (!record.name || !/^\d{10}$/.test(record.phone) || !record.address || !record.plan || !validMoney(record.monthlyFee)) {
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

  'PUT /api/payments/:id': protectedRoute(['admin'], async ({ body, params }, user) => {
    const input = (body || {}) as Payment;
    const [existing] = await db.get<Payment>('payments', [params.id], { consistent: true });
    if (!existing) return error('Payment record not found.', 404);
    const customerId = cleanText(input.customerId || existing.customerId, 128);
    const [customer] = await db.get<Customer>('customers', [customerId], { consistent: true });
    if (!customer) return error('Customer not found.', 404);
    const amount = Number(input.amount);
    const method = cleanText(input.method, 40);
    const paidAt = cleanText(input.paidAt, 20);
    const month = cleanText(input.month, 40);
    if (!validMoney(amount) || amount <= 0 || !method || !month || !/^\d{4}-\d{2}-\d{2}$/.test(paidAt)) {
      return error('Please provide a valid payment amount, method, billing month and payment date.', 400);
    }
    const patch = { customerId, customerName: customer.name, amount, method, paidAt, month, updatedAt: new Date().toISOString() };
    const [updated] = await db.tx.update('payments', [{ id: params.id, record: patch }], { patch: true });
    if (!updated) return error('Could not update payment.', 500);
    await writeAudit(user, 'UPDATE', 'payment', params.id, 'Updated payment of ₹' + amount + ' for ' + customer.name);
    return json({ updated: true });
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
    const mediaSnapshot = await firestore.collection('complaint_media').where('chunkIndex', '==', -1).limit(500).get();
    const mediaByComplaint = new Map<string, Array<Record<string, unknown>>>();
    mediaSnapshot.docs.forEach(doc => {
      const item = doc.data();
      const list = mediaByComplaint.get(String(item.complaintId)) || [];
      list.push({ mediaId: item.mediaId, fileName: item.fileName, mimeType: item.mimeType, size: item.size, createdAt: item.createdAt });
      mediaByComplaint.set(String(item.complaintId), list);
    });
    const withMedia = result.items.map(item => ({ ...item, attachments: mediaByComplaint.get(String(item.id)) || [] }));
    if (user.role === 'admin') return json({ items: withMedia });
    const customers = await db.list<Customer>('customers', { limit: 1000 });
    const assignedIds = new Set(customers.items.filter(item => item.assignedTo === user.id).map(item => item.id));
    return json({ items: withMedia.filter(item => assignedIds.has(item.customerId) || item.assignedTo === user.id || item.staffId === user.id || item.createdBy === user.id) });
  }),

  'POST /api/complaints': protectedRoute(['admin', 'staff'], async ({ body }, user) => {
    const rawInput = (body || {}) as Record<string, unknown>;
    const input = rawInput as unknown as Complaint;
    const evidenceFiles = Array.isArray(rawInput.attachments) ? rawInput.attachments : [];
    if (user.role === 'staff' && evidenceFiles.length === 0) return error('Attach at least one photo or video before submitting a complaint.', 400);
    const complaintFor = input.complaintFor === 'Staff' ? 'Staff' : 'Customer';
    const customerId = cleanText(input.customerId, 128);
    const staffId = cleanText(input.staffId, 128);
    let customer: Customer | undefined;
    let subjectStaff: UserRecord | undefined;
    if (complaintFor === 'Customer') {
      if (!customerId) return error('Choose the customer for this complaint.', 400);
      const [foundCustomer] = await db.get<Customer>('customers', [customerId], { consistent: true });
      customer = foundCustomer || undefined;
      if (!customer) return error('Customer not found.', 404);
      if (user.role === 'staff' && customer.assignedTo !== user.id) return error('You can only submit complaints for customers assigned to you.', 403);
    } else {
      if (!staffId) return error('Choose the staff member for this complaint.', 400);
      const [foundStaff] = await db.get<UserRecord>('users', [staffId], { consistent: true });
      subjectStaff = foundStaff || undefined;
      if (!subjectStaff || subjectStaff.role !== 'staff' || !subjectStaff.active) return error('Choose an active staff member.', 400);
      if (user.role === 'staff' && staffId !== user.id) return error('You can only submit a staff complaint for yourself.', 403);
    }
    const assignedTo = cleanText(input.assignedTo, 128);
    let assignedToName = '';
    if (assignedTo) {
      const [member] = await db.get<UserRecord>('users', [assignedTo], { consistent: true });
      if (!member || member.role !== 'staff' || !member.active) return error('Choose an active staff member for assignment.', 400);
      assignedToName = member.displayName;
    }
    const latitude = Number(input.latitude);
    const longitude = Number(input.longitude);
    const record: Complaint = {
      complaintFor,
      ...(customerId ? { customerId, customerName: customer?.name || '' } : {}),
      ...(staffId ? { staffId, staffName: subjectStaff?.displayName || '' } : {}),
      subject: cleanText(input.subject, 150),
      details: cleanText(input.details, 1500),
      priority: ['Low', 'Normal', 'High'].includes(input.priority) ? input.priority : 'Normal',
      status: assignedTo ? 'Assigned' : 'Pending',
      createdAt: cleanText(input.createdAt, 30) || new Date().toISOString(),
      createdBy: user.id,
      createdByName: user.displayName,
      assignedTo,
      assignedToName,
      locationText: cleanText(input.locationText, 250),
      ...(Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 ? { latitude } : {}),
      ...(Number.isFinite(longitude) && longitude >= -180 && longitude <= 180 ? { longitude } : {}),
    };
    if (!record.subject) return error('A complaint subject is required.', 400);
    const [id] = await db.add('complaints', [record as unknown as Record<string, unknown>]);
    if (!id) return error('Could not create complaint.', 500);
    try {
      const attachments = await saveEvidenceFiles('complaint_media', 'complaintId', id, user, evidenceFiles);
      return json({ id, ...record, attachments }, 201);
    } catch (err) {
      await db.delete('complaints', [id]);
      return error(err instanceof Error ? err.message : 'Could not save complaint evidence.', 400);
    }
  }),

  'PUT /api/complaints/:id': protectedRoute(['admin'], async ({ params, body }, user) => {
    const input = (body || {}) as Complaint;
    const [existing] = await db.get<Complaint>('complaints', [params.id], { consistent: true });
    if (!existing) return error('Complaint not found.', 404);
    if (user.role === 'staff' && existing.assignedTo !== user.id) return error('Only the assigned staff member or an administrator can update this complaint.', 403);
    const allowedStatuses = ['Pending', 'Assigned', 'In Progress', 'Solved', 'Not Solved'];
    const status = allowedStatuses.includes(input.status) ? input.status : existing.status;
    const patch: Record<string, unknown> = { status };
    if (user.role === 'admin' && Object.prototype.hasOwnProperty.call(input, 'assignedTo')) {
      const assignedTo = cleanText(input.assignedTo, 128);
      let assignedToName = '';
      if (assignedTo) {
        const [member] = await db.get<UserRecord>('users', [assignedTo], { consistent: true });
        if (!member || member.role !== 'staff' || !member.active) return error('Choose an active staff member for this assignment.', 400);
        assignedToName = member.displayName;
      }
      patch.assignedTo = assignedTo;
      patch.assignedToName = assignedToName;
      if (assignedTo && status === 'Pending') patch.status = 'Assigned';
    }
    if (Object.prototype.hasOwnProperty.call(input, 'resolutionDetails')) patch.resolutionDetails = cleanText(input.resolutionDetails, 1500);
    if (status === 'Solved') {
      patch.resolvedBy = user.id;
      patch.resolvedByName = user.displayName;
      patch.resolvedAt = new Date().toISOString();
    } else if (existing.status === 'Solved') {
      patch.resolvedBy = '';
      patch.resolvedByName = '';
      patch.resolvedAt = '';
    }
    const [updated] = await db.tx.update('complaints', [{ id: params.id, record: patch }], { patch: true });
    if (updated) await writeAudit(user, 'UPDATE', 'complaint', params.id, 'Updated complaint: ' + existing.subject + ' · ' + String(patch.status || status));
    return updated ? json({ updated: true }) : error('Could not update complaint.', 500);
  }),

  'POST /api/complaints/:id/media': protectedRoute(['admin'], async ({ params, body }, user) => {
    const [ticket] = await db.get<Complaint>('complaints', [params.id], { consistent: true });
    if (!ticket) return error('Complaint not found.', 404);
    if (user.role === 'staff' && ticket.createdBy !== user.id && ticket.assignedTo !== user.id && ticket.staffId !== user.id) {
      if (!ticket.customerId) return error('You do not have access to this complaint.', 403);
      const [customer] = await db.get<Customer>('customers', [ticket.customerId], { consistent: true });
      if (customer?.assignedTo !== user.id) return error('You do not have access to this complaint.', 403);
    }
    const fileName = cleanText(body?.fileName, 120) || 'complaint-attachment';
    const mimeType = cleanText(body?.mimeType, 100).toLowerCase();
    const dataBase64 = typeof body?.dataBase64 === 'string' ? body.dataBase64 : '';
    if (!/^image\/(jpeg|png|webp)$|^video\/(mp4|webm|quicktime|3gpp)$/.test(mimeType)) return error('Use a JPG, PNG, WEBP photo or MP4, WEBM, MOV video.', 400);
    const maxBytes = mimeType.startsWith('image/') ? 2 * 1024 * 1024 : 8 * 1024 * 1024;
    if (!dataBase64 || dataBase64.length > Math.ceil(maxBytes * 4 / 3) + 8) return error('Attachment is empty or too large.', 413);
    const buffer = Buffer.from(dataBase64, 'base64');
    if (!buffer.length || buffer.length > maxBytes || buffer.toString('base64').replace(/=+$/, '') !== dataBase64.replace(/=+$/, '')) return error('Attachment data is invalid or exceeds the allowed size.', 400);
    const mediaId = randomBytes(12).toString('hex');
    const chunkSize = 400000;
    const chunkCount = Math.ceil(dataBase64.length / chunkSize);
    const batch = firestore.batch();
    const collection = firestore.collection('complaint_media');
    const createdAt = new Date().toISOString();
    const metadataRef = collection.doc();
    batch.set(metadataRef, { complaintId: params.id, mediaId, chunkIndex: -1, fileName, mimeType, size: buffer.length, chunkCount, createdAt, uploadedBy: user.id, uploadedByName: user.displayName });
    for (let index = 0; index < chunkCount; index += 1) {
      const ref = collection.doc();
      batch.set(ref, { complaintId: params.id, mediaId, chunkIndex: index, data: dataBase64.slice(index * chunkSize, (index + 1) * chunkSize) });
    }
    await batch.commit();
    await writeAudit(user, 'UPLOAD', 'complaint', params.id, 'Attached file to complaint: ' + fileName);
    return json({ mediaId, fileName, mimeType, size: buffer.length, createdAt }, 201);
  }),

  'GET /api/complaints/:id/media/:mediaId': protectedRoute(['admin', 'staff'], async ({ params }, user) => {
    const [ticket] = await db.get<Complaint>('complaints', [params.id], { consistent: true });
    if (!ticket) return error('Complaint not found.', 404);
    if (user.role === 'staff' && ticket.createdBy !== user.id && ticket.assignedTo !== user.id && ticket.staffId !== user.id) {
      if (!ticket.customerId) return error('You do not have access to this complaint.', 403);
      const [customer] = await db.get<Customer>('customers', [ticket.customerId], { consistent: true });
      if (customer?.assignedTo !== user.id) return error('You do not have access to this complaint.', 403);
    }
    const snapshot = await firestore.collection('complaint_media').where('complaintId', '==', params.id).where('mediaId', '==', params.mediaId).get();
    if (snapshot.empty) return error('Attachment not found.', 404);
    const docs = snapshot.docs.map(doc => doc.data()).sort((a, b) => Number(a.chunkIndex) - Number(b.chunkIndex));
    const metadata = docs.find(doc => Number(doc.chunkIndex) === -1);
    if (!metadata) return error('Attachment metadata is missing.', 404);
    const dataBase64 = docs.filter(doc => Number(doc.chunkIndex) >= 0).map(doc => String(doc.data || '')).join('');
    return json({ fileName: metadata.fileName, mimeType: metadata.mimeType, dataBase64 });
  }),

  'DELETE /api/complaints/:id': protectedRoute(['admin'], async ({ params }, user) => {
    const [ticket] = await db.get<Complaint>('complaints', [params.id], { consistent: true });
    if (!ticket) return error('Complaint not found.', 404);
    const media = await firestore.collection('complaint_media').where('complaintId', '==', params.id).get();
    for (let offset = 0; offset < media.docs.length; offset += 400) {
      const batch = firestore.batch();
      media.docs.slice(offset, offset + 400).forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }
    const [deleted] = await db.delete('complaints', [params.id]);
    if (!deleted) return error('Could not delete complaint.', 500);
    await writeAudit(user, 'DELETE', 'complaint', params.id, 'Deleted complaint: ' + ticket.subject);
    return json({ deleted: true });
  }),

  'GET /api/tasks': protectedRoute(['admin', 'staff'], async (_ctx, user) => {
    const result = await db.list<TaskRecord>('tasks', { limit: 200 });
    const mediaSnapshot = await firestore.collection('task_media').where('chunkIndex', '==', -1).limit(500).get();
    const mediaByTask = new Map<string, Array<Record<string, unknown>>>();
    mediaSnapshot.docs.forEach(doc => { const item = doc.data(); const list = mediaByTask.get(String(item.taskId)) || []; list.push({ mediaId: item.mediaId, fileName: item.fileName, mimeType: item.mimeType, size: item.size, createdAt: item.createdAt }); mediaByTask.set(String(item.taskId), list); });
    const withMedia = (result.items as Array<TaskRecord & { id: string }>).map(item => ({ ...item, attachments: mediaByTask.get(String(item.id)) || [] }));
    const items = user.role === 'admin' ? withMedia : withMedia.filter(task => task.assignedTo === user.id);
    return json({ items });
  }),

  'POST /api/tasks': protectedRoute(['admin'], async ({ body }, user) => {
    const input = (body || {}) as Record<string, unknown>;
    const title = cleanText(input.title, 120);
    const details = cleanText(input.details, 1000);
    const assignedTo = cleanText(input.assignedTo, 100);
    const dueDate = cleanText(input.dueDate, 20);
    const priority = ['Low', 'Normal', 'High'].includes(String(input.priority)) ? String(input.priority) : 'Normal';
    if (!title || !assignedTo || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return error('Enter a task title, active staff member and valid due date.', 400);
    const [staffMember] = await db.get<UserRecord>('users', [assignedTo], { consistent: true });
    if (!staffMember || staffMember.role !== 'staff' || !staffMember.active) return error('Choose an active staff account.', 400);
    const record: TaskRecord = { title, details, assignedTo, assignedToName: staffMember.displayName, priority, dueDate, status: 'Pending', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: user.id, createdByName: user.displayName };
    const [id] = await db.add('tasks', [record as unknown as Record<string, unknown>]);
    return id ? json({ id, ...record }, 201) : error('Could not assign task.', 500);
  }),

  'POST /api/tasks/:id/media': protectedRoute(['admin', 'staff'], async ({ params, body }, user) => {
    const [task] = await db.get<TaskRecord>('tasks', [params.id], { consistent: true });
    if (!task) return error('Task not found.', 404);
    if (user.role === 'staff' && task.assignedTo !== user.id) return error('You can upload evidence only to your assigned tasks.', 403);
    const input = (body || {}) as Record<string, unknown>;
    const files = Array.isArray(input.attachments) ? input.attachments : [input];
    try {
      const attachments = await saveEvidenceFiles('task_media', 'taskId', params.id, user, files);
      if (!attachments.length) return error('Select at least one photo or video.', 400);
      await writeAudit(user, 'UPLOAD', 'task', params.id, 'Uploaded task completion evidence for ' + task.title);
      return json({ attachments }, 201);
    } catch (err) { return error(err instanceof Error ? err.message : 'Could not save task evidence.', 400); }
  }),

  'GET /api/tasks/:id/media/:mediaId': protectedRoute(['admin', 'staff'], async ({ params }, user) => {
    const [task] = await db.get<TaskRecord>('tasks', [params.id], { consistent: true });
    if (!task) return error('Task not found.', 404);
    if (user.role === 'staff' && task.assignedTo !== user.id) return error('You do not have access to this task evidence.', 403);
    const file = await readEvidenceFile('task_media', 'taskId', params.id, params.mediaId);
    return file ? json(file) : error('Attachment not found.', 404);
  }),

  'PUT /api/tasks/:id': protectedRoute(['admin', 'staff'], async ({ params, body }, user) => {
    const input = (body || {}) as Record<string, unknown>;
    const status = ['Pending', 'In progress', 'Completed'].includes(String(input.status)) ? String(input.status) : '';
    if (!status) return error('Choose a valid task status.', 400);
    const [task] = await db.get<TaskRecord>('tasks', [params.id], { consistent: true });
    if (!task) return error('Task not found.', 404);
    if (user.role === 'staff' && task.assignedTo !== user.id) return error('You can update only tasks assigned to your account.', 403);
    if (user.role === 'staff' && task.status === 'Completed' && status !== 'Completed') return error('Completed tasks cannot be reopened by staff.', 403);
    if (user.role === 'staff' && task.status === 'In progress' && status === 'Pending') return error('Staff cannot move a task backwards to Pending.', 403);
    if (user.role === 'staff' && status === 'Completed') {
      const evidence = await firestore.collection('task_media').where('taskId', '==', params.id).where('chunkIndex', '==', -1).limit(100).get();
      const ownEvidence = evidence.docs.filter(doc => doc.data().uploadedBy === user.id);
      const hasPhoto = ownEvidence.some(doc => String(doc.data().mimeType || '').startsWith('image/'));
      const hasVideo = ownEvidence.some(doc => String(doc.data().mimeType || '').startsWith('video/'));
      if (!hasPhoto || !hasVideo) return error('Upload both your own task photo and task video before marking it completed.', 400);
    }
    const [updated] = await db.tx.update('tasks', [{ id: params.id, record: { status, updatedAt: new Date().toISOString(), updatedBy: user.id, updatedByName: user.displayName, ...(status === 'Completed' ? { completedAt: new Date().toISOString(), completedBy: user.id, completedByName: user.displayName } : {}) } }], { patch: true });
    return updated ? json({ updated: true }) : error('Could not update task.', 500);
  }),

  'DELETE /api/tasks/:id': protectedRoute(['admin'], async ({ params }, user) => {
    const [task] = await db.get<TaskRecord>('tasks', [params.id], { consistent: true });
    if (!task) return error('Task not found.', 404);
    const media = await firestore.collection('task_media').where('taskId', '==', params.id).get();
    for (let offset = 0; offset < media.docs.length; offset += 400) {
      const batch = firestore.batch();
      media.docs.slice(offset, offset + 400).forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }
    const [deleted] = await db.delete('tasks', [params.id]);
    if (!deleted) return error('Could not delete task.', 500);
    await writeAudit(user, 'DELETE', 'task', params.id, 'Deleted task: ' + task.title);
    return json({ deleted: true });
  }),

  'GET /api/attendance': protectedRoute(['admin', 'staff'], async (_ctx, user) => {
    const [records, settings] = await Promise.all([
      user.role === 'admin' ? listRecentAttendance(5000) : listAttendanceForUser(user.id),
      getWorkforceSettings(),
    ]);
    const items = records.slice(0, 5000).map(record => {
      const shiftEndTime = typeof record.shiftEndTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(record.shiftEndTime) ? record.shiftEndTime : settings.shiftEndTime;
      const shiftStartTime = typeof record.shiftStartTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(record.shiftStartTime) ? record.shiftStartTime : settings.shiftStartTime;
      const autoCheckoutAt = String(record.autoCheckoutAt || record.scheduledEndAt || '') ||
        computeShiftDeadline(String(record.workDate || ''), String(record.checkInAt || ''), shiftEndTime) || '';
      return { ...record, shiftStartTime, shiftEndTime, autoCheckoutAt, scheduledEndAt: autoCheckoutAt };
    });
    return json({ items });
  }),

  'POST /api/attendance/check-in': protectedRoute(['staff'], async ({ body }, user) => {
    const settings = await getWorkforceSettings();
    const indiaClock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    const indiaMinutes = Number(indiaClock.find(part => part.type === 'hour')?.value || 0) * 60 + Number(indiaClock.find(part => part.type === 'minute')?.value || 0);
    if (indiaMinutes < timeToMinutes(settings.shiftStartTime) || indiaMinutes >= timeToMinutes(settings.shiftEndTime)) return error('Staff shift start is available only from ' + settings.shiftStartTime + ' to ' + settings.shiftEndTime + ' India time.', 403);
    const workDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const startedAt = new Date().toISOString();
    const record: Record<string, unknown> = { userId: user.id, displayName: user.displayName, workDate, checkInAt: startedAt, createdAt: startedAt, status: 'Checked in', dayType: body?.dayType === 'Half day' ? 'Half day' : 'Full day', attendanceSource: 'Staff', shiftStartTime: settings.shiftStartTime, shiftEndTime: settings.shiftEndTime, autoCheckoutAt: computeAutoCheckoutAt(workDate, startedAt, settings.shiftEndTime), scheduledEndAt: computeAutoCheckoutAt(workDate, startedAt, settings.shiftEndTime) };
    // Deterministic daily ID and a transaction prevent double taps or two devices
    // from creating duplicate attendance rows for the same staff member and day.
    const attendanceId = 'staff-' + createHash('sha256').update(user.id + '|' + workDate).digest('hex').slice(0, 40);
    const attendanceRef = firestore.collection('attendance').doc(attendanceId);
    const lockRef = firestore.collection('active_shift_locks').doc(user.id);
    const outcome = await firestore.runTransaction(async transaction => {
      const lockSnapshot = await transaction.get(lockRef);
      const lockedAttendanceId = String(lockSnapshot.data()?.attendanceId || '');
      if (lockedAttendanceId) {
        const lockedSnapshot = await transaction.get(firestore.collection('attendance').doc(lockedAttendanceId));
        const locked = lockedSnapshot.data();
        if (locked && isOpenShift({ ...locked, id: lockedAttendanceId })) {
          return { kind: 'open-shift', active: shiftDueAt({ ...locked, id: lockedAttendanceId }, settings.shiftEndTime) > Date.now() };
        }
      }
      const snapshot = await transaction.get(firestore.collection('attendance').where('userId', '==', user.id));
      const existing: Record<string, unknown>[] = snapshot.docs.map(document => ({ ...(document.data() as Record<string, unknown>), id: document.id }));
      const previousOpenShift = findOpenShift(existing, user.id);
      if (previousOpenShift) {
        return { kind: 'open-shift', active: shiftDueAt(previousOpenShift, settings.shiftEndTime) > Date.now() };
      }
      if (existing.some(item => item.workDate === workDate)) return { kind: 'day-recorded', active: false };
      const existingDailyId = await transaction.get(attendanceRef);
      if (existingDailyId.exists) return { kind: 'day-recorded', active: false };
      transaction.create(attendanceRef, record);
      transaction.set(lockRef, { userId: user.id, attendanceId, updatedAt: startedAt }, { merge: true });
      return { kind: 'created', active: false };
    });
    if (outcome.kind === 'open-shift') return error(outcome.active
      ? 'You already have an active shift. End it before starting another shift.'
      : 'Your previous shift is waiting for automatic checkout. Please try again shortly.', 409);
    if (outcome.kind === 'day-recorded') return error('Attendance has already been recorded for today.', 409);
    const id = attendanceId;
    // Attendance check-in no longer collects or stores GPS coordinates.
    return json({ id, ...record }, 201);
  }),

  'PUT /api/attendance/:id/day-type': protectedRoute(['admin'], async ({ body, params }, admin) => {
    const input = (body || {}) as Record<string, unknown>;
    const dayType = input.dayType === 'Half day' ? 'Half day' : input.dayType === 'Full day' ? 'Full day' : input.dayType === 'Absent' ? 'Absent' : '';
    const reason = cleanText(input.reason, 300);
    if (!dayType || reason.length < 3) return error('Choose a day type and provide a correction reason.', 400);
    const [attendance] = await db.get<Record<string, unknown>>('attendance', [params.id], { consistent: true });
    if (!attendance) return error('Attendance record not found.', 404);
    const correctedAt = new Date().toISOString();
    const attendanceRef = firestore.collection('attendance').doc(params.id);
    const auditRef = firestore.collection('audit_logs').doc();
    const batch = firestore.batch();
    batch.update(attendanceRef, {
      dayType,
      status: dayType === 'Absent' ? 'Absent' : attendance.checkOutAt ? 'Completed' : 'Checked in',
      correctionReason: reason, correctedAt, correctedBy: admin.id, correctedByName: admin.displayName,
    });
    batch.set(auditRef, {
      actorId: admin.id, actorName: admin.displayName, action: 'CORRECT_ATTENDANCE',
      entityType: 'attendance', entityId: params.id,
      description: cleanText('Changed day type to ' + dayType + ': ' + reason, 240),
      createdAt: correctedAt,
    });
    await batch.commit();
    return json({ updated: true });
  }),

  'POST /api/attendance/gps-lost': protectedRoute(['staff'], async ({ body }, user) => {
    const attendance = await listAttendanceForUser(user.id);
    const settings = await getWorkforceSettings();
    const active = findActiveShift(attendance, user.id, Date.now(), settings.shiftEndTime);
    if (!active) return json({ monitoring: false, reason: 'no-active-shift' });
    const workDate = String(active.workDate || indiaDateKey());

    const holidays = await db.list<Record<string, unknown>>('holiday_requests', { limit: 1000 });
    const exempt = holidays.items.some(item =>
      item.userId === user.id && ['pending', 'approved'].includes(String(item.status)) &&
      String(item.startDate || '') <= workDate && String(item.endDate || '') >= workDate
    );
    if (exempt) return json({ monitoring: false, reason: 'holiday-exempt' });

    const reason = cleanText(body?.reason, 160);
    if (!isConfirmedGpsLossReason(reason)) return error('A confirmed GPS or location-permission failure is required.', 400);

    const startedAt = String(active.gpsIssueStartedAt || new Date().toISOString());
    const issueId = String(active.gpsIssueId || createHash('sha256').update(String(active.id) + '|' + startedAt).digest('hex').slice(0, 16));
    if (!active.gpsIssueStartedAt || !active.gpsIssueId) {
      const attendanceRef = firestore.collection('attendance').doc(String(active.id));
      const staffNotificationRef = firestore.collection('staff_notifications').doc(String(active.id) + '-gps-' + issueId + '-0');
      const batch = firestore.batch();
      batch.update(attendanceRef, {
        gpsIssueStartedAt: startedAt, gpsIssueId: issueId, gpsStatus: 'grace-period',
        gpsIssueReason: reason, gpsReminderStage: 0,
      });
      batch.set(staffNotificationRef, {
        recipientId: user.id, recipientRole: 'staff', type: 'gps-reminder',
        title: 'GPS is unavailable',
        message: 'Your shift remains active during a 15-minute GPS restoration period. Restore location to keep the shift active.',
        createdAt: startedAt, read: false, attendanceId: active.id,
      });
      await batch.commit();

      try {
        const users = await db.list<UserRecord>('users', { limit: 500 });
        const admins = users.items.filter(item => item.role === 'admin' && item.active === true);
        const adminNotifications = await Promise.allSettled(admins.map(admin => db.add('staff_notifications', [{
          id: String(active.id) + '-gps-' + issueId + '-admin-' + admin.id,
          recipientId: admin.id, recipientRole: 'admin', type: 'gps-issue',
          title: 'Staff GPS is OFF',
          message: user.displayName + ' has lost GPS/location during an active shift. The 15-minute restoration period has started.',
          createdAt: startedAt, read: false, attendanceId: active.id,
        }])));
        for (const result of adminNotifications) {
          if (result.status === 'rejected') console.error('Could not notify an administrator about GPS loss:', result.reason);
        }
      } catch (notificationError) {
        console.error('Could not load administrators for GPS-loss notifications:', notificationError);
      }
    }

    const deadlineAt = new Date(Date.parse(startedAt) + 15 * 60 * 1000).toISOString();
    return json({
      monitoring: true, startedAt, deadlineAt,
      remainingSeconds: Math.max(0, Math.ceil((Date.parse(deadlineAt) - Date.now()) / 1000)),
    });
  }),

  'POST /api/attendance/check-out': protectedRoute(['staff'], async (_ctx, user) => {
    const settings = await getWorkforceSettings();
    // An active shift may have been started by an administrator outside the normal window.
    // Let the assigned staff member end that shift at any time before its saved deadline.
    const result = await listAttendanceForUser(user.id);
    const existing = findActiveShift(result, user.id, Date.now(), settings.shiftEndTime);
    if (!existing) return error('There is no active shift to check out.', 400);
    const [updated] = await db.tx.update('attendance', [{
      id: String(existing.id),
      record: {
        checkOutAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        endedBy: user.id,
        endedByName: user.displayName,
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

  'POST /api/attendance/admin-absent': protectedRoute(['admin'], async ({ body }, admin) => {
    const input = (body || {}) as Record<string, unknown>;
    const staffId = cleanText(input.userId, 128);
    const reason = cleanText(input.reason, 300) || 'Marked absent by administrator';
    const [member] = await db.get<UserRecord>('users', [staffId], { consistent: true });
    if (!member || member.role !== 'staff' || !member.active) return error('Choose an active staff member.', 400);
    const workDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const result = await listAttendanceForUser(member.id);
    const todays = result.filter(item => item.workDate === workDate)
      .sort((a, b) => String(b.checkInAt || '').localeCompare(String(a.checkInAt || '')));
    const latest = todays[0];
    if (latest && !latest.checkOutAt && latest.dayType !== 'Absent') return error('End this staff member’s active shift before marking absent.', 409);
    const markedAt = new Date().toISOString();
    const absence = {
      userId: member.id, displayName: member.displayName, workDate,
      checkInAt: '', checkOutAt: markedAt, createdAt: latest?.createdAt || markedAt, updatedAt: markedAt, status: 'Absent', dayType: 'Absent',
      absenceReason: reason, markedAbsentBy: admin.displayName, attendanceSource: 'Admin',
    };
    const attendanceRef = latest
      ? firestore.collection('attendance').doc(String(latest.id))
      : firestore.collection('attendance').doc();
    const auditRef = firestore.collection('audit_logs').doc();
    const id = attendanceRef.id;
    const batch = firestore.batch();
    if (latest) batch.set(attendanceRef, absence, { merge: true });
    else batch.set(attendanceRef, absence);
    batch.set(auditRef, {
      actorId: admin.id, actorName: admin.displayName, action: 'MARK_ABSENT',
      entityType: 'attendance', entityId: id,
      description: cleanText('Marked ' + member.displayName + ' absent: ' + reason, 240),
      createdAt: markedAt,
    });
    await batch.commit();
    return latest ? json({ updated: true, id }) : json({ id, ...absence }, 201);
  }),

  'POST /api/attendance/admin-start': protectedRoute(['admin'], async ({ body }, admin) => {
    const input = (body || {}) as Record<string, unknown>;
    const staffId = cleanText(input.userId, 128);
    const [member] = await db.get<UserRecord>('users', [staffId], { consistent: true });
    if (!member || member.role !== 'staff' || !member.active) return error('Choose an active staff member.', 400);
    const workDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const settings = await getWorkforceSettings();
    const result = await listAttendanceForUser(member.id);
    const openShift = findOpenShift(result, member.id);
    if (openShift) {
      return error(shiftDueAt(openShift, settings.shiftEndTime) > Date.now()
        ? 'This staff member already has an active shift.'
        : 'The previous shift is waiting for automatic checkout. Please retry shortly.', 409);
    }
    const todays = result
      .filter(item => item.workDate === workDate)
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
    const startedAt = new Date().toISOString();
    const record: Record<string, unknown> = {
      userId: member.id, displayName: member.displayName, workDate,
      checkInAt: startedAt, createdAt: startedAt, status: 'Checked in',
      startedByAdmin: admin.displayName, attendanceSource: 'Admin',
      dayType: input.dayType === 'Half day' ? 'Half day' : 'Full day',
      shiftStartTime: settings.shiftStartTime, shiftEndTime: settings.shiftEndTime,
      autoCheckoutAt: computeAutoCheckoutAt(workDate, startedAt, settings.shiftEndTime),
    };
    if (gpsRestartAllowed && latest) {
      record.restartOfAttendanceId = String(latest.id);
      record.restartedAfterGpsCancellation = true;
    }
    const attendanceRef = firestore.collection('attendance').doc();
    const auditRef = firestore.collection('audit_logs').doc();
    const notificationRef = firestore.collection('staff_notifications').doc();
    const id = attendanceRef.id;
    const lockRef = firestore.collection('active_shift_locks').doc(member.id);
    const outcome = await firestore.runTransaction(async transaction => {
      const lockSnapshot = await transaction.get(lockRef);
      const lockedId = String(lockSnapshot.data()?.attendanceId || '');
      if (lockedId) {
        const lockedSnapshot = await transaction.get(firestore.collection('attendance').doc(lockedId));
        const locked = lockedSnapshot.data();
        if (locked && isOpenShift({ ...locked, id: lockedId })) {
          return { kind: 'active', active: shiftDueAt({ ...locked, id: lockedId }, settings.shiftEndTime) > Date.now() };
        }
      }
      const snapshot = await transaction.get(firestore.collection('attendance').where('userId', '==', member.id));
      const existing: Record<string, unknown>[] = snapshot.docs.map(document => ({ ...(document.data() as Record<string, unknown>), id: document.id }));
      const open = findOpenShift(existing, member.id);
      if (open) return { kind: 'active', active: shiftDueAt(open, settings.shiftEndTime) > Date.now() };
      const latestToday = existing.filter(item => item.workDate === workDate)
        .sort((a, b) => String(b.checkInAt || '').localeCompare(String(a.checkInAt || '')))[0];
      const canRestart = Boolean(latestToday && (
        latestToday.gpsRestartRequired === true ||
        latestToday.gpsCancelled === true ||
        String(latestToday.status || '').toLowerCase().includes('cancelled - gps')
      ));
      if (latestToday && !canRestart) return { kind: 'completed', active: false };
      transaction.create(attendanceRef, record);
      transaction.set(lockRef, { userId: member.id, attendanceId: id, updatedAt: startedAt }, { merge: true });
      transaction.set(auditRef, {
        actorId: admin.id, actorName: admin.displayName, action: 'ADMIN_START_SHIFT',
        entityType: 'attendance', entityId: id,
        description: cleanText('Started a shift for ' + member.displayName + ' at ' + startedAt + '.', 240),
        createdAt: startedAt,
      });
      transaction.set(notificationRef, {
        recipientId: member.id, recipientRole: 'staff', type: 'admin-shift-started',
        title: 'Your shift was started by an administrator',
        message: admin.displayName + ' started your work shift. Location sharing is active only while this shift is active.',
        createdAt: startedAt, read: false, attendanceId: id,
      });
      return { kind: 'created', active: false };
    });
    if (outcome.kind === 'active') return error(outcome.active
      ? 'This staff member already has an active shift.'
      : 'The previous shift is waiting for automatic checkout. Please retry shortly.', 409);
    if (outcome.kind === 'completed') return error('Attendance is already completed for this staff member today.', 409);
    return json({ id, ...record }, 201);
  }),

  'POST /api/attendance/admin-end': protectedRoute(['admin'], async ({ body }, admin) => {
    const input = (body || {}) as Record<string, unknown>;
    const staffId = cleanText(input.userId, 128);
    const result = await listAttendanceForUser(staffId);
    const existing = findOpenShift(result, staffId);
    if (!existing) return error('There is no active shift for this staff member.', 400);
    const endedAt = new Date().toISOString();
    const attendanceRef = firestore.collection('attendance').doc(String(existing.id));
    const auditRef = firestore.collection('audit_logs').doc();
    const notificationRef = firestore.collection('staff_notifications').doc();
    const batch = firestore.batch();
    batch.update(attendanceRef, {
      checkOutAt: endedAt, updatedAt: endedAt, status: 'Completed',
      endedByAdminId: admin.id, endedByAdminName: admin.displayName, endedByAdmin: admin.displayName,
      gpsIssueStartedAt: FieldValue.delete(), gpsIssueId: FieldValue.delete(),
      gpsIssueReason: FieldValue.delete(), gpsReminderStage: FieldValue.delete(),
    });
    batch.set(auditRef, {
      actorId: admin.id, actorName: admin.displayName, action: 'ADMIN_END_SHIFT',
      entityType: 'attendance', entityId: String(existing.id),
      description: cleanText('Ended ' + String(existing.displayName || staffId) + '’s shift at ' + endedAt + '.', 240),
      createdAt: endedAt,
    });
    batch.set(notificationRef, {
      recipientId: staffId, recipientRole: 'staff', type: 'admin-shift-ended',
      title: 'Your shift was ended by an administrator',
      message: admin.displayName + ' ended your work shift. Location sharing has stopped.',
      createdAt: endedAt, read: false, attendanceId: String(existing.id),
    });
    await batch.commit();
    return json({ updated: true });
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

  'POST /api/staff/live-location': protectedRoute(['staff'], async ({ body }, user) => {
    const latitude = Number(body?.latitude), longitude = Number(body?.longitude);
    const accuracy = Number(body?.accuracy || 0);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        Math.abs(latitude) > 90 || Math.abs(longitude) > 180 ||
        !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100000) {
      return error('A valid GPS reading is required.', 400);
    }

    const attendance = await listAttendanceForUser(user.id);
    const settings = await getWorkforceSettings();
    const active = findActiveShift(attendance, user.id, Date.now(), settings.shiftEndTime);
    if (!active || active.gpsRestartRequired) return error('Location can be shared only during an active, authorised shift.', 403);

    if (active.gpsIssueStartedAt && Date.now() - Date.parse(String(active.gpsIssueStartedAt)) >= 15 * 60 * 1000) {
      return error('The 15-minute GPS grace period has expired. Contact an administrator to restart your shift.', 409);
    }

    const capturedAt = cleanText(body?.capturedAt, 40) || new Date().toISOString();
    if (!isFreshLocationTimestamp(capturedAt)) return error('The GPS reading is too old or has an invalid device timestamp. Wait for a fresh location update and try again.', 400);
    const record = {
      id: user.id, staffId: user.id, staffName: user.displayName, attendanceId: String(active.id),
      latitude, longitude, accuracy, capturedAt,
      source: cleanText(body?.source, 80) || 'staff-app-background',
    };
    const gpsRestored = Boolean(active.gpsIssueStartedAt);
    const liveLocationRef = firestore.collection('staff_live_locations').doc(user.id);
    const historyRef = firestore.collection('locations').doc();
    const batch = firestore.batch();
    const historyRecord: Record<string, unknown> = { ...record };
    delete historyRecord.id;
    batch.set(liveLocationRef, record, { merge: true });
    batch.set(historyRef, historyRecord);
    if (gpsRestored) {
      const attendanceRef = firestore.collection('attendance').doc(String(active.id));
      const restoredNotificationRef = firestore.collection('staff_notifications').doc(
        String(active.id) + '-gps-restored-' + String(active.gpsIssueId || capturedAt),
      );
      batch.update(attendanceRef, {
        gpsIssueStartedAt: FieldValue.delete(), gpsIssueId: FieldValue.delete(),
        gpsIssueReason: FieldValue.delete(), gpsReminderStage: FieldValue.delete(),
        gpsStatus: 'active', gpsRestoredAt: capturedAt,
      });
      batch.set(restoredNotificationRef, {
        recipientId: user.id, recipientRole: 'staff', type: 'gps-restored',
        title: 'GPS restored', message: 'Your location is available again. Your shift continues normally.',
        createdAt: capturedAt, read: false, attendanceId: active.id,
      });
    }
    await batch.commit();

    if (gpsRestored) {
      try {
        const notifications = await db.list<Record<string, unknown>>('staff_notifications', { limit: 1000 });
        const oldGpsNotifications = notifications.items.filter(item =>
          item.attendanceId === active.id && String(item.type || '').startsWith('gps-') &&
          item.type !== 'gps-restored'
        );
        if (oldGpsNotifications.length) {
          await db.tx.update('staff_notifications', oldGpsNotifications.map(item => ({
            id: String(item.id), record: { read: true, resolvedAt: capturedAt },
          })), { patch: true });
        }
      } catch (notificationError) {
        console.error('GPS was restored, but old reminder notifications could not be marked read:', notificationError);
      }
    }

    return json({ updated: true, capturedAt, gpsRestored });
  }),

  'GET /api/staff/:id/live-location': protectedRoute(['admin'], async ({ params }) => {
    const [member] = await db.get<UserRecord>('users', [params.id], { consistent: true });
    if (!member || member.role !== 'staff' || !member.active) return error('Active staff member not found.', 404);

    const attendance = await listAttendanceForUser(params.id);
    const settings = await getWorkforceSettings();
    const active = findActiveShift(attendance, params.id, Date.now(), settings.shiftEndTime);
    if (!active) {
      const latestRecord = attendance.slice().sort((a, b) => Date.parse(String(b.checkInAt || '')) - Date.parse(String(a.checkInAt || '')))[0];
      const cancelled = latestRecord && (latestRecord.gpsRestartRequired === true || latestRecord.gpsCancelled === true || String(latestRecord.status || '').toLowerCase().includes('cancelled - gps'))
        ? latestRecord
        : null;
      if (cancelled) return json({ status: 'gps-off', item: null, isFresh: false, ageSeconds: null, cancelled: true, cancelledAt: cancelled.gpsCancelledAt || cancelled.checkOutAt || null });
      return json({ status: 'shift-not-active', item: null, isFresh: false, ageSeconds: null });
    }
    
    const [storedLocation] = await db.get<Record<string, unknown>>('staff_live_locations', [params.id], { consistent: true });
    // Never present a previous shift's last point as if it belonged to the current shift.
    const location = storedLocation && String(storedLocation.attendanceId || '') === String(active.id)
      ? storedLocation : null;
    const gpsOff = Boolean(active.gpsIssueStartedAt || active.gpsRestartRequired || active.gpsStatus === 'disabled');
    const deadlineAt = active.gpsIssueStartedAt
      ? new Date(Date.parse(String(active.gpsIssueStartedAt)) + 15 * 60 * 1000).toISOString()
      : null;
    if (!location) return json({ status: gpsOff ? 'gps-off' : 'location-unavailable', item: null, isFresh: false, ageSeconds: null, deadlineAt });

    const capturedAt = String(location.capturedAt || '');
    const ageMs = capturedAt ? Date.now() - Date.parse(capturedAt) : Number.POSITIVE_INFINITY;
    const ageSeconds = Number.isFinite(ageMs) && ageMs >= -60000 ? Math.floor(Math.max(0, ageMs) / 1000) : null;
    const isFresh = Number.isFinite(ageMs) && ageMs >= -60000 && ageMs <= 90000;
    return json({
      item: location, status: gpsOff ? 'gps-off' : isFresh ? 'live' : 'stale',
      isFresh: isFresh && !gpsOff, ageSeconds, deadlineAt,
      cancelled: Boolean(active.gpsRestartRequired || active.gpsCancelled),
    });
  }),

  'POST /api/location-requests': protectedRoute(['admin'], async ({ body }, admin) => {
    const staffId = cleanText(body?.staffId, 128);
    const [member] = await db.get<UserRecord>('users', [staffId], { consistent: true });
    if (!member || member.role !== 'staff' || !member.active) return error('Choose an active staff member.', 400);
    const createdAt = new Date().toISOString();
    const record = { staffId: member.id, staffName: member.displayName, requestedBy: admin.id, requestedByName: admin.displayName, status: 'pending', createdAt, expiresAt: new Date(Date.now() + 2 * 60 * 1000).toISOString() };
    const [id] = await db.add('location_requests', [record]);
    if (!id) return error('Could not send the location request.', 500);
    await db.add('staff_notifications', [{ recipientId: member.id, recipientRole: 'staff', type: 'location-request', title: 'Admin requested your location', message: admin.displayName + ' requested a one-time current GPS location. Open the app to respond.', relatedId: id, createdAt, read: false }]);
    await writeAudit(admin, 'REQUEST_LOCATION', 'staff_location', id, 'Requested a one-time location from ' + member.displayName);
    return json({ id, ...record }, 201);
  }),

  'GET /api/location-requests/pending': protectedRoute(['staff'], async (_ctx, user) => {
    const result = await db.list<Record<string, unknown>>('location_requests', { limit: 100 });
    const nowTime = Date.now();
    const items = result.items.filter(item => item.staffId === user.id && item.status === 'pending' && new Date(String(item.expiresAt || 0)).getTime() > nowTime);
    return json({ items });
  }),

  'POST /api/location-requests/:id/respond': protectedRoute(['staff'], async ({ params, body }, user) => {
    const [request] = await db.get<Record<string, unknown>>('location_requests', [params.id], { consistent: true });
    if (!request || request.staffId !== user.id) return error('Location request not found.', 404);
    if (request.status !== 'pending' || new Date(String(request.expiresAt || 0)).getTime() <= Date.now()) return error('This location request has expired or was already answered.', 409);
    const input = (body || {}) as Record<string, unknown>;
    const status = input.status === 'failed' ? 'unavailable' : 'captured';
    const latitude = Number(input.latitude), longitude = Number(input.longitude);
    if (status === 'captured' && (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180)) return error('A valid current GPS location is required.', 400);
    const capturedAt = new Date().toISOString();
    const patch: Record<string, unknown> = {
      status,
      capturedAt,
      responseMessage: status === 'unavailable' ? cleanText(input.message, 240) || 'Staff location was unavailable.' : '',
      ...(status === 'captured' ? {
        latitude, longitude,
        accuracy: Math.min(Math.max(Number(input.accuracy) || 0, 0), 100000),
        address: cleanText(input.address, 500) || 'Address not available; open in Google Maps.',
      } : {}),
    };
    const [updated] = await db.tx.update('location_requests', [{ id: params.id, record: patch }], { patch: true });
    if (updated) await writeAudit(user, 'SHARE_LOCATION', 'staff_location', params.id, 'Shared a one-time GPS location in response to an admin request.');
    return updated ? json({ updated: true, status }) : error('Could not submit the location response.', 500);
  }),

  'GET /api/location-requests/:id': protectedRoute(['admin'], async ({ params }) => {
    const [stored] = await db.get<Record<string, unknown>>('location_requests', [params.id], { consistent: true });
    if (!stored) return error('Location request not found.', 404);
    let item: Record<string, unknown> = { ...stored, id: params.id };
    if (item.status === 'pending' && new Date(String(item.expiresAt || 0)).getTime() <= Date.now()) {
      await db.tx.update('location_requests', [{ id: params.id, record: { status: 'expired' } }], { patch: true });
      item = { ...item, status: 'expired' };
    }
    return json({ item });
  }),

  'GET /api/saved-locations': protectedRoute(['admin'], async () => {
    const result = await db.list<Record<string, unknown>>('saved_locations', { limit: 500 });
    return json({ items: result.items.sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || ''))) });
  }),

  'POST /api/saved-locations': protectedRoute(['admin'], async ({ body }, admin) => {
    const requestId = cleanText(body?.requestId, 128);
    let record: Record<string, unknown>;
    if (requestId) {
      const [request] = await db.get<Record<string, unknown>>('location_requests', [requestId], { consistent: true });
      if (!request || request.status !== 'captured') return error('Only a successfully captured location can be saved.', 400);
      if (request.savedLocationId) return error('This location has already been saved.', 409);
      record = {
        staffId: String(request.staffId || ''),
        staffName: String(request.staffName || 'Staff member'),
        latitude: Number(request.latitude), longitude: Number(request.longitude),
        accuracy: Number(request.accuracy || 0), address: cleanText(request.address, 500),
        capturedAt: String(request.capturedAt || ''), requestId,
      };
    } else {
      const staffId = cleanText(body?.staffId, 128);
      const [member] = await db.get<UserRecord>('users', [staffId], { consistent: true });
      const latitude = Number(body?.latitude), longitude = Number(body?.longitude);
      if (!member || member.role !== 'staff' || !member.active) return error('Active staff member not found.', 404);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return error('A valid live location is required.', 400);
      record = {
        staffId, staffName: member.displayName, latitude, longitude,
        accuracy: Math.min(Math.max(Number(body?.accuracy) || 0, 0), 100000),
        address: 'Coordinates available in Google Maps.',
        capturedAt: cleanText(body?.capturedAt, 40) || new Date().toISOString(),
      };
    }
    const savedRecord = {
      ...record, savedAt: new Date().toISOString(),
      savedBy: admin.id, savedByName: admin.displayName,
    };
    const [id] = await db.add('saved_locations', [savedRecord]);
    if (!id) return error('Could not save this location.', 500);
    if (requestId) await db.tx.update('location_requests', [{ id: requestId, record: { savedLocationId: id } }], { patch: true });
    await writeAudit(admin, 'SAVE_LOCATION', 'saved_location', id, 'Saved the location of ' + String(record.staffName || 'staff member'));
    return json({ id, ...savedRecord }, 201);
  }),

  'GET /api/locations': protectedRoute(['admin'], async () => {
    const [locationResult, attendanceSnapshot] = await Promise.all([
      db.list<Record<string, unknown>>('locations', { limit: 1000 }),
      firestore.collection('attendance').where('status', '==', 'Checked in').get(),
    ]);
    const attendanceResult: Record<string, unknown>[] = attendanceSnapshot.docs.map(document => ({
      ...(document.data() as Record<string, unknown>), id: document.id,
    }));
    const latestActiveShiftByStaff = new Map<string, Record<string, unknown>>();
    for (const shift of attendanceResult) {
      const staffId = String(shift.userId || '');
      if (!staffId || !isOpenShift(shift) || shiftDueAt(shift) <= Date.now()) continue;
      const previous = latestActiveShiftByStaff.get(staffId);
      if (!previous || String(shift.checkInAt || '') > String(previous.checkInAt || '')) {
        latestActiveShiftByStaff.set(staffId, shift);
      }
    }
    const activeShiftIds = new Set(Array.from(latestActiveShiftByStaff.values()).map(shift => String(shift.id)));
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

  'POST /api/locations': protectedRoute(['staff'], async () => {
    return error('Continuous GPS tracking is disabled. Location is shared only in response to an administrator request.', 410);
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
    if (!title || !category || !validMoney(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(spentAt) || !method) return error('Enter a valid expense title, category, amount, date and payment method.', 400);
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
    if (!/^[0-9]{4}-[0-9]{2}$/.test(period)) return error('Select a valid billing month.', 400);
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
    if (!/^[0-9]{4}-[0-9]{2}$/.test(period)) return error('Select a valid billing month.', 400);
    const customers = await db.list<Customer>('customers', { limit: 500 });
    const existing = await db.list<Record<string, unknown>>('invoices', { limit: 500 });
    const existingKeys = new Set(existing.items.map(item => String(item.customerId) + '|' + String(item.period)));
    const active = customers.items.filter(customer => customer.status === 'Active');
    let created = 0;
    for (const customer of active) {
      const key = customer.id + '|' + period;
      if (existingKeys.has(key)) continue;
      const [year, month] = period.split('-').map(Number);
      const dueDay = customer.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(customer.dueDate) ? Number(customer.dueDate.slice(-2)) : 10;
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