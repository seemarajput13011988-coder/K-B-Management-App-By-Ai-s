import { useState } from 'react';
import type { Staff } from '../../types/models';
import { Field } from '../../ui/Field';
import { Modal } from '../../ui/Modal';

export function StaffUsernameModal({ staff, onClose, onSave }: { staff: Staff; onClose: () => void; onSave: (userId: string) => Promise<void> }) {
  const [userId, setUserId] = useState(staff.userId);
  const [busy, setBusy] = useState(false);
  return <Modal title={'Change username · ' + staff.displayName} subtitle="The staff member must use the new ID at their next sign-in." onClose={onClose}><form className="form-grid" onSubmit={async e => { e.preventDefault(); setBusy(true); await onSave(userId.trim()); setBusy(false); }}><Field label="New staff user ID"><input required minLength={3} maxLength={32} pattern="[a-zA-Z0-9_-]{3,32}" value={userId} onChange={e => setUserId(e.target.value)} /></Field><div className="form-actions"><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || userId.trim().toLowerCase() === staff.userId.toLowerCase()}>{busy ? 'Saving…' : 'Save username'}</button></div></form></Modal>;
}
