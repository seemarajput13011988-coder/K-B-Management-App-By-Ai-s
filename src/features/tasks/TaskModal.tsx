import { useState } from 'react';
import type { Task, Staff } from '../../types/models';
import { Field } from '../../ui/Field';
import { Modal } from '../../ui/Modal';

export function TaskModal({ staff, onClose, onSave }: { staff: Staff[]; onClose: () => void; onSave: (data: { title: string; details: string; assignedTo: string; priority: string; dueDate: string }) => Promise<void> }) {
  const [form, setForm] = useState({ title: '', details: '', assignedTo: staff[0]?.id || '', priority: 'Normal', dueDate: new Date().toISOString().slice(0, 10) });
  const [busy, setBusy] = useState(false);
  return <Modal title="Assign a task" subtitle="Create clear work for one staff member." onClose={onClose}><form className="form-grid" onSubmit={async e => { e.preventDefault(); setBusy(true); await onSave(form); setBusy(false); }}>
    <Field label="Task title" wide><input required maxLength={120} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Visit customer and check router" /></Field>
    <Field label="Assign to staff" wide><select required value={form.assignedTo} onChange={e => setForm({ ...form, assignedTo: e.target.value })}>{staff.map((member: Staff) => <option value={member.id} key={member.id}>{member.displayName} · {member.userId}</option>)}</select></Field>
    <Field label="Priority"><select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}><option>Low</option><option>Normal</option><option>High</option></select></Field>
    <Field label="Due date"><input type="date" required value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} /></Field>
    <Field label="Instructions" wide><textarea rows={3} maxLength={1000} value={form.details} onChange={e => setForm({ ...form, details: e.target.value })} placeholder="Add location, customer or work instructions" /></Field>
    {!staff.length && <p className="form-hint">Create an active staff account before assigning work.</p>}
    <div className="form-actions"><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !staff.length}>{busy ? 'Assigning…' : 'Assign task'}</button></div>
  </form></Modal>;
}
