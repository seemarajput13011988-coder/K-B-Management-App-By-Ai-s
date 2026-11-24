import { useState } from 'react';
import type { Customer, Payment } from '../../types/models';
import { Field } from '../../ui/Field';
import { Modal } from '../../ui/Modal';

type PaymentForm = { id?: string; customerId: string; customerName?: string; amount: number | string; method: string; month: string; paidAt: string; recordedBy?: string; recordedByName?: string };

export function PaymentModal({ customers, initial, onClose, onSave }: { customers: Customer[]; initial: Payment | null; onClose: () => void; onSave: (data: Omit<Payment, 'id'>) => void | Promise<void> }) {
  const [f, s] = useState<PaymentForm>(initial || {
    customerId: customers[0]?.id || '',
    amount: customers[0]?.monthlyFee || 0,
    method: 'UPI',
    month: new Date().toLocaleString('en-IN', {
      month: 'long',
      year: 'numeric',
    }),
    paidAt: new Date().toISOString().slice(0, 10),
  });
  const c = customers.find((x: Customer) => x.id === f.customerId);
  return (
    <Modal
      title={initial ? 'Edit payment' : 'Record payment'}
      subtitle={initial ? 'Correct the saved customer payment details.' : "Add a payment to the customer's collection history."}
      onClose={onClose}
    >
      <form
        className="form-grid"
        onSubmit={e => {
          e.preventDefault();
          const paymentFields = { ...f };
          delete paymentFields.id;
          onSave({
            ...paymentFields,
            amount: Number(f.amount),
            customerName: c?.name || '',
          });
        }}
      >
        <Field label="Customer" wide>
          <select
            required
            value={f.customerId}
            onChange={e => {
              const x = customers.find(
                (c: Customer) => c.id === e.target.value
              );
              s({
                ...f,
                customerId: e.target.value,
                amount: x?.monthlyFee || 0,
              });
            }}
          >
            {customers.map((c: Customer) => (
              <option value={c.id} key={c.id}>
                {c.name} · {c.phone}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Amount (₹)">
          <input
            type="number"
            min="1"
            required
            value={f.amount}
            onChange={e => s({ ...f, amount: e.target.value })}
          />
        </Field>
        <Field label="Payment method">
          <select
            value={f.method}
            onChange={e => s({ ...f, method: e.target.value })}
          >
            <option>UPI</option>
            <option>Cash</option>
            <option>Bank transfer</option>
            <option>Other</option>
          </select>
        </Field>
        <Field label="Billing month">
          <input
            required
            value={f.month}
            onChange={e => s({ ...f, month: e.target.value })}
          />
        </Field>
        <Field label="Payment date">
          <input
            type="date"
            required
            value={f.paidAt}
            onChange={e => s({ ...f, paidAt: e.target.value })}
          />
        </Field>
        <div className="form-actions">
          <button type="button" className="btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!customers.length}>
            {initial ? 'Save changes' : 'Save payment'}
          </button>
        </div>
      </form>
      {!customers.length && (
        <p className="form-hint">Add a customer before recording a payment.</p>
      )}
    </Modal>
  );
}
