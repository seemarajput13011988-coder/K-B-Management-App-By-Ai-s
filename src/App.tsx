import { Component, useEffect, useMemo, useRef, useState } from 'react';
import type { ErrorInfo, FormEvent, ReactNode } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';

import { Filesystem } from '@capacitor/filesystem';
import { Camera } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';
import { LocalNotifications } from '@capacitor/local-notifications';
import StaffOperations from './StaffOperations';
import FinanceWorkspace from './FinanceWorkspace';
import SubscriptionWorkspace from './SubscriptionWorkspace';
import InvoiceWorkspace from './InvoiceWorkspace';
import InventoryWorkspace from './InventoryWorkspace';
import GpsTrackingWorkspace from './GpsTrackingWorkspace';
import InstallationsWorkspace from './InstallationsWorkspace';
import CalendarWorkspace from './CalendarWorkspace';
import { useAppPreferences } from './appPreferences';
import { api as client, changeAppPassword, changeAppUserId, signInAppUser, signOutAppUser, submitStaffRegistrationRequest, getStaffRegistrationStatus, nativeApiPost } from './lib/api';
import {
  Activity,
  Bell,
  ChevronDown,
  CircleHelp,
  CreditCard,
  IndianRupee,
  LayoutDashboard,
  Menu,
  MessageSquare,
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
  Clock3,
  CheckCircle2,
  ClipboardList,
  Pencil,
  Trash2,
  Eye,
  ShieldCheck, KeyRound, BarChart3, LogOut, UserPlus, UserRound, LockKeyhole, ReceiptText,
} from 'lucide-react';

type Session={token:string;expiresAt:number;user:{id:string;userId:string;displayName:string;role:'admin'|'staff';active:boolean;canManageAdmins?:boolean}};
type AppNotification={id:string;title:string;message:string;createdAt:string;read:boolean;type:string};
type RetentionReviewItem={id:string;collection:string;collectionLabel:string;recordLabel:string;createdAt:string};
type StaffRegistrationRequest={id:string;userId:string;displayName:string;phone?:string;reason?:string;status:'pending'|'approved'|'rejected';createdAt:string;reviewedAt?:string;};
type StaffHolidayRequest={id:string;userId:string;displayName:string;startDate:string;endDate:string;reason:string;status:'pending'|'approved'|'rejected';createdAt:string;reviewedAt?:string;reviewedByName?:string};
const getToken=()=>{try{return (JSON.parse(sessionStorage.getItem('kb-customer-session')||'null') as Session|null)?.token||'';}catch{return '';}};
const api={get:(url:string)=>client.get(url+(url.includes('?')?'&':'?')+'sessionToken='+encodeURIComponent(getToken())),post:(url:string,data?:Record<string,unknown>)=>client.post(url,{...(data||{}),sessionToken:getToken()}),put:(url:string,data?:Record<string,unknown>)=>client.put(url,{...(data||{}),sessionToken:getToken()}),delete:(url:string)=>client.delete(url+'?sessionToken='+encodeURIComponent(getToken()))};
interface WorkLocationTrackingPlugin { startTracking(options: { token: string; apiBaseUrl: string }): Promise<{ started: boolean }>; stopTracking(): Promise<{ stopped: boolean }>; }
const WorkLocationTracking = registerPlugin<WorkLocationTrackingPlugin>('WorkLocationTracking');
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
type Staff = { id: string; userId: string; displayName: string; role: 'staff'; active: boolean; phone?: string; createdAt?: string };
type AdminAccount = { id: string; userId: string; displayName: string; role: 'admin'; active: boolean; canManageAdmins?: boolean; isSuperAdmin?: boolean };
type AttendanceRecord = { id: string; userId: string; displayName: string; workDate: string; checkInAt: string; checkOutAt?: string; dayType?: 'Full day' | 'Half day' | 'Absent'; status?: string; correctionReason?: string; correctedAt?: string; correctedByName?: string; startedByAdmin?: string; endedByAdminName?: string; endedByName?: string; attendanceSource?: string; absenceReason?: string };
type Task = { id: string; title: string; details: string; assignedTo: string; assignedToName: string; priority: 'Low' | 'Normal' | 'High'; dueDate: string; status: 'Pending' | 'In progress' | 'Completed'; createdAt: string; createdByName: string; updatedAt?: string; completedAt?: string; attachments?: Array<{mediaId:string;fileName:string;mimeType:string;size:number}> };
type Complaint = {
  id: string;
  complaintFor: 'Customer' | 'Staff';
  customerId?: string;
  customerName?: string;
  staffId?: string;
  staffName?: string;
  subject: string;
  details: string;
  priority: string;
  status: 'Pending' | 'Assigned' | 'In Progress' | 'Solved' | 'Not Solved' | string;
  createdAt: string;
  createdByName?: string;
  assignedTo?: string;
  assignedToName?: string;
  locationText?: string;
  latitude?: number;
  longitude?: number;
  resolvedByName?: string;
  resolvedAt?: string;
  resolutionDetails?: string;
  attachments?: Array<{mediaId:string;fileName:string;mimeType:string;size:number}>;
};
type Plan = {
  id: string;
  name: string;
  provider: string;
  speed: string;
  data: string;
  price: number;
  note: string;
  details?: string;
  connectionType: string;
  featured: boolean;
  active: boolean;
};

const money = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN');
const customerStatusLabel = (value: unknown): Customer['status'] => { const status = String(value || 'Active').trim().toLowerCase(); return status === 'suspended' ? 'Suspended' : status === 'inactive' ? 'Inactive' : 'Active'; };
const dateLabel = (s: string) =>
  s
    ? new Date(s).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—';
const fileAsBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const value = String(reader.result || '');
    const comma = value.indexOf(',');
    if (comma < 0) reject(new Error('Could not read the selected attachment.'));
    else resolve(value.slice(comma + 1));
  };
  reader.onerror = () => reject(new Error('Could not read the selected attachment.'));
  reader.readAsDataURL(file);
});

function Workspace({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const isAdmin = session.user.role === 'admin';
  const canManageAdmins = session.user.canManageAdmins === true;
  const { language, setLanguage, theme, toggleTheme } = useAppPreferences();
  const [localHour, setLocalHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const timer = window.setInterval(() => setLocalHour(new Date().getHours()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    let active = true;
    if (session.user.role !== 'staff' || !Capacitor.isNativePlatform()) return;
    if (localStorage.getItem('kb-staff-permissions-v1') === 'done') return;
    // A permission already granted in Android settings should be reused silently.
    Geolocation.checkPermissions().then(permission => {
      if (!active) return;
      if (permission.location === 'granted') {
        localStorage.setItem('kb-staff-permissions-v1', 'done');
        setPermissionSetupOpen(false);
      } else {
        setPermissionSetupOpen(true);
      }
    }).catch(() => {
      if (active) setPermissionSetupOpen(true);
    });
    return () => { active = false; };
  }, [session.user.id, session.user.role]);
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
  const [staffRegistrationRequests,setStaffRegistrationRequests]=useState<StaffRegistrationRequest[]>([]);
  const [staffHolidayRequests,setStaffHolidayRequests]=useState<StaffHolidayRequest[]>([]);
  const [staffInventory,setStaffInventory]=useState<any[]>([]);
  const [staffInstallations,setStaffInstallations]=useState<any[]>([]);
  const [staffPayroll,setStaffPayroll]=useState<any[]>([]);
  const [staffRequestPasswords,setStaffRequestPasswords]=useState<Record<string,string>>({});
  const [adminAccounts, setAdminAccounts] = useState<AdminAccount[]>([]);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [selectedStaffProfileId, setSelectedStaffProfileId] = useState('');
  const [attendanceEdit,setAttendanceEdit]=useState<{record:AttendanceRecord;dayType:'Full day'|'Half day'|'Absent';reason:string}|null>(null);
  const [showTask, setShowTask] = useState(false);
  const [permissionSetupOpen, setPermissionSetupOpen] = useState(false);
  const [completingTask, setCompletingTask] = useState<Task | null>(null);
  const [taskPreview, setTaskPreview] = useState<{name:string;mimeType:string;dataUrl:string}|null>(null);
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
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [paymentSearch, setPaymentSearch] = useState('');
  const [staffSearch, setStaffSearch] = useState('');
  const [showComplaint, setShowComplaint] = useState(false);
  const [complaintPreview, setComplaintPreview] = useState<{name:string;mimeType:string;dataUrl:string}|null>(null);
  const [notice, setNotice] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [retentionItems, setRetentionItems] = useState<RetentionReviewItem[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationAnchorRef = useRef<HTMLDivElement | null>(null);
  const pushToken = useRef<string | null>(null);
  const seenNotifications = useRef<Set<string> | null>(null);

  useEffect(() => {
    const root = document.querySelector('.content');
    if (!root) return;
    const labelTables = () => {
      root.querySelectorAll('table').forEach(table => {
        const headerRow = table.querySelector<HTMLTableRowElement>('thead tr');
        const headers = headerRow ? Array.from(headerRow.cells).map(cell => (cell.textContent || '').trim()) : [];
        table.querySelectorAll<HTMLTableRowElement>('tbody tr').forEach(row => {
          Array.from(row.cells).forEach((cell, index) => {
            const label = headers[index] || (index === row.cells.length - 1 ? 'Actions' : 'Details');
            if (cell.dataset.label !== label) cell.dataset.label = label;
          });
        });
      });
    };
    labelTables();
    const observer = new MutationObserver(labelTables);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

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

  async function load(silent = false) {
    if (!silent) setLoading(true);
    try {
      const [c, p, t, w, a, planResult] = await Promise.all([
        api.get('/api/customers'),
        api.get('/api/payments'),
        api.get('/api/complaints'),
        api.get('/api/tasks'),
        api.get('/api/attendance'),
        api.get('/api/plans'),
      ]);
      setCustomers((c.data.items || []).map((item: Customer) => ({ ...item, status: customerStatusLabel(item.status) })));
      setPlans(planResult.data.items || []);
      setPayments(p.data.items || []);
      setAttendanceRecords(a.data.items || []);
      setComplaints((t.data.items || []).map((item: Complaint) => ({ ...item, status: item.status === 'Open' ? 'Pending' : item.status === 'In progress' ? 'In Progress' : item.status === 'Resolved' ? 'Solved' : item.status })));
      setTasks(w.data.items || []);
      if (isAdmin) {
        const [s, requests, inventoryResult, installationResult, payrollResult, holidayResult] = await Promise.all([api.get('/api/staff'),api.get('/api/staff-registration-requests'),api.get('/api/inventory'),api.get('/api/installations'),api.get('/api/payroll'),api.get('/api/holidays')]);
        setStaff(s.data.items || []);
        setStaffRegistrationRequests(requests.data.items || []);
        setStaffHolidayRequests(holidayResult.data.items || []);
        setStaffInventory(inventoryResult.data.items || []);
        setStaffInstallations(installationResult.data.items || []);
        setStaffPayroll(payrollResult.data.items || []);
        try {
          const review = await api.get('/api/retention/review');
          setRetentionItems((review.data.items || []) as RetentionReviewItem[]);
        } catch {
          setRetentionItems([]);
        }
      }
      if (canManageAdmins) {
        const adminsResult = await api.get('/api/admins');
        setAdminAccounts(adminsResult.data.items || []);
      }
    } catch (e) {
      setNotice('Could not load records. Please refresh and try again.');
    } finally {
      if (!silent) setLoading(false);
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
    if (!notificationsOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!notificationAnchorRef.current?.contains(event.target as Node)) setNotificationsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setNotificationsOpen(false); };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [notificationsOpen]);

  // Native push registration is intentionally disabled until Firebase Android configuration is added.
  // In-app notification polling and local notifications remain active; this avoids a native Firebase crash on sign-in.


  const active = customers.filter(c => c.status === 'Active').length;
  const collected = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const pending = customers
    .filter(c => c.status === 'Active')
    .reduce((sum, c) => sum + Number(c.monthlyFee || 0), 0);
  const openComplaints = complaints.filter(c => !['Solved', 'Resolved'].includes(c.status)).length;
  const pendingTasks = tasks.filter(task => task.status !== 'Completed').length;
  const currentBillingMonth = new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  const paidByCustomer = new Map<string, number>();
  payments.filter(p => p.month === currentBillingMonth).forEach(p => paidByCustomer.set(p.customerId, (paidByCustomer.get(p.customerId) || 0) + Number(p.amount || 0)));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const staffShiftActive = attendanceRecords.some(item => item.userId === session.user.id && item.workDate === today && !item.checkOutAt && item.dayType !== 'Absent');
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
  const filteredStaff = staff.filter(member => [member.displayName, member.userId].join(' ').toLowerCase().includes(staffSearch.toLowerCase()));
  const filteredPayments = payments.filter(payment => [payment.customerName, payment.month, payment.method, payment.paidAt, payment.recordedByName || ''].join(' ').toLowerCase().includes(paymentSearch.toLowerCase()));
  const selectedStaffPayments = payments.filter(payment => payment.recordedBy === selectedStaffProfileId).sort((a, b) => b.paidAt.localeCompare(a.paidAt));
  const selectedStaffAttendance = attendanceRecords.filter(record => record.userId === selectedStaffProfileId).sort((a, b) => b.workDate.localeCompare(a.workDate));
  const selectedStaffAttendanceEquivalent = selectedStaffAttendance.filter(record => record.dayType !== 'Absent' && String(record.status || '').toLowerCase() !== 'absent').reduce((sum, record) => sum + (record.dayType === 'Half day' ? 0.5 : 1), 0);
  const selectedStaffFullDays=selectedStaffAttendance.filter(record=>(record.dayType||'Full day')==='Full day'&&String(record.status||'').toLowerCase()!=='absent').length;
  const selectedStaffHalfDays=selectedStaffAttendance.filter(record=>record.dayType==='Half day').length;
  const selectedStaffAbsentDays=selectedStaffAttendance.filter(record=>record.dayType==='Absent'||String(record.status||'').toLowerCase()==='absent').length;
  const selectedStaffTasks = tasks.filter(task => task.assignedTo === selectedStaffProfileId);
  const selectedStaffInventory=staffInventory.filter(item=>item.assignedTo===selectedStaffProfileId);
  const selectedStaffInstallations=staffInstallations.filter(item=>item.assignedTo===selectedStaffProfileId);
  const selectedStaffPayroll=staffPayroll.filter(item=>item.staffUserId===selectedStaffProfileId).sort((a,b)=>String(b.paidAt||'').localeCompare(String(a.paidAt||'')));
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


  async function deleteNotification(item: AppNotification) {
    if (!window.confirm('Delete this notification?')) return;
    try {
      await api.delete('/api/notifications/' + item.id);
      setNotifications(current => current.filter(entry => entry.id !== item.id));
      flash('Notification deleted.');
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Could not delete notification.');
    }
  }

  async function markNotificationsRead() {
    const unread = notifications.filter(item => !item.read);
    await Promise.all(unread.map(item => api.put('/api/notifications/' + item.id, { read: true }).catch(() => undefined)));
    setNotifications(current => current.map(item => ({ ...item, read: true })));
  }
  function signOut() {
    // End the local session immediately; remote cleanup must never block the logout button.
    if (pushToken.current) {
      const token = pushToken.current;
      pushToken.current = null;
      void api.post('/api/push-tokens', { token, action: 'unregister' }).catch(() => undefined);
    }
    void api.post('/api/auth/logout').catch(() => undefined);
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
  async function createAdmin(data: { userId: string; displayName: string; password: string }) {
    try {
      await api.post('/api/admins', data);
      setShowAdminModal(false);
      await load();
      flash('Admin account created successfully');
    } catch (err) {
      const message = (err as any)?.response?.data?.error || (err instanceof Error ? err.message : 'Could not create admin account');
      flash(message);
      throw new Error(message);
    }
  }
  async function saveStaffAttendanceCorrection(event:FormEvent) {
    event.preventDefault();
    if(!attendanceEdit||!attendanceEdit.reason.trim())return;
    try{
      await api.put('/api/attendance/'+attendanceEdit.record.id+'/day-type',{dayType:attendanceEdit.dayType,reason:attendanceEdit.reason});
      setAttendanceEdit(null); await load(true); flash('Attendance updated by administrator and audit logged.');
    }catch(error){flash(error instanceof Error?error.message:'Could not update attendance.');}
  }
  async function reviewHolidayRequest(item:StaffHolidayRequest,status:'approved'|'rejected') {
    if (!window.confirm((status==='approved'?'Approve':'Decline')+' '+item.displayName+' holiday request for '+item.startDate+' to '+item.endDate+'?')) return;
    try {
      await api.put('/api/holidays/'+item.id,{status});
      await load(true);
      flash(status==='approved'?'Holiday request approved.':'Holiday request declined.');
    } catch (error) {
      flash(error instanceof Error?error.message:'Could not review the holiday request.');
    }
  }

  async function reviewStaffRequest(item:StaffRegistrationRequest,status:'approved'|'rejected') {
    const password=staffRequestPasswords[item.id]||'';
    if(status==='approved'&&password.length<10){flash('Enter a temporary password of at least 10 characters.');return;}
    if(!window.confirm(status==='approved'?'Approve '+item.displayName+' and create the staff account?':'Decline '+item.displayName+' staff access request?'))return;
    try{
      await api.put('/api/staff-registration-requests/'+item.id,{status,...(status==='approved'?{password}:{})});
      setStaffRequestPasswords(current=>{const next={...current};delete next[item.id];return next;});
      await load(true);
      flash(status==='approved'?'Staff request approved and account created.':'Staff request declined.');
    }catch(error){flash(error instanceof Error?error.message:'Could not review staff request.');}
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
  async function removeAdmin(account: AdminAccount) {
    if (account.canManageAdmins || account.isSuperAdmin || account.id === session.user.id) { flash('The primary super-admin account cannot be removed.'); return; }
    if (!window.confirm('Remove administrator account ' + account.displayName + '? Their sign-in will be revoked. Existing business records and history will be preserved.')) return;
    try { await api.delete('/api/admins/' + account.id); await load(); flash('Admin account removed. Existing records were preserved.'); }
    catch (err) { flash(err instanceof Error ? err.message : 'Could not remove admin account.'); }
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
      if (editingPayment) await api.put('/api/payments/' + editingPayment.id, data as unknown as Record<string, unknown>);
      else await api.post('/api/payments', data);
      setShowPayment(false);
      setEditingPayment(null);
      await load();
      flash(editingPayment ? 'Payment updated' : 'Payment recorded');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not save payment');
    }
  }
  async function deletePayment(payment: Payment) {
    if (!isAdmin || !window.confirm('Delete this payment record for ' + payment.customerName + '? The audit history will be preserved.')) return;
    try {
      await api.delete('/api/payments/' + payment.id);
      await load();
      flash('Payment deleted.');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not delete payment.');
    }
  }
  async function saveComplaint(data: any) {
    try {
      const { photoFile, videoFile, ...fields } = data;
      const attachments = await Promise.all([photoFile, videoFile].filter((item): item is File => item instanceof File).map(async file => ({
        fileName: file.name,
        mimeType: file.type,
        dataBase64: await fileAsBase64(file),
      })));
      await api.post('/api/complaints', { ...fields, attachments });
      setShowComplaint(false);
      await load();
      flash('Complaint saved with its evidence.');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not add complaint. Please check the evidence and try again.');
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
  async function deleteTask(task: Task) {
    if (!isAdmin || !window.confirm('Delete task "' + task.title + '"? Its evidence files will also be removed.')) return;
    try {
      await api.delete('/api/tasks/' + task.id);
      await load();
      flash('Task deleted.');
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Could not delete task.');
    }
  }
  async function updateTask(task: Task, status: string) {
    if (!isAdmin && status === 'Completed') {
      setCompletingTask(task);
      return;
    }
    try {
      await api.put('/api/tasks/' + task.id, { status });
      await load();
      flash('Task status updated');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not update task');
    }
  }
  async function completeTaskWithEvidence(task: Task, photoFile: File | null, videoFile: File | null) {
    const files = [photoFile, videoFile].filter((item): item is File => item instanceof File);
    if (!(photoFile instanceof File) || !(videoFile instanceof File)) { flash('Both a task photo and a task video are required before completion.'); return; }
    try {
      const attachments = await Promise.all(files.map(async file => ({ fileName: file.name, mimeType: file.type, dataBase64: await fileAsBase64(file) })));
      await api.post('/api/tasks/' + task.id + '/media', { attachments });
      await api.put('/api/tasks/' + task.id, { status: 'Completed' });
      setCompletingTask(null);
      await load();
      flash('Task completed with evidence uploaded.');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not complete task. Check the evidence upload and try again.');
    }
  }
  async function openTaskAttachment(task: Task, attachment: NonNullable<Task['attachments']>[number]) {
    try {
      const result = await api.get('/api/tasks/' + task.id + '/media/' + attachment.mediaId);
      setTaskPreview({ name: result.data.fileName || attachment.fileName, mimeType: result.data.mimeType, dataUrl: 'data:' + result.data.mimeType + ';base64,' + result.data.dataBase64 });
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not open task evidence.');
    }
  }
  async function updateComplaint(item: Complaint, patch: Record<string, unknown>) {
    try {
      await api.put('/api/complaints/' + item.id, patch);
      await load();
      flash('Complaint updated.');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not update complaint.');
    }
  }
  async function deleteComplaint(item: Complaint) {
    if (!window.confirm('Delete this complaint and its attached photo/video? This cannot be undone.')) return;
    try {
      await api.delete('/api/complaints/' + item.id);
      await load();
      flash('Complaint deleted.');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not delete complaint.');
    }
  }
  async function openComplaintAttachment(item: Complaint, attachment: NonNullable<Complaint['attachments']>[number]) {
    try {
      const result = await api.get('/api/complaints/' + item.id + '/media/' + attachment.mediaId);
      const dataUrl = 'data:' + result.data.mimeType + ';base64,' + result.data.dataBase64;
      setComplaintPreview({ name: result.data.fileName || attachment.fileName, mimeType: result.data.mimeType, dataUrl });
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not open attachment.');
    }
  }

  const nav = [
    { label: 'Overview', icon: LayoutDashboard },
    { label: 'Calendar', icon: CalendarDays },
    { label: taskPage, icon: ClipboardList, count: pendingTasks || undefined },
    ...(isAdmin ? [{ label: 'Salary', icon: IndianRupee }] : [{ label: 'My Day', icon: CalendarDays }]),
    { label: 'Customers', icon: Users, count: customers.length },
    { label: 'Subscriptions', icon: CalendarDays },
    { label: 'Inventory', icon: ClipboardList },
    { label: 'Installations', icon: MapPin },
    ...(isAdmin ? [{ label: 'Plans & Pricing', icon: Wifi }] : []),
    ...(isAdmin ? [{ label: 'GPS Tracking', icon: MapPin }] : []),
    ...(isAdmin ? [{ label: 'Staff', icon: UserRound, count: staff.length }] : []),
    ...(canManageAdmins ? [{ label: 'Admin Accounts', icon: ShieldCheck, count: adminAccounts.length || undefined }] : []),
    ...(isAdmin ? [{ label: 'Invoices', icon: ReceiptText }] : []),
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
                setNotificationsOpen(false);
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
            <button type="button" className="row-action" title="Sign out" aria-label="Sign out" onClick={signOut}><LogOut size={15} /></button>
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
            <FestivalBadge/>
            <div className="preference-controls">
              <label className="language-control" title="App language"><span>🌐</span><select aria-label="App language" value={language} onChange={event => setLanguage(event.target.value as 'en' | 'hi' | 'gu')}><option value="en">English</option><option value="hi">हिन्दी</option><option value="gu">ગુજરાતી</option></select></label>
              <button className="theme-toggle" onClick={toggleTheme} title={theme === 'dark' ? 'Switch to day mode' : 'Switch to night mode'} aria-label={theme === 'dark' ? 'Switch to day mode' : 'Switch to night mode'}>{theme === 'dark' ? '☀️' : '🌙'}<span>{theme === 'dark' ? 'Day' : 'Night'}</span></button>
            </div>
            <div className="notification-anchor" ref={notificationAnchorRef}>
              <button className="icon-button notification-bell" onClick={() => setNotificationsOpen(open => !open)} aria-label="Open notifications">
                <Bell size={18}/>{notifications.filter(item=>!item.read).length>0 && <span className="notification-count">{Math.min(99,notifications.filter(item=>!item.read).length)}</span>}
              </button>
              {notificationsOpen && <div className="notification-popover">
                <div className="notification-popover-head"><b>Notifications</b><button onClick={markNotificationsRead} disabled={!notifications.some(item=>!item.read)}>Mark all read</button></div>
                {notifications.slice(0,12).map(item=><article className={'notification-item '+(!item.read?'unread':'')} key={item.id}><div className="notification-item-head" style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}><b>{item.title}</b><button type="button" className="row-action danger" aria-label="Delete notification" title="Delete notification" onClick={()=>void deleteNotification(item)}><Trash2 size={13}/></button></div><p>{item.message}</p><small>{item.createdAt ? new Date(item.createdAt).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}) : ''}</small></article>)}
                {!notifications.length && <p className="notification-empty">You’re all caught up.</p>}
              </div>}
            </div>
            <button type="button" className="icon-button account-trigger" title="Account settings" aria-label="Account settings" onClick={() => { setNotificationsOpen(false); setShowAccountSettings(true); }}><div className="avatar small-avatar">{session.user.displayName.slice(0, 2).toUpperCase()}</div></button>
          </div>
        </header>
        <div className="content">
          <FestivalCelebration/>
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
                      : page === 'Invoices'
                        ? 'Create professional GST invoices and customer-ready PDF documents.'
                      : page === 'Payments'
                        ? 'Track customer collections and payment history.'
                        : page === 'Staff'
                          ? 'Manage staff accounts, assignments and collection performance.'
                          : page === 'Admin Accounts'
                            ? 'Create and view administrator sign-in accounts.'
                          : page === 'Calendar'
                            ? 'View task deadlines and team attendance by date.'
                          : page === taskPage
                            ? (isAdmin ? 'Assign work, set priorities and monitor team progress.' : 'Your assigned work, priorities and due dates.')
                            : page === 'My Day' || page === 'Salary'
                              ? (isAdmin ? 'Record monthly staff salaries and export payroll.' : 'Your attendance, customer visits, team updates and messages.')
                              : 'Track and resolve customer service requests.'}
              </p>
            </div>
            <div className="heading-actions">
              {page === 'Staff' && isAdmin && (
                <button className="btn primary" onClick={() => setShowStaff(true)}><UserPlus size={17} /> Add staff member</button>
              )}
              {page === 'Admin Accounts' && canManageAdmins && (
                <button className="btn primary" onClick={() => setShowAdminModal(true)}><UserPlus size={17} /> Add admin</button>
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

          {page === 'Calendar' && <CalendarWorkspace tasks={tasks} attendance={attendanceRecords} isAdmin={isAdmin} festivals={Object.entries(FESTIVAL_DATES).map(([date, festival]) => ({ date, ...festival }))} />}
          {page === 'Salary' && isAdmin && <FinanceWorkspace salaryOnly session={session} customers={customers} payments={payments} flash={flash} />}
          {page === 'My Day' && !isAdmin && <StaffOperations session={session} customers={customers} flash={flash} onDataChanged={() => { void load(true); }} />}
          {page === 'Invoices' && isAdmin && <InvoiceWorkspace customers={customers} plans={plans} flash={flash} />}
          {page === 'Finance & Billing' && isAdmin && <FinanceWorkspace session={session} customers={customers} payments={payments} flash={flash} />}
          {page === 'Subscriptions' && <SubscriptionWorkspace customers={customers} plans={plans} isAdmin={isAdmin} flash={flash} />}
          {page === 'Inventory' && <InventoryWorkspace isAdmin={isAdmin} flash={flash} />}
          {page === 'GPS Tracking' && isAdmin && <GpsTrackingWorkspace flash={flash} />}
          {page === 'Installations' && <InstallationsWorkspace customers={customers} staff={staff} isAdmin={isAdmin} flash={flash} />}
          {page === 'Overview' && !isAdmin && <StaffOperations session={session} customers={customers} flash={flash} compact onDataChanged={() => { void load(true); }} />}

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

              <section className="quick-actions" aria-label="Quick actions">
                <button type="button" onClick={() => setPage('Customers')}><Users size={18}/><span>Customers</span><small>Find and manage</small></button>
                <button type="button" onClick={() => setPage('Complaints')}><MessageSquare size={18}/><span>Complaints</span><small>Track issues</small></button>
                {isAdmin && <button type="button" onClick={() => { setEditing(null); setShowCustomer(true); }}><Plus size={18}/><span>Add customer</span><small>Create a record</small></button>}
                {isAdmin && <button type="button" onClick={() => setPage('Salary')}><IndianRupee size={18}/><span>Salary</span><small>Staff operations</small></button>}
                {!isAdmin && <button type="button" onClick={() => setPage('My Work')}><ClipboardList size={18}/><span>My work</span><small>See assigned tasks</small></button>}
              </section>

              {isAdmin && (
                <section className="panel retention-review-panel">
                  <div className="panel-head">
                    <div>
                      <h2>Six-month record review</h2>
                      <p>Records saved or created at least six months ago. Nothing is deleted automatically.</p>
                    </div>
                    <span className="live-tag">{retentionItems.length} DUE</span>
                  </div>
                  {retentionItems.length ? (
                    <div className="retention-review-list">
                      {retentionItems.map(item => (
                        <div className="snapshot-row" key={item.collection + ':' + item.id}>
                          <div className="snapshot-icon orange-bg"><Clock3 /></div>
                          <div className="retention-review-details">
                            <strong>{item.recordLabel}</strong>
                            <small>{item.collectionLabel} · Saved {dateLabel(item.createdAt)}</small>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="retention-review-empty">No records are currently due for review.</p>
                  )}
                </section>
              )}

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

          {page === 'Admin Accounts' && canManageAdmins && (
            <section className="panel table-panel">
              <div className="toolbar"><div><h2>Admin accounts</h2><p className="subtle">Only the primary super-admin account can create additional admins.</p></div><span className="result-count">{adminAccounts.length} admins</span></div>
              <div className="table-wrap staff-table-wrap"><table><thead><tr><th>ADMIN</th><th>USER ID</th><th>ACCESS</th><th>ROLE</th><th>ACTIONS</th></tr></thead><tbody>
                {adminAccounts.map(account => <tr key={account.id}><td><strong>{account.displayName}</strong></td><td>{account.userId}</td><td><span className={'status ' + (account.active ? 'active' : 'inactive')}>{account.active ? 'Active' : 'Disabled'}</span></td><td>{account.canManageAdmins || account.isSuperAdmin ? 'Super admin' : 'Admin'}</td><td>{account.canManageAdmins || account.isSuperAdmin || account.id === session.user.id ? <span className="subtle">Protected</span> : <button className="row-action danger" title="Remove admin account" onClick={() => removeAdmin(account)}><Trash2 size={15}/></button>}</td></tr>)}
              </tbody></table></div>
              {!adminAccounts.length && <Empty icon={<ShieldCheck />} title="No admin accounts" text="Create the first additional admin account when needed." />}
            </section>
          )}

          {page === 'Staff' && isAdmin && (
            <>
            <section className="panel table-panel staff-registration-requests">
              <div className="toolbar"><div><h2>Staff access requests</h2><p className="subtle">Review new staff sign-up requests here or from notifications.</p></div><span className="result-count">{staffRegistrationRequests.filter(item=>item.status==='pending').length} pending</span></div>
              {staffRegistrationRequests.filter(item=>item.status==='pending').map(item=><article className="staff-request-card" key={item.id}>
                <div><b>{item.displayName} · {item.userId}</b><p>{item.reason||'No additional note provided.'}</p><small>{item.phone?'Phone: '+item.phone+' · ':''}Submitted {new Date(item.createdAt).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'})}</small></div>
                <div className="staff-request-actions"><input type="password" minLength={10} autoComplete="new-password" placeholder="Temporary password (10+ chars)" value={staffRequestPasswords[item.id]||''} onChange={e=>setStaffRequestPasswords(current=>({...current,[item.id]:e.target.value}))}/><button className="btn primary compact" disabled={(staffRequestPasswords[item.id]||'').length<10} onClick={()=>void reviewStaffRequest(item,'approved')}>Accept</button><button className="btn danger compact" onClick={()=>void reviewStaffRequest(item,'rejected')}>Decline</button></div>
              </article>)}
              {!staffRegistrationRequests.some(item=>item.status==='pending')&&<p className="staff-record-empty">No pending staff access requests.</p>}
            </section>
            <section className="panel table-panel staff-holiday-requests">
              <div className="toolbar"><div><h2>Staff holiday requests</h2><p className="subtle">Approve or decline leave requests submitted by staff members.</p></div><span className="result-count">{staffHolidayRequests.filter(item=>item.status==='pending').length} pending</span></div>
              <div className="staff-holiday-list">
                {staffHolidayRequests.map(item=><article className="staff-request-card" key={item.id}>
                  <div><b>{item.displayName} · {item.startDate}{item.endDate!==item.startDate?' to '+item.endDate:''}</b><p>{item.reason}</p><small>Requested {new Date(item.createdAt).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'})}{item.reviewedAt?' · Reviewed '+new Date(item.reviewedAt).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):''}</small></div>
                  <div className="staff-request-actions"><span className={'status '+(item.status==='approved'?'active':item.status==='rejected'?'inactive':'')}>{item.status.toUpperCase()}</span>{item.status==='pending'&&<><button className="btn primary compact" onClick={()=>void reviewHolidayRequest(item,'approved')}>Approve</button><button className="btn danger compact" onClick={()=>void reviewHolidayRequest(item,'rejected')}>Decline</button></>}</div>
                </article>)}
                {!staffHolidayRequests.length&&<p className="staff-record-empty">No holiday requests have been submitted yet.</p>}
              </div>
            </section>
            <section className="panel table-panel">
              <div className="toolbar"><div className="searchbox"><Search size={17}/><input value={staffSearch} onChange={e => setStaffSearch(e.target.value)} placeholder="Search staff name or user ID..."/></div><span className="result-count">{filteredStaff.length} of {staff.length} members</span></div>
              <div className="table-wrap"><table><thead><tr><th>STAFF MEMBER</th><th>USER ID</th><th>ASSIGNED CUSTOMERS</th><th>COLLECTIONS RECORDED</th><th>ACCESS</th><th>ACTIONS</th></tr></thead><tbody>
                {filteredStaff.map(member => {
                  const assigned = customers.filter(c => c.assignedTo === member.id).length;
                  const total = payments.filter(p => p.recordedBy === member.id).reduce((sum, p) => sum + Number(p.amount || 0), 0);
                  return <tr key={member.id}><td data-label="Staff member"><button type="button" className="text-btn" onClick={()=>setSelectedStaffProfileId(member.id)}><b>{member.displayName}</b> <Eye size={13}/></button></td><td data-label="User ID">{member.userId}</td><td data-label="Assigned customers">{assigned}</td><td data-label="Collections" className="amount">{money(total)}</td><td data-label="Access"><span className={'status ' + (member.active ? 'active' : 'inactive')}>{member.active ? 'Active' : 'Disabled'}</span></td><td data-label="Actions"><div className="staff-actions"><button className="btn secondary compact" onClick={() => updateStaff(member, { active: !member.active })}>{member.active ? 'Disable' : 'Enable'}</button><button className="row-action" title="Change username" onClick={() => setEditStaffUserId(member)}><Pencil size={15} /></button><button className="row-action" title="Reset password" onClick={() => setResetStaff(member)}><LockKeyhole size={15} /></button><button className="row-action danger" title="Delete staff account" onClick={() => removeStaff(member)}><Trash2 size={15} /></button></div></td></tr>;
                })}
              </tbody></table></div>
              {!filteredStaff.length && <Empty icon={<UserRound />} title={staff.length ? 'No matching staff' : 'No staff accounts yet'} text={staff.length ? 'Try another staff name or user ID.' : 'Create a staff account, then assign customers to that person from the customer form.'} action={!staff.length ? 'Add staff member' : undefined} onClick={() => setShowStaff(true)} />}
              <div className="staff-insight-grid">
                {filteredStaff.map(member => {
                  const assigned = customers.filter(c => c.assignedTo === member.id).length;
                  const total = payments.filter(p => p.recordedBy === member.id).reduce((sum, p) => sum + Number(p.amount || 0), 0);
                  return <div className={'staff-insight ' + (selectedStaffProfileId === member.id ? 'staff-insight-selected' : '')} key={member.id}><div className="staff-insight-head"><span className="avatar">{member.displayName.slice(0,2).toUpperCase()}</span><div><b>{member.displayName}</b><small>{member.userId}</small></div></div><div className="staff-insight-stats"><span><small>Assigned</small><b>{assigned}</b></span><span><small>Collected</small><b>{money(total)}</b></span></div><button className="btn secondary compact staff-profile-button" onClick={() => setSelectedStaffProfileId(member.id)}>View personal record <Eye size={13}/></button></div>;
                })}
              </div>
              {selectedStaffProfile && <section className="staff-personal-record">
                <div className="staff-record-heading"><div><span className="eyebrow">INDIVIDUAL STAFF FILE</span><h2>{selectedStaffProfile.displayName}</h2><p>{selectedStaffProfile.userId} · {selectedStaffProfile.active ? 'Active account' : 'Access disabled'}{selectedStaffProfile.phone?' · '+selectedStaffProfile.phone:''}{selectedStaffProfile.createdAt?' · Joined '+new Date(selectedStaffProfile.createdAt).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):''}</p></div><button className="btn secondary compact" onClick={() => setSelectedStaffProfileId('')}>Close record</button></div>
                <div className="staff-record-metrics">
                  <article><small>Total collected</small><strong>{money(selectedStaffCollected)}</strong><span>{selectedStaffPayments.length} payment records</span></article>
                  <article><small>Attendance days</small><strong>{selectedStaffAttendanceEquivalent.toLocaleString('en-IN')}</strong><span>{selectedStaffAttendance.filter(record => !!record.checkOutAt && record.dayType !== 'Absent').length} completed shifts</span></article>
                  <article><small>Absent days</small><strong>{selectedStaffAbsentDays}</strong><span>Admin-marked absence records</span></article>
                  <article><small>Assigned customers</small><strong>{customers.filter(customer => customer.assignedTo === selectedStaffProfile.id).length}</strong><span>Currently assigned</span></article>
                  <article><small>Assigned tasks</small><strong>{selectedStaffTasks.length}</strong><span>{selectedStaffTasks.filter(task => task.status === 'Completed').length} completed</span></article>
                </div>
                <section className="staff-record-section staff-record-work">
                  <div className="staff-record-section-head"><h3>Attendance breakdown</h3><span>{selectedStaffAttendance.length} dated records</span></div>
                  <div className="staff-attendance-breakdown">
                    {[{label:'Full day',count:selectedStaffFullDays},{label:'Half day',count:selectedStaffHalfDays},{label:'No attendance / absent',count:selectedStaffAbsentDays}].map(item=><div className="staff-attendance-stat" key={item.label}><div><b>{item.label}</b><strong>{item.count}</strong></div><div className="staff-attendance-track" style={{height:9,background:'var(--border,#e3e8ef)',borderRadius:99,overflow:'hidden'}}><i style={{display:'block',height:'100%',width:(selectedStaffAttendance.length?item.count/selectedStaffAttendance.length*100:0)+'%',background:'var(--accent,#3569c8)',borderRadius:99}}/></div></div>)}
                  </div>
                </section>
                <div className="staff-record-columns">
                  <section className="staff-record-section"><div className="staff-record-section-head"><h3>Payment history</h3><span>{selectedStaffPayments.length} records</span></div>
                    {selectedStaffPayments.length ? <div className="table-wrap"><table><thead><tr><th>DATE</th><th>CUSTOMER</th><th>AMOUNT</th><th>METHOD</th><th>MONTH</th></tr></thead><tbody>{selectedStaffPayments.map(payment => <tr key={payment.id}><td>{dateLabel(payment.paidAt)}</td><td>{payment.customerName}</td><td className="amount">{money(payment.amount)}</td><td>{payment.method}</td><td>{payment.month}</td></tr>)}</tbody></table></div> : <p className="staff-record-empty">No payments have been recorded by this staff member yet.</p>}
                  </section>
                  <section className="staff-record-section"><div className="staff-record-section-head"><h3>Attendance history</h3><span>{selectedStaffAttendanceEquivalent.toLocaleString('en-IN')} day equivalents</span></div>
                    {selectedStaffAttendance.length ? <div className="table-wrap"><table><thead><tr><th>WORK DATE</th><th>SHIFT START</th><th>SHIFT END</th><th>DAY TYPE / STATUS</th><th>LAST CORRECTION</th><th>ACTIONS</th></tr></thead><tbody>{selectedStaffAttendance.map(record => <tr key={record.id}><td>{dateLabel(record.workDate)}</td><td>{record.checkInAt?new Date(record.checkInAt).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):'—'}<small>{record.startedByAdmin?'Started by '+record.startedByAdmin:record.attendanceSource==='Admin'?'Started/marked by Admin':'Staff shift start'}</small></td><td>{record.checkOutAt?new Date(record.checkOutAt).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):'Not checked out'}{record.checkOutAt&&<small>{record.endedByAdminName?'Ended by '+record.endedByAdminName:record.endedByName?'Ended by '+record.endedByName:''}</small>}</td><td><span className={'status ' + (record.checkOutAt||record.dayType==='Absent'?'active':'inactive')}>{record.dayType==='Absent'?'Absent':(record.dayType==='Half day'?'Half day · ':'Full day · ')+(record.checkOutAt?'Completed':'Open shift')}</span>{record.absenceReason&&<small>{record.absenceReason}</small>}{record.correctionReason&&<small>Correction: {record.correctionReason}</small>}</td><td>{record.correctedAt?new Date(record.correctedAt).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'})+' · '+(record.correctedByName||'Admin'):'—'}</td><td><button className="btn secondary compact" onClick={()=>setAttendanceEdit({record,dayType:record.dayType||'Full day',reason:''})}>Correct</button></td></tr>)}</tbody></table></div> : <p className="staff-record-empty">No attendance records are available for this staff member.</p>}
                  </section>
                </div>
                <section className="staff-record-section staff-record-work"><div className="staff-record-section-head"><h3>Assigned customer list</h3><span>{customers.filter(customer => customer.assignedTo === selectedStaffProfile.id).length} customers</span></div>
                  {customers.filter(customer => customer.assignedTo === selectedStaffProfile.id).length ? <div className="staff-record-customer-list">{customers.filter(customer => customer.assignedTo === selectedStaffProfile.id).map(customer => <div key={customer.id}><b>{customer.name}</b><span>{customer.plan} · {customer.phone}</span><strong>{customer.status}</strong></div>)}</div> : <p className="staff-record-empty">No customers are assigned to this staff member.</p>}
                </section>
                <section className="staff-record-section staff-record-work"><div className="staff-record-section-head"><h3>Task progress</h3><span>{selectedStaffTasks.length} tasks</span></div>
                  {selectedStaffTasks.length ? <div className="staff-record-customer-list">{selectedStaffTasks.map(task => <div key={task.id}><b>{task.title}</b><span>{task.priority} priority · Due {dateLabel(task.dueDate)}</span><strong>{task.status}</strong></div>)}</div> : <p className="staff-record-empty">No tasks assigned to this staff member.</p>}
                </section>
                <section className="staff-record-section staff-record-work"><div className="staff-record-section-head"><h3>Assigned inventory</h3><span>{selectedStaffInventory.length} items</span></div>
                  {selectedStaffInventory.length?<div className="staff-record-customer-list">{selectedStaffInventory.map(item=><div key={item.id}><b>{item.name} · {item.sku}</b><span>{item.category} · {item.quantity} {item.unit} · {item.location||'No location'}</span><strong>{item.createdAt?'Assigned/added '+new Date(item.createdAt).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):'Assignment date not available'}</strong></div>)}</div>:<p className="staff-record-empty">No inventory is currently assigned to this staff member.</p>}
                </section>
                <section className="staff-record-section staff-record-work"><div className="staff-record-section-head"><h3>Installation jobs</h3><span>{selectedStaffInstallations.length} jobs</span></div>
                  {selectedStaffInstallations.length?<div className="staff-record-customer-list">{selectedStaffInstallations.map(item=><div key={item.id}><b>{item.customerName} · {item.type}</b><span>{item.address} · Scheduled {dateLabel(item.scheduledDate)}</span><strong>{item.status} · Created {item.createdAt?new Date(item.createdAt).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):'—'}{item.updatedAt?' · Updated '+new Date(item.updatedAt).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):''}</strong></div>)}</div>:<p className="staff-record-empty">No installation jobs are assigned to this staff member.</p>}
                </section>
                <section className="staff-record-section staff-record-work"><div className="staff-record-section-head"><h3>Salary history</h3><span>{selectedStaffPayroll.length} records</span></div>
                  {selectedStaffPayroll.length?<div className="staff-record-customer-list">{selectedStaffPayroll.map(item=><div key={item.id}><b>{money(item.amount)} · {item.period}</b><span>Paid {item.paidAt} · {item.method}</span><strong>Recorded {item.createdAt?new Date(item.createdAt).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):'—'} · {item.recordedByName||'Admin'}</strong></div>)}</div>:<p className="staff-record-empty">No salary payments recorded for this staff member.</p>}
                </section>
              </section>}
            </section>
            {attendanceEdit&&<Modal title="Correct staff attendance" subtitle={attendanceEdit.record.displayName+' · '+attendanceEdit.record.workDate} onClose={()=>setAttendanceEdit(null)}><form className="form-grid" onSubmit={saveStaffAttendanceCorrection}><Field label="Attendance type"><select value={attendanceEdit.dayType} onChange={e=>setAttendanceEdit({...attendanceEdit,dayType:e.target.value as 'Full day'|'Half day'|'Absent'})}><option>Full day</option><option>Half day</option><option>Absent</option></select></Field><Field label="Reason for correction" wide><textarea required minLength={3} maxLength={300} value={attendanceEdit.reason} onChange={e=>setAttendanceEdit({...attendanceEdit,reason:e.target.value})} placeholder="Explain why this attendance record is being corrected"/></Field><div className="modal-actions"><button type="button" className="btn secondary" onClick={()=>setAttendanceEdit(null)}>Cancel</button><button className="btn primary">Save correction</button></div></form></Modal>}
            </>
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
                    <div className="task-meta"><span><UserRound size={14}/>{isAdmin ? task.assignedToName : 'Assigned to you'}</span><span><CalendarDays size={14}/>Due {dateLabel(task.dueDate)}</span><span>Created by {task.createdByName} · {task.createdAt?new Date(task.createdAt).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):'Date not available'}</span>{task.updatedAt&&<span>Updated {new Date(task.updatedAt).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'})}</span>}{task.completedAt&&<span>Completed {new Date(task.completedAt).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'})}</span>}</div>
                  </div>
                  {task.attachments?.length ? <div className="task-evidence-list"><span>{task.attachments.length} evidence file(s)</span>{task.attachments.map(file => <button type="button" className="text-btn" key={file.mediaId} onClick={() => void openTaskAttachment(task, file)}>{file.mimeType.startsWith('video/') ? 'View video' : 'View photo'}</button>)}</div> : null}
                  <label className="task-status-control"><span>Progress</span><select value={task.status} onChange={e => updateTask(task, e.target.value)}><option>Pending</option><option>In progress</option><option>Completed</option></select></label>
                  {isAdmin && <button type="button" className="btn danger compact" onClick={()=>void deleteTask(task)}><Trash2 size={14}/> Delete task</button>}
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
                onEdit={(c: Customer) => {
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
                <div className="searchbox"><Search size={17}/><input value={paymentSearch} onChange={e => setPaymentSearch(e.target.value)} placeholder="Search customer, month, method or date..."/></div>
                <span className="result-count">{filteredPayments.length} of {payments.length} records</span>
              </div>
              <PaymentTable rows={filteredPayments} isAdmin={isAdmin} onEdit={(payment: Payment) => { setEditingPayment(payment); setShowPayment(true); }} onDelete={isAdmin ? deletePayment : undefined} />
              {payments.length > 0 && !filteredPayments.length && <p className="ops-empty">No payments match your search.</p>}
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
            <section className="panel table-panel complaints-workspace">
              <div className="toolbar">
                <div><h2>Staff & customer complaints</h2><p className="subtle">Create a complaint, assign an owner and track it until it is solved.</p></div>
                <div className="complaint-counts"><span><b>{complaints.filter(item => !['Solved','Resolved'].includes(item.status)).length}</b> Pending / active</span><span><b>{complaints.filter(item => item.status === 'Solved' || item.status === 'Resolved').length}</b> Solved</span><span><b>{complaints.filter(item => item.status === 'Not Solved').length}</b> Not solved</span></div>
                <span className="result-count">{complaints.length} records</span>
              </div>
              <div className="complaint-list">
                {complaints.map(c => {
                  const canUpdate = isAdmin;
                  const targetName = c.complaintFor === 'Staff' ? (c.staffName || 'Staff member') : (c.customerName || 'Customer');
                  return <article className="complaint-card" key={c.id}>
                    <div className="complaint-card-head">
                      <div className="complaint-symbol"><MessageSquare size={18}/></div>
                      <div className="complaint-info">
                        <strong>{c.subject}</strong>
                        <span>{c.complaintFor || 'Customer'} · {targetName} · Submitted {c.createdAt?new Date(c.createdAt).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):'—'}</span>
                        <small>{c.details || 'No additional details.'}</small>
                      </div>
                      <span className={'priority ' + String(c.priority || 'Normal').toLowerCase()}>{c.priority || 'Normal'}</span>
                    </div>
                    <div className="complaint-meta">
                      <span><b>Assigned to:</b> {c.assignedToName || 'Not assigned'}</span>
                      <span><b>Raised by:</b> {c.createdByName || '—'}</span>
                      {c.resolvedByName && <span><b>Solved by:</b> {c.resolvedByName}</span>}
                      {c.resolvedAt && <span><b>Solved on:</b> {new Date(c.resolvedAt).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'})}</span>}
                    </div>
                    {c.locationText && <p className="complaint-location"><MapPin size={14}/>{c.locationText} <a href={Number.isFinite(c.latitude) && Number.isFinite(c.longitude) ? 'https://www.google.com/maps?q=' + c.latitude + ',' + c.longitude : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(c.locationText)} target="_blank" rel="noreferrer">Open map</a></p>}
                    <div className="complaint-controls">
                      <label><small>Status</small>{canUpdate ? <select value={c.status} onChange={e => {
                        const status = e.target.value;
                        let resolutionDetails = c.resolutionDetails || '';
                        if (status === 'Solved' || status === 'Not Solved') {
                          const answer = window.prompt(status === 'Solved' ? 'What work solved this complaint?' : 'Why is this complaint not solved?', resolutionDetails);
                          if (answer === null) return;
                          resolutionDetails = answer;
                        }
                        void updateComplaint(c, { status, resolutionDetails });
                      }}><option>Pending</option><option>Assigned</option><option>In Progress</option><option>Solved</option><option>Not Solved</option></select> : <span className="complaint-status">{c.status}</span>}</label>
                      {isAdmin && <label><small>Assign to staff</small><select value={c.assignedTo || ''} onChange={e => void updateComplaint(c, { assignedTo: e.target.value, status: e.target.value && c.status === 'Pending' ? 'Assigned' : c.status })}><option value="">Unassigned</option>{staff.filter(member => member.active).map(member => <option key={member.id} value={member.id}>{member.displayName}</option>)}</select></label>}
                      {c.attachments?.map(file => <button type="button" className="btn secondary compact" key={file.mediaId} onClick={() => void openComplaintAttachment(c, file)}>{file.mimeType.startsWith('video/') ? 'View video' : 'View photo'}</button>)}
                      {isAdmin && <button type="button" className="row-action danger" title="Delete complaint" onClick={() => void deleteComplaint(c)}><Trash2 size={15}/></button>}
                    </div>
                    {c.resolutionDetails && <p className="complaint-resolution"><b>Resolution / reason:</b> {c.resolutionDetails}</p>}
                  </article>;
                })}
              </div>
              {!complaints.length && <Empty icon={<MessageSquare/>} title="No complaints yet" text="Create a customer or staff complaint to start tracking it." action="New complaint" onClick={() => setShowComplaint(true)}/>}
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
          initial={editingPayment}
          onClose={() => { setShowPayment(false); setEditingPayment(null); }}
          onSave={savePayment}
        />
      )}
      {!isAdmin && <StaffLocationResponder activeShift={staffShiftActive} userId={session.user.id} />}
      {permissionSetupOpen && <StaffPermissionSetup onComplete={(locationGranted = false) => { if (locationGranted) localStorage.setItem('kb-staff-permissions-v1', 'done'); setPermissionSetupOpen(false); }} />}
      {completingTask && <TaskCompletionModal task={completingTask} onClose={() => setCompletingTask(null)} onComplete={(photo: File | null, video: File | null) => completeTaskWithEvidence(completingTask, photo, video)} />}
      {taskPreview && <Modal title={taskPreview.name} subtitle="Task completion evidence" onClose={() => setTaskPreview(null)}><div className="complaint-preview">{taskPreview.mimeType.startsWith('video/') ? <video src={taskPreview.dataUrl} controls playsInline /> : <img src={taskPreview.dataUrl} alt={taskPreview.name}/>}</div><div className="form-actions"><a className="btn secondary" href={taskPreview.dataUrl} download={taskPreview.name}>Download evidence</a><button type="button" className="btn primary" onClick={() => setTaskPreview(null)}>Close</button></div></Modal>}
      {showComplaint && (
        <ComplaintModal
          customers={customers}
          staff={staff}
          session={session}
          onClose={() => setShowComplaint(false)}
          onSave={saveComplaint}
        />
      )}
      {complaintPreview && <Modal title={complaintPreview.name} subtitle="Complaint attachment" onClose={() => setComplaintPreview(null)}><div className="complaint-preview">{complaintPreview.mimeType.startsWith('video/') ? <video src={complaintPreview.dataUrl} controls playsInline /> : <img src={complaintPreview.dataUrl} alt={complaintPreview.name}/>}</div><div className="form-actions"><a className="btn secondary" href={complaintPreview.dataUrl} download={complaintPreview.name}>Download attachment</a><button type="button" className="btn primary" onClick={() => setComplaintPreview(null)}>Close</button></div></Modal>}
      {showStaff && <StaffModal onClose={() => setShowStaff(false)} onSave={createStaff} />}
      {showAdminModal && canManageAdmins && <AdminModal onClose={() => setShowAdminModal(false)} onSave={createAdmin} />}
      {showAccountSettings && <AccountSettingsModal session={session} onClose={() => setShowAccountSettings(false)} onChangeUserId={async (currentPassword: string, userId: string) => { await changeAppUserId(currentPassword, userId); onLogout(); }} onChangePassword={async (currentPassword: string, newPassword: string) => { await changeAppPassword(currentPassword, newPassword); onLogout(); }} />}
      {showTask && <TaskModal staff={staff.filter(member => member.active)} onClose={() => setShowTask(false)} onSave={saveTask} />}
      {editStaffUserId && <StaffUsernameModal staff={editStaffUserId} onClose={() => setEditStaffUserId(null)} onSave={(userId: string) => saveStaffUserId(editStaffUserId, userId)} />}
      {resetStaff && <StaffPasswordModal staff={resetStaff} onClose={() => setResetStaff(null)} onSave={(password: string) => saveStaffPassword(resetStaff, password)} />}
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
              <span className={'status ' + customerStatusLabel(selected.status).toLowerCase()} aria-label={'Connection status: ' + customerStatusLabel(selected.status)}>
                Status: {customerStatusLabel(selected.status)}
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
  const rows = [{ label: 'Pending', count: complaints.filter(c => c.status === 'Pending' || c.status === 'Open').length }, { label: 'Assigned', count: complaints.filter(c => c.status === 'Assigned').length }, { label: 'In progress', count: complaints.filter(c => c.status === 'In Progress' || c.status === 'In progress').length }, { label: 'Solved', count: complaints.filter(c => c.status === 'Solved' || c.status === 'Resolved').length }, { label: 'Not solved', count: complaints.filter(c => c.status === 'Not Solved').length }];
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
    <div className="table-wrap customer-table-wrap">
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
              <td data-label="Customer">
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
              <td data-label="Plan">{c.plan}</td>
              <td data-label="Monthly fee" className="amount">{money(c.monthlyFee)}</td>
              <td data-label="Status">
                <span className={'status ' + customerStatusLabel(c.status).toLowerCase()} aria-label={'Customer status: ' + customerStatusLabel(c.status)}>
                  {customerStatusLabel(c.status)}
                </span>
              </td>
              <td data-label="Joined">{dateLabel(c.joinedAt)}</td>
              <td data-label="Actions">
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
function PaymentTable({ rows, isAdmin = false, onEdit, onDelete }: any) {
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
            {(isAdmin || onDelete) && <th>ACTIONS</th>}
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
              {(isAdmin || onDelete) && <td><div className="staff-actions"><button className="row-action" title="Edit payment" onClick={() => onEdit?.(p)}><Pencil size={14}/></button>{onDelete && <button className="row-action danger" title="Delete payment" onClick={() => onDelete(p)}><Trash2 size={14}/></button>}</div></td>}
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
    details: initial?.details || '',
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
        <Field label="Additional plan details (optional)" wide><textarea rows={3} maxLength={1000} value={form.details} onChange={e => setForm({ ...form, details: e.target.value })} placeholder="Add extra features, fair-use policy, router details, installation terms or any other information. This field is optional." /></Field>
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
          <Field label="Phone number"><input required type="tel" inputMode="numeric" pattern="[0-9]{10}" minLength={10} maxLength={10} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} placeholder="10-digit mobile number" /></Field>
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
            type="tel"
            inputMode="numeric"
            pattern="[0-9]{10}"
            minLength={10}
            maxLength={10}
            value={form.phone}
            onChange={e => setForm({ ...form, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
            placeholder="10-digit mobile number"
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
function AdminModal({ onClose, onSave }: any) {
  const [form, setForm] = useState({ displayName: '', userId: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  return <Modal title="Create admin account" subtitle="Add another administrator. Staff accounts cannot be promoted from their own login." onClose={onClose}>
    <form className="form-grid" onSubmit={async e => {
      e.preventDefault();
      setBusy(true);
      setMessage('');
      try { await onSave(form); }
      catch (error) { setMessage(error instanceof Error ? error.message : 'Could not create admin account.'); }
      finally { setBusy(false); }
    }}>
      <Field label="Admin full name"><input required maxLength={80} value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} /></Field>
      <Field label="Admin user ID"><input required minLength={3} maxLength={32} pattern="[a-zA-Z0-9_-]{3,32}" value={form.userId} onChange={e => setForm({ ...form, userId: e.target.value })} /></Field>
      <Field label="Temporary password" wide><input required type="password" minLength={8} autoComplete="new-password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></Field>
      <p className="form-hint">Use at least 8 characters. The new account will have Admin access, but cannot create or manage other admin accounts.</p>
      {message && <div className="auth-message">{message}</div>}
      <div className="form-actions"><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Creating…' : 'Create admin'}</button></div>
    </form>
  </Modal>;
}
function StaffModal({ onClose, onSave }: any) {
  const [form, setForm] = useState({ displayName: '', userId: '', password: '' });
  const [busy, setBusy] = useState(false);
  return <Modal title="Create staff account" subtitle="Give this team member a secure sign-in." onClose={onClose}><form className="form-grid" onSubmit={async e => { e.preventDefault(); setBusy(true); await onSave(form); setBusy(false); }}><Field label="Staff full name"><input required value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} /></Field><Field label="Staff user ID"><input required minLength={3} maxLength={32} pattern="[a-zA-Z0-9_-]{3,32}" value={form.userId} onChange={e => setForm({ ...form, userId: e.target.value })} /></Field><Field label="Temporary password" wide><input required type="password" minLength={10} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></Field><p className="form-hint">Use at least 10 characters and share it privately. Admin can reset it from Staff if needed.</p><div className="form-actions"><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button></div></form></Modal>;
}
function StaffLocationResponder({ activeShift, userId }: { activeShift: boolean; userId: string }) {
  const [shiftActive, setShiftActive] = useState(activeShift);
  useEffect(() => {
    let stopped = false;
    const checkShift = async () => {
      try {
        const result = await api.get('/api/attendance');
        const workDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        const active = (result.data.items || []).some((item: AttendanceRecord) => item.userId === userId && item.workDate === workDate && !item.checkOutAt && item.dayType !== 'Absent');
        if (!stopped) setShiftActive(active);
      } catch { /* Keep the last confirmed shift state if the API is temporarily unavailable. */ }
    };
    setShiftActive(activeShift);
    void checkShift();
    const timer = window.setInterval(checkShift, 15000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [activeShift, userId]);

  useEffect(() => {
    let stopped = false;
    let browserTimer: number | null = null;
    const stopNativeTracking = () => {
      if (Capacitor.isNativePlatform()) void WorkLocationTracking.stopTracking().catch(() => undefined);
    };

    if (!shiftActive) {
      stopNativeTracking();
      return;
    }

    const reportGpsUnavailable = (reason: string) => {
      if (stopped) return;
      const payload = { reason };
      const update = Capacitor.isNativePlatform()
        ? nativeApiPost('/api/attendance/gps-lost', payload)
        : api.post('/api/attendance/gps-lost', payload);
      void update.catch(() => undefined);
    };

    const publishNative = async () => {
      try {
        const permission = await Geolocation.checkPermissions();
        if (permission.location !== 'granted') {
          reportGpsUnavailable('Location permission denied');
          return;
        }
        const token = getToken();
        if (!token) return;
        const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'https://kandb-management-nexus-api-zv7f.onrender.com';
        await WorkLocationTracking.startTracking({ token, apiBaseUrl });
      } catch {
        reportGpsUnavailable('Phone location services are unavailable');
      }
    };

    const publishBrowser = () => {
      if (stopped || document.visibilityState !== 'visible') return;
      if (!navigator.geolocation) {
        reportGpsUnavailable('GPS location unavailable');
        return;
      }
      navigator.geolocation.getCurrentPosition(async position => {
        try {
          await api.post('/api/staff/live-location', {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            capturedAt: new Date(position.timestamp).toISOString(),
            source: 'staff-app-foreground',
          });
        } catch {
          // Keep the last confirmed point; the admin screen displays its age.
        }
      }, error => {
        reportGpsUnavailable(error.code === 1 ? 'Location permission denied' : 'GPS location unavailable');
      }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 });
    };

    if (Capacitor.isNativePlatform()) {
      void publishNative();
    } else {
      publishBrowser();
      browserTimer = window.setInterval(publishBrowser, 15000);
      const onVisibility = () => { if (document.visibilityState === 'visible') publishBrowser(); };
      document.addEventListener('visibilitychange', onVisibility);
      return () => {
        stopped = true;
        if (browserTimer !== null) window.clearInterval(browserTimer);
        document.removeEventListener('visibilitychange', onVisibility);
      };
    }

    // Intentionally do not stop the native foreground service from a React
    // unmount/Activity destroy: Android may destroy the WebView when the user
    // swipes the app away. The service stops on checkout or server rejection.
    return () => { stopped = true; };
  }, [shiftActive]);
  return null;
}
function StaffPermissionSetup({ onComplete }: { onComplete:(locationGranted?:boolean)=>void }) {
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  async function requestPermissions() {
    setBusy(true);
    setMessage('Checking Android permissions…');
    try {
      let location = await Geolocation.checkPermissions();
      if (location.location !== 'granted') location = await Geolocation.requestPermissions();
      const locationGranted = location.location === 'granted';
      const outcomes:string[]=['Location: '+String(location.location||'not granted')];
      try {
        const result=await Filesystem.requestPermissions();
        outcomes.push('Storage/media access: '+String(result.publicStorage||'handled by Android picker'));
      } catch { outcomes.push('Storage/media: Android will ask when you select a file.'); }
      try {
        const camera=await Camera.requestPermissions();
        outcomes.push('Camera: '+String(camera.camera||'requested'));
      } catch { outcomes.push('Camera: not granted yet. Allow it when capturing task evidence.'); }
      try {
        const notifications = await LocalNotifications.requestPermissions();
        outcomes.push('Notifications: ' + String(notifications.display || 'checked'));
      } catch { outcomes.push('Notifications: Android may ask when shift tracking starts.'); }
      setMessage(outcomes.join('\n'));
      if (locationGranted) {
        localStorage.setItem('kb-staff-permissions-v1','done');
        onComplete(true);
      } else {
        localStorage.removeItem('kb-staff-permissions-v1');
        setMessage(outcomes.join('\n')+'\n\nLocation permission is required for admin GPS requests. Enable it in Android settings, then tap Allow required permissions again. Setup will stay open until location is granted.');
      }
    } catch(error) {
      setMessage(error instanceof Error?error.message:'Could not check Android permissions. Please try again.');
    } finally { setBusy(false); }
  }
  return <Modal title="Set up staff app permissions" subtitle="Allow the permissions needed for task evidence, active-shift GPS tracking and notifications." onClose={()=>onComplete(false)}>
    <div className="form-grid">
      <div className="form-hint">Your location is shared with authorised K&B administrators only during an active shift. It stops automatically when you check out. Camera access is used for task and complaint evidence. Android’s file picker controls access to selected photos and videos.</div>
      {message&&<p className="form-hint" style={{whiteSpace:'pre-line'}}>{message}</p>}
      <div className="form-actions"><button className="btn primary" disabled={busy} onClick={()=>void requestPermissions()}>{busy?'Checking…':'Allow required permissions'}</button><button type="button" className="btn secondary" onClick={()=>onComplete(false)}>Continue for now</button></div>
    </div>
  </Modal>;
}

function TaskCompletionModal({ task, onClose, onComplete }: any) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [video, setVideo] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  function valid(file: File, kind: 'photo'|'video') {
    const allowed = kind === 'photo' ? ['image/jpeg','image/png','image/webp'] : ['video/mp4','video/webm','video/quicktime'];
    const limit = kind === 'photo' ? 2 * 1024 * 1024 : 8 * 1024 * 1024;
    if (!allowed.includes(file.type)) { window.alert(kind === 'photo' ? 'Choose a JPG, PNG or WEBP photo.' : 'Choose an MP4, WEBM or MOV video.'); return false; }
    if (file.size > limit) { window.alert(kind === 'photo' ? 'Photo must be 2 MB or smaller.' : 'Video must be 8 MB or smaller.'); return false; }
    return true;
  }
  return <Modal title="Complete task with evidence" subtitle={task.title} onClose={onClose}>
    <form className="form-grid" onSubmit={async event => { event.preventDefault(); if (!photo || !video) { window.alert('Both a task photo and a task video are required.'); return; } setBusy(true); await onComplete(photo, video); setBusy(false); }}>
      <p className="form-hint">Both a photo and a video are required. The task remains open until both files upload successfully.</p>
      <Field label="Task photo (required)" wide><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={event => { const file=event.target.files?.[0]||null; setPhoto(file&&valid(file,'photo')?file:null); }}/>{photo&&<small>{photo.name} · {(photo.size/1024).toFixed(0)} KB</small>}</Field>
      <Field label="Task video (required)" wide><input type="file" accept="video/mp4,video/webm,video/quicktime" capture="environment" onChange={event => { const file=event.target.files?.[0]||null; setVideo(file&&valid(file,'video')?file:null); }}/>{video&&<small>{video.name} · {(video.size/1024/1024).toFixed(1)} MB</small>}</Field>
      <div className="form-actions"><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy||!photo||!video}>{busy?'Uploading evidence…':'Upload and complete task'}</button></div>
    </form>
  </Modal>;
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
  const [currentPasswordForUserId, setCurrentPasswordForUserId] = useState('');
  const [currentPasswordForPassword, setCurrentPasswordForPassword] = useState('');
  const [newUserId, setNewUserId] = useState(session.user.userId);
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function submitUserId(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMessage('');
    try { await onChangeUserId(currentPasswordForUserId, newUserId); }
    catch (err) { setMessage(err instanceof Error ? err.message : 'Could not change user ID.'); setBusy(false); }
  }
  async function submitPassword(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMessage('');
    try { await onChangePassword(currentPasswordForPassword, newPassword); }
    catch (err) { setMessage(err instanceof Error ? err.message : 'Could not change password.'); setBusy(false); }
  }
  return <Modal title="My account" subtitle={'Signed in as ' + session.user.displayName + ' · ' + session.user.role} onClose={onClose}>
    <div className="form-grid">
      <form className="form-grid" onSubmit={submitUserId}>
        <Field label="Current password"><input type="password" required value={currentPasswordForUserId} onChange={e => setCurrentPasswordForUserId(e.target.value)} autoComplete="current-password" /></Field>
        <Field label="New user ID"><input required minLength={3} maxLength={32} pattern="[a-zA-Z0-9_-]{3,32}" value={newUserId} onChange={e => setNewUserId(e.target.value)} /></Field>
        <div className="form-actions"><button className="btn primary" disabled={busy || newUserId.trim().toLowerCase() === session.user.userId.toLowerCase()}>{busy ? 'Saving…' : 'Change username'}</button></div>
      </form>
      <div className="form-hint">Changing your username signs you out. Sign in again with the new ID.</div>
      <form className="form-grid" onSubmit={submitPassword}>
        <Field label="Current password"><input type="password" required value={currentPasswordForPassword} onChange={e => setCurrentPasswordForPassword(e.target.value)} autoComplete="current-password" /></Field>
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
function PaymentModal({ customers, initial, onClose, onSave }: any) {
  const [f, s] = useState<any>(initial || {
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
      title={initial ? 'Edit payment' : 'Record payment'}
      subtitle={initial ? 'Correct the saved customer payment details.' : "Add a payment to the customer's collection history."}
      onClose={onClose}
    >
      <form
        className="form-grid"
        onSubmit={e => {
          e.preventDefault();
          const paymentFields = { ...f };
          delete paymentFields.id;
          onSave({
            ...paymentFields,
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
            {initial ? 'Save changes' : 'Save payment'}
          </button>
        </div>
      </form>
      {!customers.length && (
        <p className="form-hint">Add a customer before recording a payment.</p>
      )}
    </Modal>
  );
}
function ComplaintModal({ customers, staff, session, onClose, onSave }: any) {
  const isAdmin = session.user.role === 'admin';
  const [f, setF] = useState<any>({
    complaintFor: 'Customer',
    customerId: '',
    staffId: isAdmin ? '' : session.user.id,
    assignedTo: '',
    subject: '',
    details: '',
    priority: 'Normal',
    createdAt: new Date().toISOString().slice(0, 10),
    locationText: '',
    latitude: undefined,
    longitude: undefined,
  });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [saving, setSaving] = useState(false);
  const customer = customers.find((item: Customer) => item.id === f.customerId);
  const activeStaff = (staff || []).filter((member: Staff) => member.active);
  function chooseLocation() {
    if (!navigator.geolocation) { setLocationError('Location is not available on this device.'); return; }
    setLocating(true);
    setLocationError('');
    navigator.geolocation.getCurrentPosition(position => {
      const latitude = Number(position.coords.latitude.toFixed(6));
      const longitude = Number(position.coords.longitude.toFixed(6));
      setF((old: any) => ({ ...old, latitude, longitude, locationText: old.locationText || 'Current device location' }));
      setLocating(false);
    }, error => {
      setLocationError(error.code === 1 ? 'Allow location permission in Android settings, or enter the location manually.' : 'Could not get location. Enter it manually.');
      setLocating(false);
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  }
  function validateFile(file: File, kind: 'photo' | 'video') {
    const allowed = kind === 'photo' ? ['image/jpeg', 'image/png', 'image/webp'] : ['video/mp4', 'video/webm', 'video/quicktime'];
    const maxBytes = kind === 'photo' ? 2 * 1024 * 1024 : 8 * 1024 * 1024;
    if (!allowed.includes(file.type)) { window.alert(kind === 'photo' ? 'Choose a JPG, PNG or WEBP photo.' : 'Choose an MP4, WEBM or MOV video.'); return false; }
    if (file.size > maxBytes) { window.alert(kind === 'photo' ? 'Photo must be 2 MB or smaller.' : 'Video must be 8 MB or smaller.'); return false; }
    return true;
  }
  return <Modal title="New complaint" subtitle="Choose a customer or staff member, then add the issue details." onClose={onClose}>
    <form className="form-grid complaint-form" onSubmit={async event => {
      event.preventDefault();
      if (f.complaintFor === 'Customer' && !f.customerId) { window.alert('Select a customer.'); return; }
      if (f.complaintFor === 'Staff' && !(isAdmin ? f.staffId : session.user.id)) { window.alert('Select a staff member.'); return; }
      setSaving(true);
      await onSave({ ...f, customerName: customer?.name || '', staffId: isAdmin ? f.staffId : session.user.id, photoFile, videoFile });
      setSaving(false);
    }}>
      <Field label="Complaint for" wide>
        <select value={f.complaintFor} onChange={event => setF({ ...f, complaintFor: event.target.value, customerId: '', staffId: isAdmin ? '' : session.user.id })}>
          <option value="Customer">Customer complaint</option>
          <option value="Staff">Staff complaint</option>
        </select>
      </Field>
      {f.complaintFor === 'Customer' ? <Field label="Select customer" wide>
        <select required value={f.customerId} onChange={event => setF({ ...f, customerId: event.target.value })}>
          <option value="">Choose customer</option>
          {customers.map((item: Customer) => <option value={item.id} key={item.id}>{item.name} · {item.phone}</option>)}
        </select>
      </Field> : isAdmin ? <Field label="Select staff member" wide>
        <select required value={f.staffId} onChange={event => setF({ ...f, staffId: event.target.value })}>
          <option value="">Choose staff member</option>
          {activeStaff.map((member: Staff) => <option value={member.id} key={member.id}>{member.displayName}</option>)}
        </select>
      </Field> : <Field label="Staff member" wide><input value={session.user.displayName} readOnly /></Field>}
      <Field label="Complaint title" wide><input required maxLength={150} value={f.subject} onChange={event => setF({ ...f, subject: event.target.value })} placeholder="What is the problem?" /></Field>
      <Field label="Priority"><select value={f.priority} onChange={event => setF({ ...f, priority: event.target.value })}><option>Low</option><option>Normal</option><option>High</option></select></Field>
      <Field label="Date"><input type="date" value={f.createdAt} onChange={event => setF({ ...f, createdAt: event.target.value })}/></Field>
      <Field label="What happened?" wide><textarea rows={3} maxLength={1500} value={f.details} onChange={event => setF({ ...f, details: event.target.value })} placeholder="Explain the issue in simple words" /></Field>
      <Field label="Location / address" wide><input maxLength={250} value={f.locationText} onChange={event => setF({ ...f, locationText: event.target.value })} placeholder="Enter area, building or address" /></Field>
      <div className="complaint-location-action wide">
        <button type="button" className="btn secondary compact" disabled={locating} onClick={chooseLocation}><MapPin size={14}/>{locating ? 'Getting location…' : 'Use current location'}</button>
        {Number.isFinite(f.latitude) && Number.isFinite(f.longitude) && <a href={'https://www.google.com/maps?q=' + f.latitude + ',' + f.longitude} target="_blank" rel="noreferrer">Location captured · Open map</a>}
        {locationError && <small>{locationError}</small>}
      </div>
      <Field label={isAdmin ? "Photo (optional)" : "Photo (required for staff)"} wide><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={event => { const file = event.target.files?.[0] || null; if (file && validateFile(file, 'photo')) setPhotoFile(file); else setPhotoFile(null); }}/>{photoFile && <small className="complaint-file-name">{photoFile.name} · {(photoFile.size / 1024).toFixed(0)} KB</small>}</Field>
      <Field label="Video (optional)" wide><input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={event => { const file = event.target.files?.[0] || null; if (file && validateFile(file, 'video')) setVideoFile(file); else setVideoFile(null); }}/>{videoFile && <small className="complaint-file-name">{videoFile.name} · {(videoFile.size / 1024 / 1024).toFixed(1)} MB</small>}</Field>
      {isAdmin && <Field label="Assign complaint to" wide><select value={f.assignedTo} onChange={event => setF({ ...f, assignedTo: event.target.value })}><option value="">Leave unassigned</option>{activeStaff.map((member: Staff) => <option value={member.id} key={member.id}>{member.displayName}</option>)}</select></Field>}
      <div className="form-actions"><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button className="btn primary" disabled={saving}>{saving ? 'Saving complaint…' : 'Create complaint'}</button></div>
    </form>
    <p className="form-hint">Staff must attach at least one photo or video. Photos up to 2 MB and videos up to 8 MB are saved with the complaint. Admins may submit without evidence.</p>
  </Modal>;
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


type FestivalInfo={name:string;theme:string};
const FESTIVAL_DATES:Record<string,FestivalInfo>={
  '2026-01-14':{name:'Makar Sankranti · Uttarayan',theme:'sankranti'},
  '2026-01-23':{name:'Vasant Panchami',theme:'vasant'},
  '2026-02-15':{name:'Maha Shivaratri',theme:'shivratri'},
  '2026-03-02':{name:'Holika Dahan',theme:'holi'},
  '2026-03-03':{name:'Holi · Dhuleti',theme:'holi'},
  '2026-03-19':{name:'Gudi Padwa',theme:'vasant'},
  '2026-03-26':{name:'Rama Navami',theme:'ramnavami'},
  '2026-04-02':{name:'Hanuman Jayanti',theme:'ramnavami'},
  '2026-04-19':{name:'Akha Trij · Akshaya Tritiya',theme:'vasant'},
  '2026-07-16':{name:'Ahmedabad Jagannath Rath Yatra',theme:'rath-yatra'},
  '2026-07-29':{name:'Guru Purnima',theme:'vasant'},
  '2026-08-17':{name:'Nag Panchami',theme:'navratri'},
  '2026-08-28':{name:'Raksha Bandhan',theme:'rakhi'},
  '2026-09-01':{name:'Nag Pancham',theme:'navratri'},
  '2026-09-02':{name:'Randhan Chhath',theme:'rakhi'},
  '2026-09-03':{name:'Shitala Satam',theme:'rakhi'},
  '2026-09-04':{name:'Krishna Janmashtami',theme:'janmashtami'},
  '2026-09-14':{name:'Ganesh Chaturthi · Hartalika Teej',theme:'ganesh'},
  '2026-09-25':{name:'Anant Chaturdashi · Ganesh Visarjan',theme:'ganesh'},
  '2026-09-26':{name:'Bhadarvi Poonam · Ambaji Mela',theme:'navratri'},
  '2026-10-19':{name:'Durga Ashtami · Maha Navami',theme:'navratri'},
  '2026-10-20':{name:'Vijayadashami · Dussehra',theme:'dussehra'},
  '2026-10-25':{name:'Sharad Purnima',theme:'vasant'},
  '2026-10-29':{name:'Karwa Chauth',theme:'rakhi'},
  '2026-11-05':{name:'Vagh Baras',theme:'diwali'},
  '2026-11-06':{name:'Dhanteras',theme:'diwali'},
  '2026-11-07':{name:'Kali Chaudas · Hanuman Puja',theme:'diwali'},
  '2026-11-08':{name:'Diwali · Chopda Pujan',theme:'diwali'},
  '2026-11-09':{name:'Govardhan Puja · Annakut',theme:'diwali'},
  '2026-11-10':{name:'Bestu Varas · Gujarati New Year',theme:'diwali'},
  '2026-11-11':{name:'Bhai Beej',theme:'diwali'},
  '2026-11-14':{name:'Labh Pancham',theme:'diwali'},
  '2026-11-16':{name:'Jalaram Bapa Jayanti',theme:'diwali'},
  '2026-11-20':{name:'Devutthana Ekadashi',theme:'diwali'},
  '2026-11-21':{name:'Tulsi Vivah',theme:'diwali'},
  '2026-11-24':{name:'Dev Diwali · Kartik Purnima',theme:'diwali'},
  '2026-12-20':{name:'Gita Jayanti',theme:'vasant'},
  '2026-12-23':{name:'Dattatreya Jayanti',theme:'vasant'},
  '2027-01-15':{name:'Makar Sankranti · Uttarayan',theme:'sankranti'},
  '2027-02-11':{name:'Vasant Panchami',theme:'vasant'},
  '2027-03-06':{name:'Maha Shivaratri',theme:'shivratri'},
  '2027-03-21':{name:'Holika Dahan',theme:'holi'},
  '2027-03-22':{name:'Holi · Dhuleti',theme:'holi'},
  '2027-04-07':{name:'Gudi Padwa · Ugadi · Chaitra Navratri',theme:'navratri'},
  '2027-04-14':{name:'Durga Ashtami',theme:'navratri'},
  '2027-04-15':{name:'Rama Navami',theme:'ramnavami'},
  '2027-04-20':{name:'Hanuman Jayanti',theme:'ramnavami'},
  '2027-05-09':{name:'Akha Trij · Akshaya Tritiya',theme:'vasant'},
  '2027-07-05':{name:'Ahmedabad Jagannath Rath Yatra',theme:'rath-yatra'},
  '2027-07-14':{name:'Gauri Vrat begins · Devshayani Ekadashi',theme:'navratri'},
  '2027-07-16':{name:'Jayaparvati Vrat begins',theme:'navratri'},
  '2027-07-17':{name:'Kokila Vrat',theme:'navratri'},
  '2027-07-18':{name:'Guru Purnima · Gauri Vrat ends',theme:'vasant'},
  '2027-07-21':{name:'Jayaparvati Vrat ends',theme:'navratri'},
  '2027-08-06':{name:'Nag Panchami',theme:'navratri'},
  '2027-08-17':{name:'Raksha Bandhan',theme:'rakhi'},
  '2027-08-22':{name:'Nag Pancham',theme:'navratri'},
  '2027-08-23':{name:'Randhan Chhath',theme:'rakhi'},
  '2027-08-24':{name:'Shitala Satam',theme:'rakhi'},
  '2027-08-25':{name:'Krishna Janmashtami',theme:'janmashtami'},
  '2027-09-04':{name:'Ganesh Chaturthi',theme:'ganesh'},
  '2027-10-07':{name:'Durga Ashtami',theme:'navratri'},
  '2027-10-08':{name:'Maha Navami',theme:'navratri'},
  '2027-10-09':{name:'Vijayadashami · Dussehra',theme:'dussehra'},
  '2027-10-14':{name:'Sharad Purnima',theme:'vasant'},
  '2027-10-18':{name:'Karwa Chauth',theme:'rakhi'},
  '2027-10-26':{name:'Vagh Baras',theme:'diwali'},
  '2027-10-27':{name:'Dhanteras · Kali Chaudas',theme:'diwali'},
  '2027-10-28':{name:'Roop Chaudas',theme:'diwali'},
  '2027-10-29':{name:'Diwali · Chopda Pujan',theme:'diwali'},
  '2027-10-30':{name:'Govardhan Puja · Annakut · Bestu Varas',theme:'diwali'},
  '2027-10-31':{name:'Bhai Beej',theme:'diwali'},
  '2027-11-03':{name:'Labh Pancham',theme:'diwali'},
  '2027-11-05':{name:'Jalaram Bapa Jayanti',theme:'diwali'},
  '2027-11-10':{name:'Devutthana Ekadashi',theme:'diwali'},
  '2027-11-11':{name:'Tulsi Vivah',theme:'diwali'},
  '2027-11-13':{name:'Dev Diwali · Kartik Purnima',theme:'diwali'}
};
for(const [start,count,name,theme] of [
  ['2026-03-19',9,'Chaitra Navratri','navratri'],
  ['2026-10-11',9,'Sharad Navratri','navratri'],
  ['2027-04-07',9,'Chaitra Navratri','navratri'],
  ['2027-09-30',9,'Sharad Navratri','navratri']
] as const){
  const [year,month,day]=start.split('-').map(Number);
  const first=Date.UTC(year,month-1,day);
  for(let offset=0;offset<count;offset++){
    const date=new Date(first+offset*86400000);
    const key=date.getUTCFullYear()+'-'+String(date.getUTCMonth()+1).padStart(2,'0')+'-'+String(date.getUTCDate()).padStart(2,'0');
    if(!FESTIVAL_DATES[key]) FESTIVAL_DATES[key]={name,theme};
  }
}
function currentFestival():FestivalInfo|null{
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const get=(type:string)=>parts.find(part=>part.type===type)?.value||'';
  return FESTIVAL_DATES[get('year')+'-'+get('month')+'-'+get('day')]||null;
}
function FestivalTheme(){
  useEffect(()=>{
    const apply=()=>{
      const festival=currentFestival();
      if(festival){document.documentElement.dataset.festivalTheme=festival.theme;document.documentElement.dataset.festivalName=festival.name;}
      else{delete document.documentElement.dataset.festivalTheme;delete document.documentElement.dataset.festivalName;}
    };
    apply();
    const timer=window.setInterval(apply,60_000);
    return()=>{window.clearInterval(timer);delete document.documentElement.dataset.festivalTheme;delete document.documentElement.dataset.festivalName;};
  },[]);
  return null;
}
function FestivalBadge(){
  const [festival,setFestival]=useState<FestivalInfo|null>(()=>currentFestival());
  useEffect(()=>{const update=()=>setFestival(currentFestival());const timer=window.setInterval(update,60_000);return()=>window.clearInterval(timer);},[]);
  if(!festival)return null;
  const icons:Record<string,string>={holi:'🎨',diwali:'🪔',rakhi:'🎀',janmashtami:'🦚',ganesh:'🪷',navratri:'✨',dussehra:'🏹',sankranti:'🪁',vasant:'🌼',ramnavami:'🚩',shivratri:'🔱','rath-yatra':'🛕'};
  return <div className="kb-festival-ribbon" title={festival.name} aria-label={'Festival decoration: '+festival.name}><span className="kb-festival-icon">{icons[festival.theme]||'✦'}</span><strong>{festival.name}</strong><span className="kb-festival-note">Festival mode</span></div>;
}
function FestivalCelebration(){
  const [festival,setFestival]=useState<FestivalInfo|null>(()=>currentFestival());
  useEffect(()=>{const update=()=>setFestival(currentFestival());const timer=window.setInterval(update,60_000);return()=>window.clearInterval(timer);},[]);
  if(!festival)return null;
  const motifs:Record<string,string[]>={holi:['🎨','🟣','🟡','🩷','🟢'],diwali:['🪔','✨','🌟','🪷','✨'],rakhi:['🎀','🪷','✨','🧵','🌸'],janmashtami:['🦚','🪈','🌼','🪷','✨'],ganesh:['🪷','🐘','🌺','✨','🌼'],navratri:['✨','💃','🥁','🌺','🪔'],dussehra:['🏹','🌼','✨','🚩','🌺'],sankranti:['🪁','🪁','☀️','🎏','✨'],vasant:['🌼','🌸','🦋','🌿','✨'],ramnavami:['🚩','🏹','🌼','🪷','✨'],shivratri:['🔱','🌙','🪷','✨','🌺'],'rath-yatra':['🛕','🌼','🚩','✨','🌺']};
  const motifsForDay=motifs[festival.theme]||['✨','🌼','🪷','✨','🌸'];
  return <section className={'kb-festival-hero kb-festival-'+festival.theme} aria-label={festival.name+' celebration'}>
    <div className="kb-festival-art" aria-hidden="true">{festival.theme==='diwali'?<div className="kb-diya-row">{Array.from({length:5},(_,index)=><span key={index} style={{animationDelay:(index*.18)+'s'}}>🪔</span>)}</div>:motifsForDay.map((motif,index)=><span key={index} className={'kb-festival-float kb-festival-float-'+index}>{motif}</span>)}</div>
    <div className="kb-festival-network" aria-hidden="true"><Wifi size={72}/><span>K&amp;B CONNECTED CELEBRATIONS</span><i/><i/><i/></div>
    <div className="kb-festival-hero-copy"><span className="kb-festival-kicker">K&amp;B FESTIVE CELEBRATION</span><h2>{festival.name}</h2><p>Wishing our K&amp;B family joy, prosperity and a wonderful celebration.</p></div>
    <div className="kb-festival-seal" aria-hidden="true">{motifsForDay[0]}</div>
    <span className="kb-festival-spark kb-festival-spark-one" aria-hidden="true">✦</span><span className="kb-festival-spark kb-festival-spark-two" aria-hidden="true">✧</span>
  </section>;
}
function WelcomeIntro(){return <div className="kb-welcome-intro" role="status" aria-label="Welcome to K&B Management Nexus"><div className="kb-welcome-orbit"><span/><span/><span/><div className="kb-welcome-mark"><Signal size={34}/></div></div><div className="kb-welcome-brand">K&amp;B <b>NET SERVICE</b></div><div className="kb-welcome-caption">MANAGEMENT NEXUS</div><div className="kb-welcome-loading"><i/></div></div>;}
type WorkspaceErrorBoundaryProps={children:ReactNode;onReset:()=>void};
type WorkspaceErrorBoundaryState={hasError:boolean};
class WorkspaceErrorBoundary extends Component<WorkspaceErrorBoundaryProps,WorkspaceErrorBoundaryState>{
 state:WorkspaceErrorBoundaryState={hasError:false};
 static getDerivedStateFromError():WorkspaceErrorBoundaryState{return {hasError:true};}
 componentDidCatch(error:Error,info:ErrorInfo){console.error('K&B workspace render failure after sign-in',error,info.componentStack);}
 render(){
  if(this.state.hasError)return <div className="auth-shell"><main className="auth-main"><section className="auth-card" role="alert"><div className="auth-icon"><ShieldCheck/></div><span className="eyebrow">WORKSPACE RECOVERY</span><h2>We couldn't open your workspace</h2><p>Your sign-in screen is still available. Please return to sign in; no business records have been changed by this screen.</p><button type="button" className="btn primary auth-submit" onClick={this.props.onReset}>Return to sign in</button></section></main></div>;
  return this.props.children;
 }
}
function App(){
 const [session,setSession]=useState<Session|null>(null);const [checking,setChecking]=useState(true);const [showWelcome,setShowWelcome]=useState(true);
 useEffect(()=>{const timer=window.setTimeout(()=>setShowWelcome(false),1500);return()=>window.clearTimeout(timer);},[]);
 useEffect(()=>{void client.get('/api/_healthcheck').catch(()=>undefined);},[]);
 useEffect(()=>{let live=true;async function restore(){localStorage.removeItem('kb-customer-session');const raw=sessionStorage.getItem('kb-customer-session');if(!raw){setChecking(false);return;}try{const old=JSON.parse(raw) as Session;const r=await client.get('/api/auth/me?sessionToken='+encodeURIComponent(old.token));if(live)setSession({...old,user:r.data.user});}catch{sessionStorage.removeItem('kb-customer-session');}finally{if(live)setChecking(false);}}restore();return()=>{live=false;};},[]);
 async function login(userId:string,password:string,expectedRole:'admin'|'staff'){const next=await signInAppUser(userId,password,expectedRole) as Session;if(next.user.role!==expectedRole){await signOutAppUser();throw new Error(expectedRole==='admin'?'This account is not an admin account. Choose Staff Sign In instead.':'This account is not a staff account. Choose Admin Sign In instead.');}sessionStorage.setItem('kb-customer-session',JSON.stringify(next));setSession(next);}
 if(showWelcome)return <><FestivalTheme/><WelcomeIntro/></>;
 if(checking)return <><FestivalTheme/><div className="loading-cover"><div className="loader"/><span>Preparing secure sign-in…</span></div></>;
 return <><FestivalTheme/>{session?<WorkspaceErrorBoundary key={session.user.id} onReset={()=>{void signOutAppUser();sessionStorage.removeItem('kb-customer-session');localStorage.removeItem('kb-customer-session');setSession(null);}}><Workspace session={session} onLogout={()=>{void signOutAppUser();sessionStorage.removeItem('kb-customer-session');localStorage.removeItem('kb-customer-session');setSession(null);}}/></WorkspaceErrorBoundary>:<LoginScreen onLogin={login}/>}</>;
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
 function choose(nextRole:'admin'|'staff'){setRole(nextRole);setId('');setPw('');setMsg('');}
 const [loginBusy,setLoginBusy]=useState(false);
 async function submit(e:FormEvent){e.preventDefault();if(loginBusy)return;setLoginBusy(true);setMsg('');try{if(role)await onLogin(id,pw,role);}catch(err){setMsg(err instanceof Error?err.message:'Sign-in failed.');}finally{setLoginBusy(false);}}
 async function submitRegistration(){setRegistrationBusy(true);setRegistrationMessage('');setRegistrationError(false);try{const result=await submitStaffRegistrationRequest(registration);localStorage.setItem('kandb-staff-registration',JSON.stringify({id:result.id,trackingCode:result.trackingCode}));setRegistrationStatus({status:'pending',createdAt:new Date().toISOString()});setRegistrationMessage(result.message);setRegistrationOpen(false);setRegistration({userId:'',displayName:'',phone:'',reason:''});}catch(err){setRegistrationMessage(err instanceof Error?err.message:'Could not submit your request.');setRegistrationError(true);}finally{setRegistrationBusy(false);}}
 return <div className="auth-shell"><div className="auth-side"><div className="auth-brand"><div className="brand-mark"><Signal/></div><strong>K&B NET SERVICE</strong></div><div className="auth-promo"><span className="auth-kicker">K&B OPERATIONS</span><h1>Every customer connection, in view.</h1><p>Customer records, staff assignments, collections and service requests in one shared workspace.</p></div></div><div className="auth-main"><FestivalCelebration/><form className="auth-card" onSubmit={submit}><div className="auth-icon">{role==='staff'?<UserRound/>:<ShieldCheck/>}</div><span className="eyebrow">SECURE SIGN IN</span><h2>{role?(role==='admin'?'Admin sign in':'Staff sign in'):'Welcome to K&B'}</h2><p>{role?'Enter your '+role+' account details to continue.':'Choose how you want to sign in.'}</p>
 {!role?<><div className="login-role-options"><button type="button" className="login-role-card admin-choice" onClick={()=>choose('admin')}><span className="login-role-icon"><ShieldCheck size={22}/></span><strong>Admin Sign In</strong><small>Manage customers, staff, plans and reports</small><span className="login-role-arrow">Continue →</span></button><button type="button" className="login-role-card staff-choice" onClick={()=>choose('staff')}><span className="login-role-icon"><UserRound size={22}/></span><strong>Staff Sign In</strong><small>View assigned customers and manage daily work</small><span className="login-role-arrow">Continue →</span></button></div>
 {registrationStatus ? <div className="registration-status">
  <div className="registration-status-steps"><span className="done">Submitted</span><span className={registrationStatus.status==='pending'?'current':'done'}>Admin review</span><span className={registrationStatus.status==='approved'?'done':registrationStatus.status==='rejected'?'rejected':''}>{registrationStatus.status==='rejected'?'Rejected':'Approved'}</span></div>
  <strong>{registrationStatus.status==='pending'?'Your request is awaiting admin approval.':registrationStatus.status==='approved'?'Your staff access is approved.':'Your staff access request was rejected.'}</strong>
  <small>Request submitted {new Date(registrationStatus.createdAt).toLocaleString('en-IN')}{registrationStatus.reviewedAt?' · Reviewed '+new Date(registrationStatus.reviewedAt).toLocaleString('en-IN'):''}</small>
  {registrationStatus.status==='rejected' && <button type="button" className="auth-link" onClick={()=>{localStorage.removeItem('kandb-staff-registration');setRegistrationStatus(null);setRegistrationOpen(true);}}>Submit a new request</button>}
 </div> : !registrationOpen?<button type="button" className="auth-link" onClick={()=>{setRegistrationOpen(true);setRegistrationMessage('');}}>Request staff access</button>:<div className="staff-registration-form"><strong>Staff registration request</strong><Field label="Preferred staff ID"><input required minLength={3} maxLength={32} pattern="[a-zA-Z0-9_-]{3,32}" value={registration.userId} onChange={e=>setRegistration({...registration,userId:e.target.value})}/></Field><Field label="Full name"><input required maxLength={80} value={registration.displayName} onChange={e=>setRegistration({...registration,displayName:e.target.value})}/></Field><Field label="Phone (optional)"><input type="tel" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} value={registration.phone} onChange={e=>setRegistration({...registration,phone:e.target.value.replace(/\D/g,'').slice(0,10)})} placeholder="10-digit mobile number"/></Field><Field label="Reason / note (optional)"><textarea rows={2} maxLength={300} value={registration.reason} onChange={e=>setRegistration({...registration,reason:e.target.value})}/></Field><div className="form-actions"><button type="button" className="btn secondary" onClick={()=>setRegistrationOpen(false)}>Cancel</button><button type="button" className="btn primary" disabled={registrationBusy} onClick={e=>{const form=e.currentTarget.closest('.staff-registration-form');const fields=form?.querySelectorAll('input');if(fields && Array.from(fields).every(field=>field.reportValidity()))void submitRegistration();}}>{registrationBusy?'Submitting…':'Submit request'}</button></div></div>}
 {registrationMessage&&<div className={registrationError?'auth-message':'form-hint'}>{registrationMessage}</div>}</>:<>
 <label className="auth-field"><span>{role==='admin'?'Admin username':'Staff user ID'}</span><input value={id} onChange={e=>setId(e.target.value)} required autoComplete="username" placeholder={role==='admin'?'Enter your admin username':'Enter your staff ID'}/></label><label className="auth-field"><span>Password</span><input type="password" value={pw} onChange={e=>setPw(e.target.value)} required autoComplete="current-password"/></label>
 {msg&&<div className="auth-message">{msg}</div>}<button className="btn primary auth-submit" disabled={loginBusy}>{loginBusy?'Connecting securely…':'Sign in securely'}</button><button type="button" className="auth-link" onClick={()=>{setRole(null);setId('');setPw('');setMsg('');}}>← Choose another sign-in</button>
 </>}
 <div className="auth-security"><KeyRound size={14}/> Keep your password private. Access is based on your account role.</div></form></div></div>;
}
export default App;


