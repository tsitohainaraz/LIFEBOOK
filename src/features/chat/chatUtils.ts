import { addDaysISO, cap, fmtDate, toISODate } from '../../utils/dates';
import { toZoned } from '../../lib/serverTime';

export interface DayGroup<T> {
  day: string;
  label: string;
  items: T[];
}

/** Regroupe des messages (du plus ancien au plus récent) par jour, dans le fuseau du profil. */
export function groupByDay<T extends { created_at: string }>(items: T[], today: string, zone?: string): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  for (const it of items) {
    const day = toISODate(toZoned(Date.parse(it.created_at), zone));
    let g = groups[groups.length - 1];
    if (!g || g.day !== day) {
      const label = day === today ? "Aujourd'hui" : day === addDaysISO(today, -1) ? 'Hier' : cap(fmtDate(day, 'EEEE d MMMM'));
      g = { day, label, items: [] };
      groups.push(g);
    }
    g.items.push(it);
  }
  return groups;
}

/** Heure HH:MM d'un horodatage, dans le fuseau du profil. */
export function timeOf(iso: string, zone?: string): string {
  const d = toZoned(Date.parse(iso), zone);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Vrai si la zone qui défile est (presque) tout en bas. */
export function isNearBottom(el: { scrollHeight: number; scrollTop: number; clientHeight: number }, margin = 80): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < margin;
}
