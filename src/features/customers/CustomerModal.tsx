import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Customer, Staff, Plan } from '../../types/models';
import { Field } from '../../ui/Field';
import { Modal } from '../../ui/Modal';

type CustomerForm = Omit<Customer, 'id' | 'monthlyFee'> & { monthlyFee: number | string };

export function CustomerModal({ initial, onClose, onSave, staff = [], role = 'admin', plans = [], preferredPlan = '' }: { initial: Customer | null; onClose: () => void; onSave: (data: Omit<Customer, 'id'>) => Promise<void>; staff?: Staff[]; role?: 'admin' | 'staff'; plans?: Plan[]; preferredPlan?: string }) {
  const [form, setForm] = useState<CustomerForm>(
    initial || {
      name: '',
      phone: '',
      address: '',
      plan: preferredPlan || plans.find((item: Plan) => item.active)?.name || '',
      monthlyFee: plans.find((item: Plan) => item.name === (preferredPlan || plans.find((entry: Plan) => entry.active)?.name))?.price ?? 549,
      status: 'Active',
      joinedAt: new Date().toISOString().slice(0, 10),
      dueDate: '',
      notes: '',
      assignedTo: '',
    }
  );
  const [busy, setBusy] = useState(false);
  const planOptions = plans.filter((item: Plan) => item.active || item.name === form.plan);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    await onSave({ ...form, monthlyFee: Number(form.monthlyFee) });
    setBusy(false);
  }
  return (
    <Modal
      title={initial ? 'Edit customer' : 'Add new customer'}
      subtitle="Enter the customer’s connection and contact details."
      onClose={onClose}
    >
      <form onSubmit={submit} className="form-grid">
        {role === 'staff' ? <>
          <Field label="Phone number"><input required type="tel" inputMode="numeric" pattern="[0-9]{10}" minLength={10} maxLength={10} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} placeholder="10-digit mobile number" /></Field>
          <Field label="Address" wide><textarea required rows={2} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></Field>
          <Field label="Notes" wide><textarea rows={3} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
        </> : <>
        <Field label="Customer name">
          <input
            required
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            placeholder="Full name"
          />
        </Field>
        <Field label="Phone number">
          <input
            required
            type="tel"
            inputMode="numeric"
            pattern="[0-9]{10}"
            minLength={10}
            maxLength={10}
            value={form.phone}
            onChange={e => setForm({ ...form, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
            placeholder="10-digit mobile number"
          />
        </Field>
        <Field label="Internet plan">
          <select
            value={form.plan}
            onChange={e => {
              const p = plans.find((x: Plan) => x.name === e.target.value);
              setForm({ ...form, plan: e.target.value, monthlyFee: p?.price ?? form.monthlyFee });
            }}
          >
            {planOptions.map((p: Plan) => <option key={p.id || p.name} value={p.name}>{p.name}{p.active ? '' : ' (Archived - existing customer)'}</option>)}
          </select>
        </Field>
        <Field label="Monthly fee (₹)">
          <input
            required
            type="number"
            min="0"
            value={form.monthlyFee}
            onChange={e => setForm({ ...form, monthlyFee: e.target.value })}
          />
        </Field>
        <Field label="Connection status">
          <select
            value={form.status}
            onChange={e => setForm({ ...form, status: e.target.value as Customer['status'] })}
          >
            <option>Active</option>
            <option>Inactive</option>
            <option>Suspended</option>
          </select>
        </Field>
        <Field label="Connection start date">
          <input
            type="date"
            value={form.joinedAt}
            onChange={e => setForm({ ...form, joinedAt: e.target.value })}
          />
        </Field>
        <Field label="Next due date">
          <input
            type="date"
            value={form.dueDate}
            onChange={e => setForm({ ...form, dueDate: e.target.value })}
          />
        </Field>
        <Field label="Address" wide>
          <textarea
            required
            rows={2}
            value={form.address}
            onChange={e => setForm({ ...form, address: e.target.value })}
            placeholder="Customer installation address"
          />
        </Field>
        <Field label="Notes (optional)" wide>
          <textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Additional connection notes" />
        </Field>
        <Field label="Assign to staff member" wide><select value={form.assignedTo || ''} onChange={e => { const member = staff.find((item: Staff) => item.id === e.target.value); setForm({ ...form, assignedTo: e.target.value, assignedToName: member?.displayName || '' }); }}><option value="">Unassigned</option>{staff.filter((member: Staff) => member.active).map((member: Staff) => <option value={member.id} key={member.id}>{member.displayName} · {member.userId}</option>)}</select></Field>
        </>}
        <div className="form-actions">
          <button type="button" className="btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? 'Saving…' : initial ? 'Save changes' : 'Add customer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
