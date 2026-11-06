import { useEffect, useState } from 'react';
import { api } from './lib/api';
import { MapPin, RefreshCw, Save, ExternalLink, LocateFixed } from 'lucide-react';

type StaffMember = { id: string; displayName: string; active: boolean };
type LocationRequest = {
  id: string; staffId: string; staffName: string; status: 'pending'|'captured'|'unavailable'|'expired';
  createdAt: string; expiresAt: string; capturedAt?: string; latitude?: number; longitude?: number;
  accuracy?: number; address?: string; responseMessage?: string; savedLocationId?: string;
};
type SavedLocation = {
  id: string; staffId: string; staffName: string; latitude: number; longitude: number;
  accuracy: number; address: string; capturedAt: string; savedAt: string; savedByName: string;
};
const stamp=(value?:string)=>value?new Date(value).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):'—';
const mapsUrl=(lat:number,lng:number)=>'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(lat+','+lng);

export default function GpsTrackingWorkspace({flash}:{flash:(message:string)=>void}) {
  const [staff,setStaff]=useState<StaffMember[]>([]);
  const [saved,setSaved]=useState<SavedLocation[]>([]);
  const [activeRequest,setActiveRequest]=useState<LocationRequest|null>(null);
  const [busyStaffId,setBusyStaffId]=useState('');
  const [loading,setLoading]=useState(true);
  const [section,setSection]=useState<'request'|'saved'>('request');

  async function load() {
    setLoading(true);
    try {
      const [staffResult,savedResult]=await Promise.all([
        api.get<{items:StaffMember[]}>('/api/staff'),
        api.get<{items:SavedLocation[]}>('/api/saved-locations')
      ]);
      setStaff((staffResult.data.items||[]).filter(item=>item.active));
      setSaved(savedResult.data.items||[]);
    } catch(error) {
      flash(error instanceof Error?error.message:'Could not load GPS tracking records.');
    } finally { setLoading(false); }
  }
  useEffect(()=>{void load();},[]);

  useEffect(()=>{
    if(!activeRequest||activeRequest.status!=='pending')return;
    let stopped=false;
    const poll=async()=>{
      try{
        const result=await api.get<{item:LocationRequest}>('/api/location-requests/'+activeRequest.id);
        if(!stopped&&result.data.item)setActiveRequest(result.data.item);
      }catch{/* Keep the pending request visible if a poll briefly fails. */}
    };
    const timer=window.setInterval(()=>{void poll();},2500);
    void poll();
    return()=>{stopped=true;window.clearInterval(timer);};
  },[activeRequest?.id,activeRequest?.status]);

  async function requestLocation(member:StaffMember) {
    setBusyStaffId(member.id);
    setActiveRequest(null);
    try {
      const result=await api.post<LocationRequest>('/api/location-requests',{staffId:member.id});
      setActiveRequest(result.data as LocationRequest);
      flash('Location request sent to '+member.displayName+'.');
    }catch(error){flash(error instanceof Error?error.message:'Could not request this staff member’s location.');}
    finally{setBusyStaffId('');}
  }
  async function saveLocation() {
    if(!activeRequest||activeRequest.status!=='captured')return;
    try{
      await api.post('/api/saved-locations',{requestId:activeRequest.id});
      const result=await api.get<{items:SavedLocation[]}>('/api/saved-locations');
      setSaved(result.data.items||[]);
      setActiveRequest(current=>current?{...current,savedLocationId:'saved'}:current);
      flash('Location saved under GPS Tracking → Saved Locations.');
    }catch(error){flash(error instanceof Error?error.message:'Could not save this location.');}
  }

  return <section className="panel gps-workspace">
    <div className="toolbar">
      <div><h2>GPS Tracking</h2><p className="subtle">Get a fresh location from a staff phone when it is online and the app is open.</p></div>
      <button className="btn secondary" onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/> Refresh</button>
    </div>
    <div className="gps-tabs">
      <button className={section==='request'?'active':''} onClick={()=>setSection('request')}><LocateFixed size={15}/> Request location</button>
      <button className={section==='saved'?'active':''} onClick={()=>setSection('saved')}><Save size={15}/> Saved Locations <span>{saved.length}</span></button>
    </div>
    {section==='request' ? <>
      <div className="gps-notice"><MapPin size={17}/><span>Choose a staff member and tap Get Location. Their phone uses the location permission already granted during setup, without asking again. The staff app must be online and open to respond.</span></div>
      {loading?<p className="ops-empty">Loading staff…</p>:<div className="gps-staff-list">
        {staff.map(member=><article className="gps-staff-row" key={member.id}>
          <div className="gps-avatar"><MapPin size={17}/></div>
          <div className="gps-staff-name"><strong>{member.displayName}</strong><small>Staff account</small></div>
          <button className="btn primary compact" disabled={!!busyStaffId} onClick={()=>void requestLocation(member)}>{busyStaffId===member.id?'Sending…':'Get Location'}</button>
        </article>)}
        {!staff.length&&<p className="ops-empty">No active staff accounts found.</p>}
      </div>}
      {activeRequest&&<div className="gps-result">
        <div className="gps-result-head"><div><strong>{activeRequest.staffName}</strong><small>Location request · {stamp(activeRequest.createdAt)}</small></div><span className={'gps-status '+activeRequest.status}>{activeRequest.status==='pending'?'Waiting for staff':activeRequest.status==='captured'?'Location received':activeRequest.status==='expired'?'Request expired':'Unavailable'}</span></div>
        {activeRequest.status==='pending'&&<p className="gps-wait"><span className="gps-spinner"/> Waiting for a fresh GPS response from the staff phone. A location is shown only after the phone returns a valid reading.</p>}
        {(activeRequest.status==='unavailable'||activeRequest.status==='expired')&&<p className="gps-error">{activeRequest.status==='expired'?'The staff phone did not return a location before this request expired. Check that the phone is online, GPS is enabled and the K&B app has location permission.':activeRequest.responseMessage||'Location could not be captured. Check GPS permission, then request again.'}</p>}
        {activeRequest.status==='captured'&&<>
          <div className="gps-address"><MapPin size={18}/><div><strong>{activeRequest.address||'Address not available'}</strong><small>Captured {stamp(activeRequest.capturedAt)}</small></div></div>
          <div className="gps-coordinates"><div><small>Latitude</small><strong>{Number(activeRequest.latitude).toFixed(6)}</strong></div><div><small>Longitude</small><strong>{Number(activeRequest.longitude).toFixed(6)}</strong></div><div><small>Accuracy</small><strong>±{Math.round(activeRequest.accuracy||0)} m</strong></div></div>
          <div className="gps-result-actions"><a className="btn secondary" href={mapsUrl(Number(activeRequest.latitude),Number(activeRequest.longitude))} target="_blank" rel="noreferrer"><ExternalLink size={15}/> Open in Google Maps</a><button className="btn primary" onClick={()=>void saveLocation()} disabled={!!activeRequest.savedLocationId}><Save size={15}/>{activeRequest.savedLocationId?'Saved':'Save Location'}</button></div>
        </>}
      </div>}
    </>:<div className="gps-saved-list">
      {loading?<p className="ops-empty">Loading saved locations…</p>:saved.length?saved.map(item=><article className="gps-saved-card" key={item.id}>
        <div><strong>{item.staffName}</strong><small>{item.address||'Address unavailable'}</small><small>Captured {stamp(item.capturedAt)} · Saved {stamp(item.savedAt)} by {item.savedByName||'Admin'}</small><small>{Number(item.latitude).toFixed(6)}, {Number(item.longitude).toFixed(6)} · ±{Math.round(item.accuracy||0)} m</small></div>
        <a className="btn secondary compact" href={mapsUrl(item.latitude,item.longitude)} target="_blank" rel="noreferrer"><ExternalLink size={14}/> Google Maps</a>
      </article>):<p className="ops-empty">No locations saved yet. Request a staff member’s location and use Save Location.</p>}
    </div>}
    <style>{`
      .gps-tabs{display:flex;gap:8px;border-bottom:1px solid var(--border,#e2e8f0);margin:12px 0 16px;flex-wrap:wrap}
      .gps-tabs button{display:flex;align-items:center;gap:7px;border:0;background:transparent;color:var(--muted,#64748b);padding:11px 13px;border-bottom:2px solid transparent;font:inherit;font-size:13px;font-weight:700;cursor:pointer}
      .gps-tabs button.active{color:var(--text,#172033);border-bottom-color:var(--accent,#2563eb)}.gps-tabs span{font-size:11px;border-radius:20px;background:var(--surface-soft,#f1f5f9);padding:2px 7px}
      .gps-notice{display:flex;gap:10px;align-items:flex-start;padding:12px;border-radius:12px;background:var(--surface-soft,#f7f9fc);color:var(--muted,#526176);font-size:13px;line-height:1.5;margin-bottom:14px}
      .gps-staff-list,.gps-saved-list{display:grid;gap:9px}.gps-staff-row,.gps-saved-card{display:flex;align-items:center;gap:12px;padding:12px;border:1px solid var(--border,#e2e8f0);border-radius:12px}
      .gps-avatar{width:36px;height:36px;border-radius:10px;background:var(--surface-soft,#eff6ff);display:grid;place-items:center;color:var(--accent,#2563eb)}
      .gps-staff-name{display:grid;gap:3px;flex:1}.gps-staff-name small,.gps-result-head small,.gps-address small,.gps-saved-card small{display:block;color:var(--muted,#64748b);font-size:11px;margin-top:3px}
      .gps-result{margin-top:16px;padding:15px;border:1px solid var(--border,#dbe2ec);border-radius:14px;background:var(--surface,#fff)}
      .gps-result-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.gps-status{font-size:11px;font-weight:800;border-radius:30px;padding:6px 9px;background:#f1f5f9;color:#475569;text-transform:capitalize}.gps-status.captured{background:#dcfce7;color:#166534}.gps-status.unavailable{background:#fee2e2;color:#991b1b}
      .gps-wait,.gps-error{font-size:13px;color:var(--muted,#64748b);display:flex;align-items:center;gap:9px}.gps-error{color:#b91c1c}
      .gps-spinner{width:14px;height:14px;border:2px solid #cbd5e1;border-top-color:#2563eb;border-radius:50%;animation:gpsspin .8s linear infinite}@keyframes gpsspin{to{transform:rotate(360deg)}}
      .gps-address{display:flex;align-items:flex-start;gap:10px;margin:16px 0;color:var(--text,#172033)}.gps-address svg{color:var(--accent,#2563eb);flex:none}
      .gps-coordinates{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;padding:12px;border-radius:10px;background:var(--surface-soft,#f7f9fc)}.gps-coordinates small{display:block;color:var(--muted,#64748b);font-size:10px}.gps-coordinates strong{font-size:13px;overflow-wrap:anywhere}
      .gps-result-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.gps-saved-card>div{flex:1;min-width:0}.gps-saved-card>div strong{display:block}.gps-saved-card small{overflow-wrap:anywhere}
      @media(max-width:600px){.gps-coordinates{grid-template-columns:1fr}.gps-saved-card{align-items:flex-start;flex-direction:column}.gps-staff-row{flex-wrap:wrap}}
    `}</style>
  </section>;
}
