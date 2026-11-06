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
  // Location is now captured only in response to an administrator's explicit request.
  // Attendance must never be warned, blocked, or cancelled because of background GPS.
  return;
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

let running = false;
let lastDailyRun = '';
export async function runScheduledTick() {
  if (running) return { skipped: true };
  running = true;
  try {
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
    return { skipped: false };
  } finally { running = false; }
}
export function startBackgroundJobs() {
  const timer = setInterval(() => { void runScheduledTick().catch(error => console.error('K&B scheduled task failed:', error instanceof Error ? error.message : String(error))); }, 60_000);
  (timer as any).unref?.();
  setTimeout(() => { void runScheduledTick().catch(error => console.error('K&B startup job failed:', error instanceof Error ? error.message : String(error))); }, 5_000).unref?.();
}
