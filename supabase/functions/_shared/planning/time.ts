// Outils de temps purs (sans Date du navigateur) partagés entre l'application et les Edge Functions.
// Dates : « AAAA-MM-JJ » ; heures : « HH:MM » ; durées et instants de la journée : minutes depuis minuit.

export const DAY_MIN = 24 * 60;

const pad = (n: number) => String(n).padStart(2, '0');

export function isValidDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function isValidTime(s: unknown): s is string {
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(s);
}

export function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function toHHMM(min: number): string {
  const m = Math.max(0, Math.min(DAY_MIN, Math.round(min)));
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Jour ISO de la semaine : 1 = lundi … 7 = dimanche. */
export function isoWeekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

const DAYS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** « lun. 27 oct. 2026 » */
export function frenchDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${DAYS[isoWeekday(date) - 1]} ${d} ${MONTHS[m - 1]} ${y}`;
}

/** Calendrier des `n` prochains jours, calculé par le code pour que le modèle ne calcule jamais de date. */
export function calendar(today: string, n = 14): { date: string; label: string }[] {
  return Array.from({ length: n }, (_, i) => {
    const date = addDays(today, i);
    const label = i === 0 ? `aujourd'hui, ${frenchDate(date)}` : i === 1 ? `demain, ${frenchDate(date)}` : frenchDate(date);
    return { date, label };
  });
}

export interface Interval {
  start: number;
  end: number;
}

/** Fusionne des intervalles qui se chevauchent ou se touchent. */
export function mergeIntervals(list: Interval[]): Interval[] {
  const s = list.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of s) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

/** Trous d'une fenêtre [from, to] une fois les intervalles occupés retirés. */
export function gaps(window: Interval, busy: Interval[]): Interval[] {
  const out: Interval[] = [];
  let cur = window.start;
  for (const b of mergeIntervals(busy)) {
    if (b.end <= cur) continue;
    if (b.start >= window.end) break;
    if (b.start > cur) out.push({ start: cur, end: Math.min(b.start, window.end) });
    cur = Math.max(cur, b.end);
  }
  if (cur < window.end) out.push({ start: cur, end: window.end });
  return out;
}
