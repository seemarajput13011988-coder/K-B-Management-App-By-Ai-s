import { useState } from 'react';
import type { Staff } from '../../types/models';
import { Field } from '../../ui/Field';
import { Modal } from '../../ui/Modal';

export function StaffPasswordModal({ staff, onClose, onSave }: { staff: Staff; onClose: () => void; onSave: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  return <Modal title={'Reset password · ' + staff.displayName} subtitle="The staff member will need to sign in again." onClose={onClose}><form className="form-grid" onSubmit={async e => { e.preventDefault(); setBusy(true); await onSave(password); setBusy(false); }}><Field label="New temporary password" wide><input type="password" required minLength={10} value={password} onChange={e => setPassword(e.target.value)} /></Field><div className="form-actions"><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Reset password'}</button></div></form></Modal>;
}
