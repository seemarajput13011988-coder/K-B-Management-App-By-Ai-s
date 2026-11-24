import { useState } from 'react';
import { MapPin } from 'lucide-react';
import type { Customer, Staff } from '../../types/models';
import type { Session } from '../../lib/session';
import { Field } from '../../ui/Field';
import { Modal } from '../../ui/Modal';

type ComplaintForm = {
  complaintFor: 'Customer' | 'Staff'; customerId: string; staffId: string; assignedTo: string;
  subject: string; details: string; priority: string; createdAt: string; locationText: string;
  latitude?: number; longitude?: number;
};
export function ComplaintModal({ customers, staff, session, onClose, onSave, flash }: {
  customers: Customer[]; staff: Staff[]; session: Session; onClose: () => void;
  onSave: (data: ComplaintForm & { customerName: string; photoFile: File | null; videoFile: File | null }) => Promise<void>;
  flash: (message: string) => void;
}) {
  const isAdmin = session.user.role === 'admin';
  const [f, setF] = useState<ComplaintForm>({
    complaintFor: 'Customer',
    customerId: '',
    staffId: isAdmin ? '' : session.user.id,
    assignedTo: '',
    subject: '',
    details: '',
    priority: 'Normal',
    createdAt: new Date().toISOString().slice(0, 10),
    locationText: '',
    latitude: undefined,
    longitude: undefined,
  });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [saving, setSaving] = useState(false);
  const customer = customers.find((item: Customer) => item.id === f.customerId);
  const activeStaff = (staff || []).filter((member: Staff) => member.active);
  function chooseLocation() {
    if (!navigator.geolocation) { setLocationError('Location is not available on this device.'); return; }
    setLocating(true);
    setLocationError('');
    navigator.geolocation.getCurrentPosition(position => {
      const latitude = Number(position.coords.latitude.toFixed(6));
      const longitude = Number(position.coords.longitude.toFixed(6));
      setF(old => ({ ...old, latitude, longitude, locationText: old.locationText || 'Current device location' }));
      setLocating(false);
    }, error => {
      setLocationError(error.code === 1 ? 'Allow location permission in Android settings, or enter the location manually.' : 'Could not get location. Enter it manually.');
      setLocating(false);
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  }
  function validateFile(file: File, kind: 'photo' | 'video') {
    const allowed = kind === 'photo' ? ['image/jpeg', 'image/png', 'image/webp'] : ['video/mp4', 'video/webm', 'video/quicktime'];
    const maxBytes = kind === 'photo' ? 2 * 1024 * 1024 : 8 * 1024 * 1024;
    if (!allowed.includes(file.type)) { flash(kind === 'photo' ? 'Choose a JPG, PNG or WEBP photo.' : 'Choose an MP4, WEBM or MOV video.'); return false; }
    if (file.size > maxBytes) { flash(kind === 'photo' ? 'Photo must be 2 MB or smaller.' : 'Video must be 8 MB or smaller.'); return false; }
    return true;
  }
  return <Modal title="New complaint" subtitle="Choose a customer or staff member, then add the issue details." onClose={onClose}>
    <form className="form-grid complaint-form" onSubmit={async event => {
      event.preventDefault();
      if (f.complaintFor === 'Customer' && !f.customerId) { flash('Select a customer.'); return; }
      if (f.complaintFor === 'Staff' && !(isAdmin ? f.staffId : session.user.id)) { flash('Select a staff member.'); return; }
      setSaving(true);
      await onSave({ ...f, customerName: customer?.name || '', staffId: isAdmin ? f.staffId : session.user.id, photoFile, videoFile });
      setSaving(false);
    }}>
      <Field label="Complaint for" wide>
        <select value={f.complaintFor} onChange={event => setF({ ...f, complaintFor: event.target.value === 'Staff' ? 'Staff' : 'Customer', customerId: '', staffId: isAdmin ? '' : session.user.id })}>
          <option value="Customer">Customer complaint</option>
          <option value="Staff">Staff complaint</option>
        </select>
      </Field>
      {f.complaintFor === 'Customer' ? <Field label="Select customer" wide>
        <select required value={f.customerId} onChange={event => setF({ ...f, customerId: event.target.value })}>
          <option value="">Choose customer</option>
          {customers.map((item: Customer) => <option value={item.id} key={item.id}>{item.name} · {item.phone}</option>)}
        </select>
      </Field> : isAdmin ? <Field label="Select staff member" wide>
        <select required value={f.staffId} onChange={event => setF({ ...f, staffId: event.target.value })}>
          <option value="">Choose staff member</option>
          {activeStaff.map((member: Staff) => <option value={member.id} key={member.id}>{member.displayName}</option>)}
        </select>
      </Field> : <Field label="Staff member" wide><input value={session.user.displayName} readOnly /></Field>}
      <Field label="Complaint title" wide><input required maxLength={150} value={f.subject} onChange={event => setF({ ...f, subject: event.target.value })} placeholder="What is the problem?" /></Field>
      <Field label="Priority"><select value={f.priority} onChange={event => setF({ ...f, priority: event.target.value })}><option>Low</option><option>Normal</option><option>High</option></select></Field>
      <Field label="Date"><input type="date" value={f.createdAt} onChange={event => setF({ ...f, createdAt: event.target.value })}/></Field>
      <Field label="What happened?" wide><textarea rows={3} maxLength={1500} value={f.details} onChange={event => setF({ ...f, details: event.target.value })} placeholder="Explain the issue in simple words" /></Field>
      <Field label="Location / address" wide><input maxLength={250} value={f.locationText} onChange={event => setF({ ...f, locationText: event.target.value })} placeholder="Enter area, building or address" /></Field>
      <div className="complaint-location-action wide">
        <button type="button" className="btn secondary compact" disabled={locating} onClick={chooseLocation}><MapPin size={14}/>{locating ? 'Getting location…' : 'Use current location'}</button>
        {Number.isFinite(f.latitude) && Number.isFinite(f.longitude) && <a href={'https://www.google.com/maps?q=' + f.latitude + ',' + f.longitude} target="_blank" rel="noreferrer">Location captured · Open map</a>}
        {locationError && <small>{locationError}</small>}
      </div>
      <Field label={isAdmin ? "Photo (optional)" : "Photo (required for staff)"} wide><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={event => { const file = event.target.files?.[0] || null; if (file && validateFile(file, 'photo')) setPhotoFile(file); else setPhotoFile(null); }}/>{photoFile && <small className="complaint-file-name">{photoFile.name} · {(photoFile.size / 1024).toFixed(0)} KB</small>}</Field>
      <Field label="Video (optional)" wide><input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={event => { const file = event.target.files?.[0] || null; if (file && validateFile(file, 'video')) setVideoFile(file); else setVideoFile(null); }}/>{videoFile && <small className="complaint-file-name">{videoFile.name} · {(videoFile.size / 1024 / 1024).toFixed(1)} MB</small>}</Field>
      {isAdmin && <Field label="Assign complaint to" wide><select value={f.assignedTo} onChange={event => setF({ ...f, assignedTo: event.target.value })}><option value="">Leave unassigned</option>{activeStaff.map((member: Staff) => <option value={member.id} key={member.id}>{member.displayName}</option>)}</select></Field>}
      <div className="form-actions"><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button className="btn primary" disabled={saving}>{saving ? 'Saving complaint…' : 'Create complaint'}</button></div>
    </form>
    <p className="form-hint">Staff must attach at least one photo or video. Photos up to 2 MB and videos up to 8 MB are saved with the complaint. Admins may submit without evidence.</p>
  </Modal>;
}
