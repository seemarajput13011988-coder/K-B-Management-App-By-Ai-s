import { BarChart3 } from 'lucide-react';

export function MonthlyChart({ title, subtitle, items, dateKey, valueKey, moneyValue, countOnly, money }: { title: string; subtitle: string; items: object[]; dateKey: string; valueKey?: string; moneyValue?: boolean; countOnly?: boolean; money: (value: number) => string }) {
  const now = new Date();
  const buckets = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    const key = date.getFullYear() + '-' + date.getMonth();
    const value = items.reduce((sum, item) => {
      const record = item as Record<string, unknown>;
      const rawDate = record[dateKey];
      const parsed = rawDate ? new Date(String(rawDate)) : null;
      if (!parsed || Number.isNaN(parsed.getTime()) || parsed.getFullYear() + '-' + parsed.getMonth() !== key) return sum;
      return sum + (countOnly ? 1 : Number(record[valueKey || 'amount'] || 0));
    }, 0);
    return { label: date.toLocaleDateString('en-IN', { month: 'short' }), value };
  });
  const max = Math.max(1, ...buckets.map(item => item.value));
  return <section className="panel chart-panel"><div className="panel-head"><div><h2>{title}</h2><p>{subtitle}</p></div><span className="chart-mark"><BarChart3 size={17} /></span></div><div className="chart-bars">{buckets.map(item => <div className="chart-column" key={item.label}><b>{item.value ? (moneyValue ? money(item.value) : item.value.toLocaleString('en-IN')) : '—'}</b><div className="chart-track"><i style={{ height: (item.value ? Math.max(5, item.value / max * 100) : 2) + '%' }} /></div><small>{item.label}</small></div>)}</div></section>;
}
