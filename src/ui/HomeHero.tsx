import { ArrowUpRight, type LucideIcon } from 'lucide-react';

export type HomeQuickLink = { id: string; label: string; icon: LucideIcon; tint: string };

export function HomeHero({ greeting, name, headline, sub, quick, onGo }: {
  greeting: string; name: string; headline: string; sub: string;
  quick: HomeQuickLink[]; onGo: (id: string) => void;
}) {
  return (
    <section className="home-hero" aria-label="Workspace welcome">
      <div className="home-hero-glow" aria-hidden="true" />
      <p className="home-hero-greeting">{greeting},</p>
      <h2 className="home-hero-name">{name}</h2>
      <div className="home-hero-summary">
        <small>{sub}</small>
        <strong>{headline}</strong>
        <button type="button" onClick={() => onGo('Payments')}>View details <ArrowUpRight size={15}/></button>
      </div>
      <div className="home-quick-grid" aria-label="Quick actions">
        {quick.map(item => (
          <button type="button" key={item.id} onClick={() => onGo(item.id)}>
            <span style={{ background: item.tint + '1a', color: item.tint }}><item.icon size={22}/></span>
            <small>{item.label}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
