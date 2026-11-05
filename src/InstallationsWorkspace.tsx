import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from './lib/api';
import { Download } from 'lucide-react';

type Customer={id:string;name:string;phone?:string;address:string};
type Staff={id:string;displayName:string;active:boolean};
type Installation={id:string;customerId:string;customerName:string;phone?:string;address:string;type:string;scheduledDate:string;assignedTo:string;assignedToName:string;status:'Scheduled'|'In progress'|'Completed'|'Cancelled';notes:string;createdAt:string};
const dateToday=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
const prettyDate=(value:string)=>value?new Date(value+'T12:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'—';
function exportInstallations(items:Installation[]){
  const rows=[['Customer','Phone','Address','Job type','Scheduled date','Assigned staff','Status','Notes'],
    ...items.map(item=>[item.customerName,item.phone||'',item.address,item.type,item.scheduledDate,item.assignedToName,item.status,item.notes||''])];
  const csv='\uFEFF'+rows.map(row=>row.map(value=>'"'+String(value??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='kb-installations-'+dateToday()+'.csv';link.style.display='none';document.body.appendChild(link);link.click();window.setTimeout(()=>{link.remove();URL.revokeObjectURL(url);},2000);
}

export default function InstallationsWorkspace({customers,staff,isAdmin,flash}:{customers:Customer[];staff:Staff[];isAdmin:boolean;flash:(message:string)=>void}) {
  const [items,setItems]=useState<Installation[]>([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [showForm,setShowForm]=useState(false);
  const [editingJob,setEditingJob]=useState<Installation|null>(null);
  const [customerId,setCustomerId]=useState(customers[0]?.id||'');
  const selectedCustomer=customers.find(item=>item.id===customerId);
  const [assignedTo,setAssignedTo]=useState(staff.find(item=>item.active)?.id||'');
  const [type,setType]=useState('New connection');
  const [scheduledDate,setScheduledDate]=useState(dateToday());
  const [address,setAddress]=useState(selectedCustomer?.address||'');
  const [notes,setNotes]=useState('');
  const [search,setSearch]=useState('');
  const filteredItems=items.filter(item=>[item.customerName,item.phone||'',item.address,item.type,item.assignedToName,item.status].join(' ').toLowerCase().includes(search.toLowerCase()));

  async function load(){setLoading(true);try{const result=await api.get<{items:Installation[]}>('/api/installations');setItems(result.data.items||[]);}catch(error){flash(error instanceof Error?error.message:'Could not load installation jobs.');}finally{setLoading(false);}}
  useEffect(()=>{void load();},[]);
  useEffect(()=>{if(!customerId&&customers.length)setCustomerId(customers[0].id);},[customers,customerId]);
  useEffect(()=>{if(selectedCustomer)setAddress(selectedCustomer.address||'');},[customerId]);
  useEffect(()=>{if(!assignedTo&&staff.some(item=>item.active))setAssignedTo(staff.find(item=>item.active)!.id);},[staff,assignedTo]);

  function openEdit(item:Installation){setEditingJob(item);setCustomerId(item.customerId);setAssignedTo(item.assignedTo);setType(item.type);setScheduledDate(item.scheduledDate);setAddress(item.address);setNotes(item.notes||'');setShowForm(true);}
  async function createJob(event:FormEvent){event.preventDefault();if(!customerId||!assignedTo){flash('Choose a customer and staff member.');return;}setSaving(true);try{if(editingJob){await api.put('/api/installations/'+editingJob.id,{status:editingJob.status,assignedTo,scheduledDate,address,notes});}else{await api.post('/api/installations',{customerId,assignedTo,type,scheduledDate,address,notes});}setShowForm(false);setEditingJob(null);setNotes('');await load();flash(editingJob?'Installation job updated.':'Installation job assigned.');}catch(error){flash(error instanceof Error?error.message:'Could not save installation job.');}finally{setSaving(false);}}
  async function updateJob(item:Installation,status:Installation['status']){try{await api.put('/api/installations/'+item.id,{status,notes:item.notes||''});await load();flash('Installation status updated.');}catch(error){flash(error instanceof Error?error.message:'Could not update installation.');}}

  return <section className="panel table-panel">
    <div className="toolbar"><div><h2>Installation jobs</h2><p className="subtle">Schedule new connections, upgrades, repairs and relocations.</p></div><div className="installation-toolbar-actions"><div className="searchbox"><input aria-label="Search installation jobs" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search customer, staff, address or status..."/></div><button className="btn secondary" disabled={!items.length} onClick={()=>exportInstallations(items)}><Download size={14}/> Export CSV</button>{isAdmin&&<button className="btn primary" onClick={()=>{setEditingJob(null);setShowForm(value=>!value);}}>+ Schedule installation</button>}</div></div>
    {showForm&&isAdmin&&<form className="installation-form" onSubmit={createJob}><strong className="installation-form-heading">{editingJob?'Edit installation job':'Schedule installation'}</strong>
      {!editingJob&&<label>Customer<select required value={customerId} onChange={e=>setCustomerId(e.target.value)}>{customers.map(item=><option key={item.id} value={item.id}>{item.name} · {item.phone||'Customer'}</option>)}</select></label>}
      <label>Assigned staff<select required value={assignedTo} onChange={e=>setAssignedTo(e.target.value)}>{staff.filter(item=>item.active).map(item=><option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label>
      {!editingJob&&<label>Job type<select value={type} onChange={e=>setType(e.target.value)}><option>New connection</option><option>Upgrade</option><option>Repair</option><option>Relocation</option></select></label>}
      <label>Scheduled date<input type="date" required value={scheduledDate} onChange={e=>setScheduledDate(e.target.value)}/></label>
      <label className="installation-address">Installation address<input required maxLength={300} value={address} onChange={e=>setAddress(e.target.value)}/></label>
      <label className="installation-address">Work notes<textarea rows={2} maxLength={1000} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Equipment, access instructions, customer availability…"/></label>
      <div className="installation-form-actions"><button type="button" className="btn secondary" onClick={()=>setShowForm(false)}>Cancel</button><button className="btn primary" disabled={saving}>{saving?'Saving…':'Assign job'}</button></div>
    </form>}
    {loading?<p className="ops-empty">Loading installation jobs…</p>:<div className="installation-list">
      {filteredItems.map(item=><article className="installation-card" key={item.id}>
        <div className="installation-main"><div><span className="installation-type">{item.type}</span><h3>{item.customerName}</h3><p>{item.address}</p><small>{item.phone||''}</small></div><div className="installation-date"><b>{prettyDate(item.scheduledDate)}</b><small>Scheduled date</small></div></div>
        <div className="installation-meta"><span>Assigned to: <b>{item.assignedToName||'Unassigned'}</b></span><span>Created: {prettyDate(String(item.createdAt||'').slice(0,10))}</span></div>
        {item.notes&&<p className="installation-notes">{item.notes}</p>}
        <div className="installation-footer"><span className={'installation-status '+item.status.toLowerCase().replace(' ','-')}>{item.status}</span>{isAdmin&&<button className="btn secondary compact" onClick={()=>openEdit(item)}>Edit job</button>}<label>Update status<select aria-label={'Update status for '+item.customerName} value={item.status} onChange={e=>void updateJob(item,e.target.value as Installation['status'])}><option>Scheduled</option><option>In progress</option><option>Completed</option>{isAdmin&&<option>Cancelled</option>}</select></label></div>
      </article>)}
      {!filteredItems.length&&<p className="ops-empty">{items.length?'No installation jobs match your search.':isAdmin?'No installation jobs yet. Schedule a new connection, upgrade or repair.':'No installation jobs are assigned to you yet.'}</p>}
    </div>}
    <style>{`
      .installation-toolbar-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.installation-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:16px;margin:12px 0 18px;border:1px solid var(--border,#dbe2ec);border-radius:14px;background:var(--surface-soft,#f7f9fc)}
      .installation-form label{display:grid;gap:6px;font-size:12px;font-weight:700;color:var(--muted,#526176)}
      .installation-form input,.installation-form select,.installation-form textarea,.installation-footer select{width:100%;min-height:39px;padding:8px 10px;border:1px solid var(--border,#dbe2ec);border-radius:9px;background:var(--surface,#fff);color:var(--text,#172033);font:inherit}
      .installation-address{grid-column:1/-1}.installation-form-actions{grid-column:1/-1;display:flex;justify-content:flex-end;gap:8px}
      .installation-list{display:grid;gap:12px}.installation-card{padding:15px;border:1px solid var(--border,#e1e7ef);border-radius:14px;background:var(--surface,#fff)}
      .installation-main{display:flex;justify-content:space-between;gap:14px}.installation-main h3{font-size:16px;margin:5px 0}.installation-main p{margin:0;color:var(--muted,#64748b);font-size:13px}.installation-main small,.installation-meta{color:var(--muted,#64748b);font-size:11px}
      .installation-type{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--accent,#315fbd)}.installation-date{text-align:right;white-space:nowrap}.installation-date b{display:block;font-size:14px}.installation-date small{display:block;margin-top:4px}
      .installation-meta{display:flex;gap:16px;flex-wrap:wrap;margin-top:12px}.installation-notes{padding:10px;margin:10px 0 0;border-radius:9px;background:var(--surface-soft,#f6f8fb);font-size:12px;color:var(--text,#243044)}
      .installation-footer{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:12px}.installation-footer label{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--muted,#64748b)}.installation-footer select{width:auto;min-width:130px;min-height:34px}
      .installation-status{padding:5px 8px;border-radius:99px;background:var(--surface-soft,#eef2f8);font-size:11px;font-weight:800}.installation-status.completed{background:#e5f7ee;color:#087443}.installation-status.cancelled{background:#ffeded;color:#a33}.installation-status.in-progress{background:#eaf1ff;color:#315fbd}
      @media(max-width:540px){.installation-form{grid-template-columns:1fr}.installation-address{grid-column:auto}.installation-main{display:grid}.installation-date{text-align:left}.installation-footer{align-items:flex-start;flex-direction:column}}
    `}</style>
  </section>;
}
