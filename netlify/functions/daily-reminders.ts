import { db, list, now } from '../../functions/src/admin.js';
import { isValidDateKey, subscriptionExpiryKind, taskReminderKind } from '../../functions/src/route-path.js';

export const config = { schedule: '30 3 * * *' }; // 9:00 AM Asia/Kolkata (UTC+5:30)

export default async function sendDailyReminders() {
  {
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
  }
  {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const [year, month, day] = today.split('-').map(Number);
    const threeDaysAhead = new Date(Date.UTC(year, month - 1, day + 3)).toISOString().slice(0, 10);
    const [subscriptions, customers, users] = await Promise.all([list('subscriptions'), list('customers'), list('users')]);
    const admins = users.filter(item => item.role === 'admin' && item.active === true);
    for (const subscription of subscriptions) {
      if (!subscription.id || subscription.status !== 'Active' || !isValidDateKey(subscription.endDate)) continue;
      const kind = subscriptionExpiryKind(String(subscription.endDate), today, threeDaysAhead);
      if (!kind) continue;
      const customer = customers.find(item => item.id === subscription.customerId);
      const assignedStaff = customer?.assignedTo ? users.find(item => item.id === customer.assignedTo && item.role === 'staff' && item.active === true) : null;
      const recipients = [...admins, ...(assignedStaff ? [assignedStaff] : [])];
      const uniqueRecipients = Array.from(new Map(recipients.map(item => [String(item.id), item])).values());
      const customerName = String(subscription.customerName || customer?.name || 'Customer');
      const message = kind === 'due-soon'
        ? customerName + ' subscription expires in 3 days (' + subscription.endDate + '). Please arrange renewal.'
        : kind === 'due-today'
          ? customerName + ' subscription expires today. Please arrange renewal.'
          : customerName + ' subscription expired on ' + subscription.endDate + '. Update the customer after checking renewal.';
      const subscriptionRef = db.collection('subscriptions').doc(subscription.id);
      const stillCurrent = await db.runTransaction(async transaction => {
        const latest = await transaction.get(subscriptionRef);
        const current = latest.data();
        if (!latest.exists || !current || current.status !== 'Active' || String(current.endDate) !== String(subscription.endDate)) return false;
        if (kind === 'overdue') transaction.update(subscriptionRef, { status: 'Expired', expiredAt: now() });
        return true;
      });
      if (!stillCurrent) continue;
      for (const recipient of uniqueRecipients) {
        const notificationId = 'subscription-' + subscription.id + '-' + kind + '-' + String(subscription.endDate) + '-' + String(recipient.id);
        const notificationRef = db.collection('staff_notifications').doc(notificationId);
        await db.runTransaction(async transaction => {
          const existing = await transaction.get(notificationRef);
          if (existing.exists) return;
          transaction.create(notificationRef, {
            recipientId: recipient.id,
            recipientRole: recipient.role,
            type: 'subscription-' + kind,
            title: kind === 'due-soon' ? 'Subscription expires soon' : kind === 'due-today' ? 'Subscription expires today' : 'Subscription expired',
            message,
            createdAt: now(),
            read: false,
            relatedId: subscription.id
          });
        });
      }
    }
  }
}