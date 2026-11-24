import { Pencil, Trash2 } from 'lucide-react';
import type { Customer } from '../../types/models';
import { StatusBadge } from '../../ui/StatusBadge';

export function CustomerTable({ rows, onView, onEdit, onDelete, money, dateLabel, statusLabel }: { rows: Customer[]; onView: (customer: Customer) => void; onEdit?: (customer: Customer) => void; onDelete?: (customer: Customer) => void; money: (value: number) => string; dateLabel: (value: string) => string; statusLabel: (value: unknown) => Customer['status'] }) {
  return (
    <div className="table-wrap customer-table-wrap">
      <table>
        <thead>
          <tr>
            <th>CUSTOMER</th>
            <th>PLAN</th>
            <th>MONTHLY FEE</th>
            <th>STATUS</th>
            <th>JOINED</th>
            <th>ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c: Customer) => (
            <tr key={c.id}>
              <td data-label="Customer">
                <button className="customer-cell" onClick={() => onView(c)}>
                  <span className="avatar customer-avatar">
                    {c.name
                      .split(' ')
                      .map(s => s[0])
                      .slice(0, 2)
                      .join('')
                      .toUpperCase()}
                  </span>
                  <span>
                    <b>{c.name}</b>
                    <small>{c.phone}</small>
                  </span>
                </button>
              </td>
              <td data-label="Plan">{c.plan}</td>
              <td data-label="Monthly fee" className="amount">{money(c.monthlyFee)}</td>
              <td data-label="Status">
                <StatusBadge status={statusLabel(c.status)} />
              </td>
              <td data-label="Joined">{dateLabel(c.joinedAt)}</td>
              <td data-label="Actions">
                {onEdit && (
                  <button
                    className="row-action"
                    title="Edit customer"
                    onClick={() => onEdit(c)}
                  >
                    <Pencil size={15} />
                  </button>                  )}
                {onDelete && <button className="row-action danger" title="Delete customer" onClick={() => onDelete(c)}><Trash2 size={15} /></button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
