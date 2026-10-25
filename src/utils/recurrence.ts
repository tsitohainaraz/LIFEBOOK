import { addDaysISO, parseISODate } from './dates';

export type Repeat = 'once' | 'daily' | 'weekdays' | 'weekly';

export const REPEAT_OPTIONS: { value: Repeat; label: string }[] = [
  { value: 'once', label: 'Une seule fois' },
  { value: 'daily', label: 'Tous les jours' },
  { value: 'weekdays', label: 'Du lundi au vendredi' },
  { value: 'weekly', label: 'Chaque semaine' },
];

/** Nombre de semaines couvertes par une répétition. */
export const REPEAT_WEEKS = 8;

/** Dates des occurrences à partir de `start`, sur 8 semaines. */
export function occurrenceDates(start: string, repeat: Repeat, weeks = REPEAT_WEEKS): string[] {
  if (repeat === 'once') return [start];
  const days = weeks * 7;
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = addDaysISO(start, i);
    const wd = parseISODate(d).getDay(); // 0 = dimanche
    if (repeat === 'daily') out.push(d);
    else if (repeat === 'weekdays' && wd >= 1 && wd <= 5) out.push(d);
    else if (repeat === 'weekly' && i % 7 === 0) out.push(d);
  }
  return out;
}
