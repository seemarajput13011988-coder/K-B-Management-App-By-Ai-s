import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api, subscribeToApiChanges } from './lib/api';
import { Download, FileText } from 'lucide-react';
import { exportCsvFile, exportPdfReport } from './lib/file-export';

type InventoryItem = {
  id: string; name: string; sku: string; category: string; unit: string; quantity: number;
  minimumQuantity: number; unitCost?: number; supplier?: string; location?: string; notes?: string; assignedTo?: string; assignedToName?: string; active: boolean; createdAt?: string; updatedAt?: string;
};
type Movement = {
  id: string; itemName: string; type: 'IN'|'OUT'; quantity: number; quantityBefore: number;
  quantityAfter: number; reason: string; createdAt: string; createdByName: string;
};
const money=(value:number)=>'₹'+Number(value||0).toLocaleString('en-IN');
const stamp=(value:string)=>value?new Date(value).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):'—';
async function exportInventory(items:InventoryItem[],isAdmin:boolean){
  const rows=[['Item','SKU','Category','Quantity','Unit','Minimum stock',...(isAdmin?['Unit cost','Supplier']:[]),'Storage location','Active'],
    ...items.map(item=>[item.name,item.sku,item.category,item.quantity,item.unit,item.minimumQuantity,...(isAdmin?[item.unitCost||0,item.supplier||'']:[]),item.location||'',item.active?'Yes':'No'])];
  try { await exportCsvFile('kb-inventory-'+new Date().toISOString().slice(0,10)+'.csv',rows); }
  catch(error) { window.alert(error instanceof Error?error.message:'Could not export inventory.'); }
}

async function exportInventoryPdf(items:InventoryItem[],isAdmin:boolean){
  const rows=[['Item','SKU','Category','Quantity','Unit','Minimum stock',...(isAdmin?['Unit cost','Supplier']:[]),'Storage location','Active'],
    ...items.map(item=>[item.name,item.sku,item.category,item.quantity,item.unit,item.minimumQuantity,...(isAdmin?[item.unitCost||0,item.supplier||'']:[]),item.location||'',item.active?'Yes':'No'])];
  try { await exportPdfReport('kb-inventory-'+new Date().toISOString().slice(0,10)+'.pdf','Inventory register',rows); }
  catch(error) { window.alert(error instanceof Error?error.message:'Could not create inventory PDF.'); }
}

export default function InventoryWorkspace({isAdmin,flash}:{isAdmin:boolean;flash:(message:string)=>void}) {
  const [items,setItems]=useState<InventoryItem[]>([]);
  const [staff,setStaff]=useState<Array<{id:string;displayName:string;active:boolean}>>([]);
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
  const [form,setForm]=useState({name:'',sku:'',category:'',unit:'pcs',quantity:'0',minimumQuantity:'2',unitCost:'0',supplier:'',location:'',notes:'',assignedTo:'',active:true});

  async function load() {
    setLoading(true);
    try {
      const result=await api.get<{items:InventoryItem[]}>('/api/inventory');setItems(result.data.items||[]);
      if(isAdmin){const staffResult=await api.get<{items:Array<{id:string;displayName:string;active:boolean}>}>('/api/staff');setStaff((staffResult.data.items||[]).filter(member=>member.active));}
    }
    catch(error) { flash(error instanceof Error?error.message:'Could not load inventory.'); }
    finally { setLoading(false); }
  }
  useEffect(()=>{void load();},[]);
  useEffect(()=>subscribeToApiChanges(()=>{void load();}),[]);
  function openCreate() {
    setEditing(null);setForm({name:'',sku:'',category:'',unit:'pcs',quantity:'0',minimumQuantity:'2',unitCost:'0',supplier:'',location:'',notes:'',assignedTo:'',active:true});setShowForm(true);
  }
  function openEdit(item:InventoryItem) {
    setEditing(item);setForm({name:item.name,sku:item.sku,category:item.category,unit:item.unit,quantity:String(item.quantity),minimumQuantity:String(item.minimumQuantity),unitCost:String(item.unitCost||0),supplier:item.supplier||'',location:item.location||'',notes:item.notes||'',assignedTo:item.assignedTo||'',active:item.active});setShowForm(true);
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
  const [search,setSearch]=useState('');
  const [categoryFilter,setCategoryFilter]=useState('All');
  const [stockFilter,setStockFilter]=useState<'All'|'Low stock'|'In stock'|'Archived'>('All');
  const [sortBy,setSortBy]=useState<'name'|'quantity-asc'|'quantity-desc'|'recent'>('name');
  const categories=[...new Set(items.map(item=>item.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const lowStock=items.filter(item=>item.active&&item.quantity<=item.minimumQuantity).length;
  const visibleItems=items
    .filter(item=>(categoryFilter==='All'||item.category===categoryFilter)
      &&(stockFilter==='All'||(stockFilter==='Archived'?!item.active:stockFilter==='Low stock'?item.active&&item.quantity<=item.minimumQuantity:item.active&&item.quantity>item.minimumQuantity))
      &&[item.name,item.sku,item.category,item.supplier||'',item.location||'',item.assignedToName||''].join(' ').toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a,b)=>sortBy==='quantity-asc'?a.quantity-b.quantity:sortBy==='quantity-desc'?b.quantity-a.quantity:sortBy==='recent'?(b.updatedAt||b.createdAt||'').localeCompare(a.updatedAt||a.createdAt||''):a.name.localeCompare(b.name));

  return <section className="panel table-panel">
    <div className="toolbar">
      <div><h2>Inventory & equipment</h2><p className="subtle">Track routers, cables, ONTs, tools and other business stock.</p></div>
      <div className="inventory-toolbar"><div className="searchbox"><input aria-label="Search inventory" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search item, SKU, supplier or location"/></div><select aria-label="Filter inventory category" value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option value="All">All categories</option>{categories.map(category=><option key={category} value={category}>{category}</option>)}</select><select aria-label="Filter stock level" value={stockFilter} onChange={e=>setStockFilter(e.target.value as typeof stockFilter)}><option value="All">All stock</option><option>Low stock</option><option>In stock</option><option>Archived</option></select><select aria-label="Sort inventory" value={sortBy} onChange={e=>setSortBy(e.target.value as typeof sortBy)}><option value="name">Name: A–Z</option><option value="quantity-asc">Quantity: low to high</option><option value="quantity-desc">Quantity: high to low</option><option value="recent">Recently updated</option></select><span className="inventory-low-count">{lowStock} low-stock</span><button className="btn secondary" onClick={()=>exportInventory(visibleItems,isAdmin)} disabled={!visibleItems.length}><Download size={14}/> Export CSV</button><button className="btn secondary" onClick={()=>exportInventoryPdf(visibleItems,isAdmin)} disabled={!visibleItems.length}><FileText size={14}/> Export PDF</button>{isAdmin&&<button className="btn primary" onClick={openCreate}>+ Add item</button>}</div>
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
      <label>Assign to staff<select value={form.assignedTo} onChange={e=>setForm({...form,assignedTo:e.target.value})}><option value="">Not assigned</option>{staff.map(member=><option key={member.id} value={member.id}>{member.displayName}</option>)}</select></label>
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
      <thead><tr><th>Item</th><th>Category</th><th>In stock</th><th>Minimum</th>{isAdmin&&<th>Unit cost</th>}<th>Assigned to</th><th>Location</th><th>Actions</th></tr></thead>
      <tbody>{visibleItems.map(item=><tr key={item.id} className={!item.active?'inventory-archived':''}>
        <td><strong>{item.name}</strong><small>{item.sku} · {item.unit}</small><small>Added {stamp(item.createdAt||'')}{item.updatedAt?' · Updated '+stamp(item.updatedAt):''}</small></td><td>{item.category}</td>
        <td><span className={'inventory-quantity '+(item.quantity<=item.minimumQuantity?'low':'')}>{item.quantity} {item.unit}</span></td>
        <td>{item.minimumQuantity} {item.unit}</td>{isAdmin&&<td>{money(item.unitCost||0)}</td>}<td>{item.assignedToName||'—'}</td><td>{item.location||'—'}</td>
        <td><div className="inventory-actions">{isAdmin&&<><button className="btn secondary compact" disabled={!item.active} onClick={()=>{setMovementItem(item);setMovementType('OUT');setMovementQuantity('1');}}>Issue</button><button className="btn secondary compact" disabled={!item.active} onClick={()=>{setMovementItem(item);setMovementType('IN');setMovementQuantity('1');}}>Receive</button><button className="btn secondary compact" onClick={()=>openEdit(item)}>Edit / assign</button></>}<button className="btn secondary compact" onClick={()=>void showHistory(item)}>History</button></div></td>
      </tr>)}</tbody>
    </table>{!items.length&&<p className="ops-empty">No inventory items yet. {isAdmin?'Add routers, ONTs, cables and tools to begin stock tracking.':'Ask an administrator to add inventory items.'}</p>}</div>}
    {historyItem&&<div className="inventory-history"><div className="inventory-form-title"><strong>Stock history · {historyItem.name}</strong><button className="btn secondary compact" onClick={()=>setHistoryItem(null)}>Close</button></div>{history.length?<div className="inventory-history-list">{history.map(entry=><div key={entry.id}><span className={'inventory-movement-badge '+entry.type.toLowerCase()}>{entry.type}</span><div><b>{entry.quantity} {historyItem.unit} · {entry.reason}</b><small>{entry.quantityBefore} → {entry.quantityAfter} · {entry.createdByName} · {stamp(entry.createdAt)}</small></div></div>)}</div>:<p className="ops-empty">No stock movements recorded yet.</p>}</div>}
    
  </section>;
}
