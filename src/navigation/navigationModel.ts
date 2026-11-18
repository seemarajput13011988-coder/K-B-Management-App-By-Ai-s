import type { LucideIcon } from 'lucide-react';
import {
  CalendarDays,
  ClipboardList,
  CreditCard,
  IndianRupee,
  LayoutDashboard,
  MapPin,
  MessageSquare,
  ReceiptText,
  ShieldCheck,
  UserRound,
  Users,
  Wifi,
} from 'lucide-react';

export type NavigationItem = {
  label: string;
  icon: LucideIcon;
  count?: number;
};

export type NavigationGroup = {
  label: string;
  items: NavigationItem[];
};

type NavigationModelInput = {
  isAdmin: boolean;
  canManageAdmins: boolean;
  taskPage: string;
  pendingTasks: number;
  customerCount: number;
  staffCount: number;
  adminCount: number;
  openComplaintCount: number;
};

/** Role-aware navigation is a pure information-architecture model.
 * It owns ordering and grouping only; the workspace owns page state and actions.
 */
export function buildNavigationModel(input: NavigationModelInput): NavigationGroup[] {
  const items: NavigationItem[] = [
    { label: 'Overview', icon: LayoutDashboard },
    { label: 'Calendar', icon: CalendarDays },
    { label: input.taskPage, icon: ClipboardList, count: input.pendingTasks || undefined },
    ...(input.isAdmin
      ? [{ label: 'Salary', icon: IndianRupee }]
      : [{ label: 'My Day', icon: CalendarDays }]),
    { label: 'Customers', icon: Users, count: input.customerCount || undefined },
    { label: 'Subscriptions', icon: CalendarDays },
    { label: 'Inventory', icon: ClipboardList },
    { label: 'Installations', icon: MapPin },
    ...(input.isAdmin ? [{ label: 'Plans & Pricing', icon: Wifi }] : []),
    ...(input.isAdmin ? [{ label: 'Team Operations', icon: Users }] : []),
    ...(input.isAdmin ? [{ label: 'GPS Tracking', icon: MapPin }] : []),
    ...(input.isAdmin ? [{ label: 'Staff', icon: UserRound, count: input.staffCount || undefined }] : []),
    ...(input.canManageAdmins ? [{ label: 'Admin Accounts', icon: ShieldCheck, count: input.adminCount || undefined }] : []),
    ...(input.isAdmin ? [{ label: 'Invoices', icon: ReceiptText }] : []),
    ...(input.isAdmin ? [{ label: 'Finance & Billing', icon: IndianRupee }] : []),
    { label: 'Payments', icon: CreditCard },
    { label: 'Complaints', icon: MessageSquare, count: input.openComplaintCount || undefined },
  ];

  const groups: NavigationGroup[] = [
    { label: 'HOME', items: items.filter(item => ['Overview', 'Calendar', input.taskPage, 'My Day', 'Salary'].includes(item.label)) },
    { label: 'CUSTOMERS & FIELD', items: items.filter(item => ['Customers', 'Subscriptions', 'Inventory', 'Installations', 'Payments', 'Complaints', 'Plans & Pricing'].includes(item.label)) },
    { label: 'MANAGEMENT', items: items.filter(item => ['Team Operations', 'GPS Tracking', 'Staff', 'Admin Accounts', 'Invoices', 'Finance & Billing'].includes(item.label)) },
  ];

  return groups.filter(group => group.items.length > 0);
}
