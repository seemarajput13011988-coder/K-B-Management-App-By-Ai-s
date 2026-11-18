import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { api, subscribeToApiChanges } from './lib/api';

type Customer = { id: string; name: string; phone?: string; plan: string; monthlyFee: number; dueDate: string };
type Plan = { id: string; name: string; price: number; active: boolean };
type Subscription = {
  id: string; customerId: string; customerName: string; plan: string; startDate: string; endDate: string;
  amount: number; status: 'Active'|'Pending'|'Expired'|'Cancelled'; paymentStatus: 'Paid'|'Pending';
  paidAt?: string; paymentMethod?: string; createdAt: string; notes?: string;
};

const todayKey = () => {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
};
const addDays = (value: string, count: number) => {
  const [y,m,d] = value.split('-').map(Number);
  const date = new Date(y, m-1, d + count);
  return [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0')].join('-');
};
const labelDate = (value: string) => value ? new Date(value+'T12:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—';
const money = (value: number) => '₹'+Number(value||0).toLocaleString('en-IN');

export default function SubscriptionWorkspace({ customers, plans, isAdmin, flash }: {
  customers: Customer[]; plans: Plan[]; isAdmin: boolean; flash: (message: string) => void;
}) {
  const [items,setItems] = useState<Subscription[]>([]);
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [showForm,setShowForm] = useState(false);
  const [customerId,setCustomerId] = useState(customers[0]?.id || '');
  const selectedCustomer = customers.find(item=>item.id===customerId);
  const [plan,setPlan] = useState(selectedCustomer?.plan || plans.find(item=>item.active)?.name || '');
  const [startDate,setStartDate] = useState(() => selectedCustomer?.dueDate ? addDays(selectedCustomer.dueDate,1) : todayKey());
  const [endDate,setEndDate] = useState(() => addDays(todayKey(),30));
  const [amount,setAmount] = useState(String(selectedCustomer?.monthlyFee || plans.find(item=>item.name===plan)?.price || 0));
  const [paymentStatus,setPaymentStatus] = useState<'Paid'|'Pending'>('Pending');
  const [paidAt,setPaidAt] = useState(todayKey());
  const [paymentMethod,setPaymentMethod] = useState('UPI');
  const [filter,setFilter] = useState<'All'|'Active'|'Pending'|'Expired'|'Cancelled'>('All');
  const [paymentFilter,setPaymentFilter] = useState<'All'|'Paid'|'Pending'>('All');
  const [sortBy,setSortBy] = useState<'recent'|'expiry'|'amount'|'customer'>('recent');

  async function load() {
    setLoading(true);
    try { const result=await api.get<{items:Subscription[]}>('/api/subscriptions'); setItems(result.data.items||[]); }
    catch(error) { flash(error instanceof Error?error.message:'Could not load renewals.'); }
    finally { setLoading(false); }
  }
  useEffect(()=>{ void load(); },[]);
  useEffect(()=>subscribeToApiChanges(()=>{void load();}),[]);
  useEffect(()=>{ if (!customerId && customers.length) setCustomerId(customers[0].id); },[customers,customerId]);
  useEffect(()=>{
    if (!selectedCustomer) return;
    setPlan(selectedCustomer.plan || plans.find(item=>item.active)?.name || '');
    setAmount(String(selectedCustomer.monthlyFee || plans.find(item=>item.name===selectedCustomer.plan)?.price || 0));
    const today = todayKey();
    const dueDateStart = selectedCustomer.dueDate ? addDays(selectedCustomer.dueDate,1) : today;
    const nextStart = dueDateStart > today ? dueDateStart : today;
    setStartDate(nextStart);
    setEndDate(addDays(nextStart,30));
  },[customerId]);
  useEffect(()=>{
    const selectedPlan=plans.find(item=>item.name===plan);
    if(selectedPlan) setAmount(String(selectedPlan.price));
  },[plan]);

  const visible = useMemo(()=>items
    .filter(item=>(filter==='All'||item.status===filter)&&(paymentFilter==='All'||item.paymentStatus===paymentFilter))
    .sort((a,b)=>sortBy==='expiry'?a.endDate.localeCompare(b.endDate):sortBy==='amount'?b.amount-a.amount:sortBy==='customer'?a.customerName.localeCompare(b.customerName):b.createdAt.localeCompare(a.createdAt)),
    [items,filter,paymentFilter,sortBy]);
  async function createRenewal(event: FormEvent) {
    event.preventDefault();
    if(!customerId||!plan||!startDate||!endDate||Number(amount)<=0) { flash('Complete all renewal details.'); return; }
    setSaving(true);
    try {
      await api.post('/api/subscriptions',{customerId,plan,startDate,endDate,amount:Number(amount),paymentStatus,paidAt,paymentMethod});
      setShowForm(false);
      await load();
      flash('Customer renewal saved.');
    } catch(error) { flash(error instanceof Error?error.message:'Could not save renewal.'); }
    finally { setSaving(false); }
  }
  async function changeStatus(item: Subscription,status: Subscription['status']) {
    try { await api.put('/api/subscriptions/'+item.id,{status,notes:item.notes||''}); await load(); flash('Renewal status updated.'); }
    catch(error) { flash(error instanceof Error?error.message:'Could not update renewal.'); }
  }

  return <section className="panel table-panel">
    <div className="toolbar">
      <div><h2>Customer renewals</h2><p className="subtle">Track subscription periods, expiry dates and payment status.</p></div>
      <div className="subscription-toolbar-actions">
        <select aria-label="Filter renewal status" value={filter} onChange={event=>setFilter(event.target.value as typeof filter)}>
          <option>All</option><option>Active</option><option>Pending</option><option>Expired</option><option>Cancelled</option>
        </select>
        <select aria-label="Filter payment status" value={paymentFilter} onChange={event=>setPaymentFilter(event.target.value as typeof paymentFilter)}>
          <option value="All">All payments</option><option>Paid</option><option>Pending</option>
        </select>
        <select aria-label="Sort renewals" value={sortBy} onChange={event=>setSortBy(event.target.value as typeof sortBy)}>
          <option value="recent">Recently added</option><option value="expiry">Expiry: soonest first</option><option value="amount">Amount: high to low</option><option value="customer">Customer: A–Z</option>
        </select>
        <button className="btn primary" onClick={()=>setShowForm(value=>!value)} disabled={!customers.length}>+ New renewal</button>
      </div>
    </div>
    {showForm && <form className="subscription-form" onSubmit={createRenewal}>
      <label>Customer<select required value={customerId} onChange={event=>setCustomerId(event.target.value)}>{customers.map(item=><option key={item.id} value={item.id}>{item.name} · {item.phone || item.plan}</option>)}</select></label>
      <label>Plan<select required value={plan} onChange={event=>setPlan(event.target.value)}>{plans.filter(item=>item.active).map(item=><option key={item.id} value={item.name}>{item.name}</option>)}{plan&&!plans.some(item=>item.name===plan)&&<option value={plan}>{plan} (current)</option>}</select></label>
      <label>Start date<input type="date" required value={startDate} onChange={event=>{const value=event.target.value;setStartDate(value);if(endDate<value)setEndDate(addDays(value,30));}}/></label>
      <label>Expiry date<input type="date" required min={startDate} value={endDate} onChange={event=>setEndDate(event.target.value)}/></label>
      <label>Renewal amount (₹)<input type="number" min="1" step="0.01" required value={amount} onChange={event=>setAmount(event.target.value)}/></label>
      <label>Payment status<select value={paymentStatus} onChange={event=>setPaymentStatus(event.target.value as 'Paid'|'Pending')}><option>Pending</option><option>Paid</option></select></label>
      {paymentStatus==='Paid' && <>
        <label>Paid date<input type="date" required value={paidAt} onChange={event=>setPaidAt(event.target.value)}/></label>
        <label>Payment method<select value={paymentMethod} onChange={event=>setPaymentMethod(event.target.value)}><option>UPI</option><option>Cash</option><option>Bank transfer</option><option>Card</option><option>Other</option></select></label>
      </>}
      <div className="subscription-form-actions"><button className="btn secondary" type="button" onClick={()=>setShowForm(false)}>Cancel</button><button className="btn primary" disabled={saving}>{saving?'Saving…':'Save renewal'}</button></div>
    </form>}
    {loading?<p className="ops-empty">Loading renewal history…</p>:<div className="subscription-table-wrap"><table className="subscription-table">
      <thead><tr><th>Customer</th><th>Plan</th><th>Period</th><th>Amount</th><th>Payment</th><th>Status</th>{isAdmin&&<th>Manage</th>}</tr></thead>
      <tbody>{visible.map(item=><tr key={item.id}>
        <td><strong>{item.customerName}</strong><small>{labelDate(String(item.createdAt||'').slice(0,10))}</small></td>
        <td>{item.plan}</td><td>{labelDate(item.startDate)} – {labelDate(item.endDate)}</td><td>{money(item.amount)}</td>
        <td><span className={'subscription-payment '+(item.paymentStatus==='Paid'?'paid':'unpaid')}>{item.paymentStatus}</span>{item.paymentStatus==='Paid'&&<small>{item.paymentMethod} · {labelDate(item.paidAt||'')}</small>}</td>
        <td><span className={'subscription-status '+item.status.toLowerCase()}>{item.status}</span></td>
        {isAdmin&&<td><select aria-label={'Change status for '+item.customerName} value={item.status} onChange={event=>void changeStatus(item,event.target.value as Subscription['status'])}><option>Active</option><option>Pending</option><option>Expired</option><option>Cancelled</option></select></td>}
      </tr>)}</tbody>
    </table>{!visible.length&&<p className="ops-empty">{items.length?'No renewals match this filter.':'No renewal records yet. Create the first renewal above.'}</p>}</div>}
    
  </section>;
}
