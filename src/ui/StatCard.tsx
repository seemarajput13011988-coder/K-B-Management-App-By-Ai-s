import type { LucideIcon } from 'lucide-react';

export function StatCard({ icon: Icon, label, value, detail, tone = 'brand', className = '' }: {
  icon: LucideIcon; label: string; value: string | number; delta?: string; detail?: string;
  tone?: 'brand' | 'success' | 'warning' | 'danger'; className?: string;
}) {
  return (
    <article className={'stat-card tone-' + tone + ' ' + className}>
      <span className="stat-ic kb-overview-metric-icon"><Icon size={20} /></span>
      <div><small>{label}</small><strong>{value}</strong>{detail ? <span>{detail}</span> : null}</div>
    </article>
  );
}
