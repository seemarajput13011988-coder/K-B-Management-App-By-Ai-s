const STATUS_TONE: Record<string, string> = {
  active: 'success', paid: 'success', completed: 'success', approved: 'success', resolved: 'success',
  pending: 'warning', 'in progress': 'info', open: 'warning',
  suspended: 'danger', overdue: 'danger', rejected: 'danger', inactive: 'neutral', absent: 'danger',
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={'badge badge-' + (STATUS_TONE[status.toLowerCase()] ?? 'neutral')}>{status}</span>;
}
