import { createHash, timingSafeEqual } from 'node:crypto';
import { getMessaging } from 'firebase-admin/messaging';
import { FieldValue, firestore } from './firestore-adapter.js';
import { isGpsGraceExemptHolidayStatus, subscriptionExpiryKind, taskReminderKind } from './route-path.js';

type Item = Record<string, any>;
const now = () => new Date().toISOString();
async function readAllQuery(query: any, pageSize = 400): Promise<Item[]> {
  const items: Item[] = [];
  let page = await query.limit(pageSize).get();
  while (!page.empty) {
    items.push(...page.docs.map((doc: any) => ({ ...doc.data(), id: doc.id })));
    if (page.size < pageSize) break;
    page = await query.startAfter(page.docs[page.docs.length - 1]).limit(pageSize).get();
  }
  return items;
}
function indiaDateParts() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const [year, month, day] = parts.split('-').map(Number);
  return { date: parts, year, month, day };
}
function sha(value: string) { return createHash('sha256').update(value).digest('hex'); }

export async function runGpsGracePeriod() {
  // Read the checked-in attendance set once, then avoid loading holiday and user
  // collections on every tick when nobody currently has a GPS issue.
  const records = await readAllQuery(firestore.collection('attendance').where('status', '==', 'Checked in'));
  const activeGpsIssues = records.filter(item =>
    item.id && item.gpsIssueStartedAt && !item.checkOutAt && !item.gpsRestartRequired
  );
  if (!activeGpsIssues.length) return;

  const requests = await readAllQuery(firestore.collection('holiday_requests'));
  const currentTime = Date.now();

  for (const item of activeGpsIssues) {
    const issueTime = Date.parse(String(item.gpsIssueStartedAt));
    if (!Number.isFinite(issueTime)) continue;
    const elapsed = currentTime - issueTime;
    const exempt = requests.some(request =>
      request.userId === item.userId &&
      isGpsGraceExemptHolidayStatus(request.status) &&
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

    // Fetch admin recipients only when a shift was actually cancelled.
    const admins = (await readAllQuery(firestore.collection('users').where('role', '==', 'admin')))
      .filter(entry => entry.active === true);
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

function billingPeriodParts() {
  const { year, month } = indiaDateParts();
  const period = year + '-' + String(month).padStart(2, '0');
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { period, year, month, lastDay };
}

export async function generateMonthlyInvoicesAutomatically() {
  const { period, year, month, lastDay } = billingPeriodParts();
  const [customers, invoices] = await Promise.all([
    readAllQuery(firestore.collection('customers')),
    readAllQuery(firestore.collection('invoices')),
  ]);
  const existing = new Set(invoices.map(item => String(item.customerId) + '|' + String(item.period)));
  const active = customers.filter(customer => customer.status === 'Active' && customer.id && Number.isFinite(Number(customer.monthlyFee)) && Number(customer.monthlyFee) >= 0);
  let created = 0;
  for (const customer of active) {
    const key = String(customer.id) + '|' + period;
    if (existing.has(key)) continue;
    const configuredDueDate = String(customer.dueDate || '');
    const dueDay = /^\d{4}-\d{2}-\d{2}$/.test(configuredDueDate) ? Number(configuredDueDate.slice(-2)) : 10;
    const dueDate = period + '-' + String(Math.min(Math.max(dueDay, 1), lastDay)).padStart(2, '0');
    const invoiceId = 'inv-' + Buffer.from(key).toString('base64url').slice(0, 32);
    const invoiceRef = firestore.collection('invoices').doc(invoiceId);
    const didCreate = await firestore.runTransaction(async transaction => {
      const current = await transaction.get(invoiceRef);
      if (current.exists) return false;
      transaction.create(invoiceRef, {
        customerId: String(customer.id),
        customerName: String(customer.name || 'Customer'),
        period,
        dueDate,
        amount: Number(customer.monthlyFee),
        createdAt: now(),
        createdBy: 'system',
        generatedAutomatically: true,
      });
      return true;
    });
    if (didCreate) created += 1;
  }
  if (created) {
    const auditRef = firestore.collection('audit_logs').doc('auto-invoice-batch-' + period);
    await auditRef.set({
      actorId: 'system',
      actorName: 'K&B automatic billing',
      action: 'GENERATE',
      entityType: 'invoice_batch',
      entityId: period,
      description: 'Automatically generated ' + created + ' monthly invoices for ' + period + '.',
      createdAt: now(),
      serverCreatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  return { period, created, activeCustomers: active.length };
}

export async function sendInvoiceDueReminders() {
  const { date: today } = indiaDateParts();
  const [invoices, payments, customers, users] = await Promise.all([
    readAllQuery(firestore.collection('invoices')),
    readAllQuery(firestore.collection('payments')),
    readAllQuery(firestore.collection('customers')),
    readAllQuery(firestore.collection('users')),
  ]);
  const admins = users.filter(user => user.role === 'admin' && user.active === true);
  let notified = 0;
  for (const invoice of invoices) {
    if (!invoice.id || invoice.voidedAt || !/^\d{4}-\d{2}$/.test(String(invoice.period || '')) || !/^\d{4}-\d{2}-\d{2}$/.test(String(invoice.dueDate || ''))) continue;
    const dueDate = String(invoice.dueDate);
    const dueTime = Date.parse(dueDate + 'T00:00:00Z');
    const todayTime = Date.parse(today + 'T00:00:00Z');
    const daysFromDue = Math.round((todayTime - dueTime) / 86400000);
    if (![ -3, 0, 3, 7 ].includes(daysFromDue)) continue;
    const period = String(invoice.period || '');
    const monthLabel = period ? new Date(period + '-01T12:00:00').toLocaleString('en-IN', { month: 'long', year: 'numeric' }) : '';
    const paidAmount = payments
      .filter(payment => payment.customerId === invoice.customerId &&
        (payment.month === monthLabel || String(payment.paidAt || '').slice(0, 7) === period))
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const amount = Number(invoice.amount || 0);
    const balance = Math.max(0, amount - paidAmount);
    if (!(balance > 0)) continue;
    const customer = customers.find(item => item.id === invoice.customerId);
    const assignedStaff = customer?.assignedTo
      ? users.find(user => user.id === customer.assignedTo && user.role === 'staff' && user.active === true)
      : null;
    const recipients = Array.from(new Map([...admins, ...(assignedStaff ? [assignedStaff] : [])].map(user => [String(user.id), user])).values());
    const kind = daysFromDue < 0 ? 'upcoming' : daysFromDue === 0 ? 'due-today' : 'overdue-' + daysFromDue;
    const message = String(invoice.customerName || customer?.name || 'Customer') +
      (daysFromDue < 0 ? ' has an invoice due in 3 days (' + dueDate + ').' :
        daysFromDue === 0 ? ' has an invoice due today (' + dueDate + ').' :
          ' has an unpaid invoice ' + daysFromDue + ' days overdue (due ' + dueDate + ').') +
      ' Outstanding balance: ₹' + balance.toLocaleString('en-IN') + '.';
    for (const recipient of recipients) {
      const notificationRef = firestore.collection('staff_notifications').doc(
        'invoice-' + String(invoice.id) + '-' + kind + '-' + today + '-' + String(recipient.id)
      );
      const didCreate = await firestore.runTransaction(async transaction => {
        const existing = await transaction.get(notificationRef);
        if (existing.exists) return false;
        transaction.create(notificationRef, {
          recipientId: String(recipient.id),
          recipientRole: String(recipient.role),
          type: 'invoice-' + kind,
          title: daysFromDue < 0 ? 'Invoice due soon' : daysFromDue === 0 ? 'Invoice due today' : 'Overdue customer invoice',
          message,
          createdAt: now(),
          read: false,
          relatedId: String(invoice.id),
        });
        return true;
      });
      if (didCreate) notified += 1;
    }
  }
  return { notified };
}

export async function sendTaskDueReminders() {
  const { date: today, year, month, day } = indiaDateParts();
  const tomorrow = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
  for (const task of await readAllQuery(firestore.collection('tasks'))) {
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
    readAllQuery(firestore.collection('subscriptions')), readAllQuery(firestore.collection('customers')), readAllQuery(firestore.collection('users')),
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
  // Scan all pages so a block of old, already-delivered notifications cannot
  // permanently hide newer pending notifications behind an arbitrary first-page limit.
  const notifications = (await readAllQuery(firestore.collection('staff_notifications')))
    .filter(item => item.id && !item.pushDeliveredAt && !item.pushSkippedAt && item.recipientId)
    .slice(0, 100);
  for (const notification of notifications) {
    const notificationRef = firestore.collection('staff_notifications').doc(String(notification.id));
    const tokenSnap = await firestore.collection('push_tokens').where('userId', '==', String(notification.recipientId)).limit(100).get();
    if (tokenSnap.empty) {
      await notificationRef.update({ pushSkippedAt: now(), pushSkipReason: 'no-device-token' });
      continue;
    }
    const tokenDocs = tokenSnap.docs;
    const previouslyDelivered = new Set(Array.isArray(notification.pushDeliveredTokenIds) ? notification.pushDeliveredTokenIds.map(String) : []);
    const eligibleDocs = tokenDocs.filter(doc => !previouslyDelivered.has(doc.id) && String(doc.data().token || '').trim());
    if (!eligibleDocs.length) {
      await notificationRef.update({ pushDeliveredAt: now(), pushSuccessCount: Number(notification.pushSuccessCount || 0), pushFailureCount: 0 });
      continue;
    }
    const tokens = eligibleDocs.map(doc => String(doc.data().token));
    const type = String(notification.type || ''), title = String(notification.title || 'K&B Management Nexus').slice(0, 120);
    const body = ['direct-message', 'group-message'].includes(type)
      ? 'You have a new message. Open K&B Management Nexus to view it.'
      : String(notification.message || 'You have a new update.').slice(0, 180);
    const result = await getMessaging().sendEachForMulticast({ tokens, notification: { title, body }, data: { notificationId: String(notification.id), type, relatedId: String(notification.relatedId || '') }, android: { priority: 'high' } });
    const completedTokenIds = [...previouslyDelivered];
    const invalid: Promise<unknown>[] = [];
    result.responses.forEach((response, index) => {
      const tokenDoc = eligibleDocs[index];
      if (response.success) completedTokenIds.push(tokenDoc.id);
      else if (['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(String(response.error?.code || ''))) {
        invalid.push(tokenDoc.ref.delete());
      }
    });
    if (invalid.length) await Promise.all(invalid);
    const remaining = eligibleDocs.filter(doc => !completedTokenIds.includes(doc.id));
    const attempts = Number(notification.pushAttemptCount || 0) + 1;
    const patch: Record<string, unknown> = {
      pushDeliveredTokenIds: Array.from(new Set(completedTokenIds)),
      pushAttemptCount: attempts,
      pushSuccessCount: Number(notification.pushSuccessCount || 0) + result.successCount,
      pushFailureCount: result.failureCount,
      pushLastAttemptAt: now(),
    };
    if (!remaining.length) patch.pushDeliveredAt = now();
    else if (attempts >= 5) {
      patch.pushSkippedAt = now();
      patch.pushSkipReason = 'retry-limit';
    }
    await notificationRef.update(patch);
  }
}


export async function autoCheckoutAtSevenPm() {
  const currentTime = Date.now();
  const records = await readAllQuery(firestore.collection('attendance').where('status', '==', 'Checked in'));
  const settingsSnapshot = await firestore.collection('app_settings').doc('workforce').get();
  const configuredEndTime = String(settingsSnapshot.data()?.shiftEndTime || '19:00');
  const fallbackEndTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(configuredEndTime) ? configuredEndTime : '19:00';
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
    // Admins may start a shift after the configured end time. Such a shift
    // is due at the next occurrence of that configured end time.
    const endTime = typeof item.shiftEndTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(item.shiftEndTime) ? item.shiftEndTime : fallbackEndTime;
    const [shiftEndHour, shiftEndMinute] = endTime.split(':').map(Number);
    const shiftEndMinutes = shiftEndHour * 60 + shiftEndMinute;
    const dueDate = checkInMinutes >= shiftEndMinutes
      ? new Date(Date.parse(String(item.workDate) + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10)
      : String(item.workDate);
    const legacyCheckoutAt = new Date(dueDate + 'T' + endTime + ':00+05:30');
    const savedCheckoutAt = Date.parse(String(item.autoCheckoutAt || item.scheduledEndAt || ''));
    const checkoutAt = new Date(Number.isFinite(savedCheckoutAt) ? savedCheckoutAt : legacyCheckoutAt.getTime());
    if (currentTime < checkoutAt.getTime()) continue;
    let checkoutIso = checkoutAt.toISOString();
    const ref = firestore.collection('attendance').doc(String(item.id));
    const notificationId = 'attendance-auto-checkout-' + String(item.id);
    const auditId = 'attendance-auto-checkout-' + String(item.id);
    const notificationRef = firestore.collection('staff_notifications').doc(notificationId);
    const auditRef = firestore.collection('audit_logs').doc(auditId);
    const didCheckout = await firestore.runTransaction(async transaction => {
      const latest = await transaction.get(ref);
      const current = latest.data();
      if (!latest.exists || !current || current.checkOutAt ||
          current.status !== 'Checked in' || current.dayType === 'Absent' ||
          current.workDate !== item.workDate) return false;
      // Re-check the live deadline inside the transaction. A settings change may
      // have extended this shift after the scheduler read its initial snapshot.
      const latestDeadline = Date.parse(String(current.autoCheckoutAt || current.scheduledEndAt || ''));
      if (Number.isFinite(latestDeadline)) {
        if (currentTime < latestDeadline) return false;
        checkoutIso = new Date(latestDeadline).toISOString();
      }
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
let autoCheckoutRunning = false;
let lastDailyRun = '';

async function runAutoCheckoutJob() {
  if (autoCheckoutRunning) return { skipped: true };
  autoCheckoutRunning = true;
  try {
    return { skipped: false, ...(await autoCheckoutAtSevenPm()) };
  } finally {
    autoCheckoutRunning = false;
  }
}

export async function runScheduledTick() {
  if (running) return { skipped: true };
  running = true;
  try {
    const jobFailures: string[] = [];
    let attendance: Awaited<ReturnType<typeof runAutoCheckoutJob>> | null = null;
    try {
      attendance = await runAutoCheckoutJob();
    } catch (error) {
      jobFailures.push('automatic-checkout');
      console.error('K&B scheduled job failed (automatic-checkout):', error instanceof Error ? error.message : String(error));
    }
    for (const [name, job] of [
      ['gps-grace-period', runGpsGracePeriod],
      ['push-delivery', deliverPendingPushNotifications],
    ] as Array<[string, () => Promise<unknown>]>) {
      try {
        await job();
      } catch (error) {
        jobFailures.push(name);
        console.error('K&B scheduled job failed (' + name + '):', error instanceof Error ? error.message : String(error));
      }
    }
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date());
    const hour = Number(parts.find(part => part.type === 'hour')?.value || 0);
    const { date } = indiaDateParts();
    let dailyJobFailures: string[] = [];
    if (hour >= 9 && lastDailyRun !== date) {
      const dailyJobs: Array<[string, () => Promise<unknown>]> = [
        ['monthly-invoices', generateMonthlyInvoicesAutomatically],
        ['task-reminders', sendTaskDueReminders],
        ['subscription-reminders', sendSubscriptionExpiryReminders],
        ['invoice-reminders', sendInvoiceDueReminders],
      ];
      for (const [name, job] of dailyJobs) {
        try {
          await job();
        } catch (error) {
          dailyJobFailures.push(name);
          console.error('K&B daily job failed (' + name + '):', error instanceof Error ? error.message : String(error));
        }
      }
      // Successful jobs are idempotent; retry only failed work on the next
      // scheduler tick instead of letting one failure block every other workflow.
      if (dailyJobFailures.length === 0) lastDailyRun = date;
    }
    return { skipped: false, ...(attendance || {}), jobFailures, dailyJobFailures };
  } finally { running = false; }
}

export function startBackgroundJobs() {
  // One scheduler owns attendance, GPS, reminders and push delivery. The former
  // separate 15-second checkout loop duplicated the attendance scan performed
  // by runScheduledTick every five minutes and rapidly consumed Firestore read quota.
  // A five-minute cadence keeps the service within a modest read budget while
  // still checking the 15-minute GPS grace window and scheduled shift end.
  const timer = setInterval(() => {
    void runScheduledTick().catch(error => console.error('K&B scheduled task failed:', error instanceof Error ? error.message : String(error)));
  }, 5 * 60_000);
  (timer as any).unref?.();
  setTimeout(() => {
    void runScheduledTick().catch(error => console.error('K&B startup job failed:', error instanceof Error ? error.message : String(error)));
  }, 5_000).unref?.();
}
