export type Plan = {
  id: string;
  name: string;
  price: number;
  speed: string;
  data: string;
  validity: string;
  tagline?: string;
  idealFor?: string;
  tag: string;
  color: 'blue' | 'purple' | 'cyan';
  features: string[];
  active?: boolean;
  featured?: boolean;
  offerLabel?: string;
  featured?: boolean;
};

export const plans: Plan[] = [
  {
    id: 'p3',
    name: 'K&B Connect 30',
    price: 399,
    speed: '30 Mbps',
    data: '1 TB',
    validity: '30 days',
    tagline: 'Simple, dependable internet for every day',
    idealFor: 'Browsing, study, messaging and everyday use',
    tag: 'EVERYDAY CONNECT',
    color: 'cyan',
    features: ['Everyday browsing and social apps', 'Online study and video calls', '1 TB monthly data allowance'],
  },
  {
    id: 'p1',
    name: 'K&B Stream 50',
    price: 499,
    speed: '50 Mbps',
    data: '1.5 TB',
    validity: '30 days',
    tagline: 'Your family’s all-round entertainment connection',
    idealFor: 'Family browsing, HD streaming, classes and work',
    tag: 'FAMILY FAVOURITE',
    color: 'blue',
    features: ['HD video streaming and online classes', 'Multiple connected devices', '1.5 TB monthly data allowance'],
  },
  {
    id: 'p2',
    name: 'K&B Ultra 100',
    price: 699,
    speed: '100 Mbps',
    data: '2 TB',
    validity: '30 days',
    tagline: 'More speed for busy, connected homes',
    idealFor: 'Heavier usage and multiple simultaneous streams',
    tag: 'POWER PLAN',
    color: 'purple',
    features: ['100 Mbps broadband speed', 'Multiple simultaneous streams', '2 TB monthly data allowance'],
  },
];

export const money = (n: number) => '₹\u00a0' + n.toLocaleString('en-IN');

export const heroImages = [
  'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&w=900&q=85',
  'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=900&q=85',
  'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=900&q=85',
  'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=900&q=85'
];

export function getIndiaDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const part = (type: string) => parts.find(item => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function getSeasonalFestival(date = new Date()) {
  const key = getIndiaDateKey(date);
  const fixedDays: Record<string, string> = {
    '2026-11-08': 'diwali', '2027-10-29': 'diwali', '2028-11-17': 'diwali',
    '2026-03-04': 'holi', '2027-03-22': 'holi', '2028-03-11': 'holi',
    '2026-12-25': 'christmas', '2027-12-25': 'christmas', '2028-12-25': 'christmas',
    '2026-01-01': 'newyear', '2026-12-31': 'newyear', '2027-01-01': 'newyear',
    '2027-12-31': 'newyear', '2028-01-01': 'newyear', '2028-12-31': 'newyear'
  };
  if (fixedDays[key]) return fixedDays[key];
  if (key >= '2026-10-11' && key <= '2026-10-20') return 'navratri';
  if (key >= '2027-10-01' && key <= '2027-10-09') return 'navratri';
  if (key >= '2028-10-19' && key <= '2028-10-27') return 'navratri';
  return 'none';
}

export function getCustomerGreeting(date = new Date(), customerName = '') {
  const festival = getSeasonalFestival(date);
  const name = customerName.trim() || 'there';
  if (festival !== 'none') {
    const label = festival === 'newyear' ? 'New Year' : festival[0].toUpperCase() + festival.slice(1);
    return `Happy ${label}, ${name}!`;
  }
  const hourParts = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const hour = Number(hourParts.find(part => part.type === 'hour')?.value || 0);
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return `${greeting}, ${name}!`;
}
