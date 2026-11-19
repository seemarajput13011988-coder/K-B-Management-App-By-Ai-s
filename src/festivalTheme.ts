export type FestivalTheme = {
  name: string;
  greeting: string;
  theme: 'holi' | 'ganesh' | 'diwali' | 'navratri' | 'janmashtami' | 'shivratri' | 'ram-navami';
  symbol: string;
};

// Dates use the India civil calendar. Lunar observance can vary by panchang and
// region; keep this curated list small and show no festival theme on other days.
const dates: Record<string, FestivalTheme> = {
  '2026-03-03': { name: 'Holi', greeting: 'A bright and joyful Holi', theme: 'holi', symbol: '🎨' },
  '2026-09-04': { name: 'Janmashtami', greeting: 'A joyful Janmashtami', theme: 'janmashtami', symbol: '🪈' },
  '2026-09-14': { name: 'Ganesh Chaturthi', greeting: 'A bright Ganesh Chaturthi', theme: 'ganesh', symbol: '🌺' },
  '2026-10-11': { name: 'Navratri', greeting: 'A vibrant Navratri', theme: 'navratri', symbol: '✨' },
  '2026-11-08': { name: 'Diwali', greeting: 'A warm and bright Diwali', theme: 'diwali', symbol: '🪔' },
  '2027-03-22': { name: 'Holi', greeting: 'A bright and joyful Holi', theme: 'holi', symbol: '🎨' },
  '2027-08-25': { name: 'Janmashtami', greeting: 'A joyful Janmashtami', theme: 'janmashtami', symbol: '🪈' },
  '2027-09-04': { name: 'Ganesh Chaturthi', greeting: 'A bright Ganesh Chaturthi', theme: 'ganesh', symbol: '🌺' },
  '2027-10-29': { name: 'Diwali', greeting: 'A warm and bright Diwali', theme: 'diwali', symbol: '🪔' },
  '2028-03-11': { name: 'Holi', greeting: 'A bright and joyful Holi', theme: 'holi', symbol: '🎨' },
  '2028-08-23': { name: 'Ganesh Chaturthi', greeting: 'A bright Ganesh Chaturthi', theme: 'ganesh', symbol: '🌺' },
  '2028-10-17': { name: 'Diwali', greeting: 'A warm and bright Diwali', theme: 'diwali', symbol: '🪔' },
  '2029-02-28': { name: 'Holi', greeting: 'A bright and joyful Holi', theme: 'holi', symbol: '🎨' },
  '2029-09-11': { name: 'Ganesh Chaturthi', greeting: 'A bright Ganesh Chaturthi', theme: 'ganesh', symbol: '🌺' },
  '2029-11-05': { name: 'Diwali', greeting: 'A warm and bright Diwali', theme: 'diwali', symbol: '🪔' },
  '2030-10-26': { name: 'Diwali', greeting: 'A warm and bright Diwali', theme: 'diwali', symbol: '🪔' },
};

export function getIndiaDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function getHinduFestival(dateKey: string): FestivalTheme | null {
  return dates[dateKey] || null;
}
