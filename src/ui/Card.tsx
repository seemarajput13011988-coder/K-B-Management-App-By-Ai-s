import type { ReactNode } from 'react';

export function Card({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return <section className={'ui-card ' + className} onClick={onClick}>{children}</section>;
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return <div className="section-title"><h2>{title}</h2>{action}</div>;
}
