import { ClipboardList, LayoutDashboard, Menu, Users } from 'lucide-react';

type QuickNavigationProps = {
  page: string;
  taskPage: string;
  onNavigate: (page: string) => void;
  onMore: () => void;
};

/** Primary thumb-reachable destinations for the phone layout. */
export default function QuickNavigation({ page, taskPage, onNavigate, onMore }: QuickNavigationProps) {
  const destinations = [
    { page: 'Overview', label: 'Home', Icon: LayoutDashboard },
    { page: 'Customers', label: 'Customers', Icon: Users },
    { page: taskPage, label: taskPage, Icon: ClipboardList },
  ];

  return (
    <nav className="kb-mobile-nav" aria-label="Quick navigation">
      {destinations.map(({ page: destination, label, Icon }) => (
        <button
          key={destination}
          type="button"
          className={page === destination ? 'is-active' : ''}
          aria-current={page === destination ? 'page' : undefined}
          onClick={() => onNavigate(destination)}
        >
          <Icon size={20} />
          <span>{label}</span>
        </button>
      ))}
      <button type="button" onClick={onMore} aria-label="More sections">
        <Menu size={20} />
        <span>More</span>
      </button>
    </nav>
  );
}
