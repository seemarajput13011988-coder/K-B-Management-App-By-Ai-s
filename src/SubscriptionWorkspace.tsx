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

  const visible = useMemo(()=>items.filter(item=>filter==='All'||item.status===filter),[items,filter]);
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
        <select aria-label="Filter renewals" value={filter} onChange={event=>setFilter(event.target.value as typeof filter)}>
          <option>All</option><option>Active</option><option>Pending</option><option>Expired</option><option>Cancelled</option>
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
    <style>{`
      .subscription-toolbar-actions{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
      .subscription-toolbar-actions select,.subscription-table select,.subscription-form input,.subscription-form select{min-height:40px;padding:8px 10px;border:1px solid var(--border,#dbe2ec);border-radius:9px;background:var(--surface,#fff);color:var(--text,#172033);font:inherit}
      .subscription-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px;padding:16px;margin:12px 0 18px;border:1px solid var(--border,#dbe2ec);border-radius:14px;background:var(--surface-soft,#f7f9fc)}
      .subscription-form label{display:grid;gap:6px;font-size:12px;font-weight:700;color:var(--muted,#526176)}
      .subscription-form-actions{display:flex;align-items:end;justify-content:flex-end;gap:8px;grid-column:1/-1}
      .subscription-table-wrap{width:100%;overflow:auto}.subscription-table{width:100%;border-collapse:collapse;min-width:760px;text-align:left}
      .subscription-table th,.subscription-table td{padding:12px 10px;border-bottom:1px solid var(--border,#e5eaf1);font-size:13px;vertical-align:middle}
      .subscription-table th{color:var(--muted,#64748b);font-size:11px;text-transform:uppercase;letter-spacing:.04em}
      .subscription-table td small{display:block;margin-top:4px;color:var(--muted,#64748b);font-size:11px}
      .subscription-payment,.subscription-status{display:inline-block;padding:5px 8px;border-radius:999px;font-size:11px;font-weight:700;background:var(--surface-soft,#edf2f8)}
      .subscription-payment.paid{color:#087443;background:#e5f7ee}.subscription-payment.unpaid{color:#965b00;background:#fff4dd}
      .subscription-status.cancelled,.subscription-status.expired{color:#a33;background:#ffeded}.subscription-status.active{color:#087443;background:#e5f7ee}
      @media(max-width:760px){.subscription-form{grid-template-columns:1fr 1fr}}
      @media(max-width:480px){.subscription-form{grid-template-columns:1fr}.subscription-toolbar-actions{width:100%}.subscription-toolbar-actions select,.subscription-toolbar-actions button{flex:1}}
    `}</style>
  </section>;
}
