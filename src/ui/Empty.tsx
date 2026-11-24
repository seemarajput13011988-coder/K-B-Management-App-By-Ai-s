import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { EmptyState } from './EmptyState';

export function Empty({ icon, title, text, action, onClick }: {
  icon: ReactNode; title: string; text: string; action?: string; onClick?: () => void;
}) {
  return (
    <EmptyState icon={icon} title={title} text={text}
      action={action ? <button type="button" className="btn primary" onClick={onClick}><Plus size={16}/>{action}</button> : undefined}
    />
  );
}
