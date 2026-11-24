import type { ReactNode } from 'react';

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return <div className="empty"><div className="empty-ic">{icon}</div><h3>{title}</h3>{text ? <p>{text}</p> : null}{action}</div>;
}
