import { Pencil, Trash2 } from 'lucide-react';
import type { Payment } from '../../types/models';
import { StatusBadge } from '../../ui/StatusBadge';

export function PaymentTable({ rows, isAdmin = false, onEdit, onDelete, money, dateLabel }: { rows: Payment[]; isAdmin?: boolean; onEdit?: (payment: Payment) => void; onDelete?: (payment: Payment) => void; money: (value: number) => string; dateLabel: (value: string) => string }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>CUSTOMER</th>
            <th>MONTH</th>
            <th>METHOD</th>
            <th>DATE</th>
            <th>AMOUNT</th>
            <th>STATUS</th>
            {(isAdmin || onDelete) && <th>ACTIONS</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((p: Payment) => (
            <tr key={p.id}>
              <td data-label="Customer">
                <b>{p.customerName}</b>
              </td>
              <td data-label="Month">{p.month}</td>
              <td data-label="Method">{p.method}</td>
              <td data-label="Date">{dateLabel(p.paidAt)}</td>
              <td data-label="Amount" className="amount">{money(p.amount)}</td>
              <td data-label="Status">
                <StatusBadge status="Paid" />
              </td>
              {(isAdmin || onDelete) && <td data-label="Actions"><div className="staff-actions"><button className="row-action" title="Edit payment" onClick={() => onEdit?.(p)}><Pencil size={14}/></button>{onDelete && <button className="row-action danger" title="Delete payment" onClick={() => onDelete(p)}><Trash2 size={14}/></button>}</div></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
