import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';
import StaffOperations from './StaffOperations';
import FinanceWorkspace from './FinanceWorkspace';
import SubscriptionWorkspace from './SubscriptionWorkspace';
import InventoryWorkspace from './InventoryWorkspace';
import InstallationsWorkspace from './InstallationsWorkspace';
import { useAppPreferences } from './appPreferences';
import { api as client, changeAppPassword, changeAppUserId, signInAppUser, signOutAppUser, submitStaffRegistrationRequest, getStaffRegistrationStatus } from './lib/api';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Check,
  ChevronDown,
  CircleHelp,
  CreditCard,
  IndianRupee,
  LayoutDashboard,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Search,
  Signal,
  Users,
  Wifi,
  X,
  Zap,
  CalendarDays,
  Phone,
  MapPin,
  Filter,
  Clock3,
  CheckCircle2,
  ClipboardList,
  AlertCircle,
  Pencil,
  Trash2,
  Eye,
  Download, ShieldCheck, KeyRound, BarChart3, LogOut, UserPlus, UserRound, LockKeyhole,
} from 'lucide-react';

type Session={token:string;expiresAt:number;user:{id:string;userId:string;displayName:string;role:'admin'|'staff';active:boolean;isSuperAdmin?:boolean}};
type AppNotification={id:string;title:string;message:string;createdAt:string;read:boolean;type:string};
const getToken=()=>{try{return (JSON.parse(localStorage.getItem('kb-customer-session')||'null') as Session|null)?.token||'';}catch{return '';}};
const api={get:(url:string)=>client.get(url+(url.includes('?')?'&':'?')+'sessionToken='+encodeURIComponent(getToken())),post:(url:string,data?:Record<string,unknown>)=>client.post(url,{...(data||{}),sessionToken:getToken()}),put:(url:string,data?:Record<string,unknown>)=>client.put(url,{...(data||{}),sessionToken:getToken()}),delete:(url:string)=>client.delete(url+'?sessionToken='+encodeURIComponent(getToken()))};
type Customer = {
  id: string;
  name: string;
  phone: string;
  address: string;
  plan: string;
  monthlyFee: number;
  status: 'Active' | 'Inactive' | 'Suspended';
  joinedAt: string;
  dueDate: string;
  notes?: string;
  assignedTo?: string;
  assignedToName?: string;
};
type Payment = {
  id: string;
  customerId: string;
  customerName: string;
  amount: number;
  method: string;
  paidAt: string;
  month: string;
  recordedBy?: string;
  recordedByName?: string;
};
type Staff = { id: string; userId: string; displayName: string; role: 'staff'; active: boolean };
type AttendanceRecord = { id: string; userId: string; displayName: string; workDate: string; checkInAt: string; checkOutAt?: string; dayType?: 'Full day' | 'Half day' };
type Task = { id: string; title: string; details: string; assignedTo: string; assignedToName: string; priority: 'Low' | 'Normal' | 'High'; dueDate: string; status: 'Pending' | 'In progress' | 'Completed'; createdAt: string; createdByName: string };
type Complaint = {
  id: string;
  customerId?: string;
  customerName?: string;
  subject: string;
  details: string;
  priority: string;
  status: string;
  createdAt: string;
};
type Plan = {
  id: string;
  name: string;
  provider: string;
  speed: string;
  data: string;
  price: number;
  note: string;
  connectionType: string;
  featured: boolean;
  active: boolean;
};

const money = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN');
const dateLabel = (s: string) =>
  s
    ? new Date(s).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—';

function Workspace({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const isAdmin = session.user.role === 'admin';
  const { language, setLanguage, theme, toggleTheme } = useAppPreferences();
  const [localHour, setLocalHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const timer = window.setInterval(() => setLocalHour(new Date().getHours()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const greeting = localHour < 12
    ? ({ en: 'Good morning', hi: 'सुप्रभात', gu: 'સુપ્રભાત' }[language])
    : localHour < 17
      ? ({ en: 'Good afternoon', hi: 'नमस्कार', gu: 'શુભ બપોર' }[language])
      : ({ en: 'Good evening', hi: 'शुभ संध्या', gu: 'શુભ સાંજ' }[language]);
  const taskPage = isAdmin ? 'Tasks' : 'My Work';
  const [page, setPage] = useState('Overview');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [selectedStaffProfileId, setSelectedStaffProfileId] = useState('');
  const [showTask, setShowTask] = useState(false);
  const [showStaff, setShowStaff] = useState(false);
  const [resetStaff, setResetStaff] = useState<Staff | null>(null);
  const [editStaffUserId, setEditStaffUserId] = useState<Staff | null>(null);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCustomer, setShowCustomer] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [showPlan, setShowPlan] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [preferredPlan, setPreferredPlan] = useState('');
  const [planSearch, setPlanSearch] = useState('');
  const [planFilter, setPlanFilter] = useState<'Active' | 'Archived' | 'All'>('Active');
  const [selected, setSelected] = useState<Customer | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [showComplaint, setShowComplaint] = useState(false);
  const [notice, setNotice] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const seenNotifications = useRef<Set<string> | null>(null);
  const pushToken = useRef<string | null>(null);

  useEffect(() => {
    if (!mobileNav) return;
    const previousBodyOverflow = document.body.style.overflow;
    const previousRootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
    };
  }, [mobileNav]);

  async function load() {
    setLoading(true);
    try {
      const [c, p, t, w, a, planResult] = await Promise.all([
        api.get('/api/customers'),
        api.get('/api/payments'),
        api.get('/api/complaints'),
        api.get('/api/tasks'),
        api.get('/api/attendance'),
        api.get('/api/plans'),
      ]);
      setCustomers(c.data.items || []);
      setPlans(planResult.data.items || []);
      setPayments(p.data.items || []);
      setAttendanceRecords(a.data.items || []);
      setComplaints(t.data.items || []);
      setTasks(w.data.items || []);
      if (isAdmin) {
        const s = await api.get('/api/staff');
        setStaff(s.data.items || []);
      }
    } catch (e) {
      setNotice('Could not load records. Please refresh and try again.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    let stopped = false;
    const pollNotifications = async () => {
      try {
        const result = await api.get('/api/notifications');
        if (stopped) return;
        const items = (result.data.items || []) as AppNotification[];
        setNotifications(items);
        if (seenNotifications.current === null) {
          seenNotifications.current = new Set(items.map(item => item.id));
          return;
        }
        for (const item of items.slice().reverse()) {
          if (seenNotifications.current.has(item.id)) continue;
          seenNotifications.current.add(item.id);
          if (item.read) continue;
          if (Capacitor.isNativePlatform()) {
            try {
              const permission = await LocalNotifications.checkPermissions();
              if (permission.display === 'granted') {
                const notificationId = Array.from(String(item.id)).reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) & 0x7fffffff, 1);
                await LocalNotifications.schedule({ notifications: [{ id: notificationId, title: item.title || 'K&B update', body: item.message || 'You have a new update.', schedule: { at: new Date(Date.now() + 1000) } }] });
              } else setNotice((item.title || 'K&B update') + ': ' + (item.message || 'You have a new update.'));
            } catch { setNotice((item.title || 'K&B update') + ': ' + (item.message || 'You have a new update.')); }
          } else if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification(item.title || 'K&B update', { body: item.message || 'You have a new update.' });
          } else {
            setNotice((item.title || 'K&B update') + ': ' + (item.message || 'You have a new update.'));
          }
        }
      } catch { /* Notification polling must not interrupt normal app use. */ }
    };
    void pollNotifications();
    const timer = window.setInterval(pollNotifications, 12000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [session.user.id, isAdmin]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let stopped = false;
    let registrationListener: { remove: () => Promise<void> } | undefined;
    let receivedListener: { remove: () => Promise<void> } | undefined;
    let actionListener: { remove: () => Promise<void> } | undefined;
    let errorListener: { remove: () => Promise<void> } | undefined;

    const registerDevice = async () => {
      try {
        registrationListener = await PushNotifications.addListener('registration', async token => {
          if (stopped || !token.value) return;
          pushToken.current = token.value;
          try {
            await api.post('/api/push-tokens', { token: token.value, platform: 'android' });
          } catch (error) {
            console.warn('Could not register this device for K&B push notifications.', error);
          }
        });
        receivedListener = await PushNotifications.addListener('pushNotificationReceived', async () => {
          try {
            const result = await api.get('/api/notifications');
            if (!stopped) setNotifications((result.data.items || []) as AppNotification[]);
          } catch { /* The normal notification poll will retry. */ }
        });
        actionListener = await PushNotifications.addListener('pushNotificationActionPerformed', async () => {
          try {
            const result = await api.get('/api/notifications');
            if (!stopped) {
              setNotifications((result.data.items || []) as AppNotification[]);
              setNotificationsOpen(true);
            }
          } catch { /* The normal notification poll will retry. */ }
        });
        errorListener = await PushNotifications.addListener('registrationError', error => {
          console.warn('K&B push registration failed.', error);
        });

        let permission = await PushNotifications.checkPermissions();
        if (permission.receive !== 'granted') permission = await PushNotifications.requestPermissions();
        if (!stopped && permission.receive === 'granted') await PushNotifications.register();
      } catch (error) {
        console.warn('K&B push notifications are not configured on this device yet.', error);
      }
    };

    void registerDevice();
    return () => {
      stopped = true;
      void registrationListener?.remove();
      void receivedListener?.remove();
      void actionListener?.remove();
      void errorListener?.remove();
    };
  }, [session.user.id]);

  const active = customers.filter(c => c.status === 'Active').length;
  const collected = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const pending = customers
    .filter(c => c.status === 'Active')
    .reduce((sum, c) => sum + Number(c.monthlyFee || 0), 0);
  const openComplaints = complaints.filter(c => c.status !== 'Resolved').length;
  const pendingTasks = tasks.filter(task => task.status !== 'Completed').length;
  const currentBillingMonth = new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  const paidByCustomer = new Map<string, number>();
  payments.filter(p => p.month === currentBillingMonth).forEach(p => paidByCustomer.set(p.customerId, (paidByCustomer.get(p.customerId) || 0) + Number(p.amount || 0)));
  const today = new Date().toISOString().slice(0, 10);
  const overdueValue = customers.filter(c => c.status === 'Active' && c.dueDate && c.dueDate <= today).reduce((sum, c) => sum + Math.max(0, Number(c.monthlyFee || 0) - (paidByCustomer.get(c.id) || 0)), 0);
  const filtered = useMemo(
    () =>
      customers.filter(c =>
        [c.name, c.phone, c.address, c.plan]
          .join(' ')
          .toLowerCase()
          .includes(search.toLowerCase())
      ),
    [customers, search]
  );
  const selectedStaffProfile = staff.find(member => member.id === selectedStaffProfileId);
  const selectedStaffPayments = payments.filter(payment => payment.recordedBy === selectedStaffProfileId).sort((a, b) => b.paidAt.localeCompare(a.paidAt));
  const selectedStaffAttendance = attendanceRecords.filter(record => record.userId === selectedStaffProfileId).sort((a, b) => b.workDate.localeCompare(a.workDate));
  const selectedStaffAttendanceEquivalent = selectedStaffAttendance.reduce((sum, record) => sum + (record.dayType === 'Half day' ? 0.5 : 1), 0);
  const selectedStaffTasks = tasks.filter(task => task.assignedTo === selectedStaffProfileId);
  const selectedStaffCollected = selectedStaffPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const visiblePlans = plans.filter(plan => {
    const matchesStatus = planFilter === 'All' || (planFilter === 'Active' ? plan.active : !plan.active);
    const matchesSearch = [plan.name, plan.provider, plan.speed, plan.connectionType, plan.note].join(' ').toLowerCase().includes(planSearch.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 3200);
  }
  async function markNotificationsRead() {
    const unread = notifications.filter(item => !item.read);
    await Promise.all(unread.map(item => api.put('/api/notifications/' + item.id, { read: true }).catch(() => undefined)));
    setNotifications(current => current.map(item => ({ ...item, read: true })));
  }
  async function signOut() {
    if (pushToken.current) {
      try { await api.post('/api/push-tokens', { token: pushToken.current, action: 'unregister' }); } catch { /* Server cleanup can be retried on the next sign-in. */ }
      pushToken.current = null;
    }
    try { await api.post('/api/auth/logout'); } catch { /* local sign-out still proceeds */ }
    onLogout();
  }
  async function savePlan(form: Omit<Plan, 'id'>) {
    try {
      if (editingPlan) await api.put('/api/plans/' + editingPlan.id, form as unknown as Record<string, unknown>);
      else await api.post('/api/plans', form as unknown as Record<string, unknown>);
      setShowPlan(false);
      setEditingPlan(null);
      await load();
      flash(editingPlan ? 'Plan updated successfully' : 'Plan created successfully');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not save this plan');
    }
  }
  async function deletePlan(plan: Plan) {
    if (!window.confirm('Permanently delete plan "' + plan.name + '"? Plans linked to customers cannot be deleted; archive those instead.')) return;
    try {
      await api.delete('/api/plans/' + plan.id);
      await load();
      flash('Plan deleted');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not delete this plan');
    }
  }
  async function togglePlanStatus(plan: Plan) {
    const nextActive = !plan.active;
    if (!nextActive && !window.confirm('Archive ' + plan.name + '? Existing customer records will be kept unchanged.')) return;
    try {
      await api.put('/api/plans/' + plan.id, { ...plan, active: nextActive } as unknown as Record<string, unknown>);
      await load();
      flash(nextActive ? 'Plan restored' : 'Plan archived. Existing customer records were preserved.');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not update this plan');
    }
  }
  async function saveCustomer(form: Omit<Customer, 'id'>) {
    try {
      if (editing) await api.put('/api/customers/' + editing.id, form);
      else await api.post('/api/customers', form);
      setShowCustomer(false);
      setEditing(null);
      await load();
      flash(
        editing
          ? 'Customer updated successfully'
          : 'Customer added successfully'
      );
    } catch {
      flash('Unable to save customer. Please try again.');
    }
  }
  async function removeCustomer(c: Customer) {
    if (!window.confirm('Delete ' + c.name + '? This cannot be undone.'))
      return;
    try {
      await api.delete('/api/customers/' + c.id);
      setSelected(null);
      await load();
      flash('Customer deleted');
    } catch {
      flash('Could not delete customer');
    }
  }
  async function createStaff(data: { userId: string; displayName: string; password: string }) {
    try {
      await api.post('/api/staff', data);
      setShowStaff(false);
      await load();
      flash('Staff account created successfully');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not create staff account');
    }
  }
  async function removeStaff(staffUser: Staff) {
    if (!window.confirm('Delete staff account "' + staffUser.displayName + '"? Their sign-in will be removed and assigned customers will become unassigned. Payment, attendance and work history will be preserved.')) return;
    try {
      await api.delete('/api/staff/' + staffUser.id);
      if (selectedStaffProfileId === staffUser.id) setSelectedStaffProfileId('');
      await load();
      flash('Staff account deleted. Historical records were preserved.');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not delete staff account');
    }
  }
  async function updateStaff(staffUser: Staff, patch: { active?: boolean }) {
    try {
      await api.put('/api/staff/' + staffUser.id, { ...patch, displayName: staffUser.displayName });
      await load();
      flash(patch.active === false ? 'Staff access disabled' : 'Staff account updated');
    } catch {
      flash('Could not update staff account');
    }
  }
  async function saveStaffUserId(staffUser: Staff, userId: string) {
    try {
      await api.put('/api/staff/' + staffUser.id, { userId, displayName: staffUser.displayName });
      setEditStaffUserId(null);
      await load();
      flash('Staff username updated. The staff member must sign in with the new ID.');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not change staff username');
    }
  }
  async function saveStaffPassword(staffUser: Staff, password: string) {
    try {
      await api.post('/api/staff/' + staffUser.id + '/reset-password', { password });
      setResetStaff(null);
      flash('Staff password reset. Their active sessions have been closed.');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not reset staff password');
    }
  }
  async function savePayment(data: Omit<Payment, 'id'>) {
    try {
      await api.post('/api/payments', data);
      setShowPayment(false);
      await load();
      flash('Payment recorded');
    } catch {
      flash('Could not record payment');
    }
  }
  async function saveComplaint(data: Omit<Complaint, 'id'>) {
    try {
      await api.post('/api/complaints', data);
      setShowComplaint(false);
      await load();
      flash('Complaint added');
    } catch {
      flash('Could not add complaint');
    }
  }
  async function saveTask(data: { title: string; details: string; assignedTo: string; priority: string; dueDate: string }) {
    try {
      await api.post('/api/tasks', data);
      setShowTask(false);
      await load();
      flash('Task assigned successfully');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not assign task');
    }
  }
  async function updateTask(task: Task, status: string) {
    try {
      await api.put('/api/tasks/' + task.id, { status });
      await load();
      flash('Task status updated');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not update task');
    }
  }
  async function updateComplaint(item: Complaint, status: string) {
    try {
      await api.put('/api/complaints/' + item.id, { ...item, status });
      await load();
      flash('Complaint status updated');
    } catch {
      flash('Could not update complaint');
    }
  }

  const nav = [
    { label: 'Overview', icon: LayoutDashboard },
    { label: taskPage, icon: ClipboardList, count: pendingTasks || undefined },
    ...(isAdmin ? [{ label: 'Team Operations', icon: Activity }] : [{ label: 'My Day', icon: CalendarDays }]),
    { label: 'Customers', icon: Users, count: customers.length },
    { label: 'Subscriptions', icon: CalendarDays },
    { label: 'Inventory', icon: ClipboardList },
    { label: 'Installations', icon: MapPin },
    ...(isAdmin ? [{ label: 'Plans & Pricing', icon: Wifi }] : []),
    ...(isAdmin ? [{ label: 'Staff', icon: UserRound, count: staff.length }] : []),
    ...(isAdmin ? [{ label: 'Finance & Billing', icon: IndianRupee }] : []),
    { label: 'Payments', icon: CreditCard },
    {
      label: 'Complaints',
      icon: MessageSquare,
      count: openComplaints || undefined,
    },
  ];

  return (
    <div className="shell">
      <aside className={'sidebar ' + (mobileNav ? 'mobile-open' : '')}>
        <div className="brand">
          <div className="brand-mark">
            <Signal size={21} />
          </div>
          <div>
            <strong>
              K&B <span>NET SERVICE</span>
            </strong>
            <small>Customer management</small>
          </div>
          <button className="mobile-close" onClick={() => setMobileNav(false)}>
            <X size={18} />
          </button>
        </div>
        <div className="workspace">
          <span className="workspace-dot" />
          <span>K&B Operations</span>
          <ChevronDown size={14} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.map(item => (
            <button
              key={item.label}
              className={'nav-item ' + (page === item.label ? 'active' : '')}
              onClick={() => {
                setPage(item.label);
                setMobileNav(false);
              }}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {item.count ? <em>{item.count}</em> : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="btn secondary compact" style={{width:'100%',marginBottom:12}} onClick={async()=>{if(Capacitor.isNativePlatform()){const permission=await LocalNotifications.requestPermissions();flash(permission.display==='granted'?'Notifications enabled. You will receive new messages, assigned work and reminders while the app is running.':'Notifications are blocked. Enable them in Android settings.');return;}if(typeof Notification==='undefined'){flash('This browser does not support desktop notifications.');return;}const permission=await Notification.requestPermission();flash(permission==='granted'?'Notifications enabled. You will receive new messages, assigned work and reminders while the app is open.': 'Notifications are blocked. Enable them in your browser settings.');}}>
            <Bell size={15}/> Enable notifications
          </button>
          <div className="help-card">
            <div className="help-icon">
              <CircleHelp size={18} />
            </div>
            <strong>Need help?</strong>
            <p>Keep your customer records up to date.</p>
            <button
              onClick={() =>
                flash('Contact your K&B administrator for assistance.')
              }
            >
              Help centre <span>↗</span>
            </button>
          </div>
          <div className="user-row">
            <div className="avatar">{session.user.displayName.slice(0, 2).toUpperCase()}</div>
            <div>
              <strong>{session.user.displayName}</strong>
              <small>{isAdmin ? 'Administrator' : 'Staff member'}</small>
            </div>
            <button className="row-action" title="Sign out" onClick={signOut}><LogOut size={15} /></button>
          </div>
        </div>
      </aside>
      {mobileNav && (
        <div className="scrim" onClick={() => setMobileNav(false)} />
      )}
      <main className="main">
        <header className="topbar">
          <button className="hamburger" onClick={() => setMobileNav(true)}>
            <Menu />
          </button>
          <div className="crumb">
            Workspace <span>/</span> <strong>{page}</strong>
          </div>
          <div className="top-actions">
            <span className="system-status">
              <i /> All systems operational
            </span>
            <div className="preference-controls">
              <label className="language-control" title="App language"><span>🌐</span><select aria-label="App language" value={language} onChange={event => setLanguage(event.target.value as 'en' | 'hi' | 'gu')}><option value="en">English</option><option value="hi">हिन्दी</option><option value="gu">ગુજરાતી</option></select></label>
              <button className="theme-toggle" onClick={toggleTheme} title={theme === 'dark' ? 'Switch to day mode' : 'Switch to night mode'} aria-label={theme === 'dark' ? 'Switch to day mode' : 'Switch to night mode'}>{theme === 'dark' ? '☀️' : '🌙'}<span>{theme === 'dark' ? 'Day' : 'Night'}</span></button>
            </div>
            <div className="notification-anchor">
              <button className="icon-button notification-bell" onClick={() => setNotificationsOpen(open => !open)} aria-label="Open notifications">
                <Bell size={18}/>{notifications.filter(item=>!item.read).length>0 && <span className="notification-count">{Math.min(99,notifications.filter(item=>!item.read).length)}</span>}
              </button>
              {notificationsOpen && <div className="notification-popover">
                <div className="notification-popover-head"><b>Notifications</b><button onClick={markNotificationsRead} disabled={!notifications.some(item=>!item.read)}>Mark all read</button></div>
                {notifications.slice(0,12).map(item=><article className={'notification-item '+(!item.read?'unread':'')} key={item.id}><b>{item.title}</b><p>{item.message}</p><small>{item.createdAt ? new Date(item.createdAt).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}) : ''}</small></article>)}
                {!notifications.length && <p className="notification-empty">You’re all caught up.</p>}
              </div>}
            </div>
            <button type="button" className="icon-button account-trigger" title="Account settings" aria-label="Account settings" onClick={() => setShowAccountSettings(true)}><div className="avatar small-avatar">{session.user.displayName.slice(0, 2).toUpperCase()}</div></button>
          </div>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                K&B NET SERVICE <span>•</span> OPERATIONS
              </div>
              <h1>{page === 'Overview' ? (isAdmin ? greeting + ', ' + session.user.displayName : 'Your work at a glance') : page}</h1>
              <p>
                {page === 'Overview'
                  ? 'Here’s what is happening with your connections today.'
                  : page === 'Customers'
                    ? 'Manage customer details, connections and account status.'
                    : page === 'Plans & Pricing'                      ? 'Your available internet packages and monthly pricing.'
                      : page === 'Subscriptions'
                        ? 'Manage customer renewals, subscription periods and expiry dates.'
                      : page === 'Installations'
                        ? 'Schedule customer installations, upgrades and repair visits.'
                      : page === 'Inventory'
                        ? 'Track equipment, stock levels, supplies and stock movements.'
                      : page === 'Payments'
                        ? 'Track customer collections and payment history.'
                        : page === 'Staff'
                          ? 'Manage staff accounts, assignments and collection performance.'
                          : page === taskPage
                            ? (isAdmin ? 'Assign work, set priorities and monitor team progress.' : 'Your assigned work, priorities and due dates.')
                            : page === 'My Day' || page === 'Team Operations'
                              ? (isAdmin ? 'Attendance, team locations, announcements, messages and field visits.' : 'Your attendance, customer visits, team updates and messages.')
                              : 'Track and resolve customer service requests.'}
              </p>
            </div>
            <div className="heading-actions">
              {page === 'Staff' && isAdmin && (
                <button className="btn primary" onClick={() => setShowStaff(true)}><UserPlus size={17} /> Add staff member</button>
              )}
              {page === taskPage && isAdmin && (
                <button className="btn primary" onClick={() => setShowTask(true)}><Plus size={17} /> Assign task</button>
              )}
              {page === 'Customers' && isAdmin && (
                <button
                  className="btn primary"
                  onClick={() => {
                    setEditing(null);
                    setShowCustomer(true);
                  }}
                >
                  <Plus size={17} /> Add customer
                </button>
              )}
              {page === 'Payments' && (
                <button
                  className="btn primary"
                  onClick={() => setShowPayment(true)}
                >
                  <Plus size={17} /> Record payment
                </button>
              )}
              {page === 'Complaints' && (
                <button
                  className="btn primary"
                  onClick={() => setShowComplaint(true)}
                >
                  <Plus size={17} /> New complaint
                </button>
              )}
            </div>
          </div>

          {page === (isAdmin ? 'Team Operations' : 'My Day') && <StaffOperations session={session} customers={customers} flash={flash} />}
          {page === 'Finance & Billing' && isAdmin && <FinanceWorkspace session={session} customers={customers} payments={payments} flash={flash} />}
          {page === 'Subscriptions' && <SubscriptionWorkspace customers={customers} plans={plans} isAdmin={isAdmin} flash={flash} />}
          {page === 'Inventory' && <InventoryWorkspace isAdmin={isAdmin} flash={flash} />}
          {page === 'Installations' && <InstallationsWorkspace customers={customers} staff={staff} isAdmin={isAdmin} flash={flash} />}
          {page === 'Overview' && !isAdmin && <StaffOperations session={session} customers={customers} flash={flash} compact />}

          {page === 'Overview' && (
            <>
              <div className="welcome-strip">
                <div className="welcome-symbol">
                  <Zap size={21} />
                </div>
                <div>
                  <strong>Your network, one clear view.</strong>
                  <span>
                    Customer records and service activity in one place.
                  </span>
                </div>
                <div className="strip-right">
                  <span>LIVE OVERVIEW</span>
                  <i />
                </div>
              </div>
              <div className="stats-grid">
                <Stat
                  icon={<Users />}
                  label={isAdmin ? 'Total customers' : 'My assigned customers'}
                  value={customers.length}
                  foot={isAdmin ? 'All registered connections' : 'Customers assigned to your account'}
                  tint="blue"
                />
                <Stat
                  icon={isAdmin ? <Activity /> : <ClipboardList />}
                  label={isAdmin ? 'Active connections' : 'My pending tasks'}
                  value={isAdmin ? active : pendingTasks}
                  foot={isAdmin ? (customers.length ? Math.round((active / customers.length) * 100) + '% of total customers' : 'No customers yet') : 'Assigned work not yet completed'}
                  tint="green"
                />
                <Stat
                  icon={<IndianRupee />}
                  label={isAdmin ? 'Payments recorded' : 'My collections'}
                  value={money(collected)}
                  foot={isAdmin ? 'Total recorded collections' : 'Payments recorded by you'}
                  tint="purple"
                />
                <Stat
                  icon={<MessageSquare />}
                  label="Open complaints"
                  value={openComplaints}
                  foot="Awaiting resolution"
                  tint="orange"
                />
              </div>
              <div className="overview-grid">
                <section className="panel">
                  <div className="panel-head">
                    <div>
                      <h2>Recent customers</h2>
                      <p>Latest connections added to your records</p>
                    </div>
                    <button
                      className="text-btn"
                      onClick={() => setPage('Customers')}
                    >
                      View all <span>→</span>
                    </button>
                  </div>
                  <CustomerTable
                    rows={customers.slice(0, 5)}
                    onView={setSelected}
                  />
                  {!customers.length && (
                    <Empty
                      icon={<Users />}
                      title="No customers yet"
                      text="Add your first customer to start building your records."
                      action={isAdmin ? 'Add customer' : undefined}
                      onClick={() => setShowCustomer(true)}
                    />
                  )}
                </section>
                <section className="panel activity-panel">
                  <div className="panel-head">
                    <div>
                      <h2>Service snapshot</h2>
                      <p>Current operational summary</p>
                    </div>
                    <span className="live-tag">
                      <i /> LIVE
                    </span>
                  </div>
                  <div className="snapshot-row">
                    <div className="snapshot-icon blue-bg">
                      <Wifi />
                    </div>
                    <div>
                      <strong>Active connections</strong>
                      <small>Currently marked active</small>
                    </div>
                    <b>{active}</b>
                  </div>
                  <div className="snapshot-row">
                    <div className="snapshot-icon orange-bg">
                      <Clock3 />
                    </div>
                    <div>
                      <strong>Monthly plan value</strong>
                      <small>Based on active customers</small>
                    </div>
                    <b>{money(pending)}</b>
                  </div>
                  <div className="snapshot-row">
                    <div className="snapshot-icon purple-bg">
                      <MessageSquare />
                    </div>
                    <div>
                      <strong>Pending complaints</strong>
                      <small>Need attention</small>
                    </div>
                    <b>{openComplaints}</b>
                  </div>
                  <div className="snapshot-note">
                    <CheckCircle2 size={16} /> Your customer workspace is ready
                    to use.
                  </div>
                </section>
              </div>
              <div className="chart-grid">
                <MonthlyChart title={isAdmin ? 'Monthly collections' : 'Your recorded collections'} subtitle="Payment totals from the last six months" items={payments} dateKey="paidAt" valueKey="amount" moneyValue />
                <MonthlyChart title="Customer additions" subtitle={isAdmin ? 'New connections added each month' : 'Your assigned customer base by join date'} items={customers} dateKey="joinedAt" countOnly />
              </div>
              {isAdmin && <div className="chart-grid"><StatusChart complaints={complaints} /><OverduePanel value={overdueValue} /></div>}
              <section className="panel bottom-panel">
                <div className="panel-head">
                  <div>
                    <h2>Recent payments</h2>
                    <p>Latest recorded customer payments</p>
                  </div>
                  <button
                    className="text-btn"
                    onClick={() => setPage('Payments')}
                  >
                    View payments →
                  </button>
                </div>
                <PaymentTable rows={payments.slice(0, 4)} />
              </section>
            </>
          )}

          {page === 'Staff' && isAdmin && (
            <section className="panel table-panel">
              <div className="toolbar"><div><h2>Staff accounts</h2><p className="subtle">Create accounts and manage access to assigned customers.</p></div><span className="result-count">{staff.length} members</span></div>
              <div className="table-wrap"><table><thead><tr><th>STAFF MEMBER</th><th>USER ID</th><th>ASSIGNED CUSTOMERS</th><th>COLLECTIONS RECORDED</th><th>ACCESS</th><th>ACTIONS</th></tr></thead><tbody>
                {staff.map(member => {
                  const assigned = customers.filter(c => c.assignedTo === member.id).length;
                  const total = payments.filter(p => p.recordedBy === member.id).reduce((sum, p) => sum + Number(p.amount || 0), 0);
                  return <tr key={member.id}><td><b>{member.displayName}</b></td><td>{member.userId}</td><td>{assigned}</td><td className="amount">{money(total)}</td><td><span className={'status ' + (member.active ? 'active' : 'inactive')}>{member.active ? 'Active' : 'Disabled'}</span></td><td><div className="staff-actions"><button className="btn secondary compact" onClick={() => updateStaff(member, { active: !member.active })}>{member.active ? 'Disable' : 'Enable'}</button><button className="row-action" title="Change username" onClick={() => setEditStaffUserId(member)}><Pencil size={15} /></button><button className="row-action" title="Reset password" onClick={() => setResetStaff(member)}><LockKeyhole size={15} /></button><button className="row-action danger" title="Delete staff account" onClick={() => removeStaff(member)}><Trash2 size={15} /></button></div></td></tr>;
                })}
              </tbody></table></div>
              {!staff.length && <Empty icon={<UserRound />} title="No staff accounts yet" text="Create a staff account, then assign customers to that person from the customer form." action="Add staff member" onClick={() => setShowStaff(true)} />}
              <div className="staff-insight-grid">
                {staff.map(member => {
                  const assigned = customers.filter(c => c.assignedTo === member.id).length;
                  const total = payments.filter(p => p.recordedBy === member.id).reduce((sum, p) => sum + Number(p.amount || 0), 0);
                  return <div className={'staff-insight ' + (selectedStaffProfileId === member.id ? 'staff-insight-selected' : '')} key={member.id}><div className="staff-insight-head"><span className="avatar">{member.displayName.slice(0,2).toUpperCase()}</span><div><b>{member.displayName}</b><small>{member.userId}</small></div></div><div className="staff-insight-stats"><span><small>Assigned</small><b>{assigned}</b></span><span><small>Collected</small><b>{money(total)}</b></span></div><button className="btn secondary compact staff-profile-button" onClick={() => setSelectedStaffProfileId(member.id)}>View personal record <Eye size={13}/></button></div>;
                })}
              </div>
              {selectedStaffProfile && <section className="staff-personal-record">
                <div className="staff-record-heading"><div><span className="eyebrow">INDIVIDUAL STAFF FILE</span><h2>{selectedStaffProfile.displayName}</h2><p>{selectedStaffProfile.userId} · {selectedStaffProfile.active ? 'Active account' : 'Access disabled'}</p></div><button className="btn secondary compact" onClick={() => setSelectedStaffProfileId('')}>Close record</button></div>
                <div className="staff-record-metrics">
                  <article><small>Total collected</small><strong>{money(selectedStaffCollected)}</strong><span>{selectedStaffPayments.length} payment records</span></article>
                  <article><small>Attendance days</small><strong>{selectedStaffAttendanceEquivalent.toLocaleString('en-IN')}</strong><span>{selectedStaffAttendance.filter(record => !!record.checkOutAt).length} completed shifts</span></article>
                  <article><small>Assigned customers</small><strong>{customers.filter(customer => customer.assignedTo === selectedStaffProfile.id).length}</strong><span>Currently assigned</span></article>
                  <article><small>Assigned tasks</small><strong>{selectedStaffTasks.length}</strong><span>{selectedStaffTasks.filter(task => task.status === 'Completed').length} completed</span></article>
                </div>
                <div className="staff-record-columns">
                  <section className="staff-record-section"><div className="staff-record-section-head"><h3>Payment history</h3><span>{selectedStaffPayments.length} records</span></div>
                    {selectedStaffPayments.length ? <div className="table-wrap"><table><thead><tr><th>DATE</th><th>CUSTOMER</th><th>AMOUNT</th><th>METHOD</th><th>MONTH</th></tr></thead><tbody>{selectedStaffPayments.map(payment => <tr key={payment.id}><td>{dateLabel(payment.paidAt)}</td><td>{payment.customerName}</td><td className="amount">{money(payment.amount)}</td><td>{payment.method}</td><td>{payment.month}</td></tr>)}</tbody></table></div> : <p className="staff-record-empty">No payments have been recorded by this staff member yet.</p>}
                  </section>
                  <section className="staff-record-section"><div className="staff-record-section-head"><h3>Attendance history</h3><span>{selectedStaffAttendanceEquivalent.toLocaleString('en-IN')} day equivalents</span></div>
                    {selectedStaffAttendance.length ? <div className="table-wrap"><table><thead><tr><th>WORK DATE</th><th>CHECK IN</th><th>CHECK OUT</th><th>STATUS</th></tr></thead><tbody>{selectedStaffAttendance.map(record => <tr key={record.id}><td>{dateLabel(record.workDate)}</td><td>{dateLabel(record.checkInAt)} {record.checkInAt ? new Date(record.checkInAt).toLocaleTimeString('en-IN', {hour:'2-digit',minute:'2-digit'}) : ''}</td><td>{record.checkOutAt ? new Date(record.checkOutAt).toLocaleTimeString('en-IN', {hour:'2-digit',minute:'2-digit'}) : 'Not checked out'}</td><td><span className={'status ' + (record.checkOutAt ? 'active' : 'inactive')}>{record.dayType === 'Half day' ? 'Half day · ' : ''}{record.checkOutAt ? 'Completed' : 'Open shift'}</span></td></tr>)}</tbody></table></div> : <p className="staff-record-empty">No attendance records are available for this staff member.</p>}
                  </section>
                </div>
                <section className="staff-record-section staff-record-work"><div className="staff-record-section-head"><h3>Assigned customer list</h3><span>{customers.filter(customer => customer.assignedTo === selectedStaffProfile.id).length} customers</span></div>
                  {customers.filter(customer => customer.assignedTo === selectedStaffProfile.id).length ? <div className="staff-record-customer-list">{customers.filter(customer => customer.assignedTo === selectedStaffProfile.id).map(customer => <div key={customer.id}><b>{customer.name}</b><span>{customer.plan} · {customer.phone}</span><strong>{customer.status}</strong></div>)}</div> : <p className="staff-record-empty">No customers are assigned to this staff member.</p>}
                </section>
                <section className="staff-record-section staff-record-work"><div className="staff-record-section-head"><h3>Task progress</h3><span>{selectedStaffTasks.length} tasks</span></div>
                  {selectedStaffTasks.length ? <div className="staff-record-customer-list">{selectedStaffTasks.map(task => <div key={task.id}><b>{task.title}</b><span>{task.priority} priority · Due {dateLabel(task.dueDate)}</span><strong>{task.status}</strong></div>)}</div> : <p className="staff-record-empty">No tasks assigned to this staff member.</p>}
                </section>
              </section>}
            </section>
          )}

          {page === taskPage && (
            <section className="panel task-board">
              <div className="toolbar">
                <div>
                  <h2>{isAdmin ? 'Team task board' : 'My assigned work'}</h2>
                  <p className="subtle">{isAdmin ? 'Work assigned to staff members across the business.' : 'Update your task progress as work is completed.'}</p>
                </div>
                <span className="result-count">{tasks.length} tasks · {pendingTasks} pending</span>
              </div>
              {tasks.length ? <div className="task-list">{tasks.map(task => (
                <article className="task-card" key={task.id}>
                  <div className="task-card-main">
                    <div className="task-card-top"><span className={'priority ' + task.priority.toLowerCase()}>{task.priority} priority</span><span className={'task-state ' + task.status.toLowerCase().replace(/ /g, '-')}>{task.status}</span></div>
                    <h3>{task.title}</h3>
                    {task.details && <p>{task.details}</p>}
                    <div className="task-meta"><span><UserRound size={14}/>{isAdmin ? task.assignedToName : 'Assigned to you'}</span><span><CalendarDays size={14}/>Due {dateLabel(task.dueDate)}</span><span>Created by {task.createdByName}</span></div>
                  </div>
                  <label className="task-status-control"><span>Progress</span><select value={task.status} onChange={e => updateTask(task, e.target.value)}><option>Pending</option><option>In progress</option><option>Completed</option></select></label>
                </article>
              ))}</div> : <Empty icon={<ClipboardList />} title={isAdmin ? 'No tasks assigned yet' : 'No work assigned yet'} text={isAdmin ? 'Create a task and assign it to an active staff member.' : 'Your administrator will assign work here when it is ready.'} action={isAdmin ? 'Assign first task' : undefined} onClick={() => setShowTask(true)} />}
            </section>
          )}

          {page === 'Customers' && (
            <section className="panel table-panel">
              <div className="toolbar">
                <div className="searchbox">
                  <Search size={17} />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search name, phone, address or plan..."
                  />
                </div>
                <span className="result-count">
                  {filtered.length} customers
                </span>
              </div>
              <CustomerTable
                rows={filtered}
                onView={setSelected}
                onDelete={isAdmin ? removeCustomer : undefined}
                onEdit={c => {
                  setEditing(c);
                  setShowCustomer(true);
                }}
              />
              {!filtered.length && (
                <Empty
                  icon={<Users />}
                  title={
                    search ? 'No matching customers' : 'No customers added'
                  }
                  text={
                    search
                      ? 'Try another search term.'
                      : 'Add a customer to keep their connection and billing details organized.'
                  }
                  action={search || !isAdmin ? undefined : 'Add customer'}
                  onClick={() => setShowCustomer(true)}
                />
              )}
            </section>
          )}

          {page === 'Plans & Pricing' && (
            <section className="plan-manager">
              <div className="plan-toolbar">
                <div>
                  <h2>Internet plans</h2>
                  <p className="subtle">Create packages, update prices and manage which plans are available for new customers.</p>
                </div>
                <button className="btn primary" onClick={() => { setEditingPlan(null); setShowPlan(true); }}><Plus size={15} /> Add plan</button>
              </div>
              <div className="plan-controls">
                <div className="plan-search"><Search size={16} /><input value={planSearch} onChange={e => setPlanSearch(e.target.value)} placeholder="Search plan, provider or speed..." /></div>
                <div className="plan-filters">
                  {(['Active', 'Archived', 'All'] as const).map(filter => <button key={filter} className={planFilter === filter ? 'selected' : ''} onClick={() => setPlanFilter(filter)}>{filter}{filter === 'Active' ? ' · ' + plans.filter(plan => plan.active).length : filter === 'Archived' ? ' · ' + plans.filter(plan => !plan.active).length : ''}</button>)}
                </div>
              </div>
              <div className="plans-grid">
                {visiblePlans.map(p => (
                  <article className={'plan-card ' + (p.featured && p.active ? 'featured' : '')} key={p.id}>
                    {p.featured && p.active && <div className="popular">POPULAR</div>}
                    <div className="plan-card-top">
                      <div className="plan-icon"><Wifi size={20} /></div>
                      <span className={'plan-state ' + (p.active ? 'is-active' : 'is-archived')}>{p.active ? 'Active' : 'Archived'}</span>
                    </div>
                    <div className="plan-provider">{p.provider} · {p.connectionType}</div>
                    <h3>{p.name}</h3>
                    <p>{p.note || 'Internet package'}</p>
                    <div className="plan-price">{money(p.price)}<small>/ month</small></div>
                    <div className="plan-spec"><span>Speed</span><b>{p.speed}</b></div>
                    <div className="plan-spec"><span>Monthly data</span><b>{p.data}</b></div>
                    <div className="plan-card-actions">
                      <button className="btn secondary" disabled={!p.active} onClick={() => { setPreferredPlan(p.name); setEditing(null); setShowCustomer(true); }}>Add customer</button>
                      <button className="btn secondary" onClick={() => { setEditingPlan(p); setShowPlan(true); }}><Pencil size={13} /> Edit</button>
                      <button className="btn secondary" onClick={() => togglePlanStatus(p)}>{p.active ? 'Archive' : 'Restore'}</button>
                      {isAdmin && <button className="btn danger compact" onClick={() => deletePlan(p)}><Trash2 size={13} /> Delete</button>}
                    </div>
                  </article>
                ))}
              </div>
              {!visiblePlans.length && <Empty icon={<Wifi />} title="No plans found" text={planSearch ? 'Try another search or clear the search field.' : 'Add a plan or choose another filter to see your packages.'} action={planSearch ? 'Clear search' : 'Add plan'} onClick={() => planSearch ? setPlanSearch('') : (setEditingPlan(null), setShowPlan(true))} />}
            </section>
          )}

          {page === 'Payments' && (
            <section className="panel table-panel">
              <div className="toolbar">
                <div>
                  <h2>Payment history</h2>
                  <p className="subtle">All recorded customer collections</p>
                </div>
                <span className="result-count">{payments.length} records</span>
              </div>
              <PaymentTable rows={payments} />
              {!payments.length && (
                <Empty
                  icon={<CreditCard />}
                  title="No payments recorded"
                  text="Record a payment to start tracking collections."
                  action="Record payment"
                  onClick={() => setShowPayment(true)}
                />
              )}
            </section>
          )}

          {page === 'Complaints' && (
            <section className="panel table-panel">
              <div className="toolbar">
                <div>
                  <h2>Customer complaints</h2>
                  <p className="subtle">Monitor and update service requests</p>
                </div>
                <span className="result-count">
                  {complaints.length} records
                </span>
              </div>
              <div className="complaint-list">
                {complaints.map(c => (
                  <div className="complaint-row" key={c.id}>
                    <div className="complaint-symbol">
                      <MessageSquare size={18} />
                    </div>
                    <div className="complaint-info">
                      <strong>{c.subject}</strong>
                      <span>
                        {c.customerName || 'General complaint'} · {dateLabel(c.createdAt)}
                      </span>
                      <small>{c.details}</small>
                    </div>
                    <span className={'priority ' + c.priority.toLowerCase()}>
                      {c.priority}
                    </span>
                    {isAdmin ? <select aria-label="Complaint status" value={c.status} onChange={e => updateComplaint(c, e.target.value)}><option>Open</option><option>In progress</option><option>Resolved</option></select> : <span className="status inactive">{c.status}</span>}
                  </div>
                ))}
              </div>
              {!complaints.length && (
                <Empty
                  icon={<MessageSquare />}
                  title="No complaints"
                  text="New customer service requests will appear here."
                  action="New complaint"
                  onClick={() => setShowComplaint(true)}
                />
              )}
            </section>
          )}
          <footer>
            © {new Date().getFullYear()} K&B NET SERVICE <span>•</span> Customer
            Management
          </footer>
        </div>
      </main>

      {showCustomer && (
        <CustomerModal
          initial={editing}
          staff={staff}
          plans={plans}
          preferredPlan={preferredPlan}
          role={session.user.role}
          onClose={() => {
            setShowCustomer(false);
            setEditing(null);
            setPreferredPlan('');
          }}
          onSave={saveCustomer}
        />
      )}
      {showPlan && <PlanModal initial={editingPlan} onClose={() => { setShowPlan(false); setEditingPlan(null); }} onSave={savePlan} />}
      {showPayment && (
        <PaymentModal
          customers={customers}
          onClose={() => setShowPayment(false)}
          onSave={savePayment}
        />
      )}
      {showComplaint && (
        <ComplaintModal
          customers={customers}
          onClose={() => setShowComplaint(false)}
          onSave={saveComplaint}
        />
      )}
      {showStaff && <StaffModal onClose={() => setShowStaff(false)} onSave={createStaff} />}
      {showAccountSettings && <AccountSettingsModal session={session} onClose={() => setShowAccountSettings(false)} onChangeUserId={async (currentPassword, userId) => { await changeAppUserId(currentPassword, userId); onLogout(); }} onChangePassword={async (currentPassword, newPassword) => { await changeAppPassword(currentPassword, newPassword); onLogout(); }} />}
      {showTask && <TaskModal staff={staff.filter(member => member.active)} onClose={() => setShowTask(false)} onSave={saveTask} />}
      {editStaffUserId && <StaffUsernameModal staff={editStaffUserId} onClose={() => setEditStaffUserId(null)} onSave={userId => saveStaffUserId(editStaffUserId, userId)} />}
      {resetStaff && <StaffPasswordModal staff={resetStaff} onClose={() => setResetStaff(null)} onSave={password => saveStaffPassword(resetStaff, password)} />}
      {selected && (
        <div
          className="modal-backdrop"
          onMouseDown={e => {
            if (e.target === e.currentTarget) setSelected(null);
          }}
        >
          <div className="modal">
            <div className="modal-head">
              <div>
                <span className="eyebrow">CUSTOMER PROFILE</span>
                <h2>{selected.name}</h2>
              </div>
              <button className="icon-button" onClick={() => setSelected(null)}>
                <X />
              </button>
            </div>
            <div className="profile-status">
              <span className={'status ' + selected.status.toLowerCase()}>
                {selected.status}
              </span>
              <span>Customer since {dateLabel(selected.joinedAt)}</span>
            </div>
            <div className="profile-grid">
              <ProfileItem
                icon={<Phone />}
                label="Phone"
                value={selected.phone}
              />
              <ProfileItem
                icon={<MapPin />}
                label="Address"
                value={selected.address}
              />
              <ProfileItem
                icon={<Wifi />}
                label="Internet plan"
                value={selected.plan}
              />
              <ProfileItem
                icon={<IndianRupee />}
                label="Monthly fee"
                value={money(selected.monthlyFee)}
              />
              <ProfileItem
                icon={<CalendarDays />}
                label="Next due date"
                value={dateLabel(selected.dueDate)}              />
            </div>
            {selected.notes && (
              <div className="notes-box">
                <b>Notes</b>
                <p>{selected.notes}</p>
              </div>
            )}
            {selected.assignedToName && <div className="notes-box"><b>Assigned staff</b><p>{selected.assignedToName}</p></div>}
            <div className="modal-actions">
              <button
                className="btn secondary"
                onClick={() => {
                  setEditing(selected);
                  setSelected(null);
                  setShowCustomer(true);
                }}
              >
                <Pencil size={16} /> Edit details
              </button>
              <button className="btn danger" hidden={!isAdmin} onClick={() => removeCustomer(selected)}><Trash2 size={16} /> Delete</button>
            </div>
          </div>
        </div>
      )}
      {notice && (
        <div className="toast">
          <CheckCircle2 size={17} />
          {notice}
          <button onClick={() => setNotice('')}>
            <X size={15} />
          </button>
        </div>
      )}
      {loading && (
        <div className="loading-cover">
          <div className="loader" />
          <span>Loading your workspace…</span>
        </div>
      )}
    </div>
  );
}

function MonthlyChart({ title, subtitle, items, dateKey, valueKey, moneyValue, countOnly }: { title: string; subtitle: string; items: any[]; dateKey: string; valueKey?: string; moneyValue?: boolean; countOnly?: boolean }) {
  const now = new Date();
  const buckets = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    const key = date.getFullYear() + '-' + date.getMonth();
    const value = items.reduce((sum, item) => {
      const parsed = item[dateKey] ? new Date(item[dateKey]) : null;
      if (!parsed || Number.isNaN(parsed.getTime()) || parsed.getFullYear() + '-' + parsed.getMonth() !== key) return sum;
      return sum + (countOnly ? 1 : Number(item[valueKey || 'amount'] || 0));
    }, 0);
    return { label: date.toLocaleDateString('en-IN', { month: 'short' }), value };
  });
  const max = Math.max(1, ...buckets.map(item => item.value));
  return <section className="panel chart-panel"><div className="panel-head"><div><h2>{title}</h2><p>{subtitle}</p></div><span className="chart-mark"><BarChart3 size={17} /></span></div><div className="chart-bars">{buckets.map(item => <div className="chart-column" key={item.label}><b>{item.value ? (moneyValue ? money(item.value) : item.value.toLocaleString('en-IN')) : '—'}</b><div className="chart-track"><i style={{ height: (item.value ? Math.max(5, item.value / max * 100) : 2) + '%' }} /></div><small>{item.label}</small></div>)}</div></section>;
}
function StatusChart({ complaints }: { complaints: Complaint[] }) {
  const rows = [{ label: 'Open', count: complaints.filter(c => c.status === 'Open').length }, { label: 'In progress', count: complaints.filter(c => c.status === 'In progress').length }, { label: 'Resolved', count: complaints.filter(c => c.status === 'Resolved').length }];
  const max = Math.max(1, ...rows.map(row => row.count));
  return <section className="panel chart-panel"><div className="panel-head"><div><h2>Complaint status</h2><p>Current service request distribution</p></div><span className="chart-mark"><BarChart3 size={17} /></span></div><div className="status-chart">{rows.map(row => <div className="status-chart-row" key={row.label}><span>{row.label}</span><div><i style={{ width: (row.count / max * 100) + '%' }} /></div><b>{row.count}</b></div>)}</div></section>;
}
function OverduePanel({ value }: { value: number }) {
  return <section className="panel chart-panel"><div className="panel-head"><div><h2>Estimated overdue plan value</h2><p>Active accounts past their due date with no full payment recorded for this month</p></div><span className="chart-mark"><IndianRupee size={17} /></span></div><div className="overdue-value">{money(value)}</div><p className="overdue-note">Estimate only: accounts without a due date are excluded. Partial payments are deducted from the monthly fee.</p></section>;
}

function Stat({ icon, label, value, foot, tint }: any) {
  return (
    <div className="stat-card">
      <div className={'stat-icon ' + tint}>{icon}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-foot">{foot}</div>
    </div>
  );
}
function Empty({ icon, title, text, action, onClick }: any) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <strong>{title}</strong>
      <p>{text}</p>
      {action && (
        <button className="btn primary" onClick={onClick}>
          <Plus size={16} />
          {action}
        </button>
      )}
    </div>
  );
}
function CustomerTable({ rows, onView, onEdit, onDelete }: any) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>CUSTOMER</th>
            <th>PLAN</th>
            <th>MONTHLY FEE</th>
            <th>STATUS</th>
            <th>JOINED</th>
            <th>ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c: Customer) => (
            <tr key={c.id}>
              <td>
                <button className="customer-cell" onClick={() => onView(c)}>
                  <span className="avatar customer-avatar">
                    {c.name
                      .split(' ')
                      .map(s => s[0])
                      .slice(0, 2)
                      .join('')
                      .toUpperCase()}
                  </span>
                  <span>
                    <b>{c.name}</b>
                    <small>{c.phone}</small>
                  </span>
                </button>
              </td>
              <td>{c.plan}</td>
              <td className="amount">{money(c.monthlyFee)}</td>
              <td>
                <span className={'status ' + c.status.toLowerCase()}>
                  {c.status}
                </span>
              </td>
              <td>{dateLabel(c.joinedAt)}</td>
              <td>
                {onEdit && (
                  <button
                    className="row-action"
                    title="Edit customer"
                    onClick={() => onEdit(c)}
                  >
                    <Pencil size={15} />
                  </button>                  )}
                {onDelete && <button className="row-action danger" title="Delete customer" onClick={() => onDelete(c)}><Trash2 size={15} /></button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function PaymentTable({ rows }: any) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>CUSTOMER</th>
            <th>MONTH</th>
            <th>METHOD</th>
            <th>DATE</th>
            <th>AMOUNT</th>
            <th>STATUS</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p: Payment) => (
            <tr key={p.id}>
              <td>
                <b>{p.customerName}</b>
              </td>
              <td>{p.month}</td>
              <td>{p.method}</td>
              <td>{dateLabel(p.paidAt)}</td>
              <td className="amount">{money(p.amount)}</td>
              <td>
                <span className="status active">Paid</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function ProfileItem({ icon, label, value }: any) {
  return (
    <div className="profile-item">
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <b>{value || '—'}</b>
      </div>
    </div>
  );
}
function PlanModal({ initial, onClose, onSave }: { initial: Plan | null; onClose: () => void; onSave: (data: Omit<Plan, 'id'>) => Promise<void> }) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    provider: initial?.provider || 'RailWire',
    speed: initial?.speed || '',
    data: initial?.data || '',
    price: String(initial?.price ?? ''),
    note: initial?.note || '',
    connectionType: initial?.connectionType || 'Fiber',
    featured: initial?.featured ?? false,
    active: initial?.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    await onSave({ ...form, price: Number(form.price) });
    setBusy(false);
  }
  return (
    <Modal title={initial ? 'Edit internet plan' : 'Create internet plan'} subtitle="Set the package details and customer-facing monthly price." onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <Field label="Plan name"><input required maxLength={80} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Example: RailWire 75 Mbps" /></Field>
        <Field label="Provider / network"><input required maxLength={60} value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })} placeholder="RailWire, BSNL, Air Fibre..." /></Field>
        <Field label="Speed"><input required maxLength={40} value={form.speed} onChange={e => setForm({ ...form, speed: e.target.value })} placeholder="75 Mbps" /></Field>
        <Field label="Monthly data / FUP"><input required maxLength={40} value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} placeholder="2 TB" /></Field>
        <Field label="Monthly price (₹)"><input required type="number" min="0" max="1000000" step="1" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} /></Field>
        <Field label="Connection type"><select value={form.connectionType} onChange={e => setForm({ ...form, connectionType: e.target.value })}><option>Fiber</option><option>Air Fibre</option><option>Wireless</option><option>Cable</option><option>Other</option></select></Field>
        <Field label="Short description" wide><textarea rows={2} maxLength={180} value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="Who is this plan suitable for?" /></Field>
        <label className="plan-check"><input type="checkbox" checked={form.featured} onChange={e => setForm({ ...form, featured: e.target.checked })} /> Mark as popular plan</label>
        <div className="modal-actions"><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Saving...' : initial ? 'Save changes' : 'Create plan'}</button></div>
      </form>
    </Modal>
  );
}

function CustomerModal({ initial, onClose, onSave, staff = [], role = 'admin', plans = [], preferredPlan = '' }: any) {
  const [form, setForm] = useState<any>(
    initial || {
      name: '',
      phone: '',
      address: '',
      plan: preferredPlan || plans.find((item: Plan) => item.active)?.name || '',
      monthlyFee: plans.find((item: Plan) => item.name === (preferredPlan || plans.find((entry: Plan) => entry.active)?.name))?.price ?? 549,
      status: 'Active',
      joinedAt: new Date().toISOString().slice(0, 10),
      dueDate: '',
      notes: '',
      assignedTo: '',
    }
  );
  const [busy, setBusy] = useState(false);
  const planOptions = plans.filter((item: Plan) => item.active || item.name === form.plan);
  async function submit(e: any) {
    e.preventDefault();
    setBusy(true);
    await onSave({ ...form, monthlyFee: Number(form.monthlyFee) });
    setBusy(false);
  }
  return (
    <Modal
      title={initial ? 'Edit customer' : 'Add new customer'}
      subtitle="Enter the customer’s connection and contact details."
      onClose={onClose}
    >
      <form onSubmit={submit} className="form-grid">
        {role === 'staff' ? <>
          <Field label="Phone number"><input required value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Address" wide><textarea required rows={2} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></Field>
          <Field label="Notes" wide><textarea rows={3} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
        </> : <>
        <Field label="Customer name">
          <input
            required
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            placeholder="Full name"
          />
        </Field>
        <Field label="Phone number">
          <input
            required
            pattern="[0-9+ -]{8,16}"
            value={form.phone}
            onChange={e => setForm({ ...form, phone: e.target.value })}
            placeholder="Mobile number"
          />
        </Field>
        <Field label="Internet plan">
          <select
            value={form.plan}
            onChange={e => {
              const p = plans.find((x: Plan) => x.name === e.target.value);
              setForm({ ...form, plan: e.target.value, monthlyFee: p?.price ?? form.monthlyFee });
            }}
          >
            {planOptions.map((p: Plan) => <option key={p.id || p.name} value={p.name}>{p.name}{p.active ? '' : ' (Archived - existing customer)'}</option>)}
          </select>
        </Field>
        <Field label="Monthly fee (₹)">
          <input
            required
            type="number"
            min="0"
            value={form.monthlyFee}
            onChange={e => setForm({ ...form, monthlyFee: e.target.value })}
          />
        </Field>
        <Field label="Connection status">
          <select
            value={form.status}
            onChange={e => setForm({ ...form, status: e.target.value })}
          >
            <option>Active</option>
            <option>Inactive</option>
            <option>Suspended</option>
          </select>
        </Field>
        <Field label="Connection start date">
          <input
            type="date"
            value={form.joinedAt}
            onChange={e => setForm({ ...form, joinedAt: e.target.value })}
          />
        </Field>
        <Field label="Next due date">
          <input
            type="date"
            value={form.dueDate}
            onChange={e => setForm({ ...form, dueDate: e.target.value })}
          />
        </Field>
        <Field label="Address" wide>
          <textarea
            required
            rows={2}
            value={form.address}
            onChange={e => setForm({ ...form, address: e.target.value })}
            placeholder="Customer installation address"
          />
        </Field>
        <Field label="Notes (optional)" wide>
          <textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Additional connection notes" />
        </Field>
        <Field label="Assign to staff member" wide><select value={form.assignedTo || ''} onChange={e => { const member = staff.find((item: Staff) => item.id === e.target.value); setForm({ ...form, assignedTo: e.target.value, assignedToName: member?.displayName || '' }); }}><option value="">Unassigned</option>{staff.filter((member: Staff) => member.active).map((member: Staff) => <option value={member.id} key={member.id}>{member.displayName} · {member.userId}</option>)}</select></Field>
        </>}
        <div className="form-actions">
          <button type="button" className="btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? 'Saving…' : initial ? 'Save changes' : 'Add customer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function StaffModal({ onClose, onSave }: any) {
  const [form, setForm] = useState({ displayName: '', userId: '', password: '' });
  const [busy, setBusy] = useState(false);
  return <Modal title="Create staff account" subtitle="Give this team member a secure sign-in." onClose={onClose}><form className="form-grid" onSubmit={async e => { e.preventDefault(); setBusy(true); await onSave(form); setBusy(false); }}><Field label="Staff full name"><input required value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} /></Field><Field label="Staff user ID"><input required minLength={3} maxLength={32} pattern="[a-zA-Z0-9_-]{3,32}" value={form.userId} onChange={e => setForm({ ...form, userId: e.target.value })} /></Field><Field label="Temporary password" wide><input required type="password" minLength={10} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></Field><p className="form-hint">Use at least 10 characters and share it privately. Admin can reset it from Staff if needed.</p><div className="form-actions"><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button></div></form></Modal>;
}
function TaskModal({ staff, onClose, onSave }: any) {
  const [form, setForm] = useState({ title: '', details: '', assignedTo: staff[0]?.id || '', priority: 'Normal', dueDate: new Date().toISOString().slice(0, 10) });
  const [busy, setBusy] = useState(false);
  return <Modal title="Assign a task" subtitle="Create clear work for one staff member." onClose={onClose}><form className="form-grid" onSubmit={async e => { e.preventDefault(); setBusy(true); await onSave(form); setBusy(false); }}>
    <Field label="Task title" wide><input required maxLength={120} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Visit customer and check router" /></Field>
    <Field label="Assign to staff" wide><select required value={form.assignedTo} onChange={e => setForm({ ...form, assignedTo: e.target.value })}>{staff.map((member: Staff) => <option value={member.id} key={member.id}>{member.displayName} · {member.userId}</option>)}</select></Field>
    <Field label="Priority"><select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}><option>Low</option><option>Normal</option><option>High</option></select></Field>
    <Field label="Due date"><input type="date" required value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} /></Field>
    <Field label="Instructions" wide><textarea rows={3} maxLength={1000} value={form.details} onChange={e => setForm({ ...form, details: e.target.value })} placeholder="Add location, customer or work instructions" /></Field>
    {!staff.length && <p className="form-hint">Create an active staff account before assigning work.</p>}
    <div className="form-actions"><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !staff.length}>{busy ? 'Assigning…' : 'Assign task'}</button></div>
  </form></Modal>;
}
function AccountSettingsModal({ session, onClose, onChangeUserId, onChangePassword }: any) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newUserId, setNewUserId] = useState(session.user.userId);
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function submitUserId(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMessage('');
    try { await onChangeUserId(currentPassword, newUserId); }
    catch (err) { setMessage(err instanceof Error ? err.message : 'Could not change user ID.'); setBusy(false); }
  }
  async function submitPassword(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMessage('');
    try { await onChangePassword(currentPassword, newPassword); }
    catch (err) { setMessage(err instanceof Error ? err.message : 'Could not change password.'); setBusy(false); }
  }
  return <Modal title="My account" subtitle={'Signed in as ' + session.user.displayName + ' · ' + session.user.role} onClose={onClose}>
    <div className="form-grid">
      <form className="form-grid" onSubmit={submitUserId}>
        <Field label="Current password"><input type="password" required value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} autoComplete="current-password" /></Field>
        <Field label="New user ID"><input required minLength={3} maxLength={32} pattern="[a-zA-Z0-9_-]{3,32}" value={newUserId} onChange={e => setNewUserId(e.target.value)} /></Field>
        <div className="form-actions"><button className="btn primary" disabled={busy || newUserId.trim().toLowerCase() === session.user.userId.toLowerCase()}>{busy ? 'Saving…' : 'Change username'}</button></div>
      </form>
      <div className="form-hint">Changing your username signs you out. Sign in again with the new ID.</div>
      <form className="form-grid" onSubmit={submitPassword}>
        <Field label="New password"><input type="password" required minLength={10} value={newPassword} onChange={e => setNewPassword(e.target.value)} autoComplete="new-password" /></Field>
        {message && <div className="auth-message">{message}</div>}
        <div className="form-actions"><button className="btn primary" disabled={busy || !newPassword}>{busy ? 'Saving…' : 'Change password'}</button><button type="button" className="btn secondary" onClick={onClose}>Close</button></div>
      </form>
    </div>
  </Modal>;
}
function StaffUsernameModal({ staff, onClose, onSave }: any) {
  const [userId, setUserId] = useState(staff.userId);
  const [busy, setBusy] = useState(false);
  return <Modal title={'Change username · ' + staff.displayName} subtitle="The staff member must use the new ID at their next sign-in." onClose={onClose}><form className="form-grid" onSubmit={async e => { e.preventDefault(); setBusy(true); await onSave(userId.trim()); setBusy(false); }}><Field label="New staff user ID"><input required minLength={3} maxLength={32} pattern="[a-zA-Z0-9_-]{3,32}" value={userId} onChange={e => setUserId(e.target.value)} /></Field><div className="form-actions"><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || userId.trim().toLowerCase() === staff.userId.toLowerCase()}>{busy ? 'Saving…' : 'Save username'}</button></div></form></Modal>;
}
function StaffPasswordModal({ staff, onClose, onSave }: any) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  return <Modal title={'Reset password · ' + staff.displayName} subtitle="The staff member will need to sign in again." onClose={onClose}><form className="form-grid" onSubmit={async e => { e.preventDefault(); setBusy(true); await onSave(password); setBusy(false); }}><Field label="New temporary password" wide><input type="password" required minLength={10} value={password} onChange={e => setPassword(e.target.value)} /></Field><div className="form-actions"><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Reset password'}</button></div></form></Modal>;
}
function PaymentModal({ customers, onClose, onSave }: any) {
  const [f, s] = useState<any>({
    customerId: customers[0]?.id || '',
    amount: customers[0]?.monthlyFee || 0,
    method: 'UPI',
    month: new Date().toLocaleString('en-IN', {
      month: 'long',
      year: 'numeric',
    }),
    paidAt: new Date().toISOString().slice(0, 10),
  });
  const c = customers.find((x: Customer) => x.id === f.customerId);
  return (
    <Modal
      title="Record payment"
      subtitle="Add a payment to the customer's collection history."
      onClose={onClose}
    >
      <form
        className="form-grid"
        onSubmit={e => {
          e.preventDefault();
          onSave({
            ...f,
            amount: Number(f.amount),
            customerName: c?.name || '',
          });
        }}
      >
        <Field label="Customer" wide>
          <select
            required
            value={f.customerId}
            onChange={e => {
              const x = customers.find(
                (c: Customer) => c.id === e.target.value
              );
              s({
                ...f,
                customerId: e.target.value,
                amount: x?.monthlyFee || 0,
              });
            }}
          >
            {customers.map((c: Customer) => (
              <option value={c.id} key={c.id}>
                {c.name} · {c.phone}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Amount (₹)">
          <input
            type="number"
            min="1"
            required
            value={f.amount}
            onChange={e => s({ ...f, amount: e.target.value })}
          />
        </Field>
        <Field label="Payment method">
          <select
            value={f.method}
            onChange={e => s({ ...f, method: e.target.value })}
          >
            <option>UPI</option>
            <option>Cash</option>
            <option>Bank transfer</option>
            <option>Other</option>
          </select>
        </Field>
        <Field label="Billing month">
          <input
            required
            value={f.month}
            onChange={e => s({ ...f, month: e.target.value })}
          />
        </Field>
        <Field label="Payment date">
          <input
            type="date"
            required
            value={f.paidAt}
            onChange={e => s({ ...f, paidAt: e.target.value })}
          />
        </Field>
        <div className="form-actions">
          <button type="button" className="btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!customers.length}>
            Save payment
          </button>
        </div>
      </form>
      {!customers.length && (
        <p className="form-hint">Add a customer before recording a payment.</p>
      )}
    </Modal>
  );
}
function ComplaintModal({ customers, onClose, onSave }: any) {
  const [f, s] = useState<any>({
    customerId: '',
    subject: '',
    details: '',
    priority: 'Normal',
    status: 'Open',
    createdAt: new Date().toISOString().slice(0, 10),
  });
  const c = customers.find((x: Customer) => x.id === f.customerId);
  return (
    <Modal
      title="New complaint"
      subtitle="Log a service issue for a customer."
      onClose={onClose}
    >
      <form
        className="form-grid"
        onSubmit={e => {
          e.preventDefault();
          onSave({ ...f, customerId: f.customerId || undefined, customerName: c?.name || '' });        }}
      >
        <Field label="Customer (optional)" wide>
          <select
            value={f.customerId}
            onChange={e => s({ ...f, customerId: e.target.value })}
          >
            <option value="">No specific customer / General complaint</option>
            {customers.map((c: Customer) => (
              <option value={c.id} key={c.id}>
                {c.name} · {c.phone}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Issue / subject" wide>
          <input
            required
            value={f.subject}
            onChange={e => s({ ...f, subject: e.target.value })}
            placeholder="e.g. Internet connection not working"
          />
        </Field>
        <Field label="Priority">
          <select
            value={f.priority}
            onChange={e => s({ ...f, priority: e.target.value })}
          >
            <option>Low</option>
            <option>Normal</option>
            <option>High</option>
          </select>
        </Field>
        <Field label="Date">
          <input
            type="date"
            value={f.createdAt}
            onChange={e => s({ ...f, createdAt: e.target.value })}
          />
        </Field>
        <Field label="Details" wide>
          <textarea
            rows={3}
            value={f.details}
            onChange={e => s({ ...f, details: e.target.value })}
            placeholder="Describe the issue"
          />
        </Field>
        <div className="form-actions">
          <button type="button" className="btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary">
            Create complaint
          </button>
        </div>
      </form>
      <p className="form-hint">You can log a general complaint without linking a customer, or select a customer if relevant.</p>
    </Modal>
  );
}
function Field({ label, children, wide }: any) {
  return (
    <label className={'field ' + (wide ? 'wide' : '')}>
      <span>{label}</span>
      {children}
    </label>
  );
}
function Modal({ title, subtitle, onClose, children }: any) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal">
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <X />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function App(){
 const [session,setSession]=useState<Session|null>(null);const [checking,setChecking]=useState(true);
 useEffect(()=>{let live=true;async function restore(){const raw=localStorage.getItem('kb-customer-session');if(!raw){setChecking(false);return;}try{const old=JSON.parse(raw) as Session;const r=await client.get('/api/auth/me?sessionToken='+encodeURIComponent(old.token));if(live)setSession({...old,user:r.data.user});}catch{localStorage.removeItem('kb-customer-session');}finally{if(live)setChecking(false);}}restore();return()=>{live=false;};},[]);
 async function login(userId:string,password:string,expectedRole:'admin'|'staff'){const next=await signInAppUser(userId,password) as Session;if(next.user.role!==expectedRole){await signOutAppUser();throw new Error(expectedRole==='admin'?'This account is not an admin account. Choose Staff Sign In instead.':'This account is not a staff account. Choose Admin Sign In instead.');}localStorage.setItem('kb-customer-session',JSON.stringify(next));setSession(next);}
 if(checking)return <div className="loading-cover"><div className="loader"/><span>Preparing secure sign-in…</span></div>;
 return session?<Workspace session={session} onLogout={()=>{signOutAppUser().catch(()=>undefined);localStorage.removeItem('kb-customer-session');setSession(null);}}/>:<LoginScreen onLogin={login}/>;
}
function LoginScreen({onLogin}:{onLogin:(id:string,pw:string,role:'admin'|'staff')=>Promise<void>}){
 const [role,setRole]=useState<'admin'|'staff'|null>(null);
 const [id,setId]=useState(''),[pw,setPw]=useState(''),[msg,setMsg]=useState('');
 const [registrationOpen,setRegistrationOpen]=useState(false);
 const [registration,setRegistration]=useState({userId:'',displayName:'',phone:'',reason:''});
 const [registrationBusy,setRegistrationBusy]=useState(false);
 const [registrationMessage,setRegistrationMessage]=useState('');
 const [registrationError,setRegistrationError]=useState(false);
 const [registrationStatus,setRegistrationStatus]=useState<{status:'pending'|'approved'|'rejected';createdAt:string;reviewedAt?:string|null;reviewedByName?:string|null}|null>(null);
 useEffect(()=>{let stopped=false;let saved:{id:string;trackingCode:string}|null=null;try{const raw=localStorage.getItem('kandb-staff-registration');if(raw)saved=JSON.parse(raw) as {id:string;trackingCode:string};}catch{localStorage.removeItem('kandb-staff-registration');}if(!saved)return;const poll=()=>getStaffRegistrationStatus(saved!.id,saved!.trackingCode).then(result=>{if(!stopped)setRegistrationStatus(result);}).catch(()=>{if(!stopped){localStorage.removeItem('kandb-staff-registration');setRegistrationStatus(null);}});void poll();const timer=window.setInterval(poll,20000);return()=>{stopped=true;window.clearInterval(timer);};},[]);
 function choose(nextRole:'admin'|'staff'){setRole(nextRole);setId(nextRole==='admin'?'Brajraj':'');setPw('');setMsg('');}
 async function submit(e:FormEvent){e.preventDefault();setMsg('');try{if(role)await onLogin(id,pw,role);}catch(err){setMsg(err instanceof Error?err.message:'Sign-in failed.');}}
 async function submitRegistration(){setRegistrationBusy(true);setRegistrationMessage('');setRegistrationError(false);try{const result=await submitStaffRegistrationRequest(registration);localStorage.setItem('kandb-staff-registration',JSON.stringify({id:result.id,trackingCode:result.trackingCode}));setRegistrationStatus({status:'pending',createdAt:new Date().toISOString()});setRegistrationMessage(result.message);setRegistrationOpen(false);setRegistration({userId:'',displayName:'',phone:'',reason:''});}catch(err){setRegistrationMessage(err instanceof Error?err.message:'Could not submit your request.');setRegistrationError(true);}finally{setRegistrationBusy(false);}}
 return <div className="auth-shell"><div className="auth-side"><div className="auth-brand"><div className="brand-mark"><Signal/></div><strong>K&B NET SERVICE</strong></div><div className="auth-promo"><span className="auth-kicker">K&B OPERATIONS</span><h1>Every customer connection, in view.</h1><p>Customer records, staff assignments, collections and service requests in one shared workspace.</p></div></div><div className="auth-main"><form className="auth-card" onSubmit={submit}><div className="auth-icon">{role==='staff'?<UserRound/>:<ShieldCheck/>}</div><span className="eyebrow">SECURE SIGN IN</span><h2>{role?(role==='admin'?'Admin sign in':'Staff sign in'):'Welcome to K&B'}</h2><p>{role?'Enter your '+role+' account details to continue.':'Choose how you want to sign in.'}</p>
 {!role?<><div className="login-role-options"><button type="button" className="login-role-card admin-choice" onClick={()=>choose('admin')}><span className="login-role-icon"><ShieldCheck size={22}/></span><strong>Admin Sign In</strong><small>Manage customers, staff, plans and reports</small><span className="login-role-arrow">Continue →</span></button><button type="button" className="login-role-card staff-choice" onClick={()=>choose('staff')}><span className="login-role-icon"><UserRound size={22}/></span><strong>Staff Sign In</strong><small>View assigned customers and manage daily work</small><span className="login-role-arrow">Continue →</span></button></div>
 {registrationStatus ? <div className="registration-status">
  <div className="registration-status-steps"><span className="done">Submitted</span><span className={registrationStatus.status==='pending'?'current':'done'}>Admin review</span><span className={registrationStatus.status==='approved'?'done':registrationStatus.status==='rejected'?'rejected':''}>{registrationStatus.status==='rejected'?'Rejected':'Approved'}</span></div>
  <strong>{registrationStatus.status==='pending'?'Your request is awaiting admin approval.':registrationStatus.status==='approved'?'Your staff access is approved.':'Your staff access request was rejected.'}</strong>
  <small>Request submitted {new Date(registrationStatus.createdAt).toLocaleString('en-IN')}{registrationStatus.reviewedAt?' · Reviewed '+new Date(registrationStatus.reviewedAt).toLocaleString('en-IN'):''}</small>
  {registrationStatus.status==='rejected' && <button type="button" className="auth-link" onClick={()=>{localStorage.removeItem('kandb-staff-registration');setRegistrationStatus(null);setRegistrationOpen(true);}}>Submit a new request</button>}
 </div> : !registrationOpen?<button type="button" className="auth-link" onClick={()=>{setRegistrationOpen(true);setRegistrationMessage('');}}>Request staff access</button>:<div className="staff-registration-form"><strong>Staff registration request</strong><Field label="Preferred staff ID"><input required minLength={3} maxLength={32} pattern="[a-zA-Z0-9_-]{3,32}" value={registration.userId} onChange={e=>setRegistration({...registration,userId:e.target.value})}/></Field><Field label="Full name"><input required maxLength={80} value={registration.displayName} onChange={e=>setRegistration({...registration,displayName:e.target.value})}/></Field><Field label="Phone (optional)"><input maxLength={30} value={registration.phone} onChange={e=>setRegistration({...registration,phone:e.target.value})}/></Field><Field label="Reason / note (optional)"><textarea rows={2} maxLength={300} value={registration.reason} onChange={e=>setRegistration({...registration,reason:e.target.value})}/></Field><div className="form-actions"><button type="button" className="btn secondary" onClick={()=>setRegistrationOpen(false)}>Cancel</button><button type="button" className="btn primary" disabled={registrationBusy} onClick={e=>{const form=e.currentTarget.closest('.staff-registration-form');const fields=form?.querySelectorAll('input');if(fields && Array.from(fields).every(field=>field.reportValidity()))void submitRegistration();}}>{registrationBusy?'Submitting…':'Submit request'}</button></div></div>}
 {registrationMessage&&<div className={registrationError?'auth-message':'form-hint'}>{registrationMessage}</div>}</>:<>
 <label className="auth-field"><span>{role==='admin'?'Admin user ID':'Staff user ID'}</span><input value={id} onChange={e=>setId(e.target.value)} required autoComplete="username"/></label><label className="auth-field"><span>Password</span><input type="password" value={pw} onChange={e=>setPw(e.target.value)} required autoComplete="current-password"/></label>
 {msg&&<div className="auth-message">{msg}</div>}<button className="btn primary auth-submit">Sign in securely</button><button type="button" className="auth-link" onClick={()=>{setRole(null);setId('');setPw('');setMsg('');}}>← Choose another sign-in</button>
 </>}
 <div className="auth-security"><KeyRound size={14}/> Keep your password private. Access is based on your account role.</div></form></div></div>;
}
export default App;
