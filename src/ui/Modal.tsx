import type { ReactNode } from 'react';
import { X } from 'lucide-react';

export function Modal({ title, subtitle, onClose, children }: {
  title: string; subtitle?: string; onClose: () => void; children: ReactNode;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className="modal">
        <div className="modal-head">
          <div><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close dialog"><X /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
