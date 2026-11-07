import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api as client, subscribeToApiChanges } from './lib/api';

type Session = { token: string; user: { id: string; displayName: string; role: 'admin' | 'staff'; canManageAdmins?: boolean } };
type Attendance = { id: string; userId: string; displayName: string; workDate: string; checkInAt: string; checkOutAt?: string; autoCheckoutAt?: string; shiftEndTime?: string; dayType?: 'Full day' | 'Half day' | 'Absent'; correctionReason?: string; gpsRestartRequired?: boolean; gpsCancelled?: boolean; status?: string };
type HolidayRequest = { id: string; userId: string; displayName: string; startDate: string; endDate: string; reason: string; status: 'pending'|'approved'|'rejected'; createdAt: string };
type StaffRegistrationRequest = { id: string; userId: string; displayName: string; phone?: string; reason?: string; status: 'pending'|'approved'|'rejected'; createdAt: string };
type Visit = { id: string; customerName: string; purpose: string; notes: string; visitedAt: string; staffName: string };
type Announcement = { id: string; title: string; message: string; createdAt: string; createdByName: string };
type Message = { id: string; senderName: string; recipientName: string; message: string; createdAt: string };
type Payment = { id: string; recordedBy?: string; recordedByName?: string; amount: number; paidAt: string };
type ChatGroup = { id: string; name: string; memberIds: string[]; memberNames: string[] };
type GroupMessage = { id: string; groupId: string; senderId: string; senderName: string; message: string; createdAt: string };

const localDay = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());
const indiaMinutesNow = () => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  return Number(parts.find(part => part.type === 'hour')?.value || 0) * 60 +
    Number(parts.find(part => part.type === 'minute')?.value || 0);
};
const stamp = (value?: string) => value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const displayTime = (value: string) => { const [hour, minute] = value.split(':').map(Number); return new Date(2000, 0, 1, hour, minute).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }); };
const shiftDueAt = (item: Attendance) => {
  const savedDeadline = Date.parse(item.autoCheckoutAt || '');
  if (Number.isFinite(savedDeadline)) return savedDeadline;
  const checkIn = Date.parse(item.checkInAt || '');
  if (!Number.isFinite(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(item.workDate || '')) return Number.NaN;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(checkIn));
  const minutes = Number(parts.find(part => part.type === 'hour')?.value || 0) * 60 +
    Number(parts.find(part => part.type === 'minute')?.value || 0);
  const endTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(item.shiftEndTime || '') ? item.shiftEndTime! : '19:00';
  const [endHour, endMinute] = endTime.split(':').map(Number);
  const endMinutes = endHour * 60 + endMinute;
  const dueDate = minutes >= endMinutes
    ? new Date(Date.parse(item.workDate + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10)
    : item.workDate;
  return Date.parse(dueDate + 'T' + endTime + ':00+05:30');
};
const isUnclosedShift = (item: Attendance) =>
  !item.checkOutAt && item.dayType !== 'Absent' && !item.gpsRestartRequired && !item.gpsCancelled &&
  !String(item.status || '').toLowerCase().includes('cancelled') && !String(item.status || '').toLowerCase().includes('completed');
const isOpenShift = (item: Attendance) => isUnclosedShift(item) && shiftDueAt(item) > Date.now();
function AttendanceCalendar({ staffId, staffName, records, holidays }: { staffId: string; staffName: string; records: Attendance[]; holidays: HolidayRequest[] }) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const year = month.getFullYear(), monthIndex = month.getMonth();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const mondayOffset = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const today = localDay();
  const dateKey = (day: number) => [year, String(monthIndex + 1).padStart(2,'0'), String(day).padStart(2,'0')].join('-');
  const recordsByDate = new Map(records.filter(item => item.userId === staffId).sort((a, b) => a.checkInAt.localeCompare(b.checkInAt)).map(item => [item.workDate, item]));
  const holidayOn = (date: string) => holidays.some(item => item.userId === staffId && ['pending','approved'].includes(item.status) && item.startDate <= date && item.endDate >= date);
  const statusFor = (day: number) => {
    const date = dateKey(day), weekday = new Date(year, monthIndex, day).getDay(), record = recordsByDate.get(date);
    if (holidayOn(date)) return 'holiday';
    if (record) return record.dayType === 'Absent' || record.gpsCancelled || String(record.status || '').toLowerCase().includes('absent') || String(record.status || '').toLowerCase().includes('cancelled') ? 'absent' : record.dayType === 'Half day' ? 'half' : 'full';
    if (weekday === 0) return 'off';
    if (date < today) return 'absent';
    return date === today ? 'today' : 'future';
  };
  return <div className="attendance-calendar-card">
    <div className="attendance-calendar-head"><div><b>{staffName}</b><small>Attendance calendar</small></div><div className="attendance-calendar-nav"><button type="button" aria-label="Previous month" onClick={() => setMonth(new Date(year, monthIndex - 1, 1))}>‹</button><input className="attendance-month-picker" type="month" aria-label={'Choose month for ' + staffName} value={year + '-' + String(monthIndex + 1).padStart(2,'0')} onChange={event=>{if(!event.target.value)return;const [nextYear,nextMonth]=event.target.value.split('-').map(Number);setMonth(new Date(nextYear,nextMonth-1,1));}}/><button type="button" aria-label="Next month" onClick={() => setMonth(new Date(year, monthIndex + 1, 1))}>›</button></div></div>
    <div className="attendance-calendar-grid">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day => <span className="attendance-calendar-weekday" key={day}>{day}</span>)}
      {Array.from({length:mondayOffset},(_,i)=><span className="attendance-calendar-blank" key={'blank-'+i}/>)}
      {Array.from({length:daysInMonth},(_,i)=>{const day=i+1,status=statusFor(day);return <span key={day} className={'attendance-calendar-day '+status} title={dateKey(day)+' · '+status.replace('-',' ')}>{day}</span>;})}
    </div>
    <div className="attendance-calendar-legend"><span><i className="full"/>Full day</span><span><i className="half"/>Half day</span><span><i className="absent"/>Absent</span><span><i className="holiday"/>Holiday request</span><span><i className="off"/>Weekly off</span></div>
  </div>;
}

export default function StaffOperations({ session, customers, flash, compact = false, onDataChanged }: { session: Session; customers: Array<{ id: string; name: string; assignedTo?: string }>; flash: (message: string) => void; compact?: boolean; onDataChanged?: () => void }) {
  const admin = session.user.role === 'admin';
  const superAdmin = admin && session.user.canManageAdmins === true;
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [holidays, setHolidays] = useState<HolidayRequest[]>([]);
  const [holidayForm, setHolidayForm] = useState({ startDate: localDay(), endDate: localDay(), reason: '' });
  const [visits, setVisits] = useState<Visit[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [admins, setAdmins] = useState<Array<{id:string;userId:string;displayName:string;active:boolean}>>([]);
  const [adminForm, setAdminForm] = useState({userId:'',displayName:'',password:''});
  const [registrationRequests, setRegistrationRequests] = useState<StaffRegistrationRequest[]>([]);
  const [registrationPasswords, setRegistrationPasswords] = useState<Record<string,string>>({});
  const [dayType, setDayType] = useState<'Full day'|'Half day'>('Full day');
  const [staffDayTypes, setStaffDayTypes] = useState<Record<string, 'Full day'|'Half day'|'Absent'>>({});
  const [attendanceCorrection, setAttendanceCorrection] = useState<{id:string;dayType:'Full day'|'Half day'|'Absent';reason:string}|null>(null);
  const [staff, setStaff] = useState<Array<{ id: string; displayName: string; active: boolean }>>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [groupMessages, setGroupMessages] = useState<GroupMessage[]>([]);
  const [groupMessageText, setGroupMessageText] = useState('');
  const [groupName, setGroupName] = useState('');
  const [groupMemberIds, setGroupMemberIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [announcementForm, setAnnouncementForm] = useState({ title: '', message: '' });
  const [messageForm, setMessageForm] = useState({ recipientId: '', message: '' });
  const [visitForm, setVisitForm] = useState({ customerId: customers[0]?.id || '', purpose: 'Installation / service visit', notes: '' });
  const selectedGroupRef = useRef('');
  const [today, setToday] = useState(localDay);
  const [indiaMinutes, setIndiaMinutes] = useState(indiaMinutesNow);
  const [shiftSettings, setShiftSettings] = useState({ shiftStartTime: '08:00', shiftEndTime: '19:00' });
  const [shiftSettingsBusy, setShiftSettingsBusy] = useState(false);
  const [shiftSettingsAvailable, setShiftSettingsAvailable] = useState(true);
  const toMinutes = (value: string) => { const [hour, minute] = value.split(':').map(Number); return hour * 60 + minute; };
  const staffShiftWindowOpen = indiaMinutes >= toMinutes(shiftSettings.shiftStartTime) && indiaMinutes < toMinutes(shiftSettings.shiftEndTime);
  const myTodayRecord = attendance.filter(item => item.userId === session.user.id && item.workDate === today).sort((a, b) => b.checkInAt.localeCompare(a.checkInAt))[0];
  const myActiveShift = attendance.filter(item => item.userId === session.user.id && isOpenShift(item)).sort((a, b) => b.checkInAt.localeCompare(a.checkInAt))[0];
  const myPendingCheckout = attendance.filter(item => item.userId === session.user.id && isUnclosedShift(item) && shiftDueAt(item) <= Date.now()).sort((a, b) => b.checkInAt.localeCompare(a.checkInAt))[0];
  const myToday = myActiveShift || myPendingCheckout || myTodayRecord;
  const activeShift = !!myActiveShift;
  const waitingForAutoCheckout = !!myPendingCheckout && !myActiveShift;

  const request = useCallback((method: 'get' | 'post' | 'put' | 'delete', path: string, data?: Record<string, unknown>) => {
    if (method === 'get') return client.get(path + (path.includes('?') ? '&' : '?') + 'sessionToken=' + encodeURIComponent(session.token));
    if (method === 'delete') return client.delete(path + '?sessionToken=' + encodeURIComponent(session.token));
    if (method === 'put') return client.put(path, { ...(data || {}), sessionToken: session.token });
    return client.post(path, { ...(data || {}), sessionToken: session.token });
  }, [session.token]);

  async function deleteAdminRecord(path: string, confirmText: string, successText: string) {
    if (!admin || !window.confirm(confirmText)) return;
    setBusy(true);
    try {
      await request('delete', path);
      await refresh();
      flash(successText);
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not delete this record.');
    } finally { setBusy(false); }
  }

  async function deleteGroupMessage(messageId: string) {
    if (!admin || !selectedGroupId || !window.confirm('Delete this group message permanently?')) return;
    setBusy(true);
    try {
      await request('delete', '/api/groups/' + selectedGroupId + '/messages/' + messageId);
      const result = await request('get', '/api/groups/' + selectedGroupId + '/messages');
      setGroupMessages(result.data.items || []);
      flash('Group message deleted.');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not delete group message.');
    } finally { setBusy(false); }
  }

  const refresh = useCallback(async () => {
    try {
      const [a, v, n, m, g, p, hr, settings] = await Promise.all([
        request('get', '/api/attendance'), request('get', '/api/visits'),
        request('get', '/api/announcements'), request('get', '/api/messages'),
        request('get', '/api/groups'), request('get', '/api/payments'),
        request('get', '/api/holidays'), request('get', '/api/workforce-settings').catch(() => ({ data: null }))
      ]);
      setShiftSettingsAvailable(Boolean(settings.data?.shiftStartTime && settings.data?.shiftEndTime));
      setShiftSettings({
        shiftStartTime: settings.data?.shiftStartTime || '08:00',
        shiftEndTime: settings.data?.shiftEndTime || '19:00',
      });
      setAttendance(a.data.items || []);
      setHolidays(hr.data.items || []);
      setVisits(v.data.items || []);
      setAnnouncements(n.data.items || []);
      setMessages(m.data.items || []);
      setPayments(p.data.items || []);
      const availableGroups = (g.data.items || []) as ChatGroup[];
      setGroups(availableGroups);
      setSelectedGroupId(current => current && availableGroups.some(group => group.id === current) ? current : availableGroups[0]?.id || '');
      if (admin) {
        const [s, rr] = await Promise.all([
          request('get', '/api/staff'), request('get', '/api/staff-registration-requests'),
        ]);
        setStaff(s.data.items || []);
        setRegistrationRequests(rr.data.items || []);
      }
      if (superAdmin) {
        const ad = await request('get', '/api/admins');
        setAdmins(ad.data.items || []);
      }
    } catch {
      flash('Could not load team operations. Please refresh and try again.');
    } finally {
      setLoading(false);
    }
  }, [admin, superAdmin, request, flash]);


  useEffect(() => { refresh(); }, [refresh, today]);
  useEffect(() => subscribeToApiChanges(() => { void refresh(); }), [refresh]);
  useEffect(() => {
    let stopped = false, inFlight = false;
    const poll = () => {
      if (stopped || inFlight || document.visibilityState === 'hidden') return;
      inFlight = true;
      void refresh().finally(() => { inFlight = false; });
    };
    const timer = window.setInterval(poll, 30000);
    window.addEventListener('focus', poll);
    document.addEventListener('visibilitychange', poll);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', poll);
      document.removeEventListener('visibilitychange', poll);
    };
  }, [refresh]);

  // Recalculate the India work date while the app remains open overnight.
  // Focus/visibility handlers also cover Android returning from the background,
  // where browser timers may have been paused or throttled.
  useEffect(() => {
    const syncWorkDate = () => {
      setIndiaMinutes(indiaMinutesNow());
      const nextDate = localDay();
      setToday(current => current === nextDate ? current : nextDate);
    };
    const timer = window.setInterval(syncWorkDate, 30000);
    window.addEventListener('focus', syncWorkDate);
    document.addEventListener('visibilitychange', syncWorkDate);
    syncWorkDate();
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', syncWorkDate);
      document.removeEventListener('visibilitychange', syncWorkDate);
    };
  }, []);



  useEffect(() => {
    if (!admin) return;
    let stopped = false;
    const pollRegistrationRequests = async () => {
      try {
        const result = await request('get', '/api/staff-registration-requests');
        if (!stopped) setRegistrationRequests(result.data.items || []);
      } catch {
        // Keep the last known request list if a poll briefly fails.
      }
    };
    const timer = window.setInterval(pollRegistrationRequests, 15000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [admin, request]);


  useEffect(() => {
    selectedGroupRef.current = selectedGroupId;
  }, [selectedGroupId]);

  useEffect(() => {
    let cancelled = false;
    const refreshDirectMessages = () => request('get', '/api/messages')
      .then(result => { if (!cancelled) setMessages(result.data.items || []); })
      .catch(() => undefined);
    const timer = window.setInterval(refreshDirectMessages, 12000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [request]);

  useEffect(() => {
    if (!selectedGroupId) {
      setGroupMessages([]);
      return;
    }
    let cancelled = false;
    const refreshGroupMessages = () => request('get', '/api/groups/' + selectedGroupId + '/messages')
      .then(result => { if (!cancelled) setGroupMessages(result.data.items || []); })
      .catch(() => undefined);
    void refreshGroupMessages();
    const refreshTimer = window.setInterval(refreshGroupMessages, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
    };
  }, [selectedGroupId, request]);


  async function shift(action: 'check-in' | 'check-out') {
    setBusy(true);
    try {
      await request('post', '/api/attendance/' + action, { dayType, capturedAt: new Date().toISOString() });
      await refresh();
      onDataChanged?.();
      flash(action === 'check-in' ? 'You are checked in for today.' : 'Your shift has been checked out.');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Attendance update failed.');
    } finally { setBusy(false); }
  }

  async function submit(path: string, data: Record<string, unknown>, success: string) {
    setBusy(true);
    try {
      await request('post', path, data);
      await refresh();
      flash(success);
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not save. Please try again.');
    } finally { setBusy(false); }
  }

  async function saveShiftSettings(event: FormEvent) {
    event.preventDefault();
    if (!shiftSettingsAvailable) { flash('The shift schedule controls need the latest backend deployment. The current staff window remains 8:00 AM–7:00 PM India time.'); return; }
    setShiftSettingsBusy(true);
    try {
      const result = await request('put', '/api/workforce-settings', shiftSettings);
      setShiftSettings({ shiftStartTime: result.data.shiftStartTime, shiftEndTime: result.data.shiftEndTime });
      flash('Staff shift timings updated. Existing active shifts were rescheduled, and new shifts will use this schedule. Admin overrides remain available at any time.');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not save staff shift timings.');
    } finally { setShiftSettingsBusy(false); }
  }

  async function adminShift(userId: string, action: 'admin-start' | 'admin-end', requestedDayType: 'Full day'|'Half day' = 'Full day') {
    setBusy(true);
    try {
      await request('post', '/api/attendance/' + action, { userId, dayType: requestedDayType });
      await refresh();
      onDataChanged?.();
      flash(action === 'admin-start' ? 'Staff shift started or restarted by administrator.' : 'Staff shift ended by administrator.');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not update staff attendance.');
    } finally { setBusy(false); }
  }

  async function adminAbsent(userId: string) {
    if (!window.confirm('Mark this staff member absent for today?')) return;
    setBusy(true);
    try {
      await request('post', '/api/attendance/admin-absent', { userId, reason: 'Marked absent by administrator' });
      await refresh();
      onDataChanged?.();
      flash('Staff member marked absent for today.');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not mark staff member absent.');
    } finally { setBusy(false); }
  }

  async function reviewStaffRegistration(item: StaffRegistrationRequest, status: 'approved' | 'rejected') {
    const password = registrationPasswords[item.id] || '';
    if (status === 'approved' && password.length < 10) { flash('Set a temporary password with at least 10 characters before approving.'); return; }
    if (!window.confirm(status === 'approved' ? 'Approve this request and create a staff login for ' + item.displayName + '?' : 'Reject this staff registration request?')) return;
    setBusy(true);
    try {
      await request('put', '/api/staff-registration-requests/' + item.id, { status, ...(status === 'approved' ? { password } : {}) });
      setRegistrationPasswords(current => { const next = { ...current }; delete next[item.id]; return next; });
      await refresh();
      flash(status === 'approved' ? 'Staff request approved. Share the staff ID and temporary password securely.' : 'Staff registration request rejected.');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not review this registration request.');
    } finally { setBusy(false); }
  }

  async function createAdmin(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try { await request('post','/api/admins',adminForm); setAdminForm({userId:'',displayName:'',password:''}); await refresh(); flash('Administrator account created.'); }
    catch(err){flash(err instanceof Error?err.message:'Could not create administrator.');}
    finally{setBusy(false);}
  }
  async function updateAdminAccount(item:{id:string;displayName:string;active:boolean},active:boolean) {
    if(!window.confirm((active?'Reactivate ':'Deactivate ')+item.displayName+'?'))return;
    setBusy(true);
    try{await request('put','/api/admins/'+item.id,{displayName:item.displayName,active});await refresh();flash('Administrator status updated.');}
    catch(err){flash(err instanceof Error?err.message:'Could not update administrator.');}
    finally{setBusy(false);}
  }
  async function correctAttendance(event:FormEvent) {
    event.preventDefault(); if(!attendanceCorrection?.reason.trim())return; setBusy(true);
    try{await request('put','/api/attendance/'+attendanceCorrection.id+'/day-type',{dayType:attendanceCorrection.dayType,reason:attendanceCorrection.reason});setAttendanceCorrection(null);await refresh();onDataChanged?.();flash('Attendance corrected and audit logged.');}
    catch(err){flash(err instanceof Error?err.message:'Could not correct attendance.');}
    finally{setBusy(false);}
  }

  async function createGroup(event: FormEvent) {
    event.preventDefault();
    if (!groupName.trim() || !groupMemberIds.length) return;
    setBusy(true);
    try {
      const result = await request('post', '/api/groups', { name: groupName.trim(), memberIds: groupMemberIds });
      await refresh();
      setSelectedGroupId(result.data.id);
      setGroupName('');
      setGroupMemberIds([]);
      flash('Staff group created.');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not create the group.');
    } finally { setBusy(false); }
  }

  async function sendGroupMessage(event: FormEvent) {
    event.preventDefault();
    if (!selectedGroupId || !groupMessageText.trim()) return;
    setBusy(true);
    try {
      await request('post', '/api/groups/' + selectedGroupId + '/messages', { message: groupMessageText.trim() });
      setGroupMessageText('');
      const result = await request('get', '/api/groups/' + selectedGroupId + '/messages');
      setGroupMessages(result.data.items || []);
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not send group message.');
    } finally { setBusy(false); }
  }

  const monthKey = today.slice(0, 7);
  const totalCollected = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const monthCollected = payments.filter(payment => String(payment.paidAt || '').slice(0, 7) === monthKey).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const activeToday = attendance.filter(item => item.workDate === today && !item.checkOutAt).length;
  const completedToday = attendance.filter(item => item.workDate === today && !!item.checkOutAt).length;
  const sortedAttendance = [...attendance].sort((a, b) => b.workDate.localeCompare(a.workDate) || b.checkInAt.localeCompare(a.checkInAt));
  const sortedVisits = [...visits].sort((a, b) => b.visitedAt.localeCompare(a.visitedAt));
  const sortedMessages = [...messages].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const attendanceTrend = Array.from({length:6},(_,index)=>{
    const date=new Date(); date.setDate(1); date.setMonth(date.getMonth()-(5-index));
    const key=date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0');
    return {key,label:date.toLocaleString('en-IN',{month:'short'}),full:attendance.filter(item=>item.workDate.startsWith(key)&&(item.dayType||'Full day')==='Full day').length,half:attendance.filter(item=>item.workDate.startsWith(key)&&item.dayType==='Half day').length};
  });
  const attendanceMax=Math.max(1,...attendanceTrend.map(item=>item.full+item.half*.5));


  if (compact && !admin) return <section className="panel ops-home-shift">
    <div className="ops-home-shift-copy"><span className="eyebrow">TODAY’S ATTENDANCE</span><h2>{activeShift ? 'Your shift is active' : myToday?.dayType === 'Absent' ? 'Marked absent today' : myToday?.checkOutAt ? 'Shift completed' : 'Ready to start work?'}</h2><p>{activeShift ? 'Checked in at ' + stamp(myToday?.checkInAt) + '. Your workday is being recorded.' : myToday?.dayType === 'Absent' ? 'Your attendance was marked absent by an administrator.' : myToday?.checkOutAt ? 'You checked out at ' + stamp(myToday.checkOutAt) + '.' : 'Start your shift directly from the home screen.'}</p></div>
    <div className="ops-home-shift-action">{!myToday ? staffShiftWindowOpen ? <button className="btn primary" disabled={busy || loading} onClick={() => shift('check-in')}>{busy ? 'Starting…' : 'Start shift'}</button> : <span className="ops-complete">Staff shifts are available {displayTime(shiftSettings.shiftStartTime)}–{displayTime(shiftSettings.shiftEndTime)}</span> : activeShift ? staffShiftWindowOpen ? <button className="btn danger" disabled={busy} onClick={() => shift('check-out')}>{busy ? 'Ending…' : 'End shift'}</button> : <span className="ops-complete">Your shift will end automatically at {displayTime(shiftSettings.shiftEndTime)}</span> : <span className="ops-complete">Completed for today · Start again tomorrow from {displayTime(shiftSettings.shiftStartTime)}</span>}</div>
    {loading && <small className="ops-home-loading">Loading attendance status…</small>}
  </section>;

  return <div className="ops-layout">
    <section className="ops-summary-grid">
      <article className="ops-summary"><span>{admin ? 'Total collections' : 'Today’s shift'}</span><strong>{admin ? '₹' + totalCollected.toLocaleString('en-IN') : activeShift ? 'Checked in' : myToday?.checkOutAt ? 'Completed' : 'Not started'}</strong><small>{admin ? payments.length + ' payment records across the team' : myToday ? 'Started ' + stamp(myToday.checkInAt) : 'Start your shift when work begins'}</small></article>
      <article className="ops-summary"><span>{admin ? 'This month collected' : 'My field visits'}</span><strong>{admin ? '₹' + monthCollected.toLocaleString('en-IN') : visits.length}</strong><small>{admin ? 'Payments recorded in ' + monthKey : 'Customer service visit records'}</small></article>
      <article className="ops-summary"><span>{admin ? 'Staff on shift today' : 'Announcements'}</span><strong>{admin ? activeToday : announcements.length}</strong><small>{admin ? completedToday + ' shifts completed today' : 'Updates shared by K&B administration'}</small></article>
      <article className="ops-summary"><span>{admin ? 'Field visits' : 'Messages'}</span><strong>{admin ? visits.length : messages.length}</strong><small>{admin ? 'Service visits submitted by the team' : 'Your conversation with administration'}</small></article>
    </section>

    {superAdmin && <section className="panel ops-panel">
      <div className="ops-panel-head"><div><span className="eyebrow">SUPER ADMIN ACCESS CONTROL</span><h2>Administrator accounts</h2><p>Only you can create, deactivate or reactivate administrator accounts. Other administrators cannot grant admin access.</p></div><span className="ops-pill is-live">{admins.filter(a=>a.active).length} ACTIVE</span></div>
      <form className="ops-form" onSubmit={createAdmin}>
        <input required minLength={3} maxLength={32} pattern="[A-Za-z0-9_-]+" placeholder="Admin login ID" value={adminForm.userId} onChange={e=>setAdminForm({...adminForm,userId:e.target.value})}/>
        <input required maxLength={80} placeholder="Administrator name" value={adminForm.displayName} onChange={e=>setAdminForm({...adminForm,displayName:e.target.value})}/>
        <input required minLength={12} type="password" autoComplete="new-password" placeholder="Temporary password (12+ characters)" value={adminForm.password} onChange={e=>setAdminForm({...adminForm,password:e.target.value})}/>
        <button className="btn primary" disabled={busy}>Add administrator</button>
      </form>
      <div className="ops-location-list">{admins.map(item=><article className="ops-location-card" key={item.id}><div className="ops-person"><span className="avatar">{item.displayName.slice(0,2).toUpperCase()}</span><div><b>{item.displayName}</b><small>{item.userId} · {item.userId.toLowerCase()==='brajraj'?'Primary owner':'Administrator'}</small></div></div><div className="ops-location-detail"><span className={item.active?'ops-pill is-live':'ops-pill is-idle'}>{item.active?'ACTIVE':'DISABLED'}</span>{item.userId.toLowerCase()!=='brajraj' && <button className={'btn compact '+(item.active?'danger':'secondary')} disabled={busy} onClick={()=>updateAdminAccount(item,!item.active)}>{item.active?'Deactivate':'Reactivate'}</button>}</div></article>)}</div>
    </section>}

    {admin && <section className="panel ops-panel">
      <div className="ops-panel-head"><div><span className="eyebrow">STAFF ONBOARDING</span><h2>Registration requests</h2><p>Approve requests to create staff accounts, or reject them. No account can sign in before approval.</p></div><span className="ops-pill">{registrationRequests.filter(item=>item.status==='pending').length} PENDING</span></div>
      <div className="ops-feed">{registrationRequests.filter(item=>item.status==='pending').map(item=><article className="ops-feed-item" key={item.id}>
        <div className="ops-message-top"><b>{item.displayName} · {item.userId}</b><span className="ops-pill">PENDING</span></div>
        <p>{item.reason || 'No additional note provided.'}</p><small>{item.phone ? 'Phone: '+item.phone+' · ' : ''}Requested {stamp(item.createdAt)}</small>
        <div className="ops-form"><input type="password" minLength={10} autoComplete="new-password" placeholder="Set temporary password (10+ characters)" value={registrationPasswords[item.id] || ''} onChange={e=>setRegistrationPasswords(current=>({...current,[item.id]:e.target.value}))}/><div className="ops-actions"><button className="btn primary compact" disabled={busy || (registrationPasswords[item.id] || '').length<10} onClick={()=>reviewStaffRegistration(item,'approved')}>Approve & create account</button><button className="btn danger compact" disabled={busy} onClick={()=>reviewStaffRegistration(item,'rejected')}>Reject</button></div></div>
      </article>)}{!registrationRequests.some(item=>item.status==='pending') && <p className="ops-empty">No pending staff registration requests.</p>}</div>
    </section>}

    {admin && <section className="panel ops-panel team-summary-panel">
      <div className="ops-panel-head"><div><span className="eyebrow">BUSINESS DATA</span><h2>Team collection summary</h2><p>Collections are attributed to the staff account that recorded each payment.</p></div><span className="ops-pill is-live">LIVE DATA</span></div>
      <div className="table-wrap"><table><thead><tr><th>STAFF MEMBER</th><th>PAYMENT RECORDS</th><th>TOTAL COLLECTED</th><th>THIS MONTH</th><th>ATTENDANCE DAYS</th><th>TODAY</th></tr></thead><tbody>{staff.map(member => {
        const memberPayments = payments.filter(payment => payment.recordedBy === member.id);
        const memberTotal = memberPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
        const memberMonth = memberPayments.filter(payment => String(payment.paidAt || '').slice(0, 7) === monthKey).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
        const memberDays = attendance.filter(item => item.userId === member.id && item.dayType !== 'Absent' && String(item.status || '').toLowerCase() !== 'absent').reduce((sum,item) => sum + (item.dayType === 'Half day' ? 0.5 : 1), 0);
        const memberShift = attendance.find(item => item.userId === member.id && isUnclosedShift(item)) ||
          attendance.find(item => item.userId === member.id && item.workDate === today);
        return <tr key={member.id}><td><b>{member.displayName}</b></td><td>{memberPayments.length}</td><td className="amount">₹{memberTotal.toLocaleString('en-IN')}</td><td className="amount">₹{memberMonth.toLocaleString('en-IN')}</td><td>{memberDays}</td><td>{memberShift?.dayType === 'Absent' ? 'Absent' : memberShift?.checkOutAt ? 'Completed' : memberShift ? 'On shift' : 'Not started'}</td></tr>;
      })}{!staff.length && <tr><td colSpan={6}>No staff records available yet.</td></tr>}</tbody></table></div>
    </section>}

    {admin && <section className="panel ops-panel">
      <div className="ops-panel-head"><div><span className="eyebrow">TEAM ATTENDANCE</span><h2>Individual staff calendars</h2><p>Green is full day, yellow is half day, red is absent. Sundays are weekly off by default; pending and approved holidays are marked separately.</p></div></div>
      <div className="attendance-calendar-list">{staff.map(member=>{
        const memberRecords=attendance.filter(item=>item.userId===member.id);
        const memberDays=memberRecords.filter(item=>item.dayType!=='Absent').reduce((sum,item)=>sum+(item.dayType==='Half day'?0.5:1),0);
        const memberPayments=payments.filter(item=>item.recordedBy===member.id);
        const memberCollected=memberPayments.reduce((sum,item)=>sum+Number(item.amount||0),0);
        const todayRecord=memberRecords.find(item=>item.workDate===today);
        const todayStatus=todayRecord?.dayType==='Absent'?'Absent':todayRecord?.checkOutAt?'Completed':todayRecord?'On shift':'Not started';
        return <details className="staff-calendar-accordion" key={member.id}>
          <summary><span className="avatar">{member.displayName.slice(0,2).toUpperCase()}</span><span><b>{member.displayName}</b><small>{memberRecords.length} attendance records · Tap to view staff details</small></span><span className="staff-calendar-chevron">⌄</span></summary>
          <div className="staff-calendar-profile">
            <span><small>Assigned customers</small><b>{customers.filter(item=>item.assignedTo===member.id).length}</b></span>
            <span><small>Attendance days</small><b>{memberDays.toLocaleString('en-IN')}</b></span>
            <span><small>Collections recorded</small><b>₹{memberCollected.toLocaleString('en-IN')}</b></span>
            <span><small>Today's attendance</small><b>{todayStatus}</b></span>
          </div>
          <AttendanceCalendar staffId={member.id} staffName={member.displayName} records={attendance} holidays={holidays}/>
        </details>;
      })}</div>
      {!staff.length && <p className="ops-empty">Staff calendars will appear after staff accounts are added.</p>}
    </section>}

    <section className="panel ops-panel">
      <div className="ops-panel-head"><div><span className="eyebrow">HOLIDAY MANAGEMENT</span><h2>{admin ? 'Staff holiday requests' : 'Request a holiday'}</h2><p>Pending and approved holiday dates are exempt from automatic GPS shift cancellation.</p></div><span className="ops-pill">{holidays.filter(item=>item.status==='pending').length} PENDING</span></div>
      {!admin && <form className="ops-form" onSubmit={e=>{e.preventDefault();submit('/api/holidays',{...holidayForm},'Holiday request submitted for admin approval.');setHolidayForm({...holidayForm,reason:''});}}><label>From <input type="date" required value={holidayForm.startDate} onChange={e=>setHolidayForm({...holidayForm,startDate:e.target.value})}/></label><label>To <input type="date" required min={holidayForm.startDate} value={holidayForm.endDate} onChange={e=>setHolidayForm({...holidayForm,endDate:e.target.value})}/></label><textarea required maxLength={300} rows={2} placeholder="Reason for holiday request" value={holidayForm.reason} onChange={e=>setHolidayForm({...holidayForm,reason:e.target.value})}/><button className="btn primary" disabled={busy}>Submit holiday request</button></form>}
      <div className="ops-feed">{holidays.map(item=><article className="ops-feed-item" key={item.id}><div className="ops-message-top"><b>{item.displayName} · {item.startDate}{item.endDate!==item.startDate?' to '+item.endDate:''}</b><span className={'ops-pill '+(item.status==='approved'?'is-live':item.status==='rejected'?'is-idle':'')}>{item.status.toUpperCase()}</span></div><p>{item.reason}</p><small>Requested {stamp(item.createdAt)}</small>{admin && item.status==='pending' && <div className="ops-actions"><button className="btn primary compact" disabled={busy} onClick={()=>submit('/api/holidays/'+item.id,{status:'approved'},'Holiday request approved.')}>Approve</button><button className="btn danger compact" disabled={busy} onClick={()=>submit('/api/holidays/'+item.id,{status:'rejected'},'Holiday request rejected.')}>Reject</button></div>}</article>)}{!holidays.length && <p className="ops-empty">No holiday requests yet.</p>}</div>
    </section>

    {!admin && <section className="panel ops-panel">
      <div className="ops-panel-head"><div><span className="eyebrow">ATTENDANCE</span><h2>My workday</h2><p>Record your shift start and finish. Work location is shared with authorised Admins during an active shift. On Android, background tracking continues with a persistent notification and stops at checkout.</p></div><span className={'ops-pill ' + (activeShift ? 'is-live' : 'is-idle')}>{activeShift ? 'ON SHIFT' : waitingForAutoCheckout ? 'ENDING SHIFT' : myToday?.dayType === 'Absent' ? 'ABSENT' : myToday?.checkOutAt ? 'SHIFT COMPLETE' : 'OFF SHIFT'}</span></div>
      <div className="ops-clock-row"><div><small>CHECK IN</small><strong>{myToday?.dayType === 'Absent' ? 'Absent' : myToday ? stamp(myToday.checkInAt) : 'Not checked in'}</strong></div><div><small>CHECK OUT</small><strong>{myToday?.dayType === 'Absent' ? '—' : myToday?.checkOutAt ? stamp(myToday.checkOutAt) : '—'}</strong></div></div>
      <div className="ops-actions"><label className="ops-day-type">Attendance type <select value={dayType} disabled={!!myToday} onChange={e=>setDayType(e.target.value as 'Full day'|'Half day')}><option>Full day</option><option>Half day</option></select></label>{!myToday ? staffShiftWindowOpen ? <button className="btn primary" disabled={busy} onClick={() => shift('check-in')}>Check in and start shift</button> : <span className="ops-complete">Staff shifts are available from {shiftSettings.shiftStartTime} to {shiftSettings.shiftEndTime} India time.</span> : activeShift ? <button className="btn danger" disabled={busy} onClick={() => shift('check-out')}>Check out and end shift</button> : waitingForAutoCheckout ? <span className="ops-complete">Your scheduled shift end has passed. The system is completing automatic checkout; a new shift can start once it is confirmed.</span> : <span className="ops-complete">{myToday?.dayType === 'Absent' ? 'Today’s attendance is marked absent.' : 'Today’s attendance is complete. A new shift can start during the configured shift window.'}</span>}</div>
      <p className="ops-gps-note">During an active shift, your location is shared automatically with authorised K&B administrators. Android shows a persistent tracking notification, and tracking stops when the shift ends. If location permission or phone location services are disabled, administrators will see the tracking interruption.</p>
    </section>}

    {admin && <section className="panel ops-panel workforce-settings-panel">
      <div className="ops-panel-head"><div><span className="eyebrow">WORKFORCE SETTINGS</span><h2>Staff shift schedule</h2><p>Set the daily staff check-in and check-out window. Administrators can still start or end any staff shift outside these hours.</p></div></div>
      {!shiftSettingsAvailable && <p className="form-hint">The new schedule API is not deployed yet. Staff shifts continue using the existing 8:00 AM–7:00 PM India-time window. Administrator start/end overrides remain available.</p>}
      <form className="finance-expense-form" onSubmit={saveShiftSettings}>
        <label>Staff shift starts<input type="time" required value={shiftSettings.shiftStartTime} onChange={event=>setShiftSettings(current=>({...current,shiftStartTime:event.target.value}))}/></label>
        <label>Staff shift ends<input type="time" required value={shiftSettings.shiftEndTime} onChange={event=>setShiftSettings(current=>({...current,shiftEndTime:event.target.value}))}/></label>
        <button className="btn primary" disabled={!shiftSettingsAvailable || shiftSettingsBusy || toMinutes(shiftSettings.shiftStartTime)>=toMinutes(shiftSettings.shiftEndTime)}>{shiftSettingsBusy?'Saving…':'Save shift schedule'}</button>
        <p className="form-hint wide">Timezone: India (IST). Automatic checkout uses the saved end time for each new shift. Existing shifts keep their original end deadline.</p>
      </form>
    </section>}

    {admin && <section className="panel ops-panel">
      <div className="ops-panel-head"><div><span className="eyebrow">STAFF ATTENDANCE</span><h2>Staff shift controls</h2><p>Start, end or correct a staff member’s attendance. GPS is not required for shifts.</p></div></div>
      <div className="ops-location-list">{staff.map(member => {
        const shiftRecord = sortedAttendance.find(item => item.userId === member.id && isUnclosedShift(item)) ||
          sortedAttendance.find(item => item.userId === member.id && item.workDate === today);
        const selectedType = staffDayTypes[member.id] || 'Full day';
        return <article className="ops-location-card" key={member.id}>
          <div className="ops-person"><span className="avatar">{member.displayName.slice(0,2).toUpperCase()}</span><div><b>{member.displayName}</b><small>{shiftRecord?.dayType === 'Absent' ? 'Marked absent today' : shiftRecord?.checkOutAt ? 'Checked out ' + stamp(shiftRecord.checkOutAt) : shiftRecord ? 'Checked in ' + stamp(shiftRecord.checkInAt) : 'No attendance today'}</small></div></div>
          <div className="ops-location-detail">
            {!shiftRecord && <label className="ops-day-type">Attendance type <select value={selectedType} onChange={e=>setStaffDayTypes(current=>({...current,[member.id]:e.target.value as 'Full day'|'Half day'|'Absent'}))}><option>Full day</option><option>Half day</option><option>Absent</option></select></label>}
            {!shiftRecord ? selectedType === 'Absent' ? <button className="btn danger compact" disabled={busy || !member.active} onClick={() => adminAbsent(member.id)}>Mark absent</button> : <button className="btn primary compact" disabled={busy || !member.active} onClick={() => adminShift(member.id, 'admin-start', selectedType)}>Start shift</button> : shiftRecord.gpsRestartRequired ? <button className="btn primary compact" disabled={busy || !member.active} onClick={() => adminShift(member.id, 'admin-start', selectedType === 'Absent' ? 'Full day' : selectedType)}>Restart shift</button> : shiftRecord.checkOutAt ? <span className="ops-complete">Shift completed</span> : <button className="btn danger compact" disabled={busy} onClick={() => adminShift(member.id, 'admin-end')}>End shift</button>}
          </div>
        </article>;
      })}{!staff.length && <p className="ops-empty">Staff accounts will appear here after they are created.</p>}</div>
    </section>}

    {admin && <section className="panel ops-panel finance-chart-panel">
      <div className="ops-panel-head"><div><span className="eyebrow">WORKFORCE ANALYTICS</span><h2>Monthly attendance trend</h2><p>Full-day and half-day attendance entries for the last six months.</p></div></div>
      <div className="finance-chart" role="img" aria-label="Six month attendance chart">
        {attendanceTrend.map(item=><div className="finance-chart-month" key={item.key}><div className="finance-chart-bars"><div className="finance-chart-bar income-bar" style={{height:Math.max(3,item.full/attendanceMax*100)+'%'}} title={item.full+' full-day records'}/><div className="finance-chart-bar expense-bar" style={{height:Math.max(3,item.half*.5/attendanceMax*100)+'%'}} title={item.half+' half-day records'}/></div><b>{item.label}</b><small>{item.full} full · {item.half} half</small></div>)}
      </div>
      <div className="finance-chart-legend"><span><i className="income-dot"/> Full day</span><span><i className="expense-dot"/> Half day (0.5)</span></div>
    </section>}





    <div className="ops-two-col">
      <section className="panel ops-panel">
        <div className="ops-panel-head"><div><span className="eyebrow">TEAM UPDATES</span><h2>Announcements</h2><p>Important instructions and business updates.</p></div></div>
        {admin && <form className="ops-form" onSubmit={e => { e.preventDefault(); if (announcementForm.title.trim() && announcementForm.message.trim()) { submit('/api/announcements', announcementForm, 'Announcement published.'); setAnnouncementForm({ title: '', message: '' }); } }}><input required maxLength={120} placeholder="Announcement title" value={announcementForm.title} onChange={e => setAnnouncementForm({ ...announcementForm, title: e.target.value })}/><textarea required maxLength={2000} rows={3} placeholder="Write an update for the staff team..." value={announcementForm.message} onChange={e => setAnnouncementForm({ ...announcementForm, message: e.target.value })}/><button className="btn primary" disabled={busy}>Publish announcement</button></form>}
        <div className="ops-feed">{announcements.map(item => <article className="ops-feed-item" key={item.id}><div className="ops-message-top"><b>{item.title}</b>{admin && <button className="btn danger compact" disabled={busy} onClick={() => deleteAdminRecord('/api/announcements/' + item.id, 'Delete this announcement for everyone?', 'Announcement deleted.')}>Delete</button>}</div><p>{item.message}</p><small>{item.createdByName} · {stamp(item.createdAt)}</small></article>)}{!announcements.length && <p className="ops-empty">No announcements yet.</p>}</div>
      </section>
      <section className="panel ops-panel">
        <div className="ops-panel-head"><div><span className="eyebrow">COMMUNICATION</span><h2>{admin ? 'Team inbox' : 'Message administration'}</h2><p>{admin ? 'Read staff messages and send a direct reply.' : 'Send a message to the K&B administrator.'}</p></div></div>
        <form className="ops-form" onSubmit={e => { e.preventDefault(); if (messageForm.message.trim() && (!admin || messageForm.recipientId)) { submit('/api/messages', messageForm, 'Message sent.'); setMessageForm({ ...messageForm, message: '' }); } }}>
          {admin && <select required value={messageForm.recipientId} onChange={e => setMessageForm({ ...messageForm, recipientId: e.target.value })}><option value="">Choose staff member</option>{staff.map(member => <option value={member.id} key={member.id}>{member.displayName}</option>)}</select>}
          <textarea required maxLength={1500} rows={3} placeholder="Write a message..." value={messageForm.message} onChange={e => setMessageForm({ ...messageForm, message: e.target.value })}/>
          <button className="btn primary" disabled={busy || (admin && !staff.length)}>Send message</button>
        </form>
        <div className="ops-feed">{sortedMessages.map(item => <article className="ops-feed-item" key={item.id}><div className="ops-message-top"><b>{item.senderName}</b><small>{stamp(item.createdAt)}</small></div><p>{item.message}</p>{admin && <div className="ops-message-top"><small>To: {item.recipientName}</small><button className="btn danger compact" disabled={busy} onClick={() => deleteAdminRecord('/api/messages/' + item.id, 'Delete this direct message permanently?', 'Message deleted.')}>Delete</button></div>}</article>)}{!messages.length && <p className="ops-empty">No messages yet.</p>}</div>
      </section>
    </div>

    <section className="panel ops-panel group-chat-panel">
      <div className="ops-panel-head"><div><span className="eyebrow">STAFF COMMUNICATION</span><h2>Group chat</h2><p>Shared messages for the selected staff group. New messages update live for members.</p></div>{admin && selectedGroupId && <button className="btn danger compact" disabled={busy} onClick={() => deleteAdminRecord('/api/groups/' + selectedGroupId, 'Delete this group and all messages inside it?', 'Group and its messages deleted.')}>Delete group</button>}</div>
      {admin && <form className="ops-form group-create-form" onSubmit={createGroup}>
        <input required maxLength={60} placeholder="New group name, e.g. Field Team" value={groupName} onChange={e => setGroupName(e.target.value)} />
        <div className="group-member-picker">{staff.filter(member => member.active).map(member => <label key={member.id}><input type="checkbox" checked={groupMemberIds.includes(member.id)} onChange={e => setGroupMemberIds(current => e.target.checked ? [...current, member.id] : current.filter(id => id !== member.id))}/><span>{member.displayName}</span></label>)}</div>
        <button className="btn secondary" disabled={busy || !groupName.trim() || !groupMemberIds.length}>Create group</button>
      </form>}
      <div className="group-chat-layout">
        <aside className="group-list"><b>Your groups</b>{groups.map(group => <button type="button" key={group.id} className={'group-select ' + (selectedGroupId === group.id ? 'active' : '')} onClick={() => setSelectedGroupId(group.id)}><span>{group.name}</span><small>{group.memberIds.length} members</small></button>)}{!groups.length && <p className="ops-empty">{admin ? 'Create a group and add staff members to start chatting.' : 'Your administrator has not added you to a group yet.'}</p>}</aside>
        <div className="group-chat-main">
          {selectedGroupId ? <>
            <div className="group-chat-head"><b>{groups.find(group => group.id === selectedGroupId)?.name || 'Group conversation'}</b><span>{groups.find(group => group.id === selectedGroupId)?.memberNames?.join(', ') || ''}</span></div>
            <div className="group-message-list">{groupMessages.map(message => <article className={'group-message ' + (message.senderId === session.user.id ? 'mine' : '')} key={message.id}><div><b>{message.senderName}</b><small>{stamp(message.createdAt)}</small>{admin && <button className="btn danger compact" disabled={busy} onClick={() => deleteGroupMessage(message.id)}>Delete</button>}</div><p>{message.message}</p></article>)}{!groupMessages.length && <p className="ops-empty">No messages in this group yet. Start the conversation.</p>}</div>
            <form className="group-message-form" onSubmit={sendGroupMessage}><textarea rows={2} maxLength={1500} required placeholder="Write a message to the group..." value={groupMessageText} onChange={e => setGroupMessageText(e.target.value)} /><button className="btn primary" disabled={busy || !groupMessageText.trim()}>Send message</button></form>
          </> : <div className="group-chat-empty"><b>No group selected</b><span>Choose a group to view its shared conversation.</span></div>}
        </div>
      </div>
    </section>

    <section className="panel ops-panel">
      <div className="ops-panel-head"><div><span className="eyebrow">CUSTOMER SERVICE</span><h2>{admin ? 'Field visit history' : 'Record a customer visit'}</h2><p>{admin ? 'Service visits submitted by the team.' : 'Save what you did at a customer location.'}</p></div></div>
      {!admin && <form className="ops-form ops-visit-form" onSubmit={e => { e.preventDefault(); if (visitForm.customerId && visitForm.purpose.trim()) submit('/api/visits', { ...visitForm, visitedAt: new Date().toISOString() }, 'Customer visit recorded.'); }}><select required value={visitForm.customerId} onChange={e => setVisitForm({ ...visitForm, customerId: e.target.value })}><option value="">Choose assigned customer</option>{customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select><input required maxLength={120} value={visitForm.purpose} onChange={e => setVisitForm({ ...visitForm, purpose: e.target.value })} placeholder="Visit purpose"/><textarea rows={2} maxLength={1200} value={visitForm.notes} onChange={e => setVisitForm({ ...visitForm, notes: e.target.value })} placeholder="Work completed, issue found, follow-up needed..."/><button className="btn primary" disabled={busy || !customers.length}>Save visit</button>{!customers.length && <small className="ops-empty">No assigned customers are available for visits.</small>}</form>}
      <div className="ops-feed">{sortedVisits.map(item => <article className="ops-feed-item" key={item.id}><div className="ops-message-top"><b>{item.customerName}</b><small>{stamp(item.visitedAt)}</small></div><p>{item.purpose}</p>{item.notes && <p>{item.notes}</p>}{admin && <small>Staff: {item.staffName}</small>}</article>)}{!visits.length && <p className="ops-empty">No field visits recorded yet.</p>}</div>
    </section>

    {admin && attendanceCorrection && <section className="panel ops-panel"><div className="ops-panel-head"><div><span className="eyebrow">ATTENDANCE CORRECTION</span><h2>Correct day type</h2><p>Changes are recorded in the audit log.</p></div><button className="btn secondary compact" onClick={()=>setAttendanceCorrection(null)}>Cancel</button></div><form className="ops-form" onSubmit={correctAttendance}><select value={attendanceCorrection.dayType} onChange={e=>setAttendanceCorrection({...attendanceCorrection,dayType:e.target.value as 'Full day'|'Half day'|'Absent'})}><option>Full day</option><option>Half day</option><option>Absent</option></select><textarea required maxLength={300} rows={2} placeholder="Reason for correction" value={attendanceCorrection.reason} onChange={e=>setAttendanceCorrection({...attendanceCorrection,reason:e.target.value})}/><button className="btn primary" disabled={busy}>Save correction</button></form></section>}
    {!admin && <section className="panel ops-panel">
      <div className="ops-panel-head"><div><span className="eyebrow">MY ATTENDANCE</span><h2>My attendance calendar</h2><p>Green is full day, yellow is half day, red is absent. Sundays are weekly off by default.</p></div></div>
      <AttendanceCalendar staffId={session.user.id} staffName={session.user.displayName} records={attendance} holidays={holidays}/>
    </section>}

    <section className="panel ops-panel">
      <div className="ops-panel-head"><div><span className="eyebrow">WORK HISTORY</span><h2>{admin ? 'Team attendance history' : 'My attendance history'}</h2><p>Daily attendance records, kept separate by staff member and date.</p></div></div>
      <div className="ops-history-list">{sortedAttendance.slice(0, 30).map(item => <article className="ops-history-row" key={item.id}><div><b>{item.displayName}</b><small>{item.workDate}</small></div><span>{stamp(item.checkInAt)}</span><span>{item.checkOutAt ? stamp(item.checkOutAt) : 'Still checked in'}</span><strong>{item.dayType === 'Absent' ? 'Absent' : (item.dayType || 'Full day') + ' · ' + (item.checkOutAt ? 'Completed' : 'On shift')}</strong>{admin && <button className="btn secondary compact" onClick={()=>setAttendanceCorrection({id:item.id,dayType:item.dayType||'Full day',reason:''})}>Correct</button>}</article>)}{!attendance.length && <p className="ops-empty">Attendance history will appear here.</p>}</div>
    </section>
    {loading && <div className="ops-loading">Loading team operations…</div>}
  </div>;
}
