import type { LucideIcon } from 'lucide-react';

export function StatCard({ icon: Icon, label, value, delta, tone = 'brand' }: {
  icon: LucideIcon; label: string; value: string | number; delta?: string;
  tone?: 'brand' | 'success' | 'warning' | 'danger';
}) {
  return (
    <div className={'stat-card tone-' + tone}>
      <span className="stat-ic"><Icon size={20} /></span>
      <div><small>{label}</small><strong>{value}</strong>{delta ? <em>{delta}</em> : null}</div>
    </div>
  );
}
