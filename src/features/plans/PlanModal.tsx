import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Plan } from '../../types/models';
import { Field } from '../../ui/Field';
import { Modal } from '../../ui/Modal';

export function PlanModal({ initial, onClose, onSave }: { initial: Plan | null; onClose: () => void; onSave: (data: Omit<Plan, 'id'>) => Promise<void> }) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    provider: initial?.provider || 'RailWire',
    speed: initial?.speed || '',
    data: initial?.data || '',
    price: String(initial?.price ?? ''),
    note: initial?.note || '',
    details: initial?.details || '',
    connectionType: initial?.connectionType || 'Fiber',
    featured: initial?.featured ?? false,
    active: initial?.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    await onSave({ ...form, price: Number(form.price) });
    setBusy(false);
  }
  return (
    <Modal title={initial ? 'Edit internet plan' : 'Create internet plan'} subtitle="Set the package details and customer-facing monthly price." onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <Field label="Plan name"><input required maxLength={80} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Example: RailWire 75 Mbps" /></Field>
        <Field label="Provider / network"><input required maxLength={60} value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })} placeholder="RailWire, BSNL, Air Fibre..." /></Field>
        <Field label="Speed"><input required maxLength={40} value={form.speed} onChange={e => setForm({ ...form, speed: e.target.value })} placeholder="75 Mbps" /></Field>
        <Field label="Monthly data / FUP"><input required maxLength={40} value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} placeholder="2 TB" /></Field>
        <Field label="Monthly price (₹)"><input required type="number" min="0" max="1000000" step="1" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} /></Field>
        <Field label="Connection type"><select value={form.connectionType} onChange={e => setForm({ ...form, connectionType: e.target.value })}><option>Fiber</option><option>Air Fibre</option><option>Wireless</option><option>Cable</option><option>Other</option></select></Field>
        <Field label="Short description" wide><textarea rows={2} maxLength={180} value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="Who is this plan suitable for?" /></Field>
        <Field label="Additional plan details (optional)" wide><textarea rows={3} maxLength={1000} value={form.details} onChange={e => setForm({ ...form, details: e.target.value })} placeholder="Add extra features, fair-use policy, router details, installation terms or any other information. This field is optional." /></Field>
        <label className="plan-check"><input type="checkbox" checked={form.featured} onChange={e => setForm({ ...form, featured: e.target.checked })} /> Mark as popular plan</label>
        <div className="modal-actions"><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Saving...' : initial ? 'Save changes' : 'Create plan'}</button></div>
      </form>
    </Modal>
  );
}

