import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api as client, ws } from './lib/api';

type Session = { token: string; user: { id: string; displayName: string; role: 'admin' | 'staff' } };
type Attendance = { id: string; userId: string; displayName: string; workDate: string; checkInAt: string; checkOutAt?: string; dayType?: 'Full day' | 'Half day'; correctionReason?: string; gpsRestartRequired?: boolean; gpsCancelled?: boolean; status?: string };
type HolidayRequest = { id: string; userId: string; displayName: string; startDate: string; endDate: string; reason: string; status: 'pending'|'approved'|'rejected'; createdAt: string };
type Visit = { id: string; customerName: string; purpose: string; notes: string; visitedAt: string; staffName: string };
type Announcement = { id: string; title: string; message: string; createdAt: string; createdByName: string };
type Message = { id: string; senderName: string; recipientName: string; message: string; createdAt: string };
type Location = { userId: string; displayName: string; latitude: number; longitude: number; accuracy: number; capturedAt: string };
type Payment = { id: string; recordedBy?: string; recordedByName?: string; amount: number; paidAt: string };
type ChatGroup = { id: string; name: string; memberIds: string[]; memberNames: string[] };
type GroupMessage = { id: string; groupId: string; senderId: string; senderName: string; message: string; createdAt: string };

const localDay = () => {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
};
const stamp = (value?: string) => value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export default function StaffOperations({ session, customers, flash, compact = false }: { session: Session; customers: Array<{ id: string; name: string }>; flash: (message: string) => void; compact?: boolean }) {
  const admin = session.user.role === 'admin';
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [holidays, setHolidays] = useState<HolidayRequest[]>([]);
  const [holidayForm, setHolidayForm] = useState({ startDate: localDay(), endDate: localDay(), reason: '' });
  const [visits, setVisits] = useState<Visit[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationHistory, setLocationHistory] = useState<Location[]>([]);
  const [admins, setAdmins] = useState<Array<{id:string;userId:string;displayName:string;active:boolean}>>([]);
  const [adminForm, setAdminForm] = useState({userId:'',displayName:'',password:''});
  const [dayType, setDayType] = useState<'Full day'|'Half day'>('Full day');
  const [attendanceCorrection, setAttendanceCorrection] = useState<{id:string;dayType:'Full day'|'Half day';reason:string}|null>(null);
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
  const [gpsMessage, setGpsMessage] = useState('Location sharing is limited to active work shifts.');
  const [gpsDeadline, setGpsDeadline] = useState<string | null>(null);
  const [announcementForm, setAnnouncementForm] = useState({ title: '', message: '' });
  const [messageForm, setMessageForm] = useState({ recipientId: '', message: '' });
  const [visitForm, setVisitForm] = useState({ customerId: customers[0]?.id || '', purpose: 'Installation / service visit', notes: '' });
  const chatConnection = useRef<ReturnType<typeof ws.connect> | null>(null);
  const selectedGroupRef = useRef('');
  const today = localDay();
  const myToday = attendance.find(item => item.userId === session.user.id && item.workDate === today);
  const gpsRemainingMinutes = gpsDeadline ? Math.max(0, Math.ceil((new Date(gpsDeadline).getTime() - Date.now()) / 60000)) : null;
  const activeShift = !!myToday && !myToday.checkOutAt;

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
      const [a, v, n, m, g, p, hr] = await Promise.all([
        request('get', '/api/attendance'), request('get', '/api/visits'),
        request('get', '/api/announcements'), request('get', '/api/messages'),
        request('get', '/api/groups'), request('get', '/api/payments'), request('get', '/api/holidays')
      ]);
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
        const [l, s, h, ad] = await Promise.all([request('get', '/api/locations'), request('get', '/api/staff'), request('get', '/api/locations/history'), request('get', '/api/admins')]);
        setLocations(l.data.items || []);
        setStaff(s.data.items || []);
        setLocationHistory(h.data.items || []);
        setAdmins(ad.data.items || []);
      }
    } catch {
      flash('Could not load team operations. Please refresh and try again.');
    } finally {
      setLoading(false);
    }
  }, [admin, request, flash]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!admin) return;
    let stopped = false;
    let pending = false;
    const updateLiveLocations = async () => {
      if (stopped || pending || document.visibilityState !== 'visible') return;
      pending = true;
      try {
        const result = await request('get', '/api/locations');
        if (!stopped) setLocations(result.data.items || []);
      } catch {
        // Keep the last successfully received location visible if a refresh briefly fails.
      } finally {
        pending = false;
      }
    };
    const interval = window.setInterval(updateLiveLocations, 15000);
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') updateLiveLocations(); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [admin, request]);

  useEffect(() => {
    selectedGroupRef.current = selectedGroupId;
  }, [selectedGroupId]);

  useEffect(() => {
    const connection = ws.connect();
    chatConnection.current = connection;
    connection.onMessage(message => {
      const payload = message?.payload;
      if (message?.type === 'entity.update' && payload?.entity_type === 'groupchat' && payload?.entity_id === selectedGroupRef.current) {
        request('get', '/api/groups/' + payload.entity_id + '/messages').then(result => setGroupMessages(result.data.items || [])).catch(() => undefined);
      }
    });
    return () => {
      connection.disconnect();
      chatConnection.current = null;
    };
  }, [request]);

  useEffect(() => {
    if (!selectedGroupId) {
      setGroupMessages([]);
      return;
    }
    let cancelled = false;
    const connection = chatConnection.current;
    const refreshGroupMessages = () => request('get', '/api/groups/' + selectedGroupId + '/messages')
      .then(result => { if (!cancelled) setGroupMessages(result.data.items || []); })
      .catch(() => undefined);
    void refreshGroupMessages();
    const refreshTimer = window.setInterval(refreshGroupMessages, 8000);
    if (connection) connection.ready.then(async () => {
      if (cancelled || !connection.connectionId) return;
      await request('post', '/api/subscriptions', { entity_type: 'groupchat', entity_id: selectedGroupId, connection_id: connection.connectionId });
      if (cancelled) await request('post', '/api/subscriptions/remove', { entity_type: 'groupchat', entity_id: selectedGroupId, connection_id: connection.connectionId });
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
      if (connection?.connectionId) request('post', '/api/subscriptions/remove', { entity_type: 'groupchat', entity_id: selectedGroupId, connection_id: connection.connectionId }).catch(() => undefined);
    };
  }, [selectedGroupId, request]);

  useEffect(() => {
    if (!activeShift || admin || !navigator.geolocation) return;
    let cancelled = false;
    let inFlight = false;
    const captureLocation = () => {
      if (cancelled || inFlight || document.visibilityState !== 'visible') return;
      inFlight = true;
      navigator.geolocation.getCurrentPosition(async position => {
        try {
          const saved = await request('post', '/api/locations', {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            capturedAt: new Date().toISOString()
          });
          if (!cancelled) {
            setGpsMessage(saved.data.gpsRestored ? 'GPS restored. Your shift continues normally.' : 'Work location sharing is active. Last update: ' + new Date().toLocaleTimeString());
            if (saved.data.gpsRestored) { setGpsDeadline(null); await refresh(); }
          }
        } catch {
          if (!cancelled) setGpsMessage('Location update failed. Check your connection and location permission.');
        } finally {
          inFlight = false;
        }
      }, async error => {
        try {
          const reason = error.code === 1 ? 'Location permission denied' : error.code === 2 ? 'GPS location unavailable' : 'GPS location request timed out';
          const result = await request('post', '/api/attendance/gps-lost', { reason });
          if (result.data.monitoring && result.data.deadlineAt) {
            setGpsDeadline(result.data.deadlineAt);
            const minutes = Math.max(0, Math.ceil(Number(result.data.remainingSeconds || 0) / 60));
            if (!cancelled) setGpsMessage('GPS is unavailable. Turn it back on within 15 minutes. About ' + minutes + ' minutes remain. Your shift will be cancelled only after the grace period.');
          } else if (result.data.reason === 'holiday-exempt') setGpsMessage('GPS monitoring is paused for your pending/approved holiday date.');
        } catch { if (!cancelled) setGpsMessage('GPS is unavailable. Reconnect and restore location; the 15-minute grace timer will be enforced by the server once detected.'); }
        inFlight = false;
      }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
    };
    captureLocation();
    const interval = window.setInterval(captureLocation, 30000);
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') captureLocation(); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [activeShift, admin, request, refresh]);

  async function shift(action: 'check-in' | 'check-out') {
    setBusy(true);
    try {
      let coords: Record<string, number> = {};
      if (action === 'check-in' && navigator.geolocation) {
        try {
          const p = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 9000, maximumAge: 30000 }));
          coords = { latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy };
        } catch {
          setGpsMessage('Location permission is required to start a shift.');
          throw new Error('Enable GPS/location permission before starting your shift.');
        }
      }
      await request('post', '/api/attendance/' + action, { ...coords, dayType, capturedAt: new Date().toISOString() });
      await refresh();
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

  async function adminShift(userId: string, action: 'admin-start' | 'admin-end') {
    setBusy(true);
    try {
      await request('post', '/api/attendance/' + action, { userId, dayType });
      await refresh();
      flash(action === 'admin-start' ? 'Staff shift started or restarted by administrator.' : 'Staff shift ended by administrator.');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not update staff attendance.');
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
    try{await request('put','/api/attendance/'+attendanceCorrection.id+'/day-type',{dayType:attendanceCorrection.dayType,reason:attendanceCorrection.reason});setAttendanceCorrection(null);await refresh();flash('Attendance corrected and audit logged.');}
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
    <div className="ops-home-shift-copy"><span className="eyebrow">TODAY’S ATTENDANCE</span><h2>{activeShift ? 'Your shift is active' : myToday?.checkOutAt ? 'Shift completed' : 'Ready to start work?'}</h2><p>{activeShift ? 'Checked in at ' + stamp(myToday?.checkInAt) + '. Your workday is being recorded.' : myToday?.checkOutAt ? 'You checked out at ' + stamp(myToday.checkOutAt) + '.' : 'Start your shift directly from the home screen.'}</p></div>
    <div className="ops-home-shift-action">{!myToday ? <button className="btn primary" disabled={busy || loading} onClick={() => shift('check-in')}>{busy ? 'Starting…' : 'Start shift'}</button> : activeShift ? <button className="btn danger" disabled={busy} onClick={() => shift('check-out')}>{busy ? 'Ending…' : 'End shift'}</button> : <span className="ops-complete">Completed for today</span>}</div>
    {loading && <small className="ops-home-loading">Loading attendance status…</small>}
  </section>;

  return <div className="ops-layout">
    <section className="ops-summary-grid">
      <article className="ops-summary"><span>{admin ? 'Total collections' : 'Today’s shift'}</span><strong>{admin ? '₹' + totalCollected.toLocaleString('en-IN') : activeShift ? 'Checked in' : myToday?.checkOutAt ? 'Completed' : 'Not started'}</strong><small>{admin ? payments.length + ' payment records across the team' : myToday ? 'Started ' + stamp(myToday.checkInAt) : 'Start your shift when work begins'}</small></article>
      <article className="ops-summary"><span>{admin ? 'This month collected' : 'My field visits'}</span><strong>{admin ? '₹' + monthCollected.toLocaleString('en-IN') : visits.length}</strong><small>{admin ? 'Payments recorded in ' + monthKey : 'Customer service visit records'}</small></article>
      <article className="ops-summary"><span>{admin ? 'Staff on shift today' : 'Announcements'}</span><strong>{admin ? activeToday : announcements.length}</strong><small>{admin ? completedToday + ' shifts completed today' : 'Updates shared by K&B administration'}</small></article>
      <article className="ops-summary"><span>{admin ? 'Field visits' : 'Messages'}</span><strong>{admin ? visits.length : messages.length}</strong><small>{admin ? 'Service visits submitted by the team' : 'Your conversation with administration'}</small></article>
    </section>

    {admin && <section className="panel ops-panel">
      <div className="ops-panel-head"><div><span className="eyebrow">ACCESS CONTROL</span><h2>Administrator accounts</h2><p>Create additional admin logins. Actions are audited and the primary owner account is protected.</p></div><span className="ops-pill is-live">{admins.filter(a=>a.active).length} ACTIVE</span></div>
      <form className="ops-form" onSubmit={createAdmin}>
        <input required minLength={3} maxLength={32} pattern="[A-Za-z0-9_-]+" placeholder="Admin login ID" value={adminForm.userId} onChange={e=>setAdminForm({...adminForm,userId:e.target.value})}/>
        <input required maxLength={80} placeholder="Administrator name" value={adminForm.displayName} onChange={e=>setAdminForm({...adminForm,displayName:e.target.value})}/>
        <input required minLength={12} type="password" autoComplete="new-password" placeholder="Temporary password (12+ characters)" value={adminForm.password} onChange={e=>setAdminForm({...adminForm,password:e.target.value})}/>
        <button className="btn primary" disabled={busy}>Add administrator</button>
      </form>
      <div className="ops-location-list">{admins.map(item=><article className="ops-location-card" key={item.id}><div className="ops-person"><span className="avatar">{item.displayName.slice(0,2).toUpperCase()}</span><div><b>{item.displayName}</b><small>{item.userId} · {item.userId.toLowerCase()==='brajraj'?'Primary owner':'Administrator'}</small></div></div><div className="ops-location-detail"><span className={item.active?'ops-pill is-live':'ops-pill is-idle'}>{item.active?'ACTIVE':'DISABLED'}</span>{item.userId.toLowerCase()!=='brajraj' && <button className={'btn compact '+(item.active?'danger':'secondary')} disabled={busy} onClick={()=>updateAdminAccount(item,!item.active)}>{item.active?'Deactivate':'Reactivate'}</button>}</div></article>)}</div>
    </section>}

    {admin && <section className="panel ops-panel team-summary-panel">
      <div className="ops-panel-head"><div><span className="eyebrow">BUSINESS DATA</span><h2>Team collection summary</h2><p>Collections are attributed to the staff account that recorded each payment.</p></div><span className="ops-pill is-live">LIVE DATA</span></div>
      <div className="table-wrap"><table><thead><tr><th>STAFF MEMBER</th><th>PAYMENT RECORDS</th><th>TOTAL COLLECTED</th><th>THIS MONTH</th><th>ATTENDANCE DAYS</th><th>TODAY</th></tr></thead><tbody>{staff.map(member => {
        const memberPayments = payments.filter(payment => payment.recordedBy === member.id);
        const memberTotal = memberPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
        const memberMonth = memberPayments.filter(payment => String(payment.paidAt || '').slice(0, 7) === monthKey).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
        const memberDays = attendance.filter(item => item.userId === member.id).reduce((sum,item) => sum + (item.dayType === 'Half day' ? 0.5 : 1), 0);
        const memberShift = attendance.find(item => item.userId === member.id && item.workDate === today);
        return <tr key={member.id}><td><b>{member.displayName}</b></td><td>{memberPayments.length}</td><td className="amount">₹{memberTotal.toLocaleString('en-IN')}</td><td className="amount">₹{memberMonth.toLocaleString('en-IN')}</td><td>{memberDays}</td><td>{memberShift?.checkOutAt ? 'Completed' : memberShift ? 'On shift' : 'Not started'}</td></tr>;
      })}{!staff.length && <tr><td colSpan={6}>No staff records available yet.</td></tr>}</tbody></table></div>
    </section>}

    <section className="panel ops-panel">
      <div className="ops-panel-head"><div><span className="eyebrow">HOLIDAY MANAGEMENT</span><h2>{admin ? 'Staff holiday requests' : 'Request a holiday'}</h2><p>Pending and approved holiday dates are exempt from automatic GPS shift cancellation.</p></div><span className="ops-pill">{holidays.filter(item=>item.status==='pending').length} PENDING</span></div>
      {!admin && <form className="ops-form" onSubmit={e=>{e.preventDefault();submit('/api/holidays',{...holidayForm},'Holiday request submitted for admin approval.');setHolidayForm({...holidayForm,reason:''});}}><label>From <input type="date" required value={holidayForm.startDate} onChange={e=>setHolidayForm({...holidayForm,startDate:e.target.value})}/></label><label>To <input type="date" required min={holidayForm.startDate} value={holidayForm.endDate} onChange={e=>setHolidayForm({...holidayForm,endDate:e.target.value})}/></label><textarea required maxLength={300} rows={2} placeholder="Reason for holiday request" value={holidayForm.reason} onChange={e=>setHolidayForm({...holidayForm,reason:e.target.value})}/><button className="btn primary" disabled={busy}>Submit holiday request</button></form>}
      <div className="ops-feed">{holidays.map(item=><article className="ops-feed-item" key={item.id}><div className="ops-message-top"><b>{item.displayName} · {item.startDate}{item.endDate!==item.startDate?' to '+item.endDate:''}</b><span className={'ops-pill '+(item.status==='approved'?'is-live':item.status==='rejected'?'is-idle':'')}>{item.status.toUpperCase()}</span></div><p>{item.reason}</p><small>Requested {stamp(item.createdAt)}</small>{admin && item.status==='pending' && <div className="ops-actions"><button className="btn primary compact" disabled={busy} onClick={()=>submit('/api/holidays/'+item.id,{status:'approved'},'Holiday request approved.')}>Approve</button><button className="btn danger compact" disabled={busy} onClick={()=>submit('/api/holidays/'+item.id,{status:'rejected'},'Holiday request rejected.')}>Reject</button></div>}</article>)}{!holidays.length && <p className="ops-empty">No holiday requests yet.</p>}</div>
    </section>

    {!admin && <section className="panel ops-panel">
      <div className="ops-panel-head"><div><span className="eyebrow">ATTENDANCE</span><h2>My workday</h2><p>Record your shift start and finish. Work location is shared with Admin during an active shift while this app is open and location permission is granted. Sharing stops at checkout.</p></div><span className={'ops-pill ' + (activeShift ? 'is-live' : 'is-idle')}>{activeShift ? 'ON SHIFT' : myToday?.checkOutAt ? 'SHIFT COMPLETE' : 'OFF SHIFT'}</span></div>
      <div className="ops-clock-row"><div><small>CHECK IN</small><strong>{myToday ? stamp(myToday.checkInAt) : 'Not checked in'}</strong></div><div><small>CHECK OUT</small><strong>{myToday?.checkOutAt ? stamp(myToday.checkOutAt) : '—'}</strong></div></div>
      <div className="ops-actions"><label className="ops-day-type">Attendance type <select value={dayType} disabled={!!myToday} onChange={e=>setDayType(e.target.value as 'Full day'|'Half day')}><option>Full day</option><option>Half day</option></select></label>{!myToday ? <button className="btn primary" disabled={busy} onClick={() => shift('check-in')}>Check in and start shift</button> : activeShift ? <button className="btn danger" disabled={busy} onClick={() => shift('check-out')}>Check out and end shift</button> : <span className="ops-complete">Today’s attendance is complete.</span>}</div>
      <p className="ops-gps-note">{gpsMessage}{gpsRemainingMinutes !== null ? ' Time remaining: about ' + gpsRemainingMinutes + ' minute(s).' : ''}</p>
    </section>}

    {admin && <section className="panel ops-panel finance-chart-panel">
      <div className="ops-panel-head"><div><span className="eyebrow">WORKFORCE ANALYTICS</span><h2>Monthly attendance trend</h2><p>Full-day and half-day attendance entries for the last six months.</p></div></div>
      <div className="finance-chart" role="img" aria-label="Six month attendance chart">
        {attendanceTrend.map(item=><div className="finance-chart-month" key={item.key}><div className="finance-chart-bars"><div className="finance-chart-bar income-bar" style={{height:Math.max(3,item.full/attendanceMax*100)+'%'}} title={item.full+' full-day records'}/><div className="finance-chart-bar expense-bar" style={{height:Math.max(3,item.half*.5/attendanceMax*100)+'%'}} title={item.half+' half-day records'}/></div><b>{item.label}</b><small>{item.full} full · {item.half} half</small></div>)}
      </div>
      <div className="finance-chart-legend"><span><i className="income-dot"/> Full day</span><span><i className="expense-dot"/> Half day (0.5)</span></div>
    </section>}

    {admin && <section className="panel ops-panel">
      <div className="ops-panel-head"><div><span className="eyebrow">TEAM VISIBILITY · LIVE</span><h2>Live staff locations</h2><p>Admin locations refresh every 15 seconds. Staff locations update about every 30 seconds while their shift is active and this app is open with location permission granted.</p></div><label className="ops-day-type">New shift type <select value={dayType} onChange={e=>setDayType(e.target.value as 'Full day'|'Half day')}><option>Full day</option><option>Half day</option></select></label><button className="btn secondary compact" onClick={refresh}>Refresh now</button></div>
      <div className="ops-location-list">{staff.map(member => {
        const loc = locations.find(item => item.userId === member.id);
        const shiftRecord = sortedAttendance.find(item => item.userId === member.id && item.workDate === today);
        const locationAge = loc ? Date.now() - new Date(loc.capturedAt).getTime() : Number.POSITIVE_INFINITY;
        const locationStatus = locationAge < 90000 ? 'Live · Updated ' : 'Last known · Updated ';
        return <article className="ops-location-card" key={member.id}><div className="ops-person"><span className="avatar">{member.displayName.slice(0, 2).toUpperCase()}</span><div><b>{member.displayName}</b><small>{shiftRecord?.checkOutAt ? 'Checked out ' + stamp(shiftRecord.checkOutAt) : shiftRecord ? 'Checked in ' + stamp(shiftRecord.checkInAt) : 'No attendance today'}</small></div></div><div className="ops-location-detail">{loc ? <><span>{locationStatus}{stamp(loc.capturedAt)}</span><small>Accuracy approx. {Math.round(loc.accuracy)} m</small><a href={'https://www.google.com/maps?q=' + loc.latitude + ',' + loc.longitude} target="_blank" rel="noreferrer">Open in Google Maps ↗</a></> : <span>No location shared during this shift yet</span>}{!shiftRecord ? <button className="btn primary compact" disabled={busy || !member.active} onClick={() => adminShift(member.id, 'admin-start')}>Start shift</button> : shiftRecord.gpsRestartRequired ? <button className="btn primary compact" disabled={busy || !member.active} onClick={() => adminShift(member.id, 'admin-start')}>Admin restart required</button> : shiftRecord.checkOutAt ? <span className="ops-complete">Shift completed</span> : <button className="btn danger compact" disabled={busy} onClick={() => adminShift(member.id, 'admin-end')}>End shift</button>}</div></article>;
      })}{!staff.length && <p className="ops-empty">Staff accounts will appear here after they are created.</p>}</div>
    </section>}

    {admin && <section className="panel ops-panel">
      <div className="ops-panel-head"><div><span className="eyebrow">GPS AUDIT TRAIL</span><h2>Location history</h2><p>Location points recorded during active shifts. Open any point in Google Maps.</p></div><span className="ops-pill">{locationHistory.length} RECENT POINTS</span></div>
      <div className="ops-history-list">{locationHistory.slice(0,40).map((point,index)=><article className="ops-history-row" key={point.userId+'-'+point.capturedAt+'-'+index}><div><b>{point.displayName}</b><small>{stamp(point.capturedAt)}</small></div><span>±{Math.round(point.accuracy||0)} m</span><a href={'https://www.google.com/maps?q='+point.latitude+','+point.longitude} target="_blank" rel="noreferrer">Open map ↗</a></article>)}{!locationHistory.length && <p className="ops-empty">No GPS points have been recorded yet.</p>}</div>
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

    {admin && attendanceCorrection && <section className="panel ops-panel"><div className="ops-panel-head"><div><span className="eyebrow">ATTENDANCE CORRECTION</span><h2>Correct day type</h2><p>Changes are recorded in the audit log.</p></div><button className="btn secondary compact" onClick={()=>setAttendanceCorrection(null)}>Cancel</button></div><form className="ops-form" onSubmit={correctAttendance}><select value={attendanceCorrection.dayType} onChange={e=>setAttendanceCorrection({...attendanceCorrection,dayType:e.target.value as 'Full day'|'Half day'})}><option>Full day</option><option>Half day</option></select><textarea required maxLength={300} rows={2} placeholder="Reason for correction" value={attendanceCorrection.reason} onChange={e=>setAttendanceCorrection({...attendanceCorrection,reason:e.target.value})}/><button className="btn primary" disabled={busy}>Save correction</button></form></section>}
    <section className="panel ops-panel">
      <div className="ops-panel-head"><div><span className="eyebrow">WORK HISTORY</span><h2>{admin ? 'Team attendance history' : 'My attendance history'}</h2><p>Daily attendance records, kept separate by staff member and date.</p></div></div>
      <div className="ops-history-list">{sortedAttendance.slice(0, 30).map(item => <article className="ops-history-row" key={item.id}><div><b>{item.displayName}</b><small>{item.workDate}</small></div><span>{stamp(item.checkInAt)}</span><span>{item.checkOutAt ? stamp(item.checkOutAt) : 'Still checked in'}</span><strong>{item.dayType || 'Full day'} · {item.checkOutAt ? 'Completed' : 'On shift'}</strong>{admin && <button className="btn secondary compact" onClick={()=>setAttendanceCorrection({id:item.id,dayType:item.dayType||'Full day',reason:''})}>Correct</button>}</article>)}{!attendance.length && <p className="ops-empty">Attendance history will appear here.</p>}</div>
    </section>
    {loading && <div className="ops-loading">Loading team operations…</div>}
  </div>;
}
