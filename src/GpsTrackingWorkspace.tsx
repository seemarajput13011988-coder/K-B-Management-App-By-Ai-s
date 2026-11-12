import { useEffect, useState } from 'react';
import { api, subscribeToApiChanges } from './lib/api';
import { MapPin, RefreshCw, Save, ExternalLink, LocateFixed } from 'lucide-react';

type StaffMember = { id: string; displayName: string; active: boolean };
type LiveLocation = {
  staffId: string; staffName: string; latitude: number; longitude: number;
  accuracy: number; capturedAt: string; receivedAt?: string; source?: string;
};
type SavedLocation = {
  id: string; staffId: string; staffName: string; latitude: number; longitude: number;
  accuracy: number; address: string; capturedAt: string; savedAt: string; savedByName: string;
};
const stamp=(value?:string)=>value?new Date(value).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):'—';
const mapsUrl=(lat:number,lng:number)=>'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(lat+','+lng);
const mapsEmbedUrl=(lat:number,lng:number)=>'https://maps.google.com/maps?q='+encodeURIComponent(lat+','+lng)+'&z=16&output=embed';
const hasValidCoordinates=(lat:number,lng:number)=>Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=-90&&lat<=90&&lng>=-180&&lng<=180;

export default function GpsTrackingWorkspace({flash}:{flash:(message:string)=>void}) {
  const [staff,setStaff]=useState<StaffMember[]>([]);
  const [onShiftIds,setOnShiftIds]=useState<string[]>([]);
  const [saved,setSaved]=useState<SavedLocation[]>([]);
  const [liveLocation,setLiveLocation]=useState<LiveLocation|null>(null);
  const [selectedStaff,setSelectedStaff]=useState<StaffMember|null>(null);
  const [busyStaffId,setBusyStaffId]=useState('');
  const [loading,setLoading]=useState(true);
  const [section,setSection]=useState<'live'|'saved'>('live');
  const [locationFresh,setLocationFresh]=useState(false);
  const [locationAge,setLocationAge]=useState<number|null>(null);
  const [locationStatus,setLocationStatus]=useState('location-unavailable');
  const [gpsDeadline,setGpsDeadline]=useState<string|null>(null);
  const [gpsCancelled,setGpsCancelled]=useState(false);

  async function load() {
    setLoading(true);
    try {
      const [staffResult,savedResult,attendanceResult]=await Promise.all([
        api.get<{items:StaffMember[]}>('/api/staff'),
        api.get<{items:SavedLocation[]}>('/api/saved-locations'),
        api.get<{items:Array<{userId:string;checkOutAt?:string;autoCheckoutAt?:string;scheduledEndAt?:string;gpsRestartRequired?:boolean;gpsCancelled?:boolean;status?:string}>}>('/api/attendance')
      ]);
      setStaff((staffResult.data.items||[]).filter(item=>item.active));
      setSaved(savedResult.data.items||[]);
      const activeIds=(attendanceResult.data.items||[]).filter(item=>{
        const status=String(item.status||'').toLowerCase();
        const deadline=Date.parse(item.autoCheckoutAt||item.scheduledEndAt||'');
        return !item.checkOutAt&&!item.gpsRestartRequired&&!item.gpsCancelled&&!status.includes('cancelled')&&!status.includes('completed')&&Number.isFinite(deadline)&&deadline>Date.now();
      }).map(item=>item.userId);
      setOnShiftIds(Array.from(new Set(activeIds)));
    } catch(error) {
      flash(error instanceof Error?error.message:'Could not load GPS tracking records.');
    } finally { setLoading(false); }
  }
  useEffect(()=>{void load();},[]);
  useEffect(()=>{
    let stopped=false;
    const refreshShiftStatus=async()=>{
      try{
        const result=await api.get<{items:Array<{userId:string;checkOutAt?:string;autoCheckoutAt?:string;scheduledEndAt?:string;gpsRestartRequired?:boolean;gpsCancelled?:boolean;status?:string}>}>('/api/attendance');
        if(stopped)return;
        const activeIds=(result.data.items||[]).filter(item=>{
          const status=String(item.status||'').toLowerCase();
          const deadline=Date.parse(item.autoCheckoutAt||item.scheduledEndAt||'');
          return !item.checkOutAt&&!item.gpsRestartRequired&&!item.gpsCancelled&&!status.includes('cancelled')&&!status.includes('completed')&&Number.isFinite(deadline)&&deadline>Date.now();
        }).map(item=>item.userId);
        setOnShiftIds(Array.from(new Set(activeIds)));
      }catch{/* Keep the last server-confirmed active-shift list while offline. */}
    };
    void refreshShiftStatus();
    const timer=window.setInterval(()=>void refreshShiftStatus(),15000);
    return()=>{stopped=true;window.clearInterval(timer);};
  },[]);
  useEffect(()=>subscribeToApiChanges(()=>{void load();}),[]);

  async function getLiveLocation(member:StaffMember) {
    setBusyStaffId(member.id);
    setSelectedStaff(member);
    setLiveLocation(null);
    setLocationFresh(false);
    setLocationAge(null);
    try {
      const endpoint='/api/staff/'+encodeURIComponent(member.id)+'/live-location';
      let result=await api.get<{item?:LiveLocation|null;isFresh?:boolean;ageSeconds?:number|null;status?:string;deadlineAt?:string;cancelled?:boolean}>(endpoint);
      // A deliberate admin click always requests a new phone reading, even if
      // the cached point is recent. The map must not substitute a saved point
      // for the location response requested by the administrator.
      if (onShiftIds.includes(member.id)) {
        const requestedAt = Date.now();
        const requestResult=await api.post<{id:string}>('/api/location-requests',{staffId:member.id});
        flash('Fresh GPS requested from '+member.displayName+'. Waiting for a new phone reading…');
        let captured=false;
        for(let attempt=0;attempt<18;attempt++){
          await new Promise(resolve=>window.setTimeout(resolve,2500));
          const [requestStatus, latestLocation]=await Promise.all([
            api.get<{item?:{status?:string;responseMessage?:string}}>('/api/location-requests/'+encodeURIComponent(requestResult.data.id)),
            api.get(endpoint),
          ]);
          result=latestLocation;
          const receivedAt = Date.parse(String(latestLocation.data.item?.receivedAt || ''));
          // The Android foreground service uploads continuously even if its app
          // screen is swiped away. Do not depend only on the visible React poller.
          if(Number.isFinite(receivedAt) && receivedAt >= requestedAt - 1000){
            captured=true;
            break;
          }
          if(String(requestStatus.data.item?.status||'')==='captured'){
            captured=true;
            break;
          }
          if(['unavailable','expired'].includes(String(requestStatus.data.item?.status||'')) && attempt>=5) break;
        }
        if(!captured){
          flash('No new GPS upload arrived yet. The map is showing the last saved point with its age, not calling it live.');
        }
      }
      const status=result.data.status || (result.data.isFresh ? 'live' : 'stale');
      setLocationStatus(status);
      setGpsDeadline(result.data.deadlineAt || null);
      setGpsCancelled(result.data.cancelled === true);
      setLiveLocation(result.data.item || null);
      setLocationFresh(result.data.isFresh === true);
      setLocationAge(result.data.ageSeconds ?? null);
      if(status==='gps-off') flash('GPS is OFF on '+member.displayName+'’s phone.');
      else if(status==='shift-not-active') flash(member.displayName+' does not have an active shift.');
      else if(status==='location-unavailable') flash('No location has been received from '+member.displayName+' yet.');
      else if(result.data.isFresh) flash('Fresh GPS location received. Live map refresh is active for '+member.displayName+'.');
      else flash('Showing the last known location. Its age is displayed; it is not being labelled as live.');
    }catch(error){
      flash(error instanceof Error?error.message:'No live location is available. Check the staff app and location permission.');
    }finally{setBusyStaffId('');}
  }

  // Keep the selected staff member's map data fresh while the admin is viewing it.
  // The first request returns the latest stored point immediately; later requests
  // pick up new points uploaded by the staff phone's Android foreground service.
  useEffect(()=>{
    if(!selectedStaff || section!=='live') return;
    let active=true;
    const refresh=async()=>{
      try{
        const result=await api.get<{item?:LiveLocation|null;isFresh?:boolean;ageSeconds?:number|null;status?:string;deadlineAt?:string;cancelled?:boolean}>('/api/staff/'+encodeURIComponent(selectedStaff.id)+'/live-location');
        if(!active)return;
        const item=result.data.item||null;
        setLocationStatus(result.data.status || (result.data.isFresh?'live':'stale'));
        setGpsDeadline(result.data.deadlineAt||null);
        setGpsCancelled(result.data.cancelled===true);
        if(item)setLiveLocation(item);
        setLocationFresh(result.data.isFresh===true);
        setLocationAge(result.data.ageSeconds??(item?Math.max(0,Math.floor((Date.now()-new Date(item.capturedAt).getTime())/1000)):null));
      }catch{
        // Keep the last successful point visible and let its age/status communicate staleness.
        if(active)setLocationFresh(false);
      }
    };
    void refresh();
    const timer=window.setInterval(()=>void refresh(),10000);
    return()=>{active=false;window.clearInterval(timer);};
  },[selectedStaff?.id,section]);

  async function saveLocation() {
    if(!liveLocation)return;
    try{
      const capturedAt=liveLocation.capturedAt;
      const record={...liveLocation,address:'Coordinates available in Google Maps',savedAt:new Date().toISOString(),savedByName:'Admin'};
      await api.post<{id:string}>('/api/saved-locations',{staffId:record.staffId,staffName:record.staffName,latitude:record.latitude,longitude:record.longitude,accuracy:record.accuracy,capturedAt});
      const refreshed=await api.get<{items:SavedLocation[]}>('/api/saved-locations');
      setSaved(refreshed.data.items||[]);
      flash('Live location saved.');
    }catch(error){flash(error instanceof Error?error.message:'Could not save this location.');}
  }

  return <section className="panel gps-workspace">
    <div className="toolbar">
      <div><h2>GPS Tracking</h2><p className="subtle">Choose a staff member to request a fresh GPS reading and monitor updates during their active shift.</p></div>
      <button className="btn secondary" onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/> Refresh staff</button>
    </div>
    <div className="gps-tabs">
      <button className={section==='live'?'active':''} onClick={()=>setSection('live')}><LocateFixed size={15}/> Live Staff Location</button>
      <button className={section==='saved'?'active':''} onClick={()=>setSection('saved')}><Save size={15}/> Saved Locations <span>{saved.length}</span></button>
    </div>
    {section==='live' ? <>
      <div className="gps-notice"><MapPin size={17}/><span>Live GPS is available only during an active shift. If the phone has not uploaded a fresh point, this screen requests one from the staff app. The staff member must have the app available and respond; fresh updates are then monitored automatically.</span></div>
      {loading?<p className="ops-empty">Loading staff…</p>:<div className="gps-staff-list">
        {staff.map(member=><article className="gps-staff-row" key={member.id}>
          <div className="gps-avatar"><MapPin size={17}/></div>
          <div className="gps-staff-name"><strong>{member.displayName}</strong><small>Staff account</small></div>
          <div className="gps-row-actions"><button className="btn primary compact" disabled={!!busyStaffId||!onShiftIds.includes(member.id)} onClick={()=>void getLiveLocation(member)}>{busyStaffId===member.id?'Requesting fresh GPS…':'Get Live Location'}</button></div>
        </article>)}
        {!staff.length&&<p className="ops-empty">No active staff accounts found.</p>}
      </div>}
      {selectedStaff&&<div className="gps-result">
        <div className="gps-result-head"><div><strong>{selectedStaff.displayName}</strong><small>Latest phone location · {stamp(liveLocation?.capturedAt)}</small></div><div className="gps-result-head-actions"><span className={'gps-status '+(locationStatus==='gps-off'?'gps-off':locationStatus==='live'&&liveLocation&&locationFresh?'captured':liveLocation?'pending':'unavailable')}>{locationStatus==='gps-off'?'GPS is OFF':locationStatus==='shift-not-active'?'Shift not active':liveLocation?(locationFresh?'Live · Fresh':'Last known · Stale'):'Location unavailable'}</span><button type="button" className="btn secondary compact" disabled={!!busyStaffId} onClick={()=>void getLiveLocation(selectedStaff)}><RefreshCw size={14}/>{busyStaffId===selectedStaff.id?'Refreshing…':'Refresh GPS'}</button></div></div>
        {liveLocation?<>
          <div className="gps-address"><MapPin size={18}/><div><strong>{locationFresh?'Latest location received':'Showing last known location'}</strong><small>{locationAge===null?'':locationAge<60?locationAge+' seconds ago':Math.floor(locationAge/60)+' minutes ago'} · Accuracy ±{Math.round(liveLocation.accuracy||0)} m</small></div></div>
          {hasValidCoordinates(Number(liveLocation.latitude),Number(liveLocation.longitude))&&<div className="gps-map"><iframe title={'Google Map showing '+selectedStaff.displayName+' location'} src={mapsEmbedUrl(Number(liveLocation.latitude),Number(liveLocation.longitude))} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen/></div>}
          <div className="gps-coordinates"><div><small>Latitude</small><strong>{Number(liveLocation.latitude).toFixed(6)}</strong></div><div><small>Longitude</small><strong>{Number(liveLocation.longitude).toFixed(6)}</strong></div><div><small>Captured</small><strong>{stamp(liveLocation.capturedAt)}</strong></div></div>
          <div className="gps-result-actions"><a className="btn secondary" href={mapsUrl(Number(liveLocation.latitude),Number(liveLocation.longitude))} target="_blank" rel="noreferrer"><ExternalLink size={15}/> Open in Google Maps</a><button className="btn primary" onClick={()=>void saveLocation()}><Save size={15}/> Save Location</button></div>
        </>:<p className="gps-error">{locationStatus==='gps-off'?(gpsCancelled?'GPS is OFF and the 15-minute grace period expired. The shift was automatically cancelled; an administrator must restart it.':'GPS is OFF on this staff phone. The shift GPS grace period is active. '+(gpsDeadline?'Restore GPS before '+stamp(gpsDeadline)+'.':'')):locationStatus==='shift-not-active'?'This staff member is not currently on an active shift.': 'No location has been received yet. Check device connectivity and location permission.'}</p>}
      </div>}
    </>:<div className="gps-saved-list">
      {loading?<p className="ops-empty">Loading saved locations…</p>:saved.length?saved.map(item=><article className="gps-saved-card" key={item.id}>
        <div><strong>{item.staffName}</strong><small>{item.address||'Coordinates available in Google Maps'}</small><small>Captured {stamp(item.capturedAt)} · Saved {stamp(item.savedAt)} by {item.savedByName||'Admin'}</small><small>{Number(item.latitude).toFixed(6)}, {Number(item.longitude).toFixed(6)} · ±{Math.round(item.accuracy||0)} m</small></div>
        <a className="btn secondary compact" href={mapsUrl(item.latitude,item.longitude)} target="_blank" rel="noreferrer"><ExternalLink size={14}/> Google Maps</a>
      </article>):<p className="ops-empty">No locations saved yet. Select a staff member and save their latest location.</p>}
    </div>}
    <style>{`
      .gps-tabs{display:flex;gap:8px;border-bottom:1px solid var(--border,#e2e8f0);margin:12px 0 16px;flex-wrap:wrap}
      .gps-tabs button{display:flex;align-items:center;gap:7px;border:0;background:transparent;color:var(--muted,#64748b);padding:11px 13px;border-bottom:2px solid transparent;font:inherit;font-size:13px;font-weight:700;cursor:pointer}
      .gps-tabs button.active{color:var(--text,#172033);border-bottom-color:var(--accent,#2563eb)}.gps-tabs span{font-size:11px;border-radius:20px;background:var(--surface-soft,#f1f5f9);padding:2px 7px}
      .gps-notice{display:flex;gap:10px;align-items:flex-start;padding:12px;border-radius:12px;background:var(--surface-soft,#f7f9fc);color:var(--muted,#526176);font-size:13px;line-height:1.5;margin-bottom:14px}
      .gps-staff-list,.gps-saved-list{display:grid;gap:9px}.gps-staff-row,.gps-saved-card{display:flex;align-items:center;gap:12px;padding:12px;border:1px solid var(--border,#e2e8f0);border-radius:12px}
      .gps-avatar{width:36px;height:36px;border-radius:10px;background:var(--surface-soft,#eff6ff);display:grid;place-items:center;color:var(--accent,#2563eb)}
      .gps-staff-name{display:grid;gap:3px;flex:1}.gps-row-actions{display:flex;gap:7px;flex-wrap:wrap}.gps-staff-name small,.gps-result-head small,.gps-address small,.gps-saved-card small{display:block;color:var(--muted,#64748b);font-size:11px;margin-top:3px}
      .gps-result{margin-top:16px;padding:15px;border:1px solid var(--border,#dbe2ec);border-radius:14px;background:var(--surface,#fff)}
      .gps-result-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.gps-result-head-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}.gps-status{font-size:11px;font-weight:800;border-radius:30px;padding:6px 9px;background:#f1f5f9;color:#475569;text-transform:capitalize}.gps-status.captured{background:#dcfce7;color:#166534}.gps-status.pending{background:#fef3c7;color:#92400e}.gps-status.gps-off,.gps-status.unavailable{background:#fee2e2;color:#991b1b}
      .gps-error{font-size:13px;color:#b91c1c;display:flex;align-items:center;gap:9px}
      .gps-address{display:flex;align-items:flex-start;gap:10px;margin:16px 0;color:var(--text,#172033)}.gps-address svg{color:var(--accent,#2563eb);flex:none}
      .gps-map{width:100%;aspect-ratio:16/9;min-height:220px;margin:12px 0;border:1px solid var(--border,#dbe2ec);border-radius:12px;overflow:hidden;background:var(--surface-soft,#f7f9fc)}.gps-map iframe{display:block;width:100%;height:100%;min-height:220px;border:0}.gps-coordinates{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;padding:12px;border-radius:10px;background:var(--surface-soft,#f7f9fc)}.gps-coordinates small{display:block;color:var(--muted,#64748b);font-size:10px}.gps-coordinates strong{font-size:13px;overflow-wrap:anywhere}
      .gps-result-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.gps-saved-card>div{flex:1;min-width:0}.gps-saved-card>div strong{display:block}.gps-saved-card small{overflow-wrap:anywhere}
      @media(max-width:600px){.gps-coordinates{grid-template-columns:1fr}.gps-saved-card{align-items:flex-start;flex-direction:column}.gps-staff-row{flex-wrap:wrap}}
    `}</style>
  </section>;
}
