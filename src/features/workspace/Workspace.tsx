import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Filesystem } from '@capacitor/filesystem';
import { Camera } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';
const StaffOperations = lazy(() => import('../../StaffOperations'));
const FinanceWorkspace = lazy(() => import('../../FinanceWorkspace'));
const SubscriptionWorkspace = lazy(() => import('../../SubscriptionWorkspace'));
const InvoiceWorkspace = lazy(() => import('../../InvoiceWorkspace'));
const InventoryWorkspace = lazy(() => import('../../InventoryWorkspace'));
const GpsTrackingWorkspace = lazy(() => import('../../GpsTrackingWorkspace'));
const InstallationsWorkspace = lazy(() => import('../../InstallationsWorkspace'));
const CalendarWorkspace = lazy(() => import('../../CalendarWorkspace'));
import { useAppPreferences } from '../../appPreferences';
import { buildNav, TABS } from '../../ui/nav';
import { pageSubtitle } from '../../ui/pageMeta';
import { MoreServicesSheet } from '../../ui/MoreServicesSheet';
import { useConfirm } from '../../ui/ConfirmDialog';
import { Empty } from '../../ui/Empty';
import { HomeHero } from '../../ui/HomeHero';
import { StatCard } from '../../ui/StatCard';
import { Field } from '../../ui/Field';
import { Modal } from '../../ui/Modal';
import { ProfileItem } from '../../ui/ProfileItem';
import { CustomerTable } from '../customers/CustomerTable';
import { CustomerModal } from '../customers/CustomerModal';
import { PaymentTable } from '../payments/PaymentTable';
import { PaymentModal } from '../payments/PaymentModal';
import { MonthlyChart } from '../overview/MonthlyChart';
import { StatusChart } from '../overview/StatusChart';
import { OverduePanel } from '../overview/OverduePanel';
import { PlanModal } from '../plans/PlanModal';
import { TaskModal } from '../tasks/TaskModal';
import { TaskCompletionModal } from '../tasks/TaskCompletionModal';
import { AccountSettingsModal } from '../auth/AccountSettingsModal';
import { StaffUsernameModal } from '../staff/StaffUsernameModal';
import { StaffPasswordModal } from '../staff/StaffPasswordModal';
import { AdminModal } from '../staff/AdminModal';
import { StaffModal } from '../staff/StaffModal';
import { getSession, type Session } from '../../lib/session';
import { registerBackButton } from '../../lib/backButton';
import type { Customer, Payment, Staff, AdminAccount, AttendanceRecord, Task, Complaint, Plan } from '../../types/models';
import { DateRangeFilter, dateRangeBounds, initialDateRange, isInDateRange, sortReportRows } from '../../components/DateRangeFilter';
import type { DateRange } from '../../components/DateRangeFilter';
import { exportCsvFile } from '../../lib/file-export';
import { api as client, nativeApiPost, changeAppPassword, changeAppUserId } from '../../lib/api';
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
  Users,
  Wifi,
  Globe,
  X,
  CalendarDays,
  Phone,
  MapPin,
  Clock3,
  CheckCircle2,
  ClipboardList,
  Wrench,
  Repeat,
  Package,
  Pencil,
  Trash2,
  Eye,
  ShieldCheck, LogOut, UserPlus, UserRound, UsersRound, LockKeyhole, ReceiptText, MoreHorizontal,
} from 'lucide-react';
import { getHinduFestival, getIndiaDateKey } from '../../festivalTheme';


type AppNotification={id:string;title:string;message:string;createdAt:string;read:boolean;type:string};
type RetentionReviewItem={id:string;collection:string;collectionLabel:string;recordLabel:string;createdAt:string};
type StaffRegistrationRequest={id:string;userId:string;displayName:string;phone?:string;reason?:string;status:'pending'|'approved'|'rejected';createdAt:string;reviewedAt?:string;};
type PortalConnectionRequest = { id: string; name?: string; phone?: string; plan?: string; planName?: string; monthlyFee?: number; address?: string; city?: string; state?: string; pincode?: string; notes?: string; status: string; createdAt?: string; updatedAt?: string; reviewedAt?: string };
type PortalPlanChangeRequest = { id: string; customerName?: string; phone?: string; currentPlan?: string; requestedPlan?: string; currentMonthlyFee?: number; requestedMonthlyFee?: number; status: string; createdAt?: string; updatedAt?: string; reviewedAt?: string };
type StaffInventoryItem = { id: string; name: string; sku: string; category: string; quantity: number; unit: string; location?: string; assignedTo?: string; createdAt?: string };
type StaffInstallationSummary = { id: string; customerName: string; assignedTo?: string; scheduledDate?: string; status?: string; type?: string; address?: string; createdAt?: string; updatedAt?: string };
type StaffPayrollSummary = { id: string; staffUserId: string; staffName: string; paidAt?: string; period?: string; amount: number; method?: string; createdAt?: string; recordedByName?: string };
type StaffHolidayRequest={id:string;userId:string;displayName:string;startDate:string;endDate:string;reason:string;status:'pending'|'approved'|'rejected';createdAt:string;reviewedAt?:string;reviewedByName?:string};
const getToken=()=>getSession()?.token || '';
const api = client;



interface WorkLocationTrackingPlugin { startTracking(options: { token: string; apiBaseUrl: string; attendanceId: string; scheduledEndAt: string }): Promise<{ started: boolean }>; stopTracking(): Promise<{ stopped: boolean }>; }
const WorkLocationTracking = registerPlugin<WorkLocationTrackingPlugin>('WorkLocationTracking');




const money = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN');
const attendanceDeadlineAt = (item: AttendanceRecord): number => {
  const stored = Date.parse(item.autoCheckoutAt || item.scheduledEndAt || '');
  if (Number.isFinite(stored)) return stored;
  const checkIn = Date.parse(item.checkInAt || '');
  if (!Number.isFinite(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(item.workDate || '')) return Number.NaN;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(checkIn));
  const minuteOfDay = Number(parts.find(part => part.type === 'hour')?.value || 0) * 60 + Number(parts.find(part => part.type === 'minute')?.value || 0);
  const endTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(item.shiftEndTime || '') ? item.shiftEndTime! : '19:00';
  const [hour, minute] = endTime.split(':').map(Number);
  const dueDate = minuteOfDay >= hour * 60 + minute ? new Date(Date.parse(item.workDate + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10) : item.workDate;
  return Date.parse(dueDate + 'T' + endTime + ':00+05:30');
};
const isAttendanceShiftActive = (item: AttendanceRecord, now = Date.now()) => !item.checkOutAt && item.dayType !== 'Absent' && String(item.status || '').toLowerCase() !== 'absent' && !item.gpsRestartRequired && !item.gpsCancelled && !String(item.status || '').toLowerCase().includes('cancelled') && !String(item.status || '').toLowerCase().includes('completed') && now < attendanceDeadlineAt(item);
const customerStatusLabel = (value: unknown): Customer['status'] => {
  const status = String(value || '').trim().toLowerCase();
  if (['suspended', 'paused', 'blocked'].includes(status)) return 'Suspended';
  if (['active', 'connected', 'enabled', ''].includes(status)) return 'Active';
  if (['inactive', 'disconnected', 'disabled', 'offline'].includes(status)) return 'Inactive';
  return 'Unknown';
};
const dateLabel = (s?: string) =>
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

export function Workspace({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const confirm = useConfirm();
  const isAdmin = session.user.role === 'admin';
  const canManageAdmins = session.user.canManageAdmins === true;
  const { language, setLanguage, theme, toggleTheme } = useAppPreferences();
  const [indiaDateKey, setIndiaDateKey] = useState(() => getIndiaDateKey());
  const festival = getHinduFestival(indiaDateKey);
  useEffect(() => {
    const updateFestival = () => setIndiaDateKey(getIndiaDateKey());
    const timer = window.setInterval(updateFestival, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.festivalTheme = festival?.theme || 'normal';
    document.documentElement.dataset.festival = festival?.name || '';
    return () => {
      delete document.documentElement.dataset.festivalTheme;
      delete document.documentElement.dataset.festival;
    };
  }, [festival]);
  const [localHour, setLocalHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const timer = window.setInterval(() => setLocalHour(new Date().getHours()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (session.user.role !== 'staff' || !Capacitor.isNativePlatform()) return;
    if (localStorage.getItem('kb-staff-permissions-v1') !== 'done') setPermissionSetupOpen(true);
  }, [session.user.id, session.user.role]);
  const greeting = localHour < 12
    ? ({ en: 'Good morning', hi: 'सुप्रभात', gu: 'સુપ્રભાત' }[language])
    : localHour < 17
      ? ({ en: 'Good afternoon', hi: 'नमस्कार', gu: 'શુભ બપોર' }[language])
      : ({ en: 'Good evening', hi: 'शुभ संध्या', gu: 'શુભ સાંજ' }[language]);
  const taskPage = isAdmin ? 'Tasks' : 'My Work';
  const [page, setPage] = useState('Overview');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [portalRequests, setPortalRequests] = useState<PortalConnectionRequest[]>([]);
  const [portalPlanChangeRequests, setPortalPlanChangeRequests] = useState<PortalPlanChangeRequest[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [staffRegistrationRequests,setStaffRegistrationRequests]=useState<StaffRegistrationRequest[]>([]);
  const [staffHolidayRequests,setStaffHolidayRequests]=useState<StaffHolidayRequest[]>([]);
  const [staffInventory,setStaffInventory]=useState<StaffInventoryItem[]>([]);
  const [staffInstallations,setStaffInstallations]=useState<StaffInstallationSummary[]>([]);
  const [staffPayroll,setStaffPayroll]=useState<StaffPayrollSummary[]>([]);
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
  const [customerStatusFilter, setCustomerStatusFilter] = useState<'All' | 'Active' | 'Suspended' | 'Inactive'>('All');
  const [complaintStatusFilter, setComplaintStatusFilter] = useState<'All' | 'Open' | 'In progress' | 'Resolved'>('All');
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
  const [paymentRange, setPaymentRange] = useState<DateRange>(initialDateRange);
  const [paymentSort, setPaymentSort] = useState('newest');
  const [staffSearch, setStaffSearch] = useState('');
  const [showComplaint, setShowComplaint] = useState(false);
  const [complaintPreview, setComplaintPreview] = useState<{name:string;mimeType:string;dataUrl:string}|null>(null);
  const [notice, setNotice] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [showMoreNav, setShowMoreNav] = useState(false);
  const [showMoreSheet, setShowMoreSheet] = useState(false);



  const [retentionItems, setRetentionItems] = useState<RetentionReviewItem[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  useEffect(() => registerBackButton(() => {
    if (showMoreSheet) { setShowMoreSheet(false); return true; }
    if (notificationsOpen) { setNotificationsOpen(false); return true; }
    if (mobileNav) { setMobileNav(false); return true; }
    if (showAccountSettings) { setShowAccountSettings(false); return true; }
    if (showCustomer) { setShowCustomer(false); setEditing(null); return true; }
    if (showPlan) { setShowPlan(false); setEditingPlan(null); return true; }
    if (showPayment) { setShowPayment(false); setEditingPayment(null); return true; }
    if (showComplaint) { setShowComplaint(false); return true; }
    if (showTask) { setShowTask(false); return true; }
    if (showStaff) { setShowStaff(false); return true; }
    if (showAdminModal) { setShowAdminModal(false); return true; }
    if (permissionSetupOpen) { setPermissionSetupOpen(false); return true; }
    if (completingTask) { setCompletingTask(null); return true; }
    if (taskPreview) { setTaskPreview(null); return true; }
    if (complaintPreview) { setComplaintPreview(null); return true; }
    if (attendanceEdit) { setAttendanceEdit(null); return true; }
    if (selected) { setSelected(null); return true; }
    if (resetStaff) { setResetStaff(null); return true; }
    if (editStaffUserId) { setEditStaffUserId(null); return true; }
    if (page !== 'Overview') { setPage('Overview'); return true; }
    return false;
  }), [showMoreSheet, notificationsOpen, mobileNav, showAccountSettings, showCustomer, showPlan, showPayment, showComplaint, showTask, showStaff, showAdminModal, permissionSetupOpen, completingTask, taskPreview, complaintPreview, attendanceEdit, selected, resetStaff, editStaffUserId, page]);
  const notificationAnchorRef = useRef<HTMLDivElement | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const seenNotifications = useRef<Set<string> | null>(null);
  const pushToken = useRef<string | null>(null);

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
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNav(false);
    };
    const previousBodyOverflow = document.body.style.overflow;
    const previousRootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
      window.removeEventListener('keydown', closeOnEscape);
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
        const [s, requests, inventoryResult, installationResult, payrollResult, holidayResult, portalResult, portalPlanResult] = await Promise.all([api.get('/api/staff'),api.get('/api/staff-registration-requests'),api.get('/api/inventory'),api.get('/api/installations'),api.get('/api/payroll'),api.get('/api/holidays'),api.get('/api/portal/connection-requests'),api.get('/api/portal/plan-change-requests')]);
        setStaff(s.data.items || []);
        setStaffRegistrationRequests(requests.data.items || []);
        setStaffHolidayRequests(holidayResult.data.items || []);
        setStaffInventory(inventoryResult.data.items || []);
        setStaffInstallations(installationResult.data.items || []);
        setStaffPayroll(payrollResult.data.items || []);
        setPortalRequests(portalResult.data.items || []);
        setPortalPlanChangeRequests(portalPlanResult.data.items || []);
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
  const openComplaints = complaints.filter(c => !['Solved', 'Resolved'].includes(c.status)).length;
  const pendingTasks = tasks.filter(task => task.status !== 'Completed').length;
  const indiaToday = getIndiaDateKey();
  const [indiaYear, indiaMonth] = indiaToday.split('-').map(Number);
  const currentBillingMonth = new Date(Date.UTC(indiaYear, indiaMonth - 1, 1)).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const paidByCustomer = new Map<string, number>();
  payments.filter(p => p.month === currentBillingMonth).forEach(p => paidByCustomer.set(p.customerId, (paidByCustomer.get(p.customerId) || 0) + Number(p.amount || 0)));
  const today = indiaToday;
  const staffShiftActive = attendanceRecords.some(item => item.userId === session.user.id && isAttendanceShiftActive(item));
  const overdueValue = customers.filter(c => c.status === 'Active' && c.dueDate && c.dueDate <= today).reduce((sum, c) => sum + Math.max(0, Number(c.monthlyFee || 0) - (paidByCustomer.get(c.id) || 0)), 0);
  const filtered = useMemo(
    () =>
      customers.filter(c =>
        (customerStatusFilter === 'All' ||
          (customerStatusFilter === 'Inactive' ? c.status === 'Inactive' || c.status === 'Unknown' : c.status === customerStatusFilter)) &&
        [c.name, c.phone, c.address, c.plan].join(' ').toLowerCase().includes(search.toLowerCase())
      ),
    [customers, search, customerStatusFilter]
  );
  const selectedStaffProfile = staff.find(member => member.id === selectedStaffProfileId);
  const filteredStaff = staff.filter(member => [member.displayName, member.userId].join(' ').toLowerCase().includes(staffSearch.toLowerCase()));
  const filteredPayments = sortReportRows(payments.filter(payment => isInDateRange(payment.paidAt, paymentRange) && [payment.customerName, payment.month, payment.method, payment.paidAt, payment.recordedByName || ''].join(' ').toLowerCase().includes(paymentSearch.toLowerCase())), paymentSort, payment => payment.paidAt, payment => Number(payment.amount || 0), payment => payment.customerName);
  const filteredComplaints = complaints.filter(item => {
    if (complaintStatusFilter === 'All') return true;
    if (complaintStatusFilter === 'Open') return !['Solved', 'Resolved'].includes(item.status);
    if (complaintStatusFilter === 'Resolved') return ['Solved', 'Resolved'].includes(item.status);
    return ['In Progress', 'In progress'].includes(item.status);
  });
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
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => { setNotice(''); noticeTimerRef.current = null; }, 3200);
  }

  useEffect(() => () => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
  }, []);

  useEffect(() => {
    const onToast = (event: Event) => {
      const message = (event as CustomEvent<string>).detail;
      if (message) flash(message);
    };
    window.addEventListener('kb:toast', onToast);
    return () => window.removeEventListener('kb:toast', onToast);
  }, []);


  async function deleteNotification(item: AppNotification) {
    if (!await confirm({ title: 'Delete this notification?', danger: true })) return;
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
    if (!await confirm({ title: 'Permanently delete plan "' + plan.name + '"? Plans linked to customers cannot be deleted; archive those instead.', danger: true })) return;
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
    if (!nextActive && !await confirm({ title: 'Archive ' + plan.name + '? Existing customer records will be kept unchanged.', danger: true })) return;
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
    if (!await confirm({ title: 'Delete ' + c.name + '? This cannot be undone.', danger: true }))
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
    if (!await confirm({ title: (status==='approved'?'Approve':'Decline')+' '+item.displayName+' holiday request for '+item.startDate+' to '+item.endDate+'?', danger: true })) return;
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
    if(!await confirm({ title: status==='approved'?'Approve '+item.displayName+' and create the staff account?':'Decline '+item.displayName+' staff access request?', danger: true }))return;
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
    if (!await confirm({ title: 'Remove administrator account ' + account.displayName + '? Their sign-in will be revoked. Existing business records and history will be preserved.', danger: true })) return;
    try { await api.delete('/api/admins/' + account.id); await load(); flash('Admin account removed. Existing records were preserved.'); }
    catch (err) { flash(err instanceof Error ? err.message : 'Could not remove admin account.'); }
  }
  async function removeStaff(staffUser: Staff) {
    if (!await confirm({ title: 'Delete staff account "' + staffUser.displayName + '"? Their sign-in will be removed and assigned customers will become unassigned. Payment, attendance and work history will be preserved.', danger: true })) return;
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
    if (!isAdmin || !await confirm({ title: 'Delete this payment record for ' + payment.customerName + '? The audit history will be preserved.', danger: true })) return;
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
    if (!isAdmin || !await confirm({ title: 'Delete task "' + task.title + '"? Its evidence files will also be removed.', danger: true })) return;
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
    if (!await confirm({ title: 'Delete this complaint and its attached photo/video? This cannot be undone.', danger: true })) return;
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

  const openCustomerPortalControl = () => {
    if (!isAdmin) return;
    const token = getToken();
    if (!token) { flash('Your admin session has expired. Please sign in again.'); return; }
    const url = 'https://k-b-customer-portal-gvzmcs.v2.appdeploy.ai/#admin-sso=' + encodeURIComponent(token);
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) window.location.assign(url);
  };

  const nav = [
    { label: 'Overview', icon: LayoutDashboard },
    { label: 'Customers', icon: Users, count: customers.length },
    ...(isAdmin ? [{ label: 'Finance & Billing', icon: IndianRupee }] : [{ label: 'My Day', icon: CalendarDays }]),
    { label: 'Complaints', icon: MessageSquare, count: openComplaints || undefined },
  ];
  const moreNavGroups = [
    {
      label: 'SERVICE OPERATIONS',
      items: [
        { label: 'Calendar', icon: CalendarDays },
        { label: taskPage, icon: ClipboardList, count: pendingTasks || undefined },
        { label: 'Installations', icon: MapPin },
        { label: 'Subscriptions', icon: CalendarDays },
      ],
    },
    {
      label: 'BUSINESS & FINANCE',
      items: [
        { label: 'Payments', icon: CreditCard },
        ...(isAdmin ? [{ label: 'Salary', icon: IndianRupee }] : []),
        ...(isAdmin ? [{ label: 'Invoices', icon: ReceiptText }] : []),
        ...(isAdmin ? [{ label: 'Plans & Pricing', icon: Wifi }] : []),
        { label: 'Inventory', icon: ClipboardList },
      ],
    },
    {
      label: 'TEAM & ADMINISTRATION',
      items: [
        ...(isAdmin ? [{ label: 'Team Operations', icon: UsersRound }] : []),
        ...(isAdmin ? [{ label: 'GPS Tracking', icon: MapPin }] : []),
        ...(isAdmin ? [{ label: 'Staff', icon: UserRound, count: staff.length }] : []),
        ...(canManageAdmins ? [{ label: 'Admin Accounts', icon: ShieldCheck, count: adminAccounts.length || undefined }] : []),
        ...(isAdmin ? [{ label: 'Customer Portal Control', icon: Globe }] : []),
      ],
    },
  ];
  const moreNav = moreNavGroups.flatMap(group => group.items);
  const configuredNav = buildNav(taskPage, isAdmin ? 'admin' : 'staff', canManageAdmins);
  const mobileTabs = [
    ...TABS[isAdmin ? 'admin' : 'staff'].map(id => configuredNav.find(item => item.id === id)).filter((item): item is NonNullable<typeof item> => Boolean(item)),
    { id: 'More', label: 'More', icon: MoreHorizontal },
  ];

  return (
    <div className="shell">
      <aside id="kb-primary-navigation" className={'sidebar ' + (mobileNav ? 'mobile-open' : '')} aria-label="K&B workspace navigation">
        <div className="brand">
          <div className="brand-mark brand-monogram" aria-label="K&B">K&amp;B</div>
          <div>
            <strong>
              K&B <span>NET SERVICE</span>
            </strong>
            <small>Operations workspace</small>
          </div>
          <button type="button" className="mobile-close" aria-label="Close navigation" onClick={() => setMobileNav(false)}>
            <X size={18} />
          </button>
        </div>
        <div className="workspace">
          <span className="workspace-dot" />
          <span>K&B Operations</span>
          <ChevronDown size={14} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav className="primary-navigation">
          {nav.map(item => (
            <button type="button" key={item.label} className={'nav-item ' + (page === item.label ? 'active' : '')}
              aria-current={page === item.label ? 'page' : undefined}
              onClick={() => { setNotificationsOpen(false); setMobileNav(false); setPage(item.label); }}>
              <item.icon size={19} /><span>{item.label}</span>{item.count ? <em>{item.count}</em> : null}
            </button>
          ))}
          <button type="button" className={'nav-item more-navigation-toggle ' + (showMoreNav || moreNav.some(item => item.label === page) ? 'active' : '')}
            aria-expanded={showMoreNav} onClick={() => setShowMoreNav(value => !value)}>
            <MoreHorizontal size={19}/><span>More tools</span><ChevronDown size={15} className={showMoreNav ? 'more-chevron expanded' : 'more-chevron'}/>
          </button>
          {showMoreNav && <div className="secondary-navigation" aria-label="Additional workspace tools">
            {moreNavGroups.map(group => (
              <section className="navigation-group" key={group.label} aria-label={group.label}>
                <div className="navigation-group-label">{group.label}</div>
                {group.items.map(item => <button key={item.label} type="button" className={'nav-item ' + (page === item.label ? 'active' : '')}
                  aria-current={page === item.label ? 'page' : undefined}
                  onClick={() => { setNotificationsOpen(false); setMobileNav(false); setShowMoreNav(true); if(item.label === 'Customer Portal Control'){openCustomerPortalControl();return;} setPage(item.label); }}>
                  <item.icon size={17}/><span>{item.label}</span>{item.count ? <em>{item.count}</em> : null}
                </button>)}
              </section>
            ))}
          </div>}
        </nav>
        <div className="sidebar-bottom">
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
        <button type="button" className="scrim" aria-label="Close navigation menu" onClick={() => setMobileNav(false)} />
      )}
      <main className="main">
        <header className="topbar">
          <button type="button" className="hamburger" aria-label="Open navigation menu" aria-controls="kb-primary-navigation" aria-expanded={mobileNav} onClick={() => setMobileNav(true)}>
            <Menu />
          </button>
          <div className="crumb">
            <span className="desktop-crumb">Workspace / <strong>{page}</strong></span>
            <strong className="mobile-brand">{page === 'Overview' ? 'Home' : page}</strong>
          </div>
          <div className="top-actions">
            <span className="system-status" title="Workspace status">
              <i /> K&amp;B workspace
            </span>
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
        <div className="content page-transition" key={page}>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                K&B NET SERVICE <span>•</span> OPERATIONS
              </div>
              <h1>{page === 'Overview' ? (isAdmin ? greeting + ', ' + session.user.displayName : 'Your work at a glance') : page}</h1>
              <p>{page === taskPage && isAdmin ? 'Assign work, set priorities and monitor team progress.' : pageSubtitle(page, isAdmin)}</p>
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

          {festival && page === 'Overview' && (
            <section className={'festival-banner festival-' + festival.theme} aria-label={festival.name + ' theme'}>
              <span className="festival-banner-symbol" aria-hidden="true">{festival.symbol}</span>
              <div><small>HINDU FESTIVAL DAY</small><strong>{festival.name}</strong><span>{festival.greeting}. Your workspace has its festival colors today.</span></div>
              <span className="festival-sparkle" aria-hidden="true">✦</span>
            </section>
          )}

          <Suspense fallback={<div className="workspace-loading" role="status" aria-live="polite">Loading workspace…</div>}>
            {page === 'Calendar' && <CalendarWorkspace tasks={tasks} attendance={attendanceRecords} isAdmin={isAdmin} />}
            {page === 'Salary' && isAdmin && <FinanceWorkspace salaryOnly session={session} customers={customers} payments={payments} flash={flash} />}
            {page === 'My Day' && !isAdmin && <StaffOperations session={session} customers={customers} flash={flash} onDataChanged={() => { void load(true); }} />}
            {page === 'Invoices' && isAdmin && <InvoiceWorkspace customers={customers} plans={plans} flash={flash} />}
            {page === 'Finance & Billing' && isAdmin && <FinanceWorkspace session={session} customers={customers} payments={payments} flash={flash} />}
            {page === 'Subscriptions' && <SubscriptionWorkspace customers={customers} plans={plans} isAdmin={isAdmin} flash={flash} />}
            {page === 'Inventory' && <InventoryWorkspace isAdmin={isAdmin} flash={flash} />}
            {page === 'GPS Tracking' && isAdmin && <GpsTrackingWorkspace flash={flash} />}
            {page === 'Installations' && <InstallationsWorkspace customers={customers} staff={staff} isAdmin={isAdmin} flash={flash} />}
          </Suspense>

          {page === 'Overview' && (
            <section className="kb-overview" aria-label="Operations overview">
              <HomeHero
                greeting={greeting}
                name={session.user.displayName}
                sub={isAdmin ? 'Payments recorded' : 'Pending tasks'}
                headline={isAdmin ? money(collected) : pendingTasks.toLocaleString('en-IN')}
                onGo={setPage}
                quick={isAdmin ? [
                  { id: 'Customers', label: 'Customers', icon: Users, tint: '#2563eb' },
                  { id: 'Payments', label: 'Payments', icon: CreditCard, tint: '#16a34a' },
                  { id: 'Complaints', label: 'Complaints', icon: MessageSquare, tint: '#dc2626' },
                  { id: 'Installations', label: 'Installs', icon: Wrench, tint: '#0d9488' },
                  { id: 'Subscriptions', label: 'Renewals', icon: Repeat, tint: '#9333ea' },
                  { id: 'Inventory', label: 'Stock', icon: Package, tint: '#d97706' },
                  { id: 'Invoices', label: 'Invoices', icon: ReceiptText, tint: '#c2410c' },
                  { id: 'Calendar', label: 'Calendar', icon: CalendarDays, tint: '#7c3aed' },
                ] : [
                  { id: 'My Work', label: 'My Work', icon: ClipboardList, tint: '#0891b2' },
                  { id: 'My Day', label: 'My Day', icon: CalendarDays, tint: '#ea580c' },
                  { id: 'Customers', label: 'Customers', icon: Users, tint: '#2563eb' },
                  { id: 'Complaints', label: 'Complaints', icon: MessageSquare, tint: '#dc2626' },
                  { id: 'Calendar', label: 'Calendar', icon: CalendarDays, tint: '#7c3aed' },
                ]}
              />
              {!isAdmin && <StaffOperations session={session} customers={customers} flash={flash} compact onDataChanged={() => { void load(true); }} />}

              {isAdmin && (
                <aside className="kb-overview-review" aria-label="Records due for review">
                  <div className="kb-overview-review-copy">
                    <Clock3 size={17}/>
                    <div><strong>Record review</strong><span>Older records are ready for a six-month review. Nothing is deleted automatically.</span></div>
                  </div>
                  <strong className="kb-overview-review-count"><span>{retentionItems.length}</span><em>Due</em></strong>
                  {retentionItems.length > 0 && <div className="kb-overview-review-list">{retentionItems.slice(0,3).map(item=><span key={item.collection+':'+item.id}>{item.recordLabel} <small>· {dateLabel(item.createdAt)}</small></span>)}</div>}
                  {retentionItems.length === 0 && <span className="kb-overview-review-clear"><CheckCircle2 size={14}/> No records due right now</span>}
                </aside>
              )}

              <section className="kb-overview-metrics" aria-label="Business snapshot">
                <StatCard className="kb-overview-metric" icon={Users} label={isAdmin ? 'Total customers' : 'My assigned customers'} value={customers.length.toLocaleString('en-IN')} detail={isAdmin ? 'Registered connections' : 'Currently assigned to you'} />
                <StatCard className="kb-overview-metric" icon={Activity} label={isAdmin ? 'Active connections' : 'Pending tasks'} value={(isAdmin ? active : pendingTasks).toLocaleString('en-IN')} detail={isAdmin ? (customers.length ? Math.round(active/customers.length*100)+'% of customer base' : 'No customers yet') : 'Assigned work to complete'} tone="success" />
                <StatCard className="kb-overview-metric" icon={IndianRupee} label={isAdmin ? 'Payments recorded' : 'My collections'} value={money(collected)} detail={isAdmin ? 'Total recorded collections' : 'Payments recorded by you'} tone="brand" />
                <StatCard className="kb-overview-metric" icon={MessageSquare} label="Open complaints" value={openComplaints.toLocaleString('en-IN')} detail="Awaiting resolution" tone={openComplaints ? 'warning' : 'success'} />
              </section>

              <div className="kb-overview-main">
                <section className="kb-overview-section kb-overview-customers">
                  <header className="kb-overview-section-head">
                    <div><h2>Recent customers</h2><p>Latest connections added to your records</p></div>
                    <button className="kb-overview-link" type="button" onClick={() => setPage('Customers')}>View all <span>→</span></button>
                  </header>
                  <CustomerTable rows={customers.slice().sort((left, right) => Date.parse(String(right.joinedAt || '')) - Date.parse(String(left.joinedAt || ''))).slice(0,5)} onView={setSelected} money={money} dateLabel={dateLabel} statusLabel={customerStatusLabel}/>
                  {!customers.length && <Empty icon={<Users/>} title="No customers yet" text="Add your first customer to start building your records." action={isAdmin ? 'Add customer' : undefined} onClick={() => setShowCustomer(true)}/>}
                </section>

                <section className="kb-overview-section kb-overview-service">
                  <header className="kb-overview-section-head">
                    <div><h2>Service snapshot</h2><p>Current operational summary</p></div>
                    <span className="kb-overview-live"><i/> Live</span>
                  </header>
                  <div className="kb-overview-service-list">
                    <div className="kb-overview-service-row"><span className="kb-overview-service-icon"><Wifi size={17}/></span><div><strong>Active connections</strong><small>Currently marked active</small></div><b>{active}</b></div>
                    <div className="kb-overview-service-row"><span className="kb-overview-service-icon"><Clock3 size={17}/></span><div><strong>Monthly plan value</strong><small>Based on active customers</small></div><b>{money(pending)}</b></div>
                    <div className="kb-overview-service-row"><span className="kb-overview-service-icon"><MessageSquare size={17}/></span><div><strong>Pending complaints</strong><small>Need attention</small></div><b>{openComplaints}</b></div>
                  </div>
                  <p className="kb-overview-service-note"><CheckCircle2 size={15}/> Your customer workspace is ready to use.</p>
                </section>
              </div>

              <div className="kb-overview-charts">
                <MonthlyChart title={isAdmin ? 'Monthly collections' : 'Your recorded collections'} subtitle="Payment totals from the last six months" items={payments} dateKey="paidAt" valueKey="amount" moneyValue money={money}/>
                <MonthlyChart title="Customer additions" subtitle={isAdmin ? 'New connections added each month' : 'Your assigned customer base by join date'} items={customers} dateKey="joinedAt" countOnly money={money}/>
              </div>
              {isAdmin && <div className="kb-overview-charts kb-overview-admin-charts"><StatusChart complaints={complaints}/><OverduePanel value={overdueValue} money={money}/></div>}

              <section className="kb-overview-section kb-overview-payments">
                <header className="kb-overview-section-head">
                  <div><h2>Recent payments</h2><p>Latest recorded customer payments</p></div>
                  <button className="kb-overview-link" type="button" onClick={() => setPage('Payments')}>View payments <span>→</span></button>
                </header>
                <PaymentTable rows={payments.slice().sort((left, right) => Date.parse(String(right.paidAt || '')) - Date.parse(String(left.paidAt || ''))).slice(0,4)} money={money} dateLabel={dateLabel}/>
              </section>
            </section>
          )}

          {page === 'Admin Accounts' && canManageAdmins && (
            <section className="panel table-panel">
              <div className="toolbar"><div><h2>Admin accounts</h2><p className="subtle">Only the primary super-admin account can create additional admins.</p></div><span className="result-count">{adminAccounts.length} admins</span></div>
              <div className="table-wrap staff-table-wrap"><table><thead><tr><th>ADMIN</th><th>USER ID</th><th>ACCESS</th><th>ROLE</th><th>ACTIONS</th></tr></thead><tbody>
                {adminAccounts.map(account => <tr key={account.id}><td data-label="Admin"><strong>{account.displayName}</strong></td><td data-label="User Id">{account.userId}</td><td data-label="Access"><span className={'status ' + (account.active ? 'active' : 'inactive')}>{account.active ? 'Active' : 'Disabled'}</span></td><td data-label="Role">{account.canManageAdmins || account.isSuperAdmin ? 'Super admin' : 'Admin'}</td><td data-label="Actions">{account.canManageAdmins || account.isSuperAdmin || account.id === session.user.id ? <span className="subtle">Protected</span> : <button className="row-action danger" title="Remove admin account" onClick={() => removeAdmin(account)}><Trash2 size={15}/></button>}</td></tr>)}
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
                  <article><small>Attendance days</small><strong>{selectedStaffAttendanceEquivalent.toLocaleString('en-IN')}</strong><span>{selectedStaffAttendance.filter(record => !!record.checkInAt && !!record.checkOutAt && record.dayType !== 'Absent' && String(record.status || '').toLowerCase() !== 'absent').length} completed shifts</span></article>
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
                    {selectedStaffPayments.length ? <div className="table-wrap"><table><thead><tr><th>DATE</th><th>CUSTOMER</th><th>AMOUNT</th><th>METHOD</th><th>MONTH</th></tr></thead><tbody>{selectedStaffPayments.map(payment => <tr key={payment.id}><td data-label="Date">{dateLabel(payment.paidAt)}</td><td data-label="Customer">{payment.customerName}</td><td data-label="Amount" className="amount">{money(payment.amount)}</td><td data-label="Method">{payment.method}</td><td data-label="Month">{payment.month}</td></tr>)}</tbody></table></div> : <p className="staff-record-empty">No payments have been recorded by this staff member yet.</p>}
                  </section>
                  <section className="staff-record-section"><div className="staff-record-section-head"><h3>Attendance history</h3><span>{selectedStaffAttendanceEquivalent.toLocaleString('en-IN')} day equivalents</span></div>
                    {selectedStaffAttendance.length ? <div className="table-wrap"><table><thead><tr><th>WORK DATE</th><th>SHIFT START</th><th>SHIFT END</th><th>DAY TYPE / STATUS</th><th>LAST CORRECTION</th><th>ACTIONS</th></tr></thead><tbody>{selectedStaffAttendance.map(record => <tr key={record.id}><td data-label="Work Date">{dateLabel(record.workDate)}</td><td data-label="Shift Start">{record.checkInAt?new Date(record.checkInAt).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):'—'}<small>{record.startedByAdmin?'Started by '+record.startedByAdmin:record.attendanceSource==='Admin'?'Started/marked by Admin':'Staff shift start'}</small></td><td data-label="Shift End">{record.checkOutAt?new Date(record.checkOutAt).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):'Not checked out'}{record.checkOutAt&&<small>{record.endedByAdminName?'Ended by '+record.endedByAdminName:record.endedByName?'Ended by '+record.endedByName:''}</small>}</td><td data-label="Day Type / Status"><span className={'status ' + (record.checkOutAt||record.dayType==='Absent'?'active':'inactive')}>{record.dayType==='Absent'?'Absent':(record.dayType==='Half day'?'Half day · ':'Full day · ')+(record.checkOutAt?'Completed':'Open shift')}</span>{record.absenceReason&&<small>{record.absenceReason}</small>}{record.correctionReason&&<small>Correction: {record.correctionReason}</small>}</td><td data-label="Last Correction">{record.correctedAt?new Date(record.correctedAt).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'})+' · '+(record.correctedByName||'Admin'):'—'}</td><td data-label="Actions"><button className="btn secondary compact" onClick={()=>setAttendanceEdit({record,dayType:record.dayType||'Full day',reason:''})}>Correct</button></td></tr>)}</tbody></table></div> : <p className="staff-record-empty">No attendance records are available for this staff member.</p>}
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

          {page === 'Customers' && isAdmin && portalRequests.length > 0 && (
            <section className="panel portal-request-panel">
              <div className="portal-request-heading">
                <div><span className="eyebrow">CUSTOMER NEXUS · LIVE INTAKE</span><h2>New connection requests</h2><p>These requests were submitted through the customer portal and are not active customer accounts yet.</p></div>
                <span className="portal-request-count">{portalRequests.filter(request => request.status === 'Pending').length} pending</span>
              </div>
              <div className="portal-request-list">
                {portalRequests.slice().sort((a, b) => Date.parse(String(b.createdAt || '')) - Date.parse(String(a.createdAt || ''))).map(request => (
                  <article className="portal-request-card" key={request.id}>
                    <div className="portal-request-main">
                      <strong>{request.name}</strong>
                      <span>{request.phone} · {request.plan} · {money(Number(request.monthlyFee || 0))}/month</span>
                      <small>{[request.address, request.city, request.state, request.pincode].filter(Boolean).join(', ')}</small>
                      <small>Received {dateLabel(request.createdAt)}</small>
                      {request.notes && <p>{request.notes}</p>}
                    </div>
                    {['Pending', 'Contacted'].includes(String(request.status || '')) ? (
                      <div className="portal-request-actions">
                        <button className="btn primary compact" onClick={async () => { const confirmed = await confirm({ title: 'Create an inactive customer record for ' + String(request.name || 'this applicant') + '?\\n\\nMobile: ' + String(request.phone || 'Not provided') + '\\nRequested plan: ' + String(request.planName || request.plan || 'Not specified') + '\\n\\nThis does not activate service. Review the address and plan details before proceeding.', danger: true }); if (!confirmed) return; try { await api.post('/api/portal/connection-requests/' + encodeURIComponent(request.id) + '/convert', {}); flash('Request converted to an inactive customer record. Confirm service details before activation.'); await load(true); } catch (error) { flash(error instanceof Error ? error.message : 'Could not convert this request.'); } }}>Convert to customer</button>
                        {request.status === 'Pending' && <button className="btn secondary compact" onClick={async () => { try { await api.put('/api/portal/connection-requests/' + encodeURIComponent(request.id), { status: 'Contacted' }); flash('Request marked as contacted.'); await load(true); } catch (error) { flash(error instanceof Error ? error.message : 'Could not update this request.'); } }}>Mark contacted</button>}
                        <button className="btn danger compact" onClick={async () => { try { await api.put('/api/portal/connection-requests/' + encodeURIComponent(request.id), { status: 'Rejected' }); flash('Request marked as rejected.'); await load(true); } catch (error) { flash(error instanceof Error ? error.message : 'Could not update this request.'); } }}>Reject</button>
                      </div>
                    ) : (
                      <span className={'portal-request-status ' + String(request.status || 'unknown').toLowerCase().replace(/[^a-z0-9-]/g, '-')}>{request.status || 'Status unavailable'} · Reviewed {dateLabel(request.reviewedAt || request.updatedAt || request.createdAt)}</span>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}
          {page === 'Customers' && isAdmin && portalPlanChangeRequests.length > 0 && (
            <section className="panel portal-request-panel">
              <div className="portal-request-heading">
                <div><span className="eyebrow">CUSTOMER NEXUS · PLAN MANAGEMENT</span><h2>Customer plan-change requests</h2><p>Approve only after verifying the customer and confirming the requested service plan.</p></div>
                <span className="portal-request-count">{portalPlanChangeRequests.filter(request => request.status === 'Pending').length} pending</span>
              </div>
              <div className="portal-request-list">
                {portalPlanChangeRequests.map(request => (
                  <article className="portal-request-card" key={request.id}>
                    <div className="portal-request-main">
                      <strong>{request.customerName}</strong>
                      <span>{request.phone} · {request.currentPlan} → {request.requestedPlan}</span>
                      <small>{money(Number(request.currentMonthlyFee || 0))}/month → {money(Number(request.requestedMonthlyFee || 0))}/month</small>
                      <small>Received {dateLabel(request.createdAt)} · Customer identity must be verified before approval</small>
                    </div>
                    {request.status === 'Pending' ? (
                      <div className="portal-request-actions">
                        <button className="btn primary compact" onClick={async () => { const confirmed = await confirm({ title: 'Confirm plan change for ' + String(request.customerName || 'this customer') + '?\\n\\nCurrent plan: ' + String(request.currentPlan || 'Unknown') + '\\nNew plan: ' + String(request.requestedPlan || 'Unknown') + '\\nNew monthly fee: ' + money(Number(request.requestedMonthlyFee || 0)) + '\\n\\nApproving immediately updates the customer record and monthly fee.', danger: true }); if (!confirmed) return; try { await api.post('/api/portal/plan-change-requests/' + encodeURIComponent(request.id) + '/decision', { decision: 'Approved' }); flash('Customer plan updated successfully.'); await load(true); } catch (error) { flash(error instanceof Error ? error.message : 'Could not approve this plan change.'); } }}>Approve & update plan</button>
                        <button className="btn danger compact" onClick={async () => { const reviewNote = window.prompt('Optional reason for rejecting this plan-change request:'); if (reviewNote === null) return; const confirmed = await confirm({ title: 'Reject the plan-change request from ' + String(request.customerName || 'this customer') + '?', danger: true }); if (!confirmed) return; try { await api.post('/api/portal/plan-change-requests/' + encodeURIComponent(request.id) + '/decision', { decision: 'Rejected', reviewNote: reviewNote.trim().slice(0, 300) }); flash('Plan-change request rejected.'); await load(true); } catch (error) { flash(error instanceof Error ? error.message : 'Could not reject this request.'); } }}>Reject</button>
                      </div>
                    ) : (
                      <span className={'portal-request-status ' + String(request.status || '').toLowerCase()}>{request.status} · Reviewed {dateLabel(request.reviewedAt || request.createdAt)}</span>
                    )}
                  </article>
                ))}
              </div>
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
              <div className="chips" aria-label="Filter customers by status">
                {(['All', 'Active', 'Suspended', 'Inactive'] as const).map(status => (
                  <button type="button" key={status} className={'chip ' + (customerStatusFilter === status ? 'active' : '')} aria-pressed={customerStatusFilter === status} onClick={() => setCustomerStatusFilter(status)}>{status}{status === 'All' ? ' · ' + customers.length : ' · ' + customers.filter(customer => status === 'Inactive' ? customer.status === 'Inactive' || customer.status === 'Unknown' : customer.status === status).length}</button>
                ))}
              </div>
              <CustomerTable
                money={money}
                dateLabel={dateLabel}
                statusLabel={customerStatusLabel}
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
              <DateRangeFilter value={paymentRange} onChange={setPaymentRange}><label><span>Sort by</span><select value={paymentSort} onChange={event=>setPaymentSort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="amount-high">Amount: high to low</option><option value="amount-low">Amount: low to high</option><option value="name">Customer name</option></select></label><button className="btn secondary compact" disabled={!filteredPayments.length} onClick={()=>{const{start,end}=dateRangeBounds(paymentRange);void exportCsvFile(`kb-payments-${start&&end?`${start}_to_${end}`:'all-dates'}.csv`,[['Date','Customer','Billing month','Method','Amount','Recorded by'],...filteredPayments.map(payment=>[payment.paidAt,payment.customerName,payment.month,payment.method,payment.amount,payment.recordedByName||''])]);}}>Export selected</button></DateRangeFilter>
              <PaymentTable rows={filteredPayments} money={money} dateLabel={dateLabel} isAdmin={isAdmin} onEdit={(payment: Payment) => { setEditingPayment(payment); setShowPayment(true); }} onDelete={isAdmin ? deletePayment : undefined} />
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
              <div className="chips" aria-label="Filter complaints by status">
                {(['All', 'Open', 'In progress', 'Resolved'] as const).map(status => (
                  <button type="button" key={status} className={'chip ' + (complaintStatusFilter === status ? 'active' : '')} aria-pressed={complaintStatusFilter === status} onClick={() => setComplaintStatusFilter(status)}>{status}{status === 'All' ? ' · ' + complaints.length : ' · ' + complaints.filter(item => status === 'Open' ? !['Solved', 'Resolved'].includes(item.status) : status === 'Resolved' ? ['Solved', 'Resolved'].includes(item.status) : ['In Progress', 'In progress'].includes(item.status)).length}</button>
                ))}
              </div>
              <div className="complaint-list">
                {filteredComplaints.map(c => {
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
            © {new Date().getFullYear()} K&amp;B NET SERVICE <span>•</span> Operations workspace
          </footer>
        </div>
      </main>

      <nav className="mobile-tab-bar" aria-label="Main navigation">
        {mobileTabs.map(item => item.id === 'More' ? (
          <button key={item.id} type="button" className={'mobile-tab ' + (mobileNav || moreNav.some(tool => tool.label === page) ? 'active' : '')} onClick={() => setShowMoreSheet(true)} aria-expanded={showMoreSheet}>
            <item.icon size={20}/><span>{item.label}</span>
          </button>
        ) : (
          <button key={item.id} type="button" className={'mobile-tab ' + (page === item.id ? 'active' : '')} onClick={() => { setPage(item.id); setMobileNav(false); setNotificationsOpen(false); }} aria-current={page === item.id ? 'page' : undefined}>
            <item.icon size={20}/><span>{item.label}</span>
          </button>
        ))}
      </nav>

      {showMoreSheet && (
        <MoreServicesSheet
          groups={moreNavGroups}
          onClose={() => setShowMoreSheet(false)}
          onSelect={item => {
            setShowMoreSheet(false);
            setNotificationsOpen(false);
            if (item.label === 'Customer Portal Control') {
              openCustomerPortalControl();
              return;
            }
            setPage(item.label);
          }}
        />
      )}

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
      {permissionSetupOpen && <StaffPermissionSetup onComplete={() => { localStorage.setItem('kb-staff-permissions-v1', 'done'); setPermissionSetupOpen(false); }} />}
      {completingTask && <TaskCompletionModal task={completingTask} flash={flash} onClose={() => setCompletingTask(null)} onComplete={(photo: File | null, video: File | null) => completeTaskWithEvidence(completingTask, photo, video)} />}
      {taskPreview && <Modal title={taskPreview.name} subtitle="Task completion evidence" onClose={() => setTaskPreview(null)}><div className="complaint-preview">{taskPreview.mimeType.startsWith('video/') ? <video src={taskPreview.dataUrl} controls playsInline /> : <img src={taskPreview.dataUrl} alt={taskPreview.name}/>}</div><div className="form-actions"><a className="btn secondary" href={taskPreview.dataUrl} download={taskPreview.name}>Download evidence</a><button type="button" className="btn primary" onClick={() => setTaskPreview(null)}>Close</button></div></Modal>}
      {showComplaint && (
        <ComplaintModal
          customers={customers}
          staff={staff}
          session={session}
          flash={flash}
          onClose={() => setShowComplaint(false)}
          onSave={saveComplaint}
        />
      )}
      {complaintPreview && <Modal title={complaintPreview.name} subtitle="Complaint attachment" onClose={() => setComplaintPreview(null)}><div className="complaint-preview">{complaintPreview.mimeType.startsWith('video/') ? <video src={complaintPreview.dataUrl} controls playsInline /> : <img src={complaintPreview.dataUrl} alt={complaintPreview.name}/>}</div><div className="form-actions"><a className="btn secondary" href={complaintPreview.dataUrl} download={complaintPreview.name}>Download attachment</a><button type="button" className="btn primary" onClick={() => setComplaintPreview(null)}>Close</button></div></Modal>}
      {showStaff && <StaffModal onClose={() => setShowStaff(false)} onSave={createStaff} />}
      {showAdminModal && canManageAdmins && <AdminModal onClose={() => setShowAdminModal(false)} onSave={createAdmin} />}
      {showAccountSettings && <AccountSettingsModal session={session} language={language} setLanguage={setLanguage} theme={theme} toggleTheme={toggleTheme} onEnableNotifications={async () => { if (Capacitor.isNativePlatform()) { const permission = await LocalNotifications.requestPermissions(); flash(permission.display === 'granted' ? 'Notifications enabled. You will receive new messages, assigned work and reminders while the app is running.' : 'Notifications are blocked. Enable them in Android settings.'); return; } if (typeof Notification === 'undefined') { flash('This browser does not support desktop notifications.'); return; } const permission = await Notification.requestPermission(); flash(permission === 'granted' ? 'Notifications enabled. You will receive new messages, assigned work and reminders while the app is open.' : 'Notifications are blocked. Enable them in your browser settings.'); }} onHelp={() => flash('Contact your K&B administrator for assistance.')} onClose={() => setShowAccountSettings(false)} onChangeUserId={async (currentPassword: string, userId: string) => { await changeAppUserId(currentPassword, userId); onLogout(); }} onChangePassword={async (currentPassword: string, newPassword: string) => { await changeAppPassword(currentPassword, newPassword); onLogout(); }} />}
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

function StaffLocationResponder({ activeShift, userId }: { activeShift: boolean; userId: string }) {
  const [shiftActive, setShiftActive] = useState(activeShift);
  const [activeShiftId, setActiveShiftId] = useState('');
  const [scheduledEndAt, setScheduledEndAt] = useState('');
  const [scheduleReady, setScheduleReady] = useState(false);
  useEffect(() => {
    let stopped = false;
    const checkShift = async () => {
      try {
        const result = await api.get('/api/attendance');
        const current = (result.data.items || []).filter((item: AttendanceRecord) => item.userId === userId && isAttendanceShiftActive(item)).sort((a: AttendanceRecord, b: AttendanceRecord) => String(b.checkInAt || '').localeCompare(String(a.checkInAt || '')))[0];
        if (!stopped) {
          setShiftActive(Boolean(current));
          setActiveShiftId(current?.id || '');
          setScheduledEndAt(current ? new Date(attendanceDeadlineAt(current)).toISOString() : '');
          setScheduleReady(true);
        }
      } catch { /* Keep last confirmed shift state while the API is unavailable. */ }
    };
    setShiftActive(activeShift);
    void checkShift();
    const timer = window.setInterval(checkShift, 15000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [activeShift, userId]);
  useEffect(() => {
    let stopped = false;
    let browserTimer: number | null = null;
    if (!scheduleReady) return;
    if (!shiftActive) {
      if (Capacitor.isNativePlatform()) void WorkLocationTracking.stopTracking().catch(() => undefined);
      return;
    }
    if (!activeShiftId || !scheduledEndAt) return;
    const reportGpsUnavailable = (reason: string) => {
      const payload = { reason };
      const update = Capacitor.isNativePlatform() ? nativeApiPost('/api/attendance/gps-lost', payload) : api.post('/api/attendance/gps-lost', payload);
      void update.catch(() => undefined);
    };
    const publishNative = async () => {
      try {
        let permission = await Geolocation.checkPermissions();
        if (permission.location !== 'granted') permission = await Geolocation.requestPermissions();
        if (permission.location !== 'granted') { reportGpsUnavailable('Location permission denied'); return; }
        await Geolocation.getCurrentPosition({ enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
        const token = getToken();
        if (!token) return;
        const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'https://kandb-management-nexus-api-zv7f.onrender.com';
        await WorkLocationTracking.startTracking({ token, apiBaseUrl, attendanceId: activeShiftId, scheduledEndAt });
      } catch { reportGpsUnavailable('Phone location services are unavailable'); }
    };
    const publishBrowser = () => {
      if (stopped || document.visibilityState !== 'visible') return;
      if (!navigator.geolocation) { reportGpsUnavailable('GPS location unavailable'); return; }
      navigator.geolocation.getCurrentPosition(async position => {
        try { await api.post('/api/staff/live-location', { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, capturedAt: new Date(position.timestamp).toISOString(), source: 'staff-app-foreground' }); }
        catch { /* The admin view reports the age of the latest confirmed location. */ }
      }, error => reportGpsUnavailable(error.code === 1 ? 'Location permission denied' : 'GPS location unavailable'), { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 });
    };
    if (Capacitor.isNativePlatform()) {
      void publishNative();
      // Keep the native service running across Activity destruction; the backend
      // rejects updates outside this exact active attendance record and deadline.
      return () => { stopped = true; };
    }
    publishBrowser();
    browserTimer = window.setInterval(publishBrowser, 15000);
    const onVisibility = () => { if (document.visibilityState === 'visible') publishBrowser(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { stopped = true; if (browserTimer !== null) window.clearInterval(browserTimer); document.removeEventListener('visibilitychange', onVisibility); };
  }, [shiftActive, activeShiftId, scheduledEndAt, scheduleReady]);
  useEffect(() => {
    let stopped = false;
    let polling = false;
    const handled = new Set<string>();
    const respond = (requestId:string) => {
      if (handled.has(requestId)) return;
      handled.add(requestId);
      Geolocation.getCurrentPosition({enableHighAccuracy:true,maximumAge:0,timeout:20000}).then(async position => {
        let address='Address unavailable; open this point in Google Maps.';
        try {
          const url='https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat='+position.coords.latitude+'&lon='+position.coords.longitude;
          const response=await fetch(url,{headers:{'Accept-Language':'en'}});
          if(response.ok){const place=await response.json() as {display_name?:string};if(place.display_name)address=place.display_name.slice(0,500);}
        } catch { /* Coordinates remain usable if reverse geocoding is unavailable. */ }
        try {
          await api.post('/api/location-requests/'+requestId+'/respond',{
            status:'captured',latitude:position.coords.latitude,longitude:position.coords.longitude,
            accuracy:position.coords.accuracy,address
          });
        } catch { /* The request remains visible to the administrator as pending until it expires. */ }
      }).catch(error => {
        const message=String(error?.message||'Phone GPS could not get a current location.');
        void api.post('/api/location-requests/'+requestId+'/respond',{status:'failed',message}).catch(()=>undefined);
      });
    };
    const poll=async()=>{
      if(stopped||polling||document.visibilityState!=='visible')return;
      polling=true;
      try{
        const result=await api.get('/api/location-requests/pending');
        for(const item of (result.data.items||[]) as Array<{id:string}>)respond(item.id);
      }catch{/* Retry on the next foreground poll. */}
      finally{polling=false;}
    };
    void poll();
    const timer=window.setInterval(()=>{void poll();},7000);
    const onVisibility=()=>{if(document.visibilityState==='visible')void poll();};
    document.addEventListener('visibilitychange',onVisibility);
    return()=>{stopped=true;window.clearInterval(timer);document.removeEventListener('visibilitychange',onVisibility);};
  },[]);
  return null;
}

function StaffPermissionSetup({ onComplete }: { onComplete:()=>void }) {
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  async function requestPermissions() {
    setBusy(true);setMessage('Requesting Android permissions…');
    const outcomes:string[]=[];
    try {
      const result=await Filesystem.requestPermissions();
      outcomes.push('Storage/media access: '+String(result.publicStorage||'handled by Android picker'));
    } catch { outcomes.push('Storage/media: Android will ask when you select a file.'); }
    try {
      const location=await Geolocation.requestPermissions();
      outcomes.push('Location: '+String(location.location||'requested'));
    } catch { outcomes.push('Location: not granted yet. Enable it in Android settings to respond to admin GPS requests.'); }
    try {
      const camera=await Camera.requestPermissions();
      outcomes.push('Camera: '+String(camera.camera||'requested'));
    } catch { outcomes.push('Camera: not granted yet. Allow it when capturing task evidence.'); }
    outcomes.push('Notifications: requested automatically when the app starts.');
    setMessage(outcomes.join('\n'));
    localStorage.setItem('kb-staff-permissions-v1','done');
    setBusy(false);
    onComplete();
  }
  return <Modal title="Set up staff app permissions" subtitle="Allow the permissions needed for task evidence, admin GPS requests and notifications." onClose={onComplete}>
    <div className="form-grid">
      <div className="form-hint">The app uses your location only when an administrator sends a one-time request. It does not track you continuously. Camera access is used for task and complaint evidence. Android’s file picker controls access to selected photos and videos.</div>
      {message&&<p className="form-hint" style={{whiteSpace:'pre-line'}}>{message}</p>}
      <div className="form-actions"><button className="btn primary" disabled={busy} onClick={()=>void requestPermissions()}>{busy?'Requesting…':'Allow required permissions'}</button><button type="button" className="btn secondary" onClick={onComplete}>Continue for now</button></div>
    </div>
  </Modal>;
}

function ComplaintModal({ customers, staff, session, onClose, onSave, flash }: any) {
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
    if (!allowed.includes(file.type)) { flash(kind === 'photo' ? 'Choose a JPG, PNG or WEBP photo.' : 'Choose an MP4, WEBM or MOV video.'); return false; }
    if (file.size > maxBytes) { flash(kind === 'photo' ? 'Photo must be 2 MB or smaller.' : 'Video must be 8 MB or smaller.'); return false; }
    return true;
  }
  return <Modal title="New complaint" subtitle="Choose a customer or staff member, then add the issue details." onClose={onClose}>
    <form className="form-grid complaint-form" onSubmit={async event => {
      event.preventDefault();
      if (f.complaintFor === 'Customer' && !f.customerId) { flash('Select a customer.'); return; }
      if (f.complaintFor === 'Staff' && !(isAdmin ? f.staffId : session.user.id)) { flash('Select a staff member.'); return; }
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
