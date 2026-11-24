import { heroImages, plans, type Plan } from './catalog';

export type PortalPlan = Plan & {
  active?: boolean;
  featured?: boolean;
  offerLabel?: string;
};

export type PortalImage = {
  src: string;
  path?: string;
  alt?: string;
};

export type PortalContent = {
  plans: PortalPlan[];
  heroImages: PortalImage[];
  promo: {
    active: boolean;
    badge: string;
    title: string;
    body: string;
    cta: string;
  };
};

export const defaultPortalContent: PortalContent = {
  plans: plans.map((plan, index) => ({
    ...plan,
    active: true,
    featured: index > 0,
    offerLabel: ''
  })),
  heroImages: heroImages.map((src, index) => ({
    src,
    alt: ['Fiber broadband connection', 'Modern data network', 'Connected home technology', 'Digital connectivity'][index] || 'K&B broadband'
  })),
  promo: {
    active: true,
    badge: 'K&B CUSTOMER EXCLUSIVE',
    title: 'A better connection starts at home',
    body: 'Explore plans designed for everyday browsing, streaming, learning and work.',
    cta: 'Explore plans'
  }
};
