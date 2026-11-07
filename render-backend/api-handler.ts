import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { firestore as db, FieldValue } from './firestore-adapter.js';
import { buildCustomerLedger, hasOverlappingSubscription, hasAdminManagementAccess, isValidDateKey, isValidDateRange, routePath, subscriptionExpiryKind, taskReminderKind, isSixMonthReviewDue, isValidPayrollInput } from './route-path.js';


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
  // Staff shifts can be admin-started after 7 PM and remain active until 7 PM the next day.
  // Keep the staff session valid long enough for that maximum supported shift; admin sessions remain shorter.
  const sessionHours = user.role === 'staff' ? 26 : 8;
  const expiresAt = Date.now() + sessionHours * 60 * 60 * 1000;
  await db.collection('sessions').doc(sessionTokenId(token)).set({
    userId: user.id, expiresAt, createdAt: now(), authTime: Math.floor(Date.now() / 1000),
  });
  return { token, expiresAt };
}
async function revokeUserSessions(userId: string) {
  const baseQuery = db.collection('sessions').where('userId', '==', userId);
  let page = await baseQuery.limit(450).get();
  while (!page.empty) {
    const batch = db.batch();
    page.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    if (page.size < 450) break;
    page = await baseQuery.startAfter(page.docs[page.docs.length - 1]).limit(450).get();
  }
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
async function staffHasActiveShift(userId: string): Promise<boolean> {
  const snapshot = await db.collection('attendance').where('userId', '==', userId).limit(1000).get();
  return snapshot.docs.some(doc => {
    const item = doc.data();
    if (item.status !== 'Checked in' || item.checkOutAt || item.dayType === 'Absent' || item.gpsRestartRequired || item.gpsCancelled) return false;
    const savedDeadline = Date.parse(String(item.autoCheckoutAt || ''));
    if (Number.isFinite(savedDeadline)) return savedDeadline > Date.now();
    const checkIn = Date.parse(String(item.checkInAt || ''));
    const workDate = String(item.workDate || '');
    if (!Number.isFinite(checkIn) || !datePattern.test(workDate)) return true;
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(checkIn));
    const minutes = Number(parts.find(part => part.type === 'hour')?.value || 0) * 60 + Number(parts.find(part => part.type === 'minute')?.value || 0);
    const endTime = typeof item.shiftEndTime === 'string' && /^([01]\\d|2[0-3]):[0-5]\\d$/.test(item.shiftEndTime) ? item.shiftEndTime : '19:00';
    const [endHour, endMinute] = endTime.split(':').map(Number);
    const endMinutes = endHour * 60 + endMinute;
    const dueDate = minutes >= endMinutes ? new Date(Date.parse(workDate + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10) : workDate;
    return Date.now() < Date.parse(dueDate + 'T' + endTime + ':00+05:30');
  });
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



export async function apiHandler(req: any, res: any) {
    res.set('Cache-Control', 'no-store');
    const method = req.method.toUpperCase();
    const path = routePath(req.path);
    if (method === 'OPTIONS') { res.status(204).send(''); return; }
    if (method === 'GET' && path === '/api/_healthcheck') {
      send(res, 200, { message: 'Success', service: 'kandb-management-nexus-render-api' }); return;
    }

    if (method === 'POST' && path === '/api/auth/login') {
      const input: Data = req.body && typeof req.body === 'object' ? req.body : {};
      const userId = clean(input.userId, 40);
      const password = typeof input.password === 'string' ? input.password : '';
      if (!userId || !password) { send(res, 400, { error: 'Enter your user ID and password.' }); return; }
      let matches = (await list('users')).filter(item => String(item.userId || '').toLowerCase() === userId.toLowerCase());
      const authPrincipal = userId.toLowerCase() === 'brajraj' ? 'primary-admin' : 'staff-or-secondary-admin';
      const authTrace = (result: string, matchedAccounts = matches.length, bootstrapConfigured = Boolean((process.env.ADMIN_INITIAL_PASSWORD || '').length >= 10), existingAdminPresent?: boolean) => {
        // Never log usernames, passwords, hashes, salts, or request bodies.
        console.info('[AUTH_DIAGNOSTIC]', JSON.stringify({
          principal: authPrincipal, matchedAccounts, bootstrapConfigured,
          ...(typeof existingAdminPresent === 'boolean' ? { existingAdminPresent } : {}),
          result,
        }));
      };

      // Bootstrap the fixed owner account from a private one-time secret when it does not exist.
      // If an older Brajraj owner record exists with an incompatible password hash, permit that
      // same configured secret to repair it once. The marker prevents repeated bootstrap resets.
      const initialPassword = process.env.ADMIN_INITIAL_PASSWORD || '';
      if (matches.length === 0 && userId.toLowerCase() === 'brajraj') {
        if (initialPassword.length < 10) {
          authTrace('owner-setup-secret-missing', 0, false);
          send(res, 503, { error: 'The primary admin account is not initialized. Complete the one-time owner password setup in the Render service environment.' }); return;
        }
        if (!equalSecret(password, initialPassword)) {
          const existingAdmins = await db.collection('users').where('role', '==', 'admin').limit(1).get();
          authTrace('owner-setup-password-mismatch', 0, true, !existingAdmins.empty);
          send(res, 401, { error: 'The admin username or password is incorrect.' }); return;
        }
        const ownerRef = db.collection('users').doc('admin-primary');
        // A valid private bootstrap secret proves owner setup authority. Older admin
        // records must not permanently lock the configured primary owner out.
        // Preserve those records; only create the reserved primary-owner document.
        await db.runTransaction(async transaction => {
          const ownerSnapshot = await transaction.get(ownerRef);
          if (!ownerSnapshot.exists) {
            const bootstrapTime = now();
            transaction.create(ownerRef, {
              userId: 'Brajraj', userIdLower: 'brajraj', displayName: 'Brajraj',
              role: 'admin', canManageAdmins: true, isSuperAdmin: true, active: true,
              ...newPasswordFields(password), bootstrapPasswordUsedAt: bootstrapTime, createdAt: bootstrapTime,
            });
          }
        });
        matches = (await list('users')).filter(item => String(item.userId || '').toLowerCase() === 'brajraj');
        if (matches.length === 0) {
          authTrace('owner-initialization-blocked-by-existing-admin', 0, true);
          send(res, 409, { error: 'The primary admin account could not be initialized because another admin account already exists. Admin setup needs owner review.' }); return;
        }
      }
      if (matches.length === 0) {
        authTrace('account-not-found', 0);
        send(res, 404, { error: 'No account exists with this user ID. A staff account must be created or approved by the admin before staff sign-in.' }); return;
      }
      if (matches.length > 1) {
        authTrace('duplicate-account-records');
        send(res, 409, { error: 'More than one account uses this user ID. Ask the primary admin to resolve the duplicate account records.' }); return;
      }
      const userDoc = await db.collection('users').doc(String(matches[0].id)).get();
      if (!userDoc.exists) { send(res, 401, { error: 'The user ID or password is incorrect.' }); return; }
      const record = userDoc.data()!;
      if (record.active !== true || !['admin', 'staff'].includes(record.role)) {
        send(res, 401, { error: 'The user ID or password is incorrect, or this account needs an administrator password reset.' }); return;
      }
      let passwordMatches = Boolean(record.salt && record.passwordHash &&
        equalSecret(hashPassword(password, String(record.salt)), String(record.passwordHash)));
      if (!passwordMatches && userId.toLowerCase() === 'brajraj' &&
          record.role === 'admin' && record.canManageAdmins === true &&
          !record.bootstrapPasswordUsedAt &&
          initialPassword.length >= 10 && equalSecret(password, initialPassword)) {
        const bootstrapFields = newPasswordFields(password);
        const bootstrapTime = now();
        const repaired = await db.runTransaction(async transaction => {
          const latest = await transaction.get(userDoc.ref);
          const latestRecord = latest.data() || {};
          if (!latest.exists || latestRecord.active !== true ||
              latestRecord.role !== 'admin' || latestRecord.canManageAdmins !== true ||
              latestRecord.bootstrapPasswordUsedAt) return false;
          transaction.update(userDoc.ref, {
            ...bootstrapFields,
            bootstrapPasswordUsedAt: bootstrapTime,
          });
          return true;
        });
        if (repaired) {
          Object.assign(record, bootstrapFields, { bootstrapPasswordUsedAt: bootstrapTime });
          passwordMatches = true;
        }
      }
      if (!passwordMatches) {
        authTrace('stored-password-hash-mismatch');
        send(res, 401, { error: 'The user ID or password is incorrect, or this account needs an administrator password reset.' }); return;
      }
      authTrace('success');
      const user = { id: userDoc.id, ...record };
      const session = await createSession(user);
      send(res, 200, { ...session, user: { id: userDoc.id, userId: clean(record.userId, 40), displayName: clean(record.displayName, 80), role: record.role, active: true, canManageAdmins: record.canManageAdmins === true } }); return;
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
      if (!/^[a-zA-Z0-9_-]{3,32}$/.test(userId) || !displayName || (phone && !/^\d{10}$/.test(phone))) {
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

      if (path === '/api/staff-registration-requests' && method === 'GET') {
        if (!allow(user, ['admin'], res)) return;
        const items = (await list('staff_registration_requests'))
          .map(({ trackingHash, ...safe }) => safe)
          .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        send(res, 200, { items }); return;
      }

      if (path.startsWith('/api/staff-registration-requests/') && method === 'PUT') {
        if (!allow(user, ['admin'], res)) return;
        const requestId = routeId(path, '/api/staff-registration-requests').toLowerCase();
        const status = clean(body.status, 20).toLowerCase();
        const password = typeof body.password === 'string' ? body.password : '';
        if (!requestId || requestId === 'status') { send(res, 400, { error: 'A valid registration request ID is required.' }); return; }
        if (!['approved', 'rejected'].includes(status)) {
          send(res, 400, { error: 'Choose approve or reject for this registration request.' }); return;
        }
        if (status === 'approved' && password.length < 10) {
          send(res, 400, { error: 'Set a temporary password with at least 10 characters before approving.' }); return;
        }
        const requestRef = db.collection('staff_registration_requests').doc(requestId);
        const existingSnap = await requestRef.get();
        if (!existingSnap.exists) { send(res, 404, { error: 'Staff registration request not found.' }); return; }
        const existing = existingSnap.data()!;
        if (existing.status !== 'pending') { send(res, 409, { error: 'This registration request has already been reviewed.' }); return; }
        const staffUserId = clean(existing.userId, 32);
        const staffUserIdLower = staffUserId.toLowerCase();
        if (!/^[a-zA-Z0-9_-]{3,32}$/.test(staffUserId) || !clean(existing.displayName, 80)) {
          send(res, 400, { error: 'This registration request has incomplete account details. Reject it and ask the applicant to submit again.' }); return;
        }
        const allUsers = await list('users');
        if (status === 'approved' && allUsers.some(item => String(item.userId || '').toLowerCase() === staffUserIdLower)) {
          send(res, 409, { error: 'This staff ID is already registered. Reject this request and ask the person to contact an administrator.' }); return;
        }
        const reviewedAt = now();
        const staffRecordId = 'staff-' + randomBytes(12).toString('hex');
        const staffRef = db.collection('users').doc(staffRecordId);
        const staffRecord: Data = {
          userId: staffUserId,
          userIdLower: staffUserIdLower,
          displayName: clean(existing.displayName, 80),
          phone: clean(existing.phone, 30),
          role: 'staff',
          active: true,
          canManageAdmins: false,
          ...newPasswordFields(password),
          createdAt: reviewedAt,
          createdBy: user.uid,
        };
        const outcome = await db.runTransaction(async transaction => {
          const [latest, duplicateUsers] = await Promise.all([
            transaction.get(requestRef),
            status === 'approved'
              ? transaction.get(db.collection('users').where('userIdLower', '==', staffUserIdLower).limit(1))
              : Promise.resolve(null),
          ]);
          if (!latest.exists || latest.data()?.status !== 'pending') return 'not-pending';
          if (status === 'approved' && duplicateUsers && !duplicateUsers.empty) return 'duplicate';
          if (status === 'approved') transaction.create(staffRef, staffRecord);
          transaction.update(requestRef, {
            status,
            reviewedAt,
            reviewedBy: user.uid,
            reviewedByName: user.displayName,
            ...(status === 'approved' ? { createdUserId: staffRecordId } : {}),
          });
          return 'applied';
        });
        if (outcome === 'duplicate') { send(res, 409, { error: 'This staff ID was registered while the request was being reviewed. Refresh and reject this request.' }); return; }
        if (outcome !== 'applied') { send(res, 409, { error: 'This registration request was already reviewed. Refresh the list.' }); return; }
        if (status === 'approved') {
          await db.collection('staff_notifications').add({
            recipientId: staffRecordId,
            recipientRole: 'staff',
            type: 'staff-registration-approved',
            title: 'Staff access approved',
            message: 'Your staff account has been approved. You can now sign in using your staff ID and the temporary password shared by the administrator.',
            relatedId: requestId,
            createdAt: reviewedAt,
            read: false,
          });
        }
        await audit(user, status === 'approved' ? 'APPROVE_STAFF_REGISTRATION' : 'REJECT_STAFF_REGISTRATION',
          'staff_registration_request', requestId, 'Staff registration request ' + status + ' for ' + staffUserId);
        send(res, 200, { updated: true, status, ...(status === 'approved' ? { userId: staffUserId, userRecordId: staffRecordId } : {}) }); return;
      }

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

      if (method === 'POST' && path === '/api/auth/change-password') {
        if (user.role === 'staff' && await staffHasActiveShift(user.uid)) {
          send(res, 409, { error: 'Staff credentials cannot be changed during an active shift. Ask an administrator to end the shift first.' }); return;
        }
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
        if (user.role === 'staff' && await staffHasActiveShift(user.uid)) {
          send(res, 409, { error: 'Staff credentials cannot be changed during an active shift. Ask an administrator to end the shift first.' }); return;
        }
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
      if (method === 'POST' && path === '/api/auth/logout') {
        if (user.role === 'staff' && await staffHasActiveShift(user.uid)) {
          send(res, 409, { error: 'Sign out is blocked while your work shift is active. Ask an administrator to end the shift.' }); return;
        }
        const authorization = clean(req.headers.authorization, 4096);
        const token = authorization.startsWith('Bearer ')
          ? authorization.slice(7)
          : clean(body.sessionToken, 4096) || clean(req.query?.sessionToken, 4096);
        if (token) await db.collection('sessions').doc(sessionTokenId(token)).delete();
        send(res, 200, { ok: true }); return;
      }

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
      // Staff account management routes are handled by the Render/Firestore session API.
      if (path === '/api/staff' && method === 'GET') {
        if (!allow(user, ['admin'], res)) return;
        const items = (await list('users')).filter(item => item.role === 'staff').map(({ passwordHash, salt, ...safe }) => safe);
        send(res, 200, { items }); return;
      }
      if (path === '/api/staff' && method === 'POST') {
        if (!allow(user, ['admin'], res)) return;
        const userId = clean(body.userId, 32), displayName = clean(body.displayName, 80);
        const password = typeof body.password === 'string' ? body.password : '';
        if (!/^[a-zA-Z0-9_-]{3,32}$/.test(userId) || !displayName || password.length < 10) { send(res, 400, { error: 'Use a 3–32 character staff ID, a name and a password of at least 10 characters.' }); return; }
        if ((await list('users')).some(item => String(item.userId || '').toLowerCase() === userId.toLowerCase())) { send(res, 409, { error: 'That user ID is already in use.' }); return; }
        const accountId = 'staff-' + randomBytes(10).toString('hex');
        const record: Data = { userId, userIdLower: userId.toLowerCase(), displayName, role: 'staff', active: true, canManageAdmins: false, ...newPasswordFields(password), createdAt: now(), createdBy: user.uid };
        await db.collection('users').doc(accountId).create(record);
        await audit(user, 'CREATE', 'staff', accountId, 'Created staff account ' + userId);
        const { passwordHash, salt, ...safe } = record;
        send(res, 201, { user: { id: accountId, ...safe } }); return;
      }
      if (path.startsWith('/api/staff/') && path.endsWith('/reset-password') && method === 'POST') {
        if (!allow(user, ['admin'], res)) return;
        const staffId = path.slice('/api/staff/'.length, -'/reset-password'.length).replace(/\/$/, '');
        const password = typeof body.password === 'string' ? body.password : '';
        if (password.length < 10) { send(res, 400, { error: 'Password must contain at least 10 characters.' }); return; }
        const staff = await getDoc('users', staffId);
        if (!staff || staff.role !== 'staff') { send(res, 404, { error: 'Staff account not found.' }); return; }
        await db.collection('users').doc(staffId).update(newPasswordFields(password));
        await revokeUserSessions(staffId);
        await audit(user, 'RESET_PASSWORD', 'staff', staffId, 'Reset staff password for ' + String(staff.userId || staffId));
        send(res, 200, { reset: true }); return;
      }
      if (path.startsWith('/api/staff/') && method === 'PUT') {
        if (!allow(user, ['admin'], res)) return;
        const staffId = routeId(path, '/api/staff'), staff = await getDoc('users', routeId(path, '/api/staff'));
        if (!staff || staff.role !== 'staff') { send(res, 404, { error: 'Staff account not found.' }); return; }
        const patch: Data = { updatedAt: now() };
        if (typeof body.displayName === 'string') { const name = clean(body.displayName, 80); if (!name) { send(res, 400, { error: 'Enter a staff name.' }); return; } patch.displayName = name; }
        if (typeof body.userId === 'string') { const nextId = clean(body.userId, 32); if (!/^[a-zA-Z0-9_-]{3,32}$/.test(nextId)) { send(res, 400, { error: 'Use a 3–32 character staff ID.' }); return; } if ((await list('users')).some(item => item.id !== staffId && String(item.userId || '').toLowerCase() === nextId.toLowerCase())) { send(res, 409, { error: 'That user ID is already in use.' }); return; } patch.userId = nextId; patch.userIdLower = nextId.toLowerCase(); }
        if (typeof body.active === 'boolean') patch.active = body.active;
        if (body.monthlySalary !== undefined) {
          const monthlySalary = Number(body.monthlySalary);
          if (!Number.isFinite(monthlySalary) || monthlySalary < 0 || monthlySalary > 1000000) {
            send(res, 400, { error: 'Monthly salary must be between ₹0 and ₹10,00,000.' }); return;
          }
          patch.monthlySalary = monthlySalary;
        }
        await db.collection('users').doc(staffId).update(patch);
        if (patch.active === false || patch.userId) await revokeUserSessions(staffId);
        await audit(user, 'UPDATE', 'staff', staffId, 'Updated staff account ' + String(staff.userId || staffId));
        send(res, 200, { updated: true }); return;
      }
      if (path.startsWith('/api/staff/') && method === 'DELETE') {
        if (!allow(user, ['admin'], res)) return;
        const staffId = routeId(path, '/api/staff'), staff = await getDoc('users', routeId(path, '/api/staff'));
        if (!staff || staff.role !== 'staff') { send(res, 404, { error: 'Staff account not found.' }); return; }
        const assigned = (await list('customers')).filter(item => item.assignedTo === staffId);
        await Promise.all(assigned.map(customer => db.collection('customers').doc(String(customer.id)).update({ assignedTo: '', assignedToName: '' })));
        await revokeUserSessions(staffId);
        await db.collection('users').doc(staffId).delete();
        await audit(user, 'DELETE', 'staff', staffId, 'Removed staff account ' + String(staff.displayName || staff.userId || staffId) + '; historical records preserved');
        send(res, 200, { deleted: true, unassignedCustomers: assigned.length, historyPreserved: true }); return;
      }
      if (path.startsWith('/api/admins/') && method === 'DELETE') {
        if (!allowSuperAdmin(user, res)) return;
        const adminId = routeId(path, '/api/admins'), target = await getDoc('users', routeId(path, '/api/admins'));
        if (!target || target.role !== 'admin') { send(res, 404, { error: 'Admin account not found.' }); return; }
        if (adminId === user.uid || target.canManageAdmins === true || target.isSuperAdmin === true) { send(res, 403, { error: 'The primary super-admin account cannot be removed.' }); return; }
        await revokeUserSessions(adminId);
        await db.collection('users').doc(adminId).delete();
        await audit(user, 'DELETE', 'admin', adminId, 'Removed administrator account ' + String(target.userId || adminId));
        send(res, 200, { deleted: true }); return;
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


      if (method === 'GET' && path === '/api/notifications') {
        const user = await requireUser(req);
        if (!user) { send(res,401,{error:'Your session has expired. Please sign in again.'}); return; }
        const items = (await list('staff_notifications')).filter(item => String(item.recipientId || '') === user.uid || String(item.recipientId || '') === user.userId)
          .sort((a,b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0,150);
        send(res,200,{items}); return;
      }
      if (path.startsWith('/api/notifications/') && method === 'PUT') {
        const user = await requireUser(req);
        if (!user) { send(res,401,{error:'Your session has expired. Please sign in again.'}); return; }
        const id = routeId(path,'/api/notifications'), existing = await getDoc('staff_notifications',id);
        if (!existing || (String(existing.recipientId || '') !== user.uid && String(existing.recipientId || '') !== user.userId)) { send(res,404,{error:'Notification not found.'}); return; }
        await db.collection('staff_notifications').doc(id).update({read:req.body?.read !== false,readAt:now()});
        send(res,200,{updated:true}); return;
      }
      if (path.startsWith('/api/notifications/') && method === 'DELETE') {
        const user = await requireUser(req);
        if (!user) { send(res,401,{error:'Your session has expired. Please sign in again.'}); return; }
        const id = routeId(path,'/api/notifications'), existing = await getDoc('staff_notifications',id);
        if (!existing || (String(existing.recipientId || '') !== user.uid && String(existing.recipientId || '') !== user.userId)) { send(res,404,{error:'Notification not found.'}); return; }
        await db.collection('staff_notifications').doc(id).delete();
        send(res,200,{deleted:true}); return;
      }
      if (method === 'POST' && path === '/api/push-tokens') {
        const user = await requireUser(req);
        if (!user) { send(res,401,{error:'Your session has expired. Please sign in again.'}); return; }
        const token = clean(req.body?.token,4096);
        if (token.length < 20) { send(res,400,{error:'A valid device notification token is required.'}); return; }
        const id = createHash('sha256').update(token).digest('hex');
        const tokenRef = db.collection('push_tokens').doc(id);
        if (req.body?.action === 'unregister') {
          const existingToken = await tokenRef.get();
          if (existingToken.exists && String(existingToken.data()?.userId || '') === user.uid) await tokenRef.delete();
          send(res,200,{unregistered:true}); return;
        }
        await tokenRef.set({userId:user.uid,token,platform:clean(req.body?.platform,30)||'android',createdAt:now(),updatedAt:now()},{merge:true});
        send(res,201,{registered:true}); return;
      }
      if (path === '/api/payroll' && method === 'GET') {
        const user = await requireUser(req);
        if (!user) { send(res,401,{error:'Your session has expired. Please sign in again.'}); return; }
        if (!allow(user,['admin'],res)) return;
        const period = clean(req.query.period,7);
        const items = (await list('payroll')).filter(item => !period || String(item.period || '') === period)
          .sort((a,b) => String(b.paidAt || '').localeCompare(String(a.paidAt || '')));
        send(res,200,{items}); return;
      }
      if (path.startsWith('/api/payroll/') && method === 'DELETE') {
        const user = await requireUser(req);
        if (!user) { send(res,401,{error:'Your session has expired. Please sign in again.'}); return; }
        if (!allow(user,['admin'],res)) return;
        const id = routeId(path,'/api/payroll'), existing = await getDoc('payroll',id);
        if (!existing) { send(res,404,{error:'Salary record not found.'}); return; }
        await db.collection('payroll').doc(id).delete();
        await audit(user,'DELETE','payroll',id,'Deleted salary record for '+String(existing.staffName||'staff')+' ('+String(existing.period||'')+')');
        send(res,200,{deleted:true}); return;
      }
      if (path === '/api/payroll' && method === 'POST') {
        const user = await requireUser(req);
        if (!user) { send(res,401,{error:'Your session has expired. Please sign in again.'}); return; }
        if (!allow(user,['admin'],res)) return;
        const staffUserId = clean(req.body?.staffUserId,128), period = clean(req.body?.period,7);
        const amount = Number(req.body?.amount), paidAt = clean(req.body?.paidAt,10), payMethod = clean(req.body?.method,50);
        if (!isValidPayrollInput({ staffUserId, period, amount, paidAt, method: payMethod })) {
          send(res,400,{error:'Check the salary form: select an active staff member, choose a valid month and payment date, enter an amount above zero (up to INR 1,000,000), and choose a payment method.'}); return;
        }
        const staff = await getDoc('users',staffUserId);
        if (!staff || staff.role !== 'staff' || staff.active !== true) { send(res,404,{error:'Active staff account not found.'}); return; }
        const record = {staffUserId,staffName:clean(staff.displayName,80),period,amount,paidAt,method:payMethod,notes:clean(req.body?.notes,500),recordedBy:user.uid,recordedByName:user.displayName,createdAt:now()};
        // A deterministic document ID plus a transaction prevents two admins from
        // recording the same staff member's salary for the same month concurrently.
        const payrollId = 'pay-' + createHash('sha256').update(staffUserId + '|' + period).digest('hex').slice(0, 48);
        const ref = db.collection('payroll').doc(payrollId);
        const created = await db.runTransaction(async transaction => {
          const [byId, byStaff] = await Promise.all([
            transaction.get(ref),
            transaction.get(db.collection('payroll').where('staffUserId', '==', staffUserId).limit(500)),
          ]);
          if (byId.exists || byStaff.docs.some(doc => String(doc.data().period || '') === period)) return false;
          transaction.create(ref, record);
          return true;
        });
        if (!created) { send(res,409,{error:'Salary has already been recorded for this staff member and month.'}); return; }
        await audit(user,'CREATE','payroll',ref.id,'Recorded salary payment for '+record.staffName);
        send(res,201,{id:ref.id,...record}); return;
      }
      if (path === '/api/inventory' && method === 'GET') {
        const user = await requireUser(req);
        if (!user) { send(res,401,{error:'Your session has expired. Please sign in again.'}); return; }
        const allItems = await list('inventory');
        const visibleItems = user.role === 'admin' ? allItems : allItems.filter(item => item.assignedTo === user.uid).map(({unitCost,supplier,...item}) => item);
        send(res,200,{items:visibleItems}); return;
      }
      if (path === '/api/inventory' && method === 'POST') {
        const user = await requireUser(req);
        if (!user) { send(res,401,{error:'Your session has expired. Please sign in again.'}); return; }
        if (!allow(user,['admin'],res)) return;
        const body=req.body||{}, name=clean(body.name,120), sku=clean(body.sku,60), category=clean(body.category,80);
        const assignedTo=clean(body.assignedTo,128);
        const assignedStaff=assignedTo?await getDoc('users',assignedTo):null;
        if (assignedTo&&(!assignedStaff||assignedStaff.role!=='staff'||assignedStaff.active!==true)) { send(res,400,{error:'Choose an active staff member for this inventory assignment.'}); return; }
        const quantity=Number(body.quantity), minimumQuantity=Number(body.minimumQuantity);
        if (!name || !sku || !category || !Number.isInteger(quantity) || quantity<0 || !Number.isInteger(minimumQuantity) || minimumQuantity<0) { send(res,400,{error:'Enter a valid item name, SKU, category and stock quantities.'}); return; }
        if ((await list('inventory')).some(item => String(item.sku||'').toLowerCase()===sku.toLowerCase())) { send(res,409,{error:'That SKU is already in the inventory.'}); return; }
        const record={name,sku,category,unit:clean(body.unit,30)||'pcs',quantity,minimumQuantity,unitCost:Number(body.unitCost||0),supplier:clean(body.supplier,120),location:clean(body.location,120),notes:clean(body.notes,500),assignedTo:assignedTo||'',assignedToName:assignedStaff?clean(assignedStaff.displayName,80):'',active:body.active!==false,createdAt:now(),createdBy:user.uid};
        const ref=await db.collection('inventory').add(record);
        await audit(user,'CREATE','inventory',ref.id,'Added inventory item '+name);
        send(res,201,{id:ref.id,...record}); return;
      }
      if (path.startsWith('/api/inventory/') && path.endsWith('/movements') && ['GET','POST'].includes(method)) {
        const user=await requireUser(req);
        if (!user) { send(res,401,{error:'Your session has expired. Please sign in again.'}); return; }
        const id=decodeURIComponent(path.slice('/api/inventory/'.length,-'/movements'.length).replace(/\/$/,''));
        const itemRef=db.collection('inventory').doc(id), itemSnap=await itemRef.get();
        if (!itemSnap.exists) { send(res,404,{error:'Inventory item not found.'}); return; }
        const inventoryRecord=itemSnap.data()||{};
        if (user.role!=='admin' && inventoryRecord.assignedTo!==user.uid) { send(res,403,{error:'You can view only inventory assigned to your account.'}); return; }
        if (method==='GET') {
          const items=(await list('inventory_movements')).filter(item=>item.itemId===id).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
          send(res,200,{items}); return;
        }
        if (!allow(user,['admin'],res)) return;
        const type=clean(req.body?.type,5), quantity=Number(req.body?.quantity), reason=clean(req.body?.reason,300);
        if (!['IN','OUT'].includes(type)||!Number.isInteger(quantity)||quantity<=0||!reason) { send(res,400,{error:'Choose stock IN or OUT, a positive whole quantity and a reason.'}); return; }
        let movement: Data|null=null;
        await db.runTransaction(async transaction=>{
          const snap=await transaction.get(itemRef);
          if (!snap.exists) throw new Error('Inventory item not found.');
          const item=snap.data()||{}, before=Number(item.quantity||0);
          if (type==='OUT'&&quantity>before) { const e:any=new Error('Not enough stock is available for this issue.'); e.code='inventory/insufficient'; throw e; }
          const after=type==='IN'?before+quantity:before-quantity, ref=db.collection('inventory_movements').doc();
          movement={id:ref.id,itemId:id,itemName:String(item.name||'Inventory item'),type,quantity,quantityBefore:before,quantityAfter:after,reason,createdAt:now(),createdBy:user.uid,createdByName:user.displayName};
          transaction.update(itemRef,{quantity:after,updatedAt:now()});
          transaction.create(ref,movement);
        });
        if (!movement) { send(res,500,{error:'Could not record the stock movement.'}); return; }
        await audit(user,'STOCK_'+type,'inventory',id,type+' '+quantity+' units of '+String(movement.itemName));
        send(res,201,movement); return;
      }
      if (path.startsWith('/api/inventory/') && method==='PUT') {
        const user=await requireUser(req);
        if (!user) { send(res,401,{error:'Your session has expired. Please sign in again.'}); return; }
        if (!allow(user,['admin'],res)) return;
        const id=routeId(path,'/api/inventory'), existing=await getDoc('inventory',id);
        if (!existing) { send(res,404,{error:'Inventory item not found.'}); return; }
        const body=req.body||{}, quantity=Number(body.quantity), minimumQuantity=Number(body.minimumQuantity), assignedTo=clean(body.assignedTo,128);
        const assignedStaff=assignedTo?await getDoc('users',assignedTo):null;
        if (assignedTo&&(!assignedStaff||assignedStaff.role!=='staff'||assignedStaff.active!==true)) { send(res,400,{error:'Choose an active staff member for this inventory assignment.'}); return; }
        if (!clean(body.name,120)||!clean(body.sku,60)||!clean(body.category,80)||!Number.isInteger(quantity)||quantity<0||!Number.isInteger(minimumQuantity)||minimumQuantity<0) { send(res,400,{error:'Enter valid inventory details.'}); return; }
        const patch={name:clean(body.name,120),sku:clean(body.sku,60),category:clean(body.category,80),unit:clean(body.unit,30)||'pcs',quantity,minimumQuantity,unitCost:Number(body.unitCost||0),supplier:clean(body.supplier,120),location:clean(body.location,120),notes:clean(body.notes,500),assignedTo:assignedTo||'',assignedToName:assignedStaff?clean(assignedStaff.displayName,80):'',active:body.active!==false,updatedAt:now()};
        await db.collection('inventory').doc(id).update(patch);
        await audit(user,'UPDATE','inventory',id,'Updated inventory item '+patch.name);
        send(res,200,{updated:true}); return;
      }
      if (path === '/api/installations' && method === 'GET') {
        const user=await requireUser(req);
        if (!user) { send(res,401,{error:'Your session has expired. Please sign in again.'}); return; }
        const items=await list('installations');
        send(res,200,{items:user.role==='admin'?items:items.filter(item=>item.assignedTo===user.uid)}); return;
      }
      if (path === '/api/installations' && method === 'POST') {
        const user=await requireUser(req);
        if (!user) { send(res,401,{error:'Your session has expired. Please sign in again.'}); return; }
        if (!allow(user,['admin'],res)) return;
        const body=req.body||{}, customerId=clean(body.customerId,128), assignedTo=clean(body.assignedTo,128);
        const customer=await getDoc('customers',customerId), staff=await getDoc('users',assignedTo);
        const scheduledDate=clean(body.scheduledDate,10), type=clean(body.type,80);
        if (!customer||!staff||staff.role!=='staff'||staff.active!==true||!datePattern.test(scheduledDate)||!type) { send(res,400,{error:'Choose an existing customer, active staff member, job type and valid scheduled date.'}); return; }
        const record={customerId,customerName:clean(customer.name,120),phone:clean(customer.phone,40),address:clean(body.address,300)||clean(customer.address,300),type,scheduledDate,assignedTo,assignedToName:clean(staff.displayName,80),status:'Scheduled',notes:clean(body.notes,600),createdAt:now(),createdBy:user.uid};
        const ref=await db.collection('installations').add(record);
        await audit(user,'CREATE','installation',ref.id,'Assigned an installation job for '+record.customerName);
        send(res,201,{id:ref.id,...record}); return;
      }
      if (path.startsWith('/api/installations/') && method==='PUT') {
        const user=await requireUser(req);
        if (!user) { send(res,401,{error:'Your session has expired. Please sign in again.'}); return; }
        const id=routeId(path,'/api/installations'), existing=await getDoc('installations',id);
        if (!existing) { send(res,404,{error:'Installation job not found.'}); return; }
        if (user.role!=='admin'&&existing.assignedTo!==user.uid) { send(res,403,{error:'You can update only your assigned installation jobs.'}); return; }
        const body=req.body||{}, statuses=['Scheduled','In progress','Completed','Cancelled'], status=clean(body.status,30)||String(existing.status||'Scheduled');
        if (!statuses.includes(status)) { send(res,400,{error:'Choose a valid installation status.'}); return; }
        const patch:Data={status,notes:clean(body.notes,600),updatedAt:now(),updatedBy:user.uid};
        if (user.role==='admin') {
          const assignedTo=clean(body.assignedTo,128);
          if (assignedTo) { const staff=await getDoc('users',assignedTo); if (!staff||staff.role!=='staff'||staff.active!==true) { send(res,400,{error:'Choose an active staff member.'}); return; } patch.assignedTo=assignedTo; patch.assignedToName=clean(staff.displayName,80); }
          if (body.scheduledDate) patch.scheduledDate=clean(body.scheduledDate,10);
          if (body.address) patch.address=clean(body.address,300);
        }
        await db.collection('installations').doc(id).update(patch);
        await audit(user,'UPDATE','installation',id,'Updated installation job status to '+status);
        send(res,200,{updated:true}); return;
      }
      if (path.startsWith('/api/installations/') && method==='DELETE') {
        const user=await requireUser(req);
        if (!user) { send(res,401,{error:'Your session has expired. Please sign in again.'}); return; }
        const id=routeId(path,'/api/installations'), existing=await getDoc('installations',id);
        if (!existing) { send(res,404,{error:'Installation job not found.'}); return; }
        if (user.role!=='admin' && existing.assignedTo!==user.uid) { send(res,403,{error:'You can delete only installation jobs assigned to your account.'}); return; }
        await db.collection('installations').doc(id).delete();
        await audit(user,'DELETE','installation',id,'Deleted installation job for '+String(existing.customerName||'customer'));
        send(res,200,{deleted:true}); return;
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
