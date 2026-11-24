import { useState } from 'react';
import { Field } from '../../ui/Field';
import { Modal } from '../../ui/Modal';

export function StaffModal({ onClose, onSave }: { onClose: () => void; onSave: (data: { displayName: string; userId: string; password: string }) => Promise<void> }) {
  const [form, setForm] = useState({ displayName: '', userId: '', password: '' });
  const [busy, setBusy] = useState(false);
  return <Modal title="Create staff account" subtitle="Give this team member a secure sign-in." onClose={onClose}><form className="form-grid" onSubmit={async e => { e.preventDefault(); setBusy(true); await onSave(form); setBusy(false); }}><Field label="Staff full name"><input required value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} /></Field><Field label="Staff user ID"><input required minLength={3} maxLength={32} pattern="[a-zA-Z0-9_-]{3,32}" value={form.userId} onChange={e => setForm({ ...form, userId: e.target.value })} /></Field><Field label="Temporary password" wide><input required type="password" minLength={10} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></Field><p className="form-hint">Use at least 10 characters and share it privately. Admin can reset it from Staff if needed.</p><div className="form-actions"><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button></div></form></Modal>;
}
