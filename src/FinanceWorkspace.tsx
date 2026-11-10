import { useEffect, useMemo, useState } from 'react';
import { api as client, subscribeToApiChanges } from './lib/api';
import { Download, Plus, RefreshCw, ReceiptText, Trash2, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { exportCsvFile, exportPdfFile } from './lib/file-export';

type Session = { token: string; user: { id: string; displayName: string; role: 'admin' | 'staff' } };
type Customer = { id: string; name: string; monthlyFee: number; status: string; dueDate?: string };
type Payment = { id: string; customerId: string; customerName: string; amount: number; paidAt: string; month: string; method: string; recordedByName?: string };
type Expense = { id: string; title: string; category: string; amount: number; spentAt: string; method: string; notes?: string; createdByName: string };
type Invoice = { id: string; customerId: string; customerName: string; period: string; dueDate: string; amount: number; status: string; paidAmount: number };
type StaffMember = { id: string; displayName: string; userId: string; role: string; active: boolean; monthlySalary?: number };
type PayrollRecord = { id: string; staffUserId: string; staffName: string; period: string; amount: number; paidAt: string; method: string; notes?: string; recordedByName?: string; createdAt?: string };
type LedgerEntry = { id: string; date: string; type: 'Invoice' | 'Payment'; description: string; debit: number; credit: number; balance: number; reference: string };
type CustomerLedger = { customer: { id: string; name: string; phone?: string; plan?: string }; items: LedgerEntry[]; totalBilled: number; totalPaid: number; balance: number };

const money = (value: number) => '₹' + Number(value || 0).toLocaleString('en-IN');
const monthName = (period: string) => new Date(period + '-01T12:00:00').toLocaleString('en-IN', { month: 'long', year: 'numeric' });
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
async function downloadCsv(name: string, rows: unknown[][]) {
  try {
    await exportCsvFile(name, rows);
  } catch (error) {
    window.alert(error instanceof Error ? error.message : 'Could not export this CSV file.');
  }
}

async function printReport(title: string, rows: unknown[][]) {
  try {
    const { jsPDF } = await import('jspdf');
    const landscape = (rows[0]?.length || 0) >= 7;
    const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 12;
    const usableWidth = pageWidth - margin * 2;
    const columnCount = Math.max(1, ...rows.map(row => row.length));
    const columnWidth = usableWidth / columnCount;
    const lineHeight = 4;
    let y = 14;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(20, 59, 103);
    doc.text('K&B NET SERVICE', margin, y);
    y += 7;
    doc.setFontSize(12);
    doc.setTextColor(25, 38, 58);
    doc.text(title, margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('Management Nexus · Generated ' + new Date().toLocaleString('en-IN'), margin, y);
    y += 8;
    rows.forEach((row, rowIndex) => {
      const cells = Array.from({ length: columnCount }, (_, index) => String(row[index] ?? '').replace(/₹/g, 'INR '));
      const wrapped = cells.map(value => doc.splitTextToSize(value, columnWidth - 4).slice(0, 5));
      const height = Math.max(8, ...wrapped.map(lines => lines.length * lineHeight + 4));
      if (y + height > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      cells.forEach((_, colIndex) => {
        const x = margin + colIndex * columnWidth;
        if (rowIndex === 0) {
          doc.setFillColor(21, 63, 105);
          doc.setDrawColor(21, 63, 105);
          doc.rect(x, y, columnWidth, height, 'FD');
          doc.setTextColor(255, 255, 255);
          doc.setFont('helvetica', 'bold');
        } else {
          doc.setFillColor(rowIndex % 2 ? 248 : 255, rowIndex % 2 ? 250 : 255, rowIndex % 2 ? 252 : 255);
          doc.setDrawColor(220, 228, 237);
          doc.rect(x, y, columnWidth, height, 'FD');
          doc.setTextColor(40, 52, 70);
          doc.setFont('helvetica', 'normal');
        }
        doc.setFontSize(7);
        doc.text(wrapped[colIndex], x + 2, y + 4);
      });
      y += height;
    });
    const fileName = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.pdf';
    await exportPdfFile(fileName, doc.output('datauristring'));
  } catch (error) {
    window.alert(error instanceof Error ? error.message : 'Could not create this PDF report.');
  }
}

export default function FinanceWorkspace({ session, customers, payments, flash, salaryOnly = false }: {
  session: Session;
  customers: Customer[];
  payments: Payment[];
  flash: (message: string) => void;
  salaryOnly?: boolean;
}) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [audit, setAudit] = useState<Array<{ id: string; action: string; entityType: string; description: string; actorName: string; createdAt: string }>>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [payroll, setPayroll] = useState<PayrollRecord[]>([]);
  const [ledgerCustomerId, setLedgerCustomerId] = useState(customers[0]?.id || '');
  const [ledger, setLedger] = useState<CustomerLedger | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [salaryStaffId, setSalaryStaffId] = useState('');
  const [salaryAmount, setSalaryAmount] = useState('');
  const [salaryPaidAt, setSalaryPaidAt] = useState(today());
  const [salaryMethod, setSalaryMethod] = useState('Bank transfer');
  const [salaryNotes, setSalaryNotes] = useState('');
  const [salaryDrafts, setSalaryDrafts] = useState<Record<string, string>>({});
  const [period, setPeriod] = useState(today().slice(0, 7));
  const [invoiceWeek, setInvoiceWeek] = useState<'all'|'1'|'2'|'3'|'4'|'5'>('all');
  const [invoiceStatus, setInvoiceStatus] = useState<'all'|'Paid'|'Partially paid'|'Unpaid'|'Void'>('all');
  const [expenseRange, setExpenseRange] = useState<'all'|'week'|'month'>('all');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Network / provider');
  const [amount, setAmount] = useState('');
  const [spentAt, setSpentAt] = useState(today());
  const [method, setMethod] = useState('Cash');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const tokenQuery = '?sessionToken=' + encodeURIComponent(session.token);
  const load = async () => {
    const [e, i, a, st, pr] = await Promise.all([
      client.get('/api/expenses' + tokenQuery),
      client.get('/api/invoices?period=' + encodeURIComponent(period) + '&sessionToken=' + encodeURIComponent(session.token)),
      client.get('/api/audit' + tokenQuery),
      client.get('/api/staff' + tokenQuery),
      client.get('/api/payroll' + tokenQuery)
    ]);
    setExpenses(e.data.items || []);
    setInvoices(i.data.items || []);
    setAudit(a.data.items || []);
    const activeStaff = (st.data.items || []).filter((item: StaffMember) => item.active);
    setStaff(activeStaff);
    setSalaryDrafts(current => {
      const nextDrafts = { ...current };
      activeStaff.forEach((member: StaffMember) => {
        if (nextDrafts[member.id] === undefined) nextDrafts[member.id] = String(member.monthlySalary || 0);
      });
      return nextDrafts;
    });
    setPayroll(pr.data.items || []);
  };
  useEffect(() => { load().catch(() => flash('Could not load finance records.')); }, [period]);
  useEffect(() => subscribeToApiChanges(() => { void load().catch(() => flash('Could not refresh finance records.')); }), [period]);
  useEffect(() => {
    let stopped = false, inFlight = false;
    const poll = () => {
      if (stopped || inFlight || document.visibilityState === 'hidden') return;
      inFlight = true;
      void load().catch(() => flash('Could not refresh finance records.')).finally(() => { inFlight = false; });
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
  }, [period, session.token]);
  useEffect(() => { if (!ledgerCustomerId && customers.length) setLedgerCustomerId(customers[0].id); }, [customers, ledgerCustomerId]);
  useEffect(() => {
    if (!ledgerCustomerId) { setLedger(null); return; }
    let cancelled = false;
    setLedgerLoading(true);
    client.get('/api/customer-ledger?customerId=' + encodeURIComponent(ledgerCustomerId) + '&sessionToken=' + encodeURIComponent(session.token))
      .then(result => { if (!cancelled) setLedger(result.data as CustomerLedger); })
      .catch(() => { if (!cancelled) { setLedger(null); flash('Could not load the selected customer ledger.'); } })
      .finally(() => { if (!cancelled) setLedgerLoading(false); });
    return () => { cancelled = true; };
  }, [ledgerCustomerId, session.token]);
  const monthPayments = payments.filter(item => item.month === monthName(period) || item.paidAt?.slice(0, 7) === period);
  const monthExpenses = expenses.filter(item => item.spentAt?.slice(0, 7) === period);
  const collected = monthPayments.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const selectedPayroll = payroll.filter(item => String(item.period || '') === period);
  const payrollTotal = selectedPayroll.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const spent = monthExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0) + payrollTotal;
  const outstanding = invoices.reduce((sum, item) => sum + Math.max(0, Number(item.amount || 0) - Number(item.paidAmount || 0)), 0);
  const cashResult = collected - spent;
  const activeCustomers = customers.filter(item => item.status === 'Active');
  const unpaidInvoices = invoices.filter(item => item.status !== 'Paid');
  const filteredInvoices = invoices.filter(item => {
    const dueDay = Number(String(item.dueDate || '').slice(-2));
    const dueWeek = dueDay >= 1 && dueDay <= 31 ? String(Math.ceil(dueDay / 7)) : '0';
    return (invoiceWeek === 'all' || dueWeek === invoiceWeek) && (invoiceStatus === 'all' || item.status === invoiceStatus);
  });
  const sortedExpenses = useMemo(() => [...expenses].sort((a, b) => b.spentAt.localeCompare(a.spentAt)), [expenses]);
  const isWithinExpenseRange = (dateValue: string) => {
    if (expenseRange === 'all') return true;
    const date = String(dateValue || '');
    if (expenseRange === 'month') return date.slice(0, 7) === today().slice(0, 7);
    const todayDate = new Date(today() + 'T12:00:00+05:30');
    const startOfWeek = new Date(todayDate);
    startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7));
    const startKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(startOfWeek);
    return date >= startKey && date <= today();
  };
  const filteredExpenses = sortedExpenses.filter(item => isWithinExpenseRange(item.spentAt));
  const filteredExpensePayroll = payroll.filter(item => isWithinExpenseRange(item.paidAt));
  const monthlyTrend = Array.from({length:6},(_,index)=>{
    const date=new Date(); date.setDate(1); date.setMonth(date.getMonth()-(5-index));
    const key=date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0');
    const label=date.toLocaleString('en-IN',{month:'short'});
    const income=payments.filter(item=>String(item.paidAt||'').slice(0,7)===key).reduce((sum,item)=>sum+Number(item.amount||0),0);
    const monthlyPayroll=payroll.filter(item=>String(item.period||'')===key).reduce((sum,item)=>sum+Number(item.amount||0),0);
    const cost=expenses.filter(item=>String(item.spentAt||'').slice(0,7)===key).reduce((sum,item)=>sum+Number(item.amount||0),0)+monthlyPayroll;
    return {key,label,income,cost};
  });
  const trendMax=Math.max(1,...monthlyTrend.flatMap(item=>[item.income,item.cost]));


  async function generateInvoices() {
    if (!window.confirm('Generate monthly invoices for ' + monthName(period) + ' for all active customers? Existing invoices will not be duplicated.')) return;
    setBusy(true);
    try {
      const result = await client.post('/api/invoices/generate', { period, sessionToken: session.token });
      await load();
      flash(result.data.created ? result.data.created + ' invoices generated.' : 'Invoices are already up to date.');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not generate invoices.');
    } finally { setBusy(false); }
  }
  async function saveMonthlySalary(member: StaffMember) {
    const amount = Number(salaryDrafts[member.id] || 0);
    if (!Number.isFinite(amount) || amount < 0 || amount > 1000000) {
      flash('Enter a monthly salary between ₹0 and ₹10,00,000.');
      return;
    }
    setBusy(true);
    try {
      await client.put('/api/staff/' + member.id, { monthlySalary: amount, sessionToken: session.token });
      const verification = await client.get('/api/staff?sessionToken=' + encodeURIComponent(session.token));
      const savedMember = (verification.data.items || []).find((item: StaffMember) => item.id === member.id);
      if (Number(savedMember?.monthlySalary || 0) !== amount) {
        throw new Error('Monthly salary settings need the latest backend deployment. The amount was not confirmed as saved.');
      }
      await load();
      flash('Monthly salary for ' + member.displayName + ' saved.');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not save the staff salary amount.');
    } finally { setBusy(false); }
  }

  async function recordSalary(event: React.FormEvent) {
    event.preventDefault();
    if (!salaryStaffId || !salaryAmount || !salaryPaidAt) return;
    setBusy(true);
    try {
      await client.post('/api/payroll', { staffUserId: salaryStaffId, period, amount: Number(salaryAmount), paidAt: salaryPaidAt, method: salaryMethod, notes: salaryNotes, sessionToken: session.token });
      setSalaryAmount(''); setSalaryNotes('');
      await load();
      flash('Staff salary recorded.');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not record salary.');
    } finally { setBusy(false); }
  }

  async function deleteSalary(item: PayrollRecord) {
    if (session.user.role !== 'admin' || !window.confirm('Delete this salary record for ' + item.staffName + ' (' + monthName(item.period) + ')? This action will be recorded in the audit log.')) return;
    setBusy(true);
    try { await client.delete('/api/payroll/' + item.id + tokenQuery); await load(); flash('Salary record deleted.'); }
    catch (err) { flash(err instanceof Error ? err.message : 'Could not delete salary record.'); }
    finally { setBusy(false); }
  }

  async function addExpense(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await client.post('/api/expenses', { title, category, amount: Number(amount), spentAt, method, notes, sessionToken: session.token });
      setTitle(''); setAmount(''); setNotes('');
      await load();
      flash('Expense saved.');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not save expense.');
    } finally { setBusy(false); }
  }
  async function deleteExpense(item: Expense) {
    if (!window.confirm('Delete expense "' + item.title + '"? The audit history will remain.')) return;
    setBusy(true);
    try {
      await client.delete('/api/expenses/' + item.id + tokenQuery);
      await load();
      flash('Expense deleted.');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not delete expense.');
    } finally { setBusy(false); }
  }

  if (salaryOnly) return <div className="finance-workspace salary-workspace">
    <section className="panel finance-panel">
      <div className="finance-head"><div><span className="eyebrow">STAFF PAYROLL</span><h2>Monthly salary records</h2><p>Record payments and maintain each staff member's agreed monthly salary.</p></div></div>
      <div className="finance-table-wrap salary-settings-table"><table><thead><tr><th>STAFF MEMBER</th><th>MONTHLY SALARY (₹)</th><th> </th></tr></thead><tbody>
        {staff.map(member=><tr key={member.id}><td><b>{member.displayName}</b><small>{member.userId}</small></td><td><input aria-label={'Monthly salary for '+member.displayName} type="number" min="0" max="1000000" step="0.01" value={salaryDrafts[member.id] ?? String(member.monthlySalary||0)} onChange={event=>setSalaryDrafts(current=>({...current,[member.id]:event.target.value}))}/></td><td><button type="button" className="btn secondary compact" disabled={busy} onClick={()=>void saveMonthlySalary(member)}>Save amount</button></td></tr>)}
        {!staff.length&&<tr><td colSpan={3}>No active staff members.</td></tr>}
      </tbody></table></div>
      <form className="finance-expense-form" onSubmit={recordSalary}>
        <label>Staff member<select required value={salaryStaffId} onChange={e => { const member = staff.find(item => item.id === e.target.value); setSalaryStaffId(e.target.value); if (member) setSalaryAmount(String(member.monthlySalary || '')); }}><option value="">Select staff member</option>{staff.map(item => <option key={item.id} value={item.id}>{item.displayName} ({item.userId})</option>)}</select></label>
        <label>Salary amount (₹)<input required type="number" min="0.01" max="1000000" step="0.01" value={salaryAmount} onChange={e => setSalaryAmount(e.target.value)}/></label>
        <label>Payment date<input required type="date" value={salaryPaidAt} onChange={e => setSalaryPaidAt(e.target.value)}/></label>
        <label>Payment method<select value={salaryMethod} onChange={e => setSalaryMethod(e.target.value)}><option>Bank transfer</option><option>UPI</option><option>Cash</option><option>Card</option><option>Other</option></select></label>
        <label className="wide">Notes<input maxLength={300} value={salaryNotes} onChange={e => setSalaryNotes(e.target.value)} placeholder="Optional salary reference"/></label>
        <button className="btn primary" disabled={busy || !staff.length || !salaryStaffId || !salaryAmount}>{busy ? 'Saving…' : 'Record salary'}</button>
      </form>
      <div className="finance-table-wrap"><table><thead><tr><th>STAFF MEMBER</th><th>MONTH</th><th>PAID DATE</th><th>RECORDED AT</th><th>METHOD</th><th>AMOUNT</th>{session.user.role==='admin'&&<th>ACTIONS</th>}</tr></thead><tbody>
        {selectedPayroll.map(item => <tr key={item.id}><td><b>{item.staffName}</b></td><td>{monthName(item.period)}</td><td>{item.paidAt}</td><td>{item.createdAt?new Date(item.createdAt).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):'—'}</td><td>{item.method}</td><td className="amount">{money(item.amount)}</td>{session.user.role==='admin'&&<td><button className="row-action danger" title="Delete salary record" disabled={busy} onClick={()=>void deleteSalary(item)}><Trash2 size={14}/></button></td>}</tr>)}
        {!payroll.length && <tr><td colSpan={session.user.role==='admin'?7:6}>No salary payments recorded for this month.</td></tr>}
      </tbody></table></div>
      <div className="finance-foot"><span>{selectedPayroll.length} staff payments · Total salary paid: <b>{money(payrollTotal)}</b></span><button className="btn secondary compact" disabled={!selectedPayroll.length} onClick={() => downloadCsv('kb-payroll-' + period + '.csv', [['Staff member','Staff ID','Month','Paid date','Method','Amount','Notes'], ...selectedPayroll.map(item => [item.staffName, item.staffUserId, monthName(item.period), item.paidAt, item.method, item.amount, item.notes || ''])])}><Download size={14}/> Export payroll</button><button className="btn secondary compact" disabled={!selectedPayroll.length} onClick={() => printReport('Payroll · ' + monthName(period), [['Staff member','Staff ID','Month','Paid date','Method','Amount','Notes'], ...selectedPayroll.map(item => [item.staffName, item.staffUserId, monthName(item.period), item.paidAt, item.method, money(item.amount), item.notes || ''])])}><ReceiptText size={14}/> Export payroll PDF</button></div>
    </section>
  </div>;

  return <div className="finance-workspace">
    <section className="finance-metrics">
      <article><span><TrendingUp size={17}/> Collections · {monthName(period)}</span><strong>{money(collected)}</strong><small>{monthPayments.length} payment records</small></article>
      <article><span><TrendingDown size={17}/> Expenses</span><strong>{money(spent)}</strong><small>{monthExpenses.length} expense records + {payroll.length} salary payments</small></article>
      <article><span><Wallet size={17}/> Cash operating balance</span><strong className={cashResult < 0 ? 'negative' : ''}>{money(cashResult)}</strong><small>Collections minus recorded expenses</small></article>
      <article><span><ReceiptText size={17}/> Unpaid invoice balance</span><strong>{money(outstanding)}</strong><small>{unpaidInvoices.length} unpaid / partial invoices</small></article>
    </section>
    <section className="panel finance-panel">
      <div className="finance-head"><div><span className="eyebrow">STAFF PAYROLL</span><h2>Monthly salary records</h2><p>Record each staff member's salary once per month. Salary is also added to the expense ledger automatically.</p></div></div>
      <form className="finance-expense-form" onSubmit={recordSalary}>
        <label>Staff member<select required value={salaryStaffId} onChange={e => { const member = staff.find(item => item.id === e.target.value); setSalaryStaffId(e.target.value); if (member) setSalaryAmount(String(member.monthlySalary || '')); }}><option value="">Select staff member</option>{staff.map(item => <option key={item.id} value={item.id}>{item.displayName} ({item.userId})</option>)}</select></label>
        <label>Salary amount (₹)<input required type="number" min="0.01" max="1000000" step="0.01" value={salaryAmount} onChange={e => setSalaryAmount(e.target.value)}/></label>
        <label>Payment date<input required type="date" value={salaryPaidAt} onChange={e => setSalaryPaidAt(e.target.value)}/></label>
        <label>Payment method<select value={salaryMethod} onChange={e => setSalaryMethod(e.target.value)}><option>Bank transfer</option><option>UPI</option><option>Cash</option><option>Card</option><option>Other</option></select></label>
        <label className="wide">Notes<input maxLength={300} value={salaryNotes} onChange={e => setSalaryNotes(e.target.value)} placeholder="Optional salary reference"/></label>
        <button className="btn primary" disabled={busy || !staff.length || !salaryStaffId || !salaryAmount}>Record salary</button>
      </form>
      <div className="finance-table-wrap"><table><thead><tr><th>STAFF MEMBER</th><th>MONTH</th><th>PAID DATE</th><th>METHOD</th><th>AMOUNT</th></tr></thead><tbody>
        {selectedPayroll.map(item => <tr key={item.id}><td><b>{item.staffName}</b></td><td>{monthName(item.period)}</td><td>{item.paidAt}</td><td>{item.method}</td><td className="amount">{money(item.amount)}</td></tr>)}
        {!selectedPayroll.length && <tr><td colSpan={5}>No salary payments recorded for this month.</td></tr>}
      </tbody></table></div>
      <div className="finance-foot"><span>{selectedPayroll.length} staff payments · Total salary paid: <b>{money(payrollTotal)}</b></span><button className="btn secondary compact" disabled={!selectedPayroll.length} onClick={() => downloadCsv('kb-payroll-' + period + '.csv', [['Staff member','Staff ID','Month','Paid date','Method','Amount','Notes'], ...selectedPayroll.map(item => [item.staffName, item.staffUserId, monthName(item.period), item.paidAt, item.method, item.amount, item.notes || ''])])}><Download size={14}/> Export payroll</button><button className="btn secondary compact" disabled={!selectedPayroll.length} onClick={() => printReport('Payroll · ' + monthName(period), [['Staff member','Staff ID','Month','Paid date','Method','Amount','Notes'], ...selectedPayroll.map(item => [item.staffName, item.staffUserId, monthName(item.period), item.paidAt, item.method, money(item.amount), item.notes || ''])])}><ReceiptText size={14}/> Export payroll PDF</button></div>
    </section>
    <section className="panel finance-panel finance-chart-panel">
      <div className="finance-head"><div><span className="eyebrow">FINANCIAL ANALYTICS</span><h2>Six-month collection and expense trend</h2><p>Monthly recorded collections compared with recorded operating expenses.</p></div><div className="finance-chart-legend"><span><i className="income-dot"/> Collections</span><span><i className="expense-dot"/> Expenses</span></div></div>
      <div className="finance-chart" role="img" aria-label="Six month collections and expenses bar chart">
        {monthlyTrend.map(item=><div className="finance-chart-month" key={item.key}>
          <div className="finance-chart-bars">
            <div className="finance-chart-bar income-bar" style={{height:Math.max(3,item.income/trendMax*100)+'%'}} title={item.label+' collections '+money(item.income)}><span>{item.income?money(item.income):'₹0'}</span></div>
            <div className="finance-chart-bar expense-bar" style={{height:Math.max(3,item.cost/trendMax*100)+'%'}} title={item.label+' expenses '+money(item.cost)}><span>{item.cost?money(item.cost):'₹0'}</span></div>
          </div><b>{item.label}</b>
        </div>)}
      </div>
      <div className="finance-chart-foot"><span>Highest month: {monthlyTrend.reduce((best,item)=>item.income>best.income?item:best,monthlyTrend[0]).label}</span><span>Chart uses recorded transactions only</span></div>
    </section>
    <section className="panel finance-panel">
      <div className="finance-head"><div><span className="eyebrow">MONTHLY BILLING</span><h2>Customer invoices</h2><p>Filter invoices by billing month, due-date week and payment status.</p></div><div className="finance-actions"><input aria-label="Billing month" type="month" value={period} onChange={e => { setPeriod(e.target.value); setInvoiceWeek('all'); }}/><select aria-label="Filter invoices by due-date week" value={invoiceWeek} onChange={e => setInvoiceWeek(e.target.value as typeof invoiceWeek)}><option value="all">All weeks</option><option value="1">Week 1 · 1–7</option><option value="2">Week 2 · 8–14</option><option value="3">Week 3 · 15–21</option><option value="4">Week 4 · 22–28</option><option value="5">Week 5 · 29–31</option></select><select aria-label="Filter invoices by status" value={invoiceStatus} onChange={e => setInvoiceStatus(e.target.value as typeof invoiceStatus)}><option value="all">All statuses</option><option value="Paid">Paid</option><option value="Partially paid">Partially paid</option><option value="Unpaid">Unpaid</option><option value="Void">Void</option></select><button className="btn primary" disabled={busy || !activeCustomers.length} onClick={generateInvoices}>Generate invoices</button></div></div>
      <div className="finance-table-wrap"><table><thead><tr><th>CUSTOMER</th><th>PERIOD</th><th>DUE DATE</th><th>AMOUNT</th><th>PAID</th><th>BALANCE</th><th>STATUS</th></tr></thead><tbody>
        {filteredInvoices.map(item => <tr key={item.id}><td><b>{item.customerName}</b></td><td>{monthName(item.period)}</td><td>{item.dueDate}</td><td>{money(item.amount)}</td><td>{money(item.paidAmount)}</td><td className="amount">{money(Math.max(0, item.amount - item.paidAmount))}</td><td><span className={'status ' + (item.status === 'Paid' ? 'active' : 'inactive')}>{item.status}</span></td></tr>)}
        {!filteredInvoices.length && <tr><td colSpan={7}>{invoices.length ? 'No invoices match the selected week and status filters.' : 'No invoices for this month. Generate invoices to start monthly billing.'}</td></tr>}
      </tbody></table></div>
      <div className="finance-foot"><span>{filteredInvoices.length} shown of {invoices.length} invoices · {activeCustomers.length} active customers</span><button className="btn secondary compact" onClick={() => downloadCsv('kb-invoices-' + period + '.csv', [['Customer','Period','Due date','Amount','Paid','Balance','Status'], ...filteredInvoices.map(i => [i.customerName, monthName(i.period), i.dueDate, i.amount, i.paidAmount, Math.max(0, i.amount-i.paidAmount), i.status])])}><Download size={14}/> Export invoices</button><button className="btn secondary compact" onClick={() => printReport('Customer invoices · ' + monthName(period), [['Customer','Period','Due date','Amount','Paid','Balance','Status'], ...filteredInvoices.map(i => [i.customerName, monthName(i.period), i.dueDate, money(i.amount), money(i.paidAmount), money(Math.max(0,i.amount-i.paidAmount)), i.status])])}><ReceiptText size={14}/> Export PDF</button></div>
    </section>
    <section className="panel finance-panel">
      <div className="finance-head"><div><span className="eyebrow">CUSTOMER ACCOUNT</span><h2>Customer transaction ledger</h2><p>View billed invoices, received payments and the running balance for one customer.</p></div><div className="finance-actions"><select aria-label="Select customer ledger" value={ledgerCustomerId} onChange={event => setLedgerCustomerId(event.target.value)}><option value="">Select customer</option>{customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></div></div>
      {ledgerLoading ? <p className="finance-note">Loading customer ledger…</p> : ledger ? <>
        <div className="finance-metrics ledger-metrics">
          <article><span>Total billed</span><strong>{money(ledger.totalBilled)}</strong></article>
          <article><span>Payments received</span><strong>{money(ledger.totalPaid)}</strong></article>
          <article><span>Outstanding balance</span><strong className={ledger.balance > 0 ? 'negative' : ''}>{money(ledger.balance)}</strong></article>
        </div>
        <div className="finance-table-wrap"><table><thead><tr><th>DATE</th><th>TRANSACTION</th><th>DESCRIPTION</th><th>DEBIT</th><th>CREDIT</th><th>RUNNING BALANCE</th></tr></thead><tbody>
          {ledger.items.map(item => <tr key={item.id}><td>{item.date}</td><td><b>{item.type}</b></td><td>{item.description}</td><td className="amount">{item.debit ? money(item.debit) : '—'}</td><td className="amount">{item.credit ? money(item.credit) : '—'}</td><td className="amount"><b>{money(item.balance)}</b></td></tr>)}
          {!ledger.items.length && <tr><td colSpan={6}>No invoices or payments have been recorded for this customer.</td></tr>}
        </tbody></table></div>
        <div className="finance-foot"><span>{ledger.customer.name}{ledger.customer.phone ? ' · ' + ledger.customer.phone : ''}</span><div className="finance-actions">
          <button className="btn secondary compact" disabled={!ledger.items.length} onClick={() => downloadCsv('kb-ledger-' + ledger.customer.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.csv', [['Date','Type','Description','Debit','Credit','Running balance','Reference'], ...ledger.items.map(item => [item.date,item.type,item.description,item.debit,item.credit,item.balance,item.reference])])}><Download size={14}/> Export ledger</button>
          <button className="btn secondary compact" disabled={!ledger.items.length} onClick={() => printReport('Customer ledger · ' + ledger.customer.name, [['Date','Type','Description','Debit','Credit','Running balance'], ...ledger.items.map(item => [item.date,item.type,item.description,money(item.debit),money(item.credit),money(item.balance)]), ['TOTAL','', '', money(ledger.totalBilled), money(ledger.totalPaid), money(ledger.balance)]])}><ReceiptText size={14}/> Export PDF</button>
        </div></div>
      </> : <p className="finance-note">Select a customer to view their ledger.</p>}
    </section>
    <section className="panel finance-panel">
      <div className="finance-head"><div><span className="eyebrow">CASH BOOK</span><h2>Record business expense</h2><p>Track provider bills, fuel, equipment and operating costs. Staff payroll is tracked separately and included in monthly outflow.</p></div><div className="finance-actions"><select aria-label="Filter expenses by date" value={expenseRange} onChange={e => setExpenseRange(e.target.value as typeof expenseRange)}><option value="all">All time</option><option value="week">This week</option><option value="month">This month</option></select></div></div>
      <form className="finance-expense-form" onSubmit={addExpense}>
        <label>Expense title<input required maxLength={120} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Monthly upstream payment"/></label>
        <label>Category<select value={category} onChange={e => setCategory(e.target.value)}><option>Network / provider</option><option>Salary</option><option>Equipment</option><option>Fuel / travel</option><option>Office</option><option>Installation</option><option>Other</option></select></label>
        <label>Amount (₹)<input required type="number" min="0.01" max="10000000" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}/></label>
        <label>Date<input required type="date" value={spentAt} onChange={e => setSpentAt(e.target.value)}/></label>
        <label>Payment method<select value={method} onChange={e => setMethod(e.target.value)}><option>Cash</option><option>UPI</option><option>Bank transfer</option><option>Card</option><option>Other</option></select></label>
        <label className="wide">Notes<input maxLength={300} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional reference or details"/></label>
        <button className="btn primary" disabled={busy || !title.trim() || !amount}> <Plus size={15}/> Save expense</button>
      </form>
      <div className="finance-table-wrap"><table><thead><tr><th>DATE</th><th>EXPENSE</th><th>CATEGORY</th><th>METHOD</th><th>AMOUNT</th><th>RECORDED BY</th><th></th></tr></thead><tbody>
        {filteredExpenses.map(item => <tr key={item.id}><td>{item.spentAt}</td><td><b>{item.title}</b>{item.notes && <small className="finance-note">{item.notes}</small>}</td><td>{item.category}</td><td>{item.method}</td><td className="amount">{money(item.amount)}</td><td>{item.createdByName}</td><td><button className="btn danger compact" disabled={busy} onClick={() => deleteExpense(item)}>Delete</button></td></tr>)}
        {!filteredExpenses.length && <tr><td colSpan={7}>{expenses.length ? 'No expenses match this date filter.' : 'No expenses recorded yet.'}</td></tr>}
      </tbody></table></div>
      <div className="finance-foot"><span>{filteredExpenses.length} shown of {expenses.length} expense records · {filteredExpensePayroll.length} salary payments included in exports</span><button className="btn secondary compact" onClick={() => downloadCsv('kb-expenses.csv', [['Date','Title','Category','Method','Amount','Notes','Recorded by'], ...filteredExpenses.map(e => [e.spentAt,e.title,e.category,e.method,e.amount,e.notes,e.createdByName]), ...filteredExpensePayroll.map(item => [item.paidAt,'Salary - '+item.staffName,'Salary',item.method,item.amount,item.notes||'',item.recordedByName||''])])}><Download size={14}/> Export expenses</button><button className="btn secondary compact" onClick={() => printReport('Business expenses', [['Date','Title','Category','Method','Amount','Notes','Recorded by'], ...filteredExpenses.map(e => [e.spentAt,e.title,e.category,e.method,money(e.amount),e.notes||'',e.createdByName]), ...filteredExpensePayroll.map(item => [item.paidAt,'Salary - '+item.staffName,'Salary',item.method,money(item.amount),item.notes||'',item.recordedByName||''])])}><ReceiptText size={14}/> Export PDF</button></div>
    </section>
    <section className="panel finance-panel">
      <div className="finance-head"><div><span className="eyebrow">MANAGEMENT REPORTS</span><h2>Business reports</h2><p>Download your current payment and collection data for spreadsheet analysis.</p></div></div>
      <div className="finance-report-actions">
        <button className="btn secondary" onClick={() => printReport('Finance summary · ' + monthName(period), [['Metric','Amount'],['Collections',money(collected)],['Expenses including payroll',money(spent)],['Cash operating balance',money(cashResult)],['Outstanding invoices',money(outstanding)],['Payroll paid',money(payroll.reduce((sum,item)=>sum+Number(item.amount||0),0))]])}><ReceiptText size={15}/> Export PDF</button>
        <button className="btn secondary" onClick={() => downloadCsv('kb-payments-' + period + '.csv', [['Date','Customer','Billing month','Method','Amount','Recorded by'], ...monthPayments.map(p => [p.paidAt,p.customerName,p.month,p.method,p.amount,p.recordedByName])])}><Download size={15}/> Export monthly collections</button><button className="btn secondary" onClick={() => printReport('Monthly collections · ' + monthName(period), [['Date','Customer','Billing month','Method','Amount','Recorded by'], ...monthPayments.map(p => [p.paidAt,p.customerName,p.month,p.method,money(p.amount),p.recordedByName||''])])}><ReceiptText size={15}/> Collections PDF</button>
        <button className="btn secondary" onClick={() => downloadCsv('kb-customer-register.csv', [['Customer','Phone','Plan','Monthly fee','Status','Assigned to'], ...customers.map(c => [c.name,(c as any).phone,(c as any).plan,c.monthlyFee,c.status,(c as any).assignedToName])])}><Download size={15}/> Export customer register</button><button className="btn secondary" onClick={() => printReport('Customer register', [['Customer','Phone','Plan','Monthly fee','Status','Assigned to'], ...customers.map(c => [c.name,(c as any).phone,(c as any).plan,money(c.monthlyFee),c.status,(c as any).assignedToName||''])])}><ReceiptText size={15}/> Customer PDF</button>
        <button className="btn secondary" onClick={() => downloadCsv('kb-finance-summary-' + period + '.csv', [['Metric','Amount'],['Collections',collected],['Expenses including payroll',spent],['Cash operating balance',cashResult],['Outstanding invoices',outstanding]])}><Download size={15}/> Export finance summary</button><button className="btn secondary" onClick={() => printReport('Finance summary · ' + monthName(period), [['Metric','Amount'],['Collections',money(collected)],['Expenses including payroll',money(spent)],['Cash operating balance',money(cashResult)],['Outstanding invoices',money(outstanding)],['Payroll paid',money(payrollTotal)]])}><ReceiptText size={15}/> Summary PDF</button>
      </div>
      <p className="finance-disclaimer">Cash operating balance is a simple management figure: recorded collections minus recorded expenses. It is not a statutory profit figure and does not include taxes, unpaid supplier bills, depreciation or other unrecorded liabilities.</p>
    </section>
    <section className="panel finance-panel">
      <div className="finance-head"><div><span className="eyebrow">ACCOUNTABILITY</span><h2>Recent activity log</h2><p>Records important finance actions such as invoices and expense changes.</p></div><button className="btn secondary compact" onClick={() => load().catch(() => flash('Could not refresh finance data.'))}><RefreshCw size={14}/> Refresh</button></div>
      <div className="finance-audit-list">{audit.slice(0, 40).map(item => <article key={item.id}><div><b>{item.description}</b><small>{item.actorName} · {item.entityType} · {item.action}</small></div><time>{new Date(item.createdAt).toLocaleString('en-IN')}</time></article>)}{!audit.length && <p>No activity log entries yet. New finance actions will appear here.</p>}</div>
    </section>
  </div>;
}
