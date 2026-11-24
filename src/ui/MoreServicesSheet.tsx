import { X, type LucideIcon } from 'lucide-react';

export type MoreServiceItem = { label: string; icon: LucideIcon; count?: number };
export type MoreServiceGroup = { label: string; items: MoreServiceItem[] };

type Props = {
  groups: MoreServiceGroup[];
  onSelect: (item: MoreServiceItem) => void;
  onClose: () => void;
};

export function MoreServicesSheet({ groups, onSelect, onClose }: Props) {
  return (
    <div className="more-sheet-backdrop" role="presentation" onClick={onClose}>
      <section className="more-services-sheet" role="dialog" aria-modal="true" aria-label="All services" onClick={event => event.stopPropagation()}>
        <div className="more-sheet-grab" />
        <header className="more-sheet-header">
          <div><span className="more-sheet-kicker">K&B NET SERVICE</span><h2>All services</h2></div>
          <button type="button" className="more-sheet-close" onClick={onClose} aria-label="Close services"><X size={20}/></button>
        </header>
        {groups.map(group => group.items.length ? (
          <section className="more-sheet-group" key={group.label}>
            <h3>{group.label}</h3>
            <div className="more-sheet-grid">
              {group.items.map(item => (
                <button type="button" className="more-sheet-item" key={item.label} onClick={() => onSelect(item)}>
                  <span className="more-sheet-icon"><item.icon size={21}/></span>
                  <span className="more-sheet-label">{item.label}</span>
                  {item.count ? <span className="more-sheet-count">{item.count}</span> : null}
                </button>
              ))}
            </div>
          </section>
        ) : null)}
      </section>
    </div>
  );
}
