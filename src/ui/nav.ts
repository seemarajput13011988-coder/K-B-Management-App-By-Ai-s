import {
  CalendarDays, ClipboardList, CreditCard, Landmark, LayoutDashboard, MapPinned,
  MessageSquareWarning, Package, ReceiptText, Repeat, ShieldCheck, Sunrise,
  UserRound, Users, UsersRound, Wallet, Wifi, Wrench, type LucideIcon,
} from 'lucide-react';

export type NavRole = 'admin' | 'staff';
export type NavGroup = 'Home' | 'Customers & Field' | 'Management';
export type NavItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  group: NavGroup;
  roles: NavRole[];
  needsSuperAdmin?: boolean;
  tint: string;
};

export function buildNav(taskPage: 'Tasks' | 'My Work', role: NavRole, canManageAdmins = false): NavItem[] {
  const all: NavItem[] = [
    { id: 'Overview', label: 'Home', icon: LayoutDashboard, group: 'Home', roles: ['admin', 'staff'], tint: '#2563eb' },
    { id: 'Calendar', label: 'Calendar', icon: CalendarDays, group: 'Home', roles: ['admin', 'staff'], tint: '#7c3aed' },
    { id: taskPage, label: taskPage, icon: ClipboardList, group: 'Home', roles: ['admin', 'staff'], tint: '#0891b2' },
    { id: 'My Day', label: 'My Day', icon: Sunrise, group: 'Home', roles: ['staff'], tint: '#ea580c' },
    { id: 'Salary', label: 'Salary', icon: Wallet, group: 'Home', roles: ['admin'], tint: '#16a34a' },
    { id: 'Customers', label: 'Customers', icon: Users, group: 'Customers & Field', roles: ['admin', 'staff'], tint: '#2563eb' },
    { id: 'Subscriptions', label: 'Subscriptions', icon: Repeat, group: 'Customers & Field', roles: ['admin', 'staff'], tint: '#9333ea' },
    { id: 'Inventory', label: 'Inventory', icon: Package, group: 'Customers & Field', roles: ['admin', 'staff'], tint: '#d97706' },
    { id: 'Installations', label: 'Installations', icon: Wrench, group: 'Customers & Field', roles: ['admin', 'staff'], tint: '#0d9488' },
    { id: 'Plans & Pricing', label: 'Plans & Pricing', icon: Wifi, group: 'Customers & Field', roles: ['admin'], tint: '#e11d48' },
    { id: 'Payments', label: 'Payments', icon: CreditCard, group: 'Customers & Field', roles: ['admin', 'staff'], tint: '#16a34a' },
    { id: 'Complaints', label: 'Complaints', icon: MessageSquareWarning, group: 'Customers & Field', roles: ['admin', 'staff'], tint: '#dc2626' },
    { id: 'Team Operations', label: 'Team Operations', icon: UsersRound, group: 'Management', roles: ['admin'], tint: '#4f46e5' },
    { id: 'GPS Tracking', label: 'GPS Tracking', icon: MapPinned, group: 'Management', roles: ['admin'], tint: '#0284c7' },
    { id: 'Staff', label: 'Staff', icon: UserRound, group: 'Management', roles: ['admin'], tint: '#475569' },
    { id: 'Admin Accounts', label: 'Admin Accounts', icon: ShieldCheck, group: 'Management', roles: ['admin'], needsSuperAdmin: true, tint: '#b91c1c' },
    { id: 'Invoices', label: 'Invoices', icon: ReceiptText, group: 'Management', roles: ['admin'], tint: '#c2410c' },
    { id: 'Finance & Billing', label: 'Finance & Billing', icon: Landmark, group: 'Management', roles: ['admin'], tint: '#15803d' },
  ];
  return all.filter(item => item.roles.includes(role) && (!item.needsSuperAdmin || canManageAdmins));
}

export const TABS = {
  admin: ['Overview', 'Customers', 'Payments', 'Complaints'],
  staff: ['Overview', 'My Work', 'My Day', 'Complaints'],
} as const;
