import { createHash } from 'node:crypto';
import { FieldValue, db, list, now } from '../../functions/src/admin.js';

export const config = { schedule: '* * * * *' };

export default async function enforceGpsGracePeriod() {
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
      const issueId = String(item.gpsIssueId || createHash('sha256').update(item.id + '|' + String(item.gpsIssueStartedAt)).digest('hex').slice(0, 16));
      const notificationRef = db.collection('staff_notifications').doc(item.id + '-gps-' + issueId + '-' + reminder.stage);
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
      const issueId = String(item.gpsIssueId || createHash('sha256').update(item.id + '|' + String(item.gpsIssueStartedAt)).digest('hex').slice(0, 16));
      const cancellationNotificationRef = db.collection('staff_notifications').doc(item.id + '-gps-' + issueId + '-cancelled');
      const cancellationAuditRef = db.collection('audit_logs').doc('gps-cancelled-' + item.id + '-' + issueId);
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
      const admins = (await list('users')).filter(entry => entry.role === 'admin' && entry.active === true);
      await Promise.all(admins.map(admin => db.collection('staff_notifications').doc(item.id + '-gps-' + issueId + '-cancelled-admin-' + admin.id).set({
        recipientId: admin.id, recipientRole: 'admin', type: 'gps-cancelled-admin',
        title: 'Staff shift cancelled for GPS',
        message: String(item.displayName || 'A staff member') + ' did not restore GPS/location within 15 minutes. The shift was automatically cancelled.',
        createdAt: cancelledAt, read: false, attendanceId: item.id
      }, { merge: true })));
    }
  }
}
