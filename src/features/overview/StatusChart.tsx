import { BarChart3 } from 'lucide-react';
import type { Complaint } from '../../types/models';

export function StatusChart({ complaints }: { complaints: Complaint[] }) {
  const rows = [{ label: 'Pending', count: complaints.filter(c => c.status === 'Pending' || c.status === 'Open').length }, { label: 'Assigned', count: complaints.filter(c => c.status === 'Assigned').length }, { label: 'In progress', count: complaints.filter(c => c.status === 'In Progress' || c.status === 'In progress').length }, { label: 'Solved', count: complaints.filter(c => c.status === 'Solved' || c.status === 'Resolved').length }, { label: 'Not solved', count: complaints.filter(c => c.status === 'Not Solved').length }];
  const max = Math.max(1, ...rows.map(row => row.count));
  return <section className="panel chart-panel"><div className="panel-head"><div><h2>Complaint status</h2><p>Current service request distribution</p></div><span className="chart-mark"><BarChart3 size={17} /></span></div><div className="status-chart">{rows.map(row => <div className="status-chart-row" key={row.label}><span>{row.label}</span><div><i style={{ width: (row.count / max * 100) + '%' }} /></div><b>{row.count}</b></div>)}</div></section>;
}
