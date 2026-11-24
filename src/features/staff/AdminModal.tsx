import { useState } from 'react';
import { Field } from '../../ui/Field';
import { Modal } from '../../ui/Modal';

export function AdminModal({ onClose, onSave }: { onClose: () => void; onSave: (data: { displayName: string; userId: string; password: string }) => Promise<void> }) {
  const [form, setForm] = useState({ displayName: '', userId: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  return <Modal title="Create admin account" subtitle="Add another administrator. Staff accounts cannot be promoted from their own login." onClose={onClose}>
    <form className="form-grid" onSubmit={async e => {
      e.preventDefault();
      setBusy(true);
      setMessage('');
      try { await onSave(form); }
      catch (error) { setMessage(error instanceof Error ? error.message : 'Could not create admin account.'); }
      finally { setBusy(false); }
    }}>
      <Field label="Admin full name"><input required maxLength={80} value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} /></Field>
      <Field label="Admin user ID"><input required minLength={3} maxLength={32} pattern="[a-zA-Z0-9_-]{3,32}" value={form.userId} onChange={e => setForm({ ...form, userId: e.target.value })} /></Field>
      <Field label="Temporary password" wide><input required type="password" minLength={8} autoComplete="new-password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></Field>
      <p className="form-hint">Use at least 8 characters. The new account will have Admin access, but cannot create or manage other admin accounts.</p>
      {message && <div className="auth-message">{message}</div>}
      <div className="form-actions"><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Creating…' : 'Create admin'}</button></div>
    </form>
  </Modal>;
}
