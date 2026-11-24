import { IndianRupee } from 'lucide-react';

export function OverduePanel({ value, money }: { value: number; money: (value: number) => string }) {
  return <section className="panel chart-panel"><div className="panel-head"><div><h2>Estimated overdue plan value</h2><p>Active accounts past their due date with no full payment recorded for this month</p></div><span className="chart-mark"><IndianRupee size={17} /></span></div><div className="overdue-value">{money(value)}</div><p className="overdue-note">Estimate only: accounts without a due date are excluded. Partial payments are deducted from the monthly fee.</p></section>;
}


