import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';

type Customer = { id:string; name:string; phone:string; address:string; plan:string; monthlyFee:number; status:string };
type Plan = { id:string; name:string; provider:string; speed:string; data:string; price:number; note:string; details?:string; connectionType:string; active:boolean };
type LineItem = { id:number; description:string; details:string; sac:string; quantity:string; rate:string; discount:string; gstRate:string; taxMode:'exclusive'|'inclusive' };
const BUSINESS = { name:'K&B NET SERVICE', gstin:'24AHHPC7437K1ZA', phone:'9879669892', tollFree:'079-29992999', ifsc:'VCOB0000018', address:'B-8/10 Gokul Galaxy Residency, Kathwada, Ahmedabad - 382430', email:'brajrajsinghchauhan3517@gmail.com', state:'Gujarat' };
const today = () => new Date().toISOString().slice(0,10);
const money = (n:number) => '₹'+(Number.isFinite(n)?n:0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtDate = (s:string) => s ? new Date(s+'T12:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—';
const esc = (value:unknown) => String(value??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] as string));
const newLine = (id:number):LineItem => ({id,description:'',details:'',sac:'',quantity:'1',rate:'',discount:'0',gstRate:'18',taxMode:'exclusive'});

export default function InvoiceWorkspace({customers,plans,flash}:{customers:Customer[];plans:Plan[];flash:(message:string)=>void}) {
  const [customerId,setCustomerId]=useState('');
  const [customerName,setCustomerName]=useState('');
  const [customerPhone,setCustomerPhone]=useState('');
  const [customerEmail,setCustomerEmail]=useState('');
  const [customerAddress,setCustomerAddress]=useState('');
  const [customerGstin,setCustomerGstin]=useState('');
  const [businessAddress,setBusinessAddress]=useState(BUSINESS.address);
  const [manualQty,setManualQty]=useState('1');
  const [manualRate,setManualRate]=useState('');
  const [manualDiscount,setManualDiscount]=useState('0');
  const [manualGst,setManualGst]=useState('18');
  const [businessUpi,setBusinessUpi]=useState('');
  const [invoiceNo,setInvoiceNo]=useState(()=> 'KB/INV/'+new Date().getFullYear()+'/'+String(Date.now()).slice(-6));
  const [invoiceDate,setInvoiceDate]=useState(today);
  const [dueDate,setDueDate]=useState(today);
  const [placeOfSupply,setPlaceOfSupply]=useState('Gujarat');
  const [supplyStateCode,setSupplyStateCode]=useState('24');
  const [reverseCharge,setReverseCharge]=useState(false);
  const [reference,setReference]=useState('');
  const [notes,setNotes]=useState('Thank you for choosing K&B Net Service.');
  const [terms,setTerms]=useState('Payment is due by the due date mentioned above. Please mention the invoice number while making payment.');
  const [paymentMode,setPaymentMode]=useState('UPI / Bank Transfer');
  const [items,setItems]=useState<LineItem[]>([newLine(1)]);
  const [busy,setBusy]=useState(false);
  const [dialogOpen,setDialogOpen]=useState(false);
  const subtotal = useMemo(()=>items.reduce((sum,item)=>{
    const qty=Math.max(0,Number(item.quantity)||0), rate=Math.max(0,Number(item.rate)||0), disc=Math.min(100,Math.max(0,Number(item.discount)||0));
    const gross=qty*rate, net=gross*(1-disc/100);
    return sum + (item.taxMode==='inclusive' ? net/(1+(Math.max(0,Number(item.gstRate)||0)/100)) : net);
  },0),[items]);
  const taxTotal = useMemo(()=>items.reduce((sum,item)=>{
    const qty=Math.max(0,Number(item.quantity)||0), rate=Math.max(0,Number(item.rate)||0), disc=Math.min(100,Math.max(0,Number(item.discount)||0)), gst=Math.max(0,Number(item.gstRate)||0);
    const net=qty*rate*(1-disc/100), taxable=item.taxMode==='inclusive'?net/(1+gst/100):net;
    return sum + (item.taxMode==='inclusive'?net-taxable:taxable*gst/100);
  },0),[items]);
  const discountTotal = items.reduce((sum,item)=>{const gross=Math.max(0,Number(item.quantity)||0)*Math.max(0,Number(item.rate)||0)*Math.min(100,Math.max(0,Number(item.discount)||0))/100;const gst=Math.max(0,Number(item.gstRate)||0);return sum+gross/(item.taxMode==='inclusive'?1+gst/100:1);},0);
  const isIntraState = supplyStateCode.trim()==='24';
  const cgst = isIntraState ? Math.round(taxTotal/2*100)/100 : 0, sgst = isIntraState ? taxTotal-cgst : 0, igst = isIntraState ? 0 : taxTotal;
  const grandTotal = Math.round((subtotal+taxTotal)*100)/100;
  const roundOff = Math.round(grandTotal)-grandTotal;
  const payable = Math.round(grandTotal);
  const selectedPlan = (planName:string)=>plans.find(p=>p.name===planName);
  function chooseCustomer(id:string) {
    setCustomerId(id);
    const c=customers.find(x=>x.id===id);
    if(!c)return;
    setCustomerName(c.name||'');setCustomerPhone(c.phone||'');setCustomerAddress(c.address||'');
    const p=selectedPlan(c.plan);
    setItems([{...newLine(1),description:(c.plan||'Internet service')+' - '+(p?.provider||'K&B Net Service'),details:[p?.speed,p?.data,p?.details,p?.note].filter(Boolean).join(' · '),rate:String(c.monthlyFee||p?.price||'')}]);
  }
  function updateItem(id:number,patch:Partial<LineItem>){setItems(prev=>prev.map(item=>item.id===id?{...item,...patch}:item));}
  function makeInvoiceHtml() {
    const rows=items.map((item,index)=>{
      const qty=Math.max(0,Number(item.quantity)||0),rate=Math.max(0,Number(item.rate)||0),disc=Math.min(100,Math.max(0,Number(item.discount)||0)),gst=Math.max(0,Number(item.gstRate)||0);
      const gross=qty*rate,discount=gross*disc/100,after=gross-discount,taxable=item.taxMode==='inclusive'?after/(1+gst/100):after,tax=after-taxable,total=after+(item.taxMode==='exclusive'?tax:0);
      return {index:index+1,item,qty,rate,discount,taxable,tax,total,gst};
    });
    const rowsHtml=rows.map(r=>'<tr><td>'+r.index+'</td><td><b>'+esc(r.item.description)+'</b>'+(r.item.details?'<small>'+esc(r.item.details)+'</small>':'')+'<small>SAC: '+esc(r.item.sac||'—')+'</small></td><td class="num">'+r.qty+'</td><td class="num">'+money(r.rate)+'</td><td class="num">'+money(r.discount)+'</td><td class="num">'+money(r.taxable)+'</td><td class="num">'+r.gst+'%</td><td class="num">'+money(r.tax)+'</td><td class="num"><b>'+money(r.total)+'</b></td></tr>').join('');
    const taxLabel=isIntraState?'<div><span>CGST</span><b>'+money(cgst)+'</b></div><div><span>SGST</span><b>'+money(sgst)+'</b></div>':'<div><span>IGST</span><b>'+money(igst)+'</b></div>';
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(invoiceNo)}</title><style>
      @page{size:A4;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#172033;margin:0;font-size:11px;line-height:1.45}
      .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:4px solid #143b67;padding:0 0 18px;margin-bottom:18px}
      .brand{font-size:24px;font-weight:800;letter-spacing:.4px;color:#12395f}.brand small{display:block;font-size:10px;letter-spacing:2px;color:#3975a8;margin-top:3px}
      .tag{font-size:25px;font-weight:800;color:#12395f;text-align:right}.muted{color:#68778b}.meta{margin-top:7px;text-align:right}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:14px 0}.card{border:1px solid #d8e0ea;border-radius:8px;padding:12px}.card h3{margin:0 0 8px;color:#28608e;font-size:10px;letter-spacing:1px;text-transform:uppercase}
      .card p{margin:3px 0}.customer-name{font-size:15px;font-weight:700}.badge{display:inline-block;background:#eaf2fa;color:#1c527e;padding:5px 9px;border-radius:20px;font-weight:700}
      table{width:100%;border-collapse:collapse;margin-top:15px}th{background:#153f69;color:white;text-align:left;font-size:9px;padding:9px 6px}td{border-bottom:1px solid #e1e7ef;padding:9px 6px;vertical-align:top}td small{display:block;color:#6b7787;margin-top:3px;font-size:9px}.num{text-align:right;white-space:nowrap}
      .bottom{display:grid;grid-template-columns:1.15fr .85fr;gap:18px;margin-top:18px}.totals{border:1px solid #d8e0ea;border-radius:8px;padding:12px}.totals div{display:flex;justify-content:space-between;padding:5px 0}.totals .grand{border-top:2px solid #153f69;margin-top:6px;padding-top:10px;font-size:17px;font-weight:800;color:#153f69}
      .words{background:#f2f6fa;border-radius:7px;padding:10px;margin-top:9px}.foot{border-top:1px solid #d8e0ea;margin-top:24px;padding-top:12px;display:flex;justify-content:space-between;gap:20px}.sign{text-align:right;min-width:170px;padding-top:28px}.note{white-space:pre-wrap;margin-top:8px}.small{font-size:9px;color:#68778b}
      @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.no-print{display:none}}
    </style></head><body>
      <header class="top"><div><div class="brand">K&amp;B NET SERVICE<small>INTERNET • NETWORK • CONNECTIVITY</small></div><p class="muted">${esc(businessAddress).replace(/\n/g,'<br>')}<br>GSTIN: ${BUSINESS.gstin}<br>Phone: ${BUSINESS.phone}<br>Toll Free: ${BUSINESS.tollFree}<br>IFSC Code: ${BUSINESS.ifsc}<br>Email: ${BUSINESS.email}${businessUpi?'<br>UPI: '+esc(businessUpi):''}</p></div><div><div class="tag">TAX INVOICE</div><div class="meta"><b>Invoice No:</b> ${esc(invoiceNo)}<br><b>Invoice Date:</b> ${fmtDate(invoiceDate)}<br><b>Due Date:</b> ${fmtDate(dueDate)}<br><span class="badge">Original for Recipient</span></div></div></header>
      <div class="grid"><section class="card"><h3>Bill To</h3><p class="customer-name">${esc(customerName)}</p><p>${esc(customerAddress).replace(/\n/g,'<br>')}</p><p>Phone: ${esc(customerPhone||'—')}</p>${customerEmail?'<p>Email: '+esc(customerEmail)+'</p>':''}${customerGstin?'<p>GSTIN: '+esc(customerGstin)+'</p>':''}</section><section class="card"><h3>Invoice Details</h3><p><b>Place of Supply:</b> ${esc(placeOfSupply)} (${esc(supplyStateCode)})</p><p><b>Reverse Charge:</b> ${reverseCharge?'Yes':'No'}</p><p><b>Reference:</b> ${esc(reference||'—')}</p><p><b>Payment Mode:</b> ${esc(paymentMode)}</p></section></div>
      <table><thead><tr><th>#</th><th>DESCRIPTION / SERVICE</th><th class="num">QTY</th><th class="num">RATE</th><th class="num">DISCOUNT</th><th class="num">TAXABLE VALUE</th><th class="num">GST</th><th class="num">TAX</th><th class="num">TOTAL</th></tr></thead><tbody>${rowsHtml}</tbody></table>
      <div class="bottom"><div><div class="card"><h3>Tax Summary</h3><p>Taxable value: <b>${money(subtotal)}</b></p>${taxLabel}<p><b>Total GST: ${money(taxTotal)}</b></p><p class="small">Tax is calculated line-by-line using the GST rate and inclusive/exclusive setting selected for each service.</p></div><div class="words"><b>Amount in words</b><p>${esc(numberWords(payable))}</p></div><div class="note"><b>Notes:</b> ${esc(notes)}</div><div class="note"><b>Terms &amp; Conditions:</b> ${esc(terms)}</div></div><div class="totals"><div><span>Gross value</span><b>${money(subtotal+discountTotal)}</b></div><div><span>Discount</span><b>- ${money(discountTotal)}</b></div><div><span>Taxable amount</span><b>${money(subtotal)}</b></div><div><span>Total GST</span><b>${money(taxTotal)}</b></div><div><span>Round off</span><b>${money(roundOff)}</b></div><div class="grand"><span>Grand Total</span><b>${money(payable)}</b></div></div></div>
      <footer class="foot"><div><b>For K&amp;B NET SERVICE</b><p class="small">This is a computer-generated invoice.</p><p class="small">Please retain this invoice for your records.</p></div><div class="sign"><b>Authorised Signatory</b><div class="small">K&amp;B NET SERVICE</div></div></footer>
      <script>window.onload=()=>setTimeout(()=>window.print(),350);<\/script></body></html>`;
  }
  function numberWords(value:number) {
    const n=Math.max(0,Math.round(value)); if(n===0)return 'Rupees Zero Only';
    const one=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
    const ten=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
    const under=(x:number)=>x<20?one[x]:ten[Math.floor(x/10)]+(x%10?' '+one[x%10]:'');
    let x=n, parts:string[]=[]; const crore=Math.floor(x/10000000);x%=10000000;const lakh=Math.floor(x/100000);x%=100000;const thousand=Math.floor(x/1000);x%=1000;const hundred=Math.floor(x/100);x%=100;
    if(crore)parts.push(under(crore)+' Crore');if(lakh)parts.push(under(lakh)+' Lakh');if(thousand)parts.push(under(thousand)+' Thousand');if(hundred)parts.push(one[hundred]+' Hundred');if(x)parts.push(under(x));return 'Rupees '+parts.join(' ')+' Only';
  }
  function generate(e:FormEvent) {
    e.preventDefault();
    if(!customerName.trim()||!customerPhone.trim()||!items.length||items.some(i=>!i.description.trim()||Number(i.quantity)<=0||Number(i.rate)<0)){flash('Enter customer name, phone number and valid service line details.');return;}
    setBusy(true);
    try {
      const html=makeInvoiceHtml(), popup=window.open('','_blank');
      if(!popup){flash('Allow pop-ups for K&B Management Nexus, then generate the invoice again.');return;}
      popup.document.open();popup.document.write(html);popup.document.close();
      flash('Invoice prepared. Choose Save as PDF in the print window.');
      setDialogOpen(false);
      setInvoiceNo('KB/INV/'+new Date().getFullYear()+'/'+String(Date.now()).slice(-6));
    } catch(error) { flash(error instanceof Error?error.message:'Could not prepare invoice PDF.'); }
    finally {setBusy(false);}
  }
  return <div className="invoice-workspace">
    <section className="invoice-intro"><div><span className="eyebrow">CUSTOMER DOCUMENTS</span><h2>Professional GST invoices</h2><p>Create a branded customer invoice with automatic tax calculation and PDF printing.</p></div><div className="invoice-brand-chip"><b>K&amp;B</b><span>NET SERVICE</span></div><button type="button" className="btn primary invoice-open-button" onClick={()=>setDialogOpen(true)}>+ Create invoice</button></section>
    {dialogOpen && <div className="invoice-modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setDialogOpen(false);}}><div className="invoice-modal" role="dialog" aria-modal="true" aria-label="Create customer invoice"><div className="invoice-modal-head"><div><h2>Create customer invoice</h2><p>Fill in customer, service and tax details, then generate the PDF.</p></div><button type="button" className="btn secondary compact" onClick={()=>setDialogOpen(false)}>Close</button></div>
    <form className="invoice-form" onSubmit={generate}>
      <section className="invoice-form-section"><h3>Invoice information</h3><div className="invoice-grid">
        <label>Invoice number<input required value={invoiceNo} onChange={e=>setInvoiceNo(e.target.value)}/></label><label>Invoice date<input type="date" required value={invoiceDate} onChange={e=>setInvoiceDate(e.target.value)}/></label><label>Due date<input type="date" required min={invoiceDate} value={dueDate} onChange={e=>setDueDate(e.target.value)}/></label><label>Reference / order number <small>Optional</small><input value={reference} onChange={e=>setReference(e.target.value)} placeholder="PO / service reference"/></label>
      </div></section>
      <section className="invoice-form-section"><h3>Customer information</h3><div className="invoice-grid">
        <label>Choose existing customer <small>Optional, or enter details manually</small><select value={customerId} onChange={e=>chooseCustomer(e.target.value)}><option value="">Manual customer entry</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}</select></label>
        <label>Customer name<input required value={customerName} onChange={e=>setCustomerName(e.target.value)} placeholder="Full customer / business name"/></label><label>Phone number<input required type="tel" value={customerPhone} onChange={e=>setCustomerPhone(e.target.value)} placeholder="Customer mobile number"/></label><label>Email address <small>Optional</small><input type="email" value={customerEmail} onChange={e=>setCustomerEmail(e.target.value)} placeholder="customer@example.com"/></label><label className="wide">Billing address<textarea rows={2} value={customerAddress} onChange={e=>setCustomerAddress(e.target.value)} placeholder="House, street, area, city, state, PIN"/></label><label>Customer GSTIN <small>Optional</small><input maxLength={15} value={customerGstin} onChange={e=>setCustomerGstin(e.target.value.toUpperCase())} placeholder="15-character GSTIN"/></label>
        <label className="wide">K&amp;B business address<input value={businessAddress} onChange={e=>setBusinessAddress(e.target.value)} /></label>
        <label>Business UPI ID <small>Optional</small><input value={businessUpi} onChange={e=>setBusinessUpi(e.target.value)} placeholder="business@upi"/></label>
      </div></section>
      <section className="invoice-form-section"><h3>Service / plan charges</h3><p className="invoice-help">Add internet plan, installation, router, maintenance or other billable items. Each line can use its own GST rate.</p>
        {items.map((item,index)=><div className="invoice-line" key={item.id}><div className="invoice-line-title"><b>Item {index+1}</b>{items.length>1&&<button type="button" className="invoice-remove" onClick={()=>setItems(prev=>prev.filter(x=>x.id!==item.id))}>Remove</button>}</div><div className="invoice-grid"><label>Description<input required value={item.description} onChange={e=>updateItem(item.id,{description:e.target.value})} placeholder="Monthly internet plan"/></label><label>Additional plan details <small>Optional</small><input value={item.details} onChange={e=>updateItem(item.id,{details:e.target.value})} placeholder="Speed, data limit, validity, installation details"/></label><label>SAC / HSN <small>Optional</small><input value={item.sac} onChange={e=>updateItem(item.id,{sac:e.target.value})}/></label><label>Quantity<input type="number" min="0.01" step="0.01" required value={item.quantity} onChange={e=>updateItem(item.id,{quantity:e.target.value})}/></label><label>Rate per unit (₹)<input type="number" min="0" step="0.01" required value={item.rate} onChange={e=>updateItem(item.id,{rate:e.target.value})}/></label><label>Discount (%)<input type="number" min="0" max="100" step="0.01" value={item.discount} onChange={e=>updateItem(item.id,{discount:e.target.value})}/></label><label>GST rate<select value={item.gstRate} onChange={e=>updateItem(item.id,{gstRate:e.target.value})}><option value="0">0%</option><option value="5">5%</option><option value="12">12%</option><option value="18">18% (9% CGST + 9% SGST)</option><option value="28">28%</option></select></label><label>Rate type<select value={item.taxMode} onChange={e=>updateItem(item.id,{taxMode:e.target.value as LineItem['taxMode']})}><option value="exclusive">GST extra (exclusive)</option><option value="inclusive">GST included (inclusive)</option></select></label></div></div>)}
        <button type="button" className="btn secondary" onClick={()=>setItems(prev=>[...prev,newLine(Math.max(0,...prev.map(x=>x.id))+1)])}>+ Add another charge</button>
      </section>
      <section className="invoice-form-section"><h3>Tax &amp; payment details</h3><div className="invoice-grid"><label>Place of supply state<input required value={placeOfSupply} onChange={e=>setPlaceOfSupply(e.target.value)}/></label><label>State code<input required maxLength={2} pattern="[0-9]{2}" value={supplyStateCode} onChange={e=>setSupplyStateCode(e.target.value)}/></label><label>Reverse charge<select value={reverseCharge?'yes':'no'} onChange={e=>setReverseCharge(e.target.value==='yes')}><option value="no">No</option><option value="yes">Yes</option></select></label><label>Payment mode<input value={paymentMode} onChange={e=>setPaymentMode(e.target.value)}/></label></div>
        <div className="invoice-tax-preview"><div><span>Taxable value</span><b>{money(subtotal)}</b></div><div><span>GST total</span><b>{money(taxTotal)}</b></div><div><span>{isIntraState?'CGST + SGST':'IGST'}</span><b>{money(taxTotal)}</b></div><div className="total"><span>Grand total</span><b>{money(payable)}</b></div><small>{isIntraState?'Intra-state supply: GST split equally into CGST and SGST.':'Inter-state supply: IGST applies.'} Amounts update automatically as you edit charges.</small></div>
      </section>
      <section className="invoice-form-section"><h3>Manual calculator</h3><p className="invoice-help">Independent check only. This calculator does not change invoice line items or automatic totals.</p><div className="invoice-grid"><label>Quantity<input type="number" min="0" step="0.01" value={manualQty} onChange={e=>setManualQty(e.target.value)}/></label><label>Rate per unit (₹)<input type="number" min="0" step="0.01" value={manualRate} onChange={e=>setManualRate(e.target.value)}/></label><label>Discount (%)<input type="number" min="0" max="100" step="0.01" value={manualDiscount} onChange={e=>setManualDiscount(e.target.value)}/></label><label>GST rate<select value={manualGst} onChange={e=>setManualGst(e.target.value)}><option value="0">0%</option><option value="5">5%</option><option value="12">12%</option><option value="18">18% (9% CGST + 9% SGST)</option><option value="28">28%</option></select></label></div><div className="invoice-tax-preview"><div><span>Taxable amount</span><b>{money(Math.max(0,Number(manualQty)||0)*Math.max(0,Number(manualRate)||0)*(1-Math.min(100,Math.max(0,Number(manualDiscount)||0))/100))}</b></div><div><span>CGST ({Number(manualGst)/2}%)</span><b>{money(Math.max(0,Number(manualQty)||0)*Math.max(0,Number(manualRate)||0)*(1-Math.min(100,Math.max(0,Number(manualDiscount)||0))/100)*Number(manualGst)/200)}</b></div><div><span>SGST ({Number(manualGst)/2}%)</span><b>{money(Math.max(0,Number(manualQty)||0)*Math.max(0,Number(manualRate)||0)*(1-Math.min(100,Math.max(0,Number(manualDiscount)||0))/100)*Number(manualGst)/200)}</b></div><div className="total"><span>Total with GST</span><b>{money(Math.max(0,Number(manualQty)||0)*Math.max(0,Number(manualRate)||0)*(1-Math.min(100,Math.max(0,Number(manualDiscount)||0))/100)*(1+Number(manualGst)/100))}</b></div></div></section>
      <section className="invoice-form-section"><h3>Customer message &amp; terms</h3><div className="invoice-grid"><label className="wide">Notes <small>Optional</small><textarea rows={2} value={notes} onChange={e=>setNotes(e.target.value)}/></label><label className="wide">Terms &amp; conditions <small>Optional</small><textarea rows={2} value={terms} onChange={e=>setTerms(e.target.value)}/></label></div></section>
      <div className="invoice-submit"><div><span>Amount payable</span><strong>{money(payable)}</strong><small>Includes GST and rounding</small></div><button className="btn primary" disabled={busy||!items.length}>{busy?'Preparing…':'Generate customer PDF invoice'}</button></div>
    </form></div></div>}
    <style>{`
      .invoice-workspace{display:grid;gap:16px}.invoice-modal-backdrop{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;background:#0b1729a8}.invoice-modal{width:min(980px,100%);max-height:92dvh;overflow:auto;background:var(--surface,#fff);border:1px solid var(--border,#dbe2ec);border-radius:18px;padding:18px;box-shadow:0 24px 70px #07142655}.invoice-modal-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;margin-bottom:14px}.invoice-modal-head h2{margin:0;font-size:19px;color:var(--text,#172033)}.invoice-modal-head p{margin:4px 0 0;font-size:12px;color:var(--muted,#64748b)}.invoice-open-button{align-self:center;white-space:nowrap}.invoice-intro{display:flex;justify-content:space-between;align-items:center;padding:20px 22px;border-radius:16px;background:linear-gradient(120deg,#102e50,#1e5d8c);color:#fff}.invoice-intro h2{margin:5px 0;font-size:21px}.invoice-intro p{margin:0;color:#d6e5f4;font-size:13px}.invoice-brand-chip{display:grid;justify-items:center;padding:12px 16px;border:1px solid #ffffff55;border-radius:12px}.invoice-brand-chip b{font-size:25px}.invoice-brand-chip span{font-size:9px;letter-spacing:2px}
      .invoice-form{display:grid;gap:14px}.invoice-form-section{background:var(--surface,#fff);border:1px solid var(--border,#dbe2ec);border-radius:14px;padding:17px}.invoice-form-section h3{margin:0 0 13px;font-size:14px;color:var(--text,#172033)}.invoice-help{font-size:12px;color:var(--muted,#64748b);margin:-6px 0 12px}
      .invoice-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.invoice-grid label{display:grid;gap:6px;font-size:12px;font-weight:700;color:var(--muted,#526176)}.invoice-grid label small{font-weight:400;display:inline;color:#8994a5}.invoice-grid input,.invoice-grid select,.invoice-grid textarea{width:100%;min-width:0;min-height:40px;border:1px solid var(--border,#dbe2ec);border-radius:9px;padding:9px 10px;background:var(--surface,#fff);color:var(--text,#172033);font:inherit}.invoice-grid textarea{resize:vertical}.invoice-grid .wide{grid-column:1/-1}
      .invoice-line{padding:13px;margin:12px 0;border:1px solid var(--border,#dbe2ec);border-radius:12px;background:var(--surface-soft,#f7f9fc)}.invoice-line-title{display:flex;justify-content:space-between;align-items:center;margin-bottom:11px}.invoice-remove{border:0;background:transparent;color:#b42318;font-weight:700;cursor:pointer}
      .invoice-tax-preview{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;padding:13px;margin-top:14px;border-radius:11px;background:var(--surface-soft,#f3f6fa)}.invoice-tax-preview div{display:grid;gap:4px}.invoice-tax-preview span{font-size:11px;color:var(--muted,#64748b)}.invoice-tax-preview b{font-size:15px}.invoice-tax-preview .total{color:#155b91}.invoice-tax-preview small{grid-column:1/-1;color:var(--muted,#64748b);font-size:10px}
      .invoice-submit{position:sticky;bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 17px;border:1px solid var(--border,#dbe2ec);border-radius:14px;background:var(--surface,#fff);box-shadow:0 8px 28px #14263b18}.invoice-submit div{display:grid;gap:2px}.invoice-submit span,.invoice-submit small{font-size:11px;color:var(--muted,#64748b)}.invoice-submit strong{font-size:23px;color:var(--text,#172033)}
      @media(max-width:700px){.invoice-modal-backdrop{padding:6px;align-items:flex-end}.invoice-modal{max-height:95dvh;border-radius:16px 16px 0 0;padding:13px}.invoice-intro{padding:16px;flex-wrap:wrap}.invoice-open-button{width:100%}.invoice-grid{grid-template-columns:1fr}.invoice-tax-preview{grid-template-columns:1fr 1fr}.invoice-submit{align-items:stretch;flex-direction:column}.invoice-submit button{width:100%}}
    `}</style>
  </div>;
}
