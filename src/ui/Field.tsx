import type { ReactNode } from 'react';

export function Field({ label, children, wide = false }: { label: ReactNode; children: ReactNode; wide?: boolean }) {
  return <label className={'field ' + (wide ? 'wide' : '')}><span>{label}</span>{children}</label>;
}
