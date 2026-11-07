import { createHash, timingSafeEqual } from 'node:crypto';
import { getMessaging } from 'firebase-admin/messaging';
import { FieldValue, firestore } from './firestore-adapter.js';
import { subscriptionExpiryKind, taskReminderKind } from './route-path.js';

type Item = Record<string, any>;
const now = () => new Date().toISOString();
async function readCollection(name: string, limit = 1000): Promise<Item[]> {
  const snapshot = await firestore.collection(name).limit(limit).get();
  return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
}
function indiaDateParts() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const [year, month, day] = parts.split('-').map(Number);
  return { date: parts, year, month, day };
}
function sha(value: string) { return createHash('sha256').update(value).digest('hex'); }

export async function runGpsGracePeriod() {
  const activeSnapshot = await firestore.collection('attendance').where('status', '==', 'Checked in').limit(1000).get();
  const records: Item[] = activeSnapshot.docs.map(doc => ({ ...(doc.data() as Item), id: doc.id }));
  const requests = await readCollection('holiday_requests', 1000);
  const users = await readCollection('users', 500);
  const currentTime = Date.now();

  for (const item of records) {
    if (!item.id || !item.gpsIssueStartedAt || item.checkOutAt || item.gpsRestartRequired) continue;
    const issueTime = Date.parse(String(item.gpsIssueStartedAt));
    if (!Number.isFinite(issueTime)) continue;
    const elapsed = currentTime - issueTime;
    const exempt = requests.some(request =>
      request.userId === item.userId &&
      ['pending', 'approved'].includes(String(request.status)) &&
      String(request.startDate || '') <= String(item.workDate || '') &&
      String(request.endDate || '') >= String(item.workDate || '')
    );
    if (exempt) continue;

    const issueId = String(item.gpsIssueId || sha(String(item.id) + '|' + String(item.gpsIssueStartedAt)).slice(0, 16));
    const attendanceRef = firestore.collection('attendance').doc(String(item.id));
    const reminders = [
      { minute: 5, stage: 1, message: 'GPS is still unavailable. Please restore location within 10 minutes.' },
      { minute: 10, stage: 2, message: 'Only 5 minutes remain in the GPS restoration period.' },
      { minute: 14, stage: 3, message: 'Final GPS reminder: the active shift will be cancelled in about 1 minute if location is not restored.' },
    ];

    for (const reminder of reminders) {
      if (elapsed < reminder.minute * 60000) continue;
      const notificationRef = firestore.collection('staff_notifications').doc(String(item.id) + '-gps-' + issueId + '-' + reminder.stage);
      await firestore.runTransaction(async transaction => {
        const latest = await transaction.get(attendanceRef);
        const current = latest.data();
        const currentIssueTime = Date.parse(String(current?.gpsIssueStartedAt || ''));
        if (!latest.exists || !current || current.gpsIssueStartedAt !== item.gpsIssueStartedAt ||
            current.checkOutAt || current.gpsRestartRequired || !Number.isFinite(currentIssueTime) ||
            Date.now() - currentIssueTime < reminder.minute * 60000 ||
            Number(current.gpsReminderStage || 0) >= reminder.stage) return;
        transaction.update(attendanceRef, { gpsReminderStage: reminder.stage });
        transaction.set(notificationRef, {
          recipientId: String(item.userId), recipientRole: 'staff', type: 'gps-reminder',
          title: 'GPS restoration reminder', message: reminder.message,
          createdAt: now(), read: false, attendanceId: String(item.id),
        }, { merge: true });
      });
    }

    if (elapsed < 15 * 60000) continue;
    const cancelledAt = now();
    const cancellationNotificationRef = firestore.collection('staff_notifications').doc(String(item.id) + '-gps-' + issueId + '-cancelled');
    const cancellationAuditRef = firestore.collection('audit_logs').doc('gps-cancelled-' + String(item.id) + '-' + issueId);
    const didCancel = await firestore.runTransaction(async transaction => {
      const latest = await transaction.get(attendanceRef);
      const current = latest.data();
      const currentIssueTime = Date.parse(String(current?.gpsIssueStartedAt || ''));
      if (!latest.exists || !current || current.gpsIssueStartedAt !== item.gpsIssueStartedAt ||
          current.checkOutAt || current.gpsRestartRequired || !Number.isFinite(currentIssueTime) ||
          Date.now() - currentIssueTime < 15 * 60000) return false;
      transaction.update(attendanceRef, {
        checkOutAt: cancelledAt,
        status: 'Cancelled - GPS unavailable',
        gpsStatus: 'disabled',
        gpsCancelled: true,
        gpsRestartRequired: true,
        gpsCancelledAt: cancelledAt,
        gpsCancellationReason: current.gpsIssueReason || 'GPS was not restored within 15 minutes',
        shiftEvents: FieldValue.arrayUnion({ type: 'gps-cancelled', at: cancelledAt, reason: 'GPS was not restored within 15 minutes' }),
      });
      transaction.set(cancellationNotificationRef, {
        recipientId: String(item.userId), recipientRole: 'staff', type: 'gps-cancelled',
        title: 'Shift cancelled',
        message: 'Your shift was automatically cancelled because GPS/location was not restored within 15 minutes. Contact an administrator to restart it.',
        createdAt: cancelledAt, read: false, attendanceId: String(item.id),
      }, { merge: true });
      transaction.set(cancellationAuditRef, {
        actorId: 'system', actorName: 'K&B GPS monitor', action: 'GPS_SHIFT_CANCELLED',
        entityType: 'attendance', entityId: String(item.id),
        description: 'Automatically cancelled ' + String(item.displayName || 'staff shift') + ' after the 15-minute GPS restoration period.',
        createdAt: cancelledAt, serverCreatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return true;
    });
    if (!didCancel) continue;

    const admins = users.filter(entry => entry.role === 'admin' && entry.active === true);
    await Promise.all(admins.map(admin => {
      const notificationRef = firestore.collection('staff_notifications').doc(String(item.id) + '-gps-' + issueId + '-cancelled-admin-' + String(admin.id));
      return notificationRef.set({
        recipientId: String(admin.id), recipientRole: 'admin', type: 'gps-cancelled-admin',
        title: 'Staff shift cancelled for GPS',
        message: String(item.displayName || 'A staff member') + ' did not restore GPS/location within 15 minutes. The shift was automatically cancelled.',
        createdAt: cancelledAt, read: false, attendanceId: String(item.id),
      }, { merge: true });
    }));
  }
}

export async function sendTaskDueReminders() {
  const { date: today, year, month, day } = indiaDateParts();
  const tomorrow = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
  for (const task of await readCollection('tasks', 1000)) {
    const dueDate = String(task.dueDate || ''), assignedTo = String(task.assignedTo || '');
    if (!task.id || !assignedTo || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || task.status === 'Completed') continue;
    const kind = taskReminderKind(dueDate, today, tomorrow);
    if (!kind) continue;
    const ref = firestore.collection('staff_notifications').doc('task-reminder-' + String(task.id) + '-' + kind + '-' + dueDate);
    await firestore.runTransaction(async transaction => {
      const exists = await transaction.get(ref);
      if (exists.exists) return;
      const title = kind === 'upcoming' ? 'Task due tomorrow' : kind === 'due-today' ? 'Task due today' : 'Task overdue';
      const message = kind === 'upcoming'
        ? String(task.title || 'Assigned task') + ' is due tomorrow (' + dueDate + ').'
        : kind === 'due-today'
          ? String(task.title || 'Assigned task') + ' is due today (' + dueDate + ').'
          : String(task.title || 'Assigned task') + ' was due on ' + dueDate + ' and is still incomplete.';
      transaction.create(ref, { recipientId: assignedTo, recipientRole: 'staff', type: kind === 'overdue' ? 'task-overdue' : 'task-reminder', title, message, createdAt: now(), read: false, relatedId: String(task.id) });
    });
  }
}

export async function sendSubscriptionExpiryReminders() {
  const { date: today, year, month, day } = indiaDateParts();
  const inThreeDays = new Date(Date.UTC(year, month - 1, day + 3)).toISOString().slice(0, 10);
  const [subscriptions, customers, users] = await Promise.all([
    readCollection('subscriptions', 1000), readCollection('customers', 1000), readCollection('users', 500),
  ]);
  const admins = users.filter(item => item.role === 'admin' && item.active === true);
  for (const subscription of subscriptions) {
    if (!subscription.id || subscription.status !== 'Active' || !/^\d{4}-\d{2}-\d{2}$/.test(String(subscription.endDate || ''))) continue;
    const kind = subscriptionExpiryKind(String(subscription.endDate), today, inThreeDays);
    if (!kind) continue;
    const customer = customers.find(item => item.id === subscription.customerId);
    const staff = customer?.assignedTo ? users.find(item => item.id === customer.assignedTo && item.role === 'staff' && item.active === true) : null;
    const recipients = [...admins, ...(staff ? [staff] : [])];
    const unique = Array.from(new Map(recipients.map(item => [String(item.id), item])).values());
    const customerName = String(subscription.customerName || customer?.name || 'Customer');
    const message = kind === 'due-soon'
      ? customerName + ' subscription expires in 3 days (' + subscription.endDate + '). Please arrange renewal.'
      : kind === 'due-today'
        ? customerName + ' subscription expires today. Please arrange renewal.'
        : customerName + ' subscription expired on ' + subscription.endDate + '. Update the customer after checking renewal.';
    const subRef = firestore.collection('subscriptions').doc(String(subscription.id));
    const stillCurrent = await firestore.runTransaction(async transaction => {
      const latest = await transaction.get(subRef), data = latest.data();
      if (!latest.exists || !data || data.status !== 'Active' || String(data.endDate) !== String(subscription.endDate)) return false;
      if (kind === 'overdue') transaction.update(subRef, { status: 'Expired', expiredAt: now() });
      return true;
    });
    if (!stillCurrent) continue;
    for (const recipient of unique) {
      const ref = firestore.collection('staff_notifications').doc('subscription-' + String(subscription.id) + '-' + kind + '-' + String(subscription.endDate) + '-' + String(recipient.id));
      await firestore.runTransaction(async transaction => {
        const existing = await transaction.get(ref);
        if (existing.exists) return;
        transaction.create(ref, {
          recipientId: String(recipient.id), recipientRole: String(recipient.role),
          type: 'subscription-' + kind,
          title: kind === 'due-soon' ? 'Subscription expires soon' : kind === 'due-today' ? 'Subscription expires today' : 'Subscription expired',
          message, createdAt: now(), read: false, relatedId: String(subscription.id),
        });
      });
    }
  }
}

export async function deliverPendingPushNotifications() {
  const notifications = await readCollection('staff_notifications', 500);
  for (const notification of notifications) {
    if (!notification.id || notification.pushDeliveredAt || !notification.recipientId) continue;
    const tokenSnap = await firestore.collection('push_tokens').where('userId', '==', String(notification.recipientId)).limit(100).get();
    if (tokenSnap.empty) continue;
    const tokenDocs = tokenSnap.docs;
    const tokens = tokenDocs.map(doc => String(doc.data().token || '')).filter(Boolean);
    if (!tokens.length) continue;
    const type = String(notification.type || ''), title = String(notification.title || 'K&B Management Nexus').slice(0, 120);
    const body = ['direct-message', 'group-message'].includes(type)
      ? 'You have a new message. Open K&B Management Nexus to view it.'
      : String(notification.message || 'You have a new update.').slice(0, 180);
    const result = await getMessaging().sendEachForMulticast({ tokens, notification: { title, body }, data: { notificationId: String(notification.id), type, relatedId: String(notification.relatedId || '') }, android: { priority: 'high' } });
    const invalid: Promise<unknown>[] = [];
    result.responses.forEach((response, index) => {
      if (!response.success && ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(String(response.error?.code || ''))) {
        const doc = tokenDocs.find(candidate => candidate.data().token === tokens[index]);
        if (doc) invalid.push(doc.ref.delete());
      }
    });
    if (invalid.length) await Promise.all(invalid);
    await firestore.collection('staff_notifications').doc(String(notification.id)).update({ pushDeliveredAt: now(), pushSuccessCount: result.successCount, pushFailureCount: result.failureCount });
  }
}


export async function autoCheckoutAtSevenPm() {
  const currentTime = Date.now();
  const activeSnapshot = await firestore.collection('attendance').where('status', '==', 'Checked in').limit(1000).get();
  const records: Item[] = activeSnapshot.docs.map(doc => ({ ...(doc.data() as Item), id: doc.id }));
  let checkedOut = 0;
  for (const item of records) {
    if (!item.id || !/^\d{4}-\d{2}-\d{2}$/.test(String(item.workDate || '')) ||
        item.checkOutAt || item.dayType === 'Absent') continue;
    const checkInTime = Date.parse(String(item.checkInAt || ''));
    if (!Number.isFinite(checkInTime)) continue;
    const localCheckIn = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(checkInTime));
    const checkInMinutes = Number(localCheckIn.find(part => part.type === 'hour')?.value || 0) * 60 +
      Number(localCheckIn.find(part => part.type === 'minute')?.value || 0);
    // Admins may start a shift after 7 PM. Such a shift is due for
    // automatic checkout at 7 PM on the following India calendar day.
    const dueDate = checkInMinutes >= 19 * 60
      ? new Date(Date.parse(String(item.workDate) + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10)
      : String(item.workDate);
    const legacyCheckoutAt = new Date(dueDate + 'T19:00:00+05:30');
    const savedCheckoutAt = Date.parse(String(item.autoCheckoutAt || ''));
    const checkoutAt = new Date(Number.isFinite(savedCheckoutAt) ? savedCheckoutAt : legacyCheckoutAt.getTime());
    if (currentTime < checkoutAt.getTime()) continue;
    const checkoutIso = checkoutAt.toISOString();
    const ref = firestore.collection('attendance').doc(String(item.id));
    const notificationId = 'attendance-auto-checkout-' + String(item.id);
    const auditId = 'attendance-auto-checkout-' + String(item.id);
    const notificationRef = firestore.collection('staff_notifications').doc(notificationId);
    const auditRef = firestore.collection('audit_logs').doc(auditId);
    const didCheckout = await firestore.runTransaction(async transaction => {
      const latest = await transaction.get(ref);
      const current = latest.data();
      if (!latest.exists || !current || current.checkOutAt ||
          current.workDate !== item.workDate) return false;
      transaction.update(ref, {
        checkOutAt: checkoutIso,
        updatedAt: now(),
        status: 'Completed',
        endedBy: 'system',
        endedByName: 'Automatic scheduled checkout',
        autoCheckedOut: true,
        autoCheckedOutAt: checkoutIso,
        gpsStatus: current.gpsIssueStartedAt ? 'disabled-at-checkout' : (current.gpsStatus || 'enabled'),
        gpsIssueStartedAt: FieldValue.delete(),
        gpsIssueId: FieldValue.delete(),
        gpsIssueReason: FieldValue.delete(),
        gpsReminderStage: FieldValue.delete(),
      });
      transaction.set(notificationRef, {
        recipientId: String(item.userId), recipientRole: 'staff', type: 'attendance-auto-checkout',
        title: 'Shift automatically ended',
        message: 'Your shift was automatically checked out at the scheduled end time. You can start a new shift during the configured staff shift window.',
        createdAt: checkoutIso, read: false, attendanceId: String(item.id),
      }, { merge: true });
      transaction.set(auditRef, {
        actorId: 'system', actorName: 'K&B automatic attendance',
        action: 'AUTO_CHECKOUT', entityType: 'attendance', entityId: String(item.id),
        description: 'Automatically checked out ' + String(item.displayName || 'staff member') + ' at the scheduled shift end time.',
        createdAt: checkoutIso, serverCreatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return true;
    });
    if (!didCheckout) continue;
    checkedOut += 1;
  }
  return { checkedOut };
}

let running = false;
let lastDailyRun = '';
export async function runScheduledTick() {
  if (running) return { skipped: true };
  running = true;
  try {
    const attendance = await autoCheckoutAtSevenPm();
    await runGpsGracePeriod();
    await deliverPendingPushNotifications();
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date());
    const hour = Number(parts.find(part => part.type === 'hour')?.value || 0);
    const { date } = indiaDateParts();
    if (hour >= 9 && lastDailyRun !== date) {
      await sendTaskDueReminders();
      await sendSubscriptionExpiryReminders();
      lastDailyRun = date;
    }
    return { skipped: false, ...attendance };
  } finally { running = false; }
}
export function startBackgroundJobs() {
  const timer = setInterval(() => { void runScheduledTick().catch(error => console.error('K&B scheduled task failed:', error instanceof Error ? error.message : String(error))); }, 60_000);
  (timer as any).unref?.();
  setTimeout(() => { void runScheduledTick().catch(error => console.error('K&B startup job failed:', error instanceof Error ? error.message : String(error))); }, 5_000).unref?.();
}
