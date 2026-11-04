import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from './lib/api';
import { Download } from 'lucide-react';

type InventoryItem = {
  id: string; name: string; sku: string; category: string; unit: string; quantity: number;
  minimumQuantity: number; unitCost?: number; supplier?: string; location?: string; notes?: string; active: boolean;
};
type Movement = {
  id: string; itemName: string; type: 'IN'|'OUT'; quantity: number; quantityBefore: number;
  quantityAfter: number; reason: string; createdAt: string; createdByName: string;
};
const money=(value:number)=>'₹'+Number(value||0).toLocaleString('en-IN');
const stamp=(value:string)=>value?new Date(value).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):'—';
function exportInventory(items:InventoryItem[],isAdmin:boolean){
  const rows=[['Item','SKU','Category','Quantity','Unit','Minimum stock',...(isAdmin?['Unit cost','Supplier']:[]),'Storage location','Active'],
    ...items.map(item=>[item.name,item.sku,item.category,item.quantity,item.unit,item.minimumQuantity,...(isAdmin?[item.unitCost||0,item.supplier||'']:[]),item.location||'',item.active?'Yes':'No'])];
  const csv='\uFEFF'+rows.map(row=>row.map(value=>'"'+String(value??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='kb-inventory-'+new Date().toISOString().slice(0,10)+'.csv';link.click();URL.revokeObjectURL(url);
}

export default function InventoryWorkspace({isAdmin,flash}:{isAdmin:boolean;flash:(message:string)=>void}) {
  const [items,setItems]=useState<InventoryItem[]>([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [editing,setEditing]=useState<InventoryItem|null>(null);
  const [showForm,setShowForm]=useState(false);
  const [movementItem,setMovementItem]=useState<InventoryItem|null>(null);
  const [movementType,setMovementType]=useState<'IN'|'OUT'>('OUT');
  const [movementQuantity,setMovementQuantity]=useState('1');
  const [movementReason,setMovementReason]=useState('');
  const [historyItem,setHistoryItem]=useState<InventoryItem|null>(null);
  const [history,setHistory]=useState<Movement[]>([]);
  const [form,setForm]=useState({name:'',sku:'',category:'',unit:'pcs',quantity:'0',minimumQuantity:'2',unitCost:'0',supplier:'',location:'',notes:'',active:true});

  async function load() {
    setLoading(true);
    try { const result=await api.get<{items:InventoryItem[]}>('/api/inventory');setItems(result.data.items||[]); }
    catch(error) { flash(error instanceof Error?error.message:'Could not load inventory.'); }
    finally { setLoading(false); }
  }
  useEffect(()=>{void load();},[]);
  function openCreate() {
    setEditing(null);setForm({name:'',sku:'',category:'',unit:'pcs',quantity:'0',minimumQuantity:'2',unitCost:'0',supplier:'',location:'',notes:'',active:true});setShowForm(true);
  }
  function openEdit(item:InventoryItem) {
    setEditing(item);setForm({name:item.name,sku:item.sku,category:item.category,unit:item.unit,quantity:String(item.quantity),minimumQuantity:String(item.minimumQuantity),unitCost:String(item.unitCost||0),supplier:item.supplier||'',location:item.location||'',notes:item.notes||'',active:item.active});setShowForm(true);
  }
  async function saveItem(event:FormEvent) {
    event.preventDefault();setSaving(true);
    const payload={...form,quantity:Number(form.quantity),minimumQuantity:Number(form.minimumQuantity),unitCost:Number(form.unitCost)};
    try {
      if(editing) await api.put('/api/inventory/'+editing.id,payload);
      else await api.post('/api/inventory',payload);
      setShowForm(false);await load();flash(editing?'Inventory item updated.':'Inventory item added.');
    } catch(error) { flash(error instanceof Error?error.message:'Could not save inventory item.'); }
    finally { setSaving(false); }
  }
  async function saveMovement(event:FormEvent) {
    event.preventDefault();if(!movementItem)return;setSaving(true);
    try {
      await api.post('/api/inventory/'+movementItem.id+'/movements',{type:movementType,quantity:Number(movementQuantity),reason:movementReason});
      setMovementItem(null);setMovementReason('');await load();flash(movementType==='IN'?'Stock received.':'Stock issue recorded.');
    } catch(error) { flash(error instanceof Error?error.message:'Could not record stock movement.'); }
    finally { setSaving(false); }
  }
  async function showHistory(item:InventoryItem) {
    setHistoryItem(item);setHistory([]);
    try { const result=await api.get<{items:Movement[]}>('/api/inventory/'+item.id+'/movements');setHistory(result.data.items||[]); }
    catch(error) { flash(error instanceof Error?error.message:'Could not load stock history.'); }
  }
  const lowStock=items.filter(item=>item.active&&item.quantity<=item.minimumQuantity).length;

  return <section className="panel table-panel">
    <div className="toolbar">
      <div><h2>Inventory & equipment</h2><p className="subtle">Track routers, cables, ONTs, tools and other business stock.</p></div>
      <div className="inventory-toolbar"><span className="inventory-low-count">{lowStock} low-stock</span><button className="btn secondary" onClick={()=>exportInventory(items,isAdmin)} disabled={!items.length}><Download size={14}/> Export CSV</button>{isAdmin&&<button className="btn primary" onClick={openCreate}>+ Add item</button>}</div>
    </div>
    {showForm&&isAdmin&&<form className="inventory-form" onSubmit={saveItem}>
      <div className="inventory-form-title"><strong>{editing?'Edit inventory item':'Add inventory item'}</strong><button type="button" className="btn secondary compact" onClick={()=>setShowForm(false)}>Close</button></div>
      <label>Item name<input required maxLength={100} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
      <label>SKU / item code<input required maxLength={50} value={form.sku} onChange={e=>setForm({...form,sku:e.target.value})}/></label>
      <label>Category<input required maxLength={60} placeholder="Router, ONT, cable…" value={form.category} onChange={e=>setForm({...form,category:e.target.value})}/></label>
      <label>Unit<input maxLength={24} value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})}/></label>
      {!editing&&<label>Opening stock<input type="number" min="0" step="1" required value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})}/></label>}
      <label>Low-stock alert at<input type="number" min="0" step="1" required value={form.minimumQuantity} onChange={e=>setForm({...form,minimumQuantity:e.target.value})}/></label>
      <label>Unit cost (₹)<input type="number" min="0" step="0.01" required value={form.unitCost} onChange={e=>setForm({...form,unitCost:e.target.value})}/></label>
      <label>Supplier<input maxLength={100} value={form.supplier} onChange={e=>setForm({...form,supplier:e.target.value})}/></label>
      <label>Storage location<input maxLength={100} value={form.location} onChange={e=>setForm({...form,location:e.target.value})}/></label>
      <label className="inventory-notes">Notes<textarea rows={2} maxLength={500} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
      {editing&&<label className="inventory-active"><input type="checkbox" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})}/> Item active</label>}
      <div className="inventory-form-actions"><button type="button" className="btn secondary" onClick={()=>setShowForm(false)}>Cancel</button><button className="btn primary" disabled={saving}>{saving?'Saving…':'Save item'}</button></div>
    </form>}
    {movementItem&&<form className="inventory-movement-form" onSubmit={saveMovement}>
      <strong>{movementType==='IN'?'Receive stock':'Issue stock'} · {movementItem.name}</strong>
      <div className="inventory-movement-fields">
        {isAdmin&&<label>Movement<select value={movementType} onChange={e=>setMovementType(e.target.value as 'IN'|'OUT')}><option value="OUT">Issue / use</option><option value="IN">Receive stock</option></select></label>}
        <label>Quantity<input type="number" min="1" step="1" required value={movementQuantity} onChange={e=>setMovementQuantity(e.target.value)}/></label>
        <label>Reason<input required maxLength={240} placeholder="Installation job, repair, supplier delivery…" value={movementReason} onChange={e=>setMovementReason(e.target.value)}/></label>
      </div>
      <div className="inventory-form-actions"><button type="button" className="btn secondary" onClick={()=>setMovementItem(null)}>Cancel</button><button className="btn primary" disabled={saving}>{saving?'Saving…':'Record movement'}</button></div>
    </form>}
    {loading?<p className="ops-empty">Loading inventory…</p>:<div className="inventory-table-wrap"><table className="inventory-table">
      <thead><tr><th>Item</th><th>Category</th><th>In stock</th><th>Minimum</th>{isAdmin&&<th>Unit cost</th>}<th>Location</th><th>Actions</th></tr></thead>
      <tbody>{items.map(item=><tr key={item.id} className={!item.active?'inventory-archived':''}>
        <td><strong>{item.name}</strong><small>{item.sku} · {item.unit}</small></td><td>{item.category}</td>
        <td><span className={'inventory-quantity '+(item.quantity<=item.minimumQuantity?'low':'')}>{item.quantity} {item.unit}</span></td>
        <td>{item.minimumQuantity} {item.unit}</td>{isAdmin&&<td>{money(item.unitCost||0)}</td>}<td>{item.location||'—'}</td>
        <td><div className="inventory-actions"><button className="btn secondary compact" disabled={!item.active} onClick={()=>{setMovementItem(item);setMovementType('OUT');setMovementQuantity('1');}}>Issue</button>{isAdmin&&<><button className="btn secondary compact" disabled={!item.active} onClick={()=>{setMovementItem(item);setMovementType('IN');setMovementQuantity('1');}}>Receive</button><button className="btn secondary compact" onClick={()=>openEdit(item)}>Edit</button></>}<button className="btn secondary compact" onClick={()=>void showHistory(item)}>History</button></div></td>
      </tr>)}</tbody>
    </table>{!items.length&&<p className="ops-empty">No inventory items yet. {isAdmin?'Add routers, ONTs, cables and tools to begin stock tracking.':'Ask an administrator to add inventory items.'}</p>}</div>}
    {historyItem&&<div className="inventory-history"><div className="inventory-form-title"><strong>Stock history · {historyItem.name}</strong><button className="btn secondary compact" onClick={()=>setHistoryItem(null)}>Close</button></div>{history.length?<div className="inventory-history-list">{history.map(entry=><div key={entry.id}><span className={'inventory-movement-badge '+entry.type.toLowerCase()}>{entry.type}</span><div><b>{entry.quantity} {historyItem.unit} · {entry.reason}</b><small>{entry.quantityBefore} → {entry.quantityAfter} · {entry.createdByName} · {stamp(entry.createdAt)}</small></div></div>)}</div>:<p className="ops-empty">No stock movements recorded yet.</p>}</div>}
    <style>{`
      .inventory-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.inventory-low-count{padding:6px 9px;border-radius:99px;background:#fff4df;color:#875500;font-size:12px;font-weight:700}
      .inventory-form,.inventory-movement-form,.inventory-history{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;padding:16px;margin:12px 0 18px;border:1px solid var(--border,#dbe2ec);border-radius:14px;background:var(--surface-soft,#f7f9fc)}
      .inventory-form-title{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between}.inventory-form label,.inventory-movement-form label{display:grid;gap:6px;font-size:12px;font-weight:700;color:var(--muted,#526176)}
      .inventory-form input,.inventory-form textarea,.inventory-movement-form input,.inventory-movement-form select{width:100%;min-height:39px;padding:8px 10px;border:1px solid var(--border,#dbe2ec);border-radius:9px;background:var(--surface,#fff);color:var(--text,#172033);font:inherit}
      .inventory-form .inventory-notes{grid-column:span 2}.inventory-form .inventory-active{display:flex;align-items:center;gap:8px}.inventory-form .inventory-active input{width:auto;min-height:auto}
      .inventory-form-actions{grid-column:1/-1;display:flex;justify-content:flex-end;gap:8px}.inventory-movement-form{grid-template-columns:1fr}.inventory-movement-form>strong{font-size:14px}.inventory-movement-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
      .inventory-table-wrap{width:100%;overflow:auto}.inventory-table{width:100%;min-width:760px;border-collapse:collapse;text-align:left}.inventory-table th,.inventory-table td{padding:12px 9px;border-bottom:1px solid var(--border,#e5eaf1);font-size:13px}.inventory-table th{font-size:11px;color:var(--muted,#64748b);text-transform:uppercase}.inventory-table td small{display:block;margin-top:4px;color:var(--muted,#64748b);font-size:11px}
      .inventory-quantity{font-weight:800}.inventory-quantity.low{color:#b45309}.inventory-archived{opacity:.58}.inventory-actions{display:flex;gap:5px;flex-wrap:wrap}.inventory-history{grid-template-columns:1fr}.inventory-history-list{display:grid;gap:10px}.inventory-history-list>div{display:flex;align-items:center;gap:10px;padding-bottom:9px;border-bottom:1px solid var(--border,#e5eaf1)}.inventory-history-list small{display:block;color:var(--muted,#64748b);margin-top:4px}.inventory-movement-badge{font-size:11px;font-weight:800;padding:5px 7px;border-radius:99px}.inventory-movement-badge.in{background:#e5f7ee;color:#087443}.inventory-movement-badge.out{background:#fff4df;color:#875500}
      @media(max-width:720px){.inventory-form,.inventory-movement-fields{grid-template-columns:1fr 1fr}}
      @media(max-width:480px){.inventory-form,.inventory-movement-fields{grid-template-columns:1fr}.inventory-form .inventory-notes{grid-column:auto}}
    `}</style>
  </section>;
}
