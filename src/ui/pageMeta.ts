export const PAGE_SUBTITLE: Record<string, { admin: string; staff?: string }> = {
  Overview: { admin: 'Here’s what is happening with your connections today.', staff: 'Your work at a glance' },
  Customers: { admin: 'Manage customer details, connections and account status.' },
  'Plans & Pricing': { admin: 'Your available internet packages and monthly pricing.' },
  Subscriptions: { admin: 'Manage customer renewals, subscription periods and expiry dates.' },
  Installations: { admin: 'Schedule customer installations, upgrades and repair visits.' },
  'Team Operations': { admin: 'Manage staff shifts, attendance, holiday requests and team communication.' },
  Inventory: { admin: 'Track equipment, stock levels, supplies and stock movements.' },
  Invoices: { admin: 'Create professional GST invoices and customer-ready PDF documents.' },
  Payments: { admin: 'Track customer collections and payment history.' },
  Staff: { admin: 'Manage staff accounts, assignments and collection performance.' },
  'Admin Accounts': { admin: 'Create and view administrator sign-in accounts.' },
  Calendar: { admin: 'View task deadlines and team attendance by date.' },
  Tasks: { admin: 'Assign work, set priorities and monitor team progress.' },
  'My Work': { admin: 'Your assigned work, priorities and due dates.' },
  'My Day': { admin: 'Your attendance, customer visits, team updates and messages.' },
  Salary: { admin: 'Record monthly staff salaries and export payroll.' },
  Complaints: { admin: 'Track and resolve customer service requests.' },
  'Finance & Billing': { admin: 'Collections, expenses, ledgers and reports.' },
  'GPS Tracking': { admin: 'Consent-based, shift-scoped staff location.' },
};
export function pageSubtitle(page: string, isAdmin: boolean): string {
  const entry = PAGE_SUBTITLE[page];
  return entry ? (isAdmin ? entry.admin : (entry.staff ?? entry.admin)) : '';
}
