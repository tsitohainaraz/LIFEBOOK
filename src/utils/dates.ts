import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

// Dates de jour au format AAAA-MM-JJ (date locale), heures au format HH:MM.

export const pad = (n: number): string => String(n).padStart(2, '0');

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Lit une date AAAA-MM-JJ à midi local (évite les décalages de fuseau). */
export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

export function todayISO(now: Date = new Date()): string {
  return toISODate(now);
}

export function addDaysISO(s: string, n: number): string {
  const d = parseISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Lundi de la semaine qui contient la date. */
export function mondayOf(s: string): string {
  const d = parseISODate(s);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toISODate(d);
}

export function monthStart(s: string): string {
  return s.slice(0, 8) + '01';
}

export function addMonthsISO(s: string, n: number): string {
  const d = parseISODate(monthStart(s));
  d.setMonth(d.getMonth() + n);
  return toISODate(d);
}

export function daysInMonth(s: string): number {
  const d = parseISODate(s);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export function quarterStart(s: string): string {
  const d = parseISODate(s);
  const q = Math.floor(d.getMonth() / 3);
  return `${d.getFullYear()}-${pad(q * 3 + 1)}-01`;
}

export function diffDays(a: string, b: string): number {
  return Math.round((parseISODate(a).getTime() - parseISODate(b).getTime()) / 86_400_000);
}

/** Numéro de semaine ISO 8601. */
export function isoWeekNumber(s: string): number {
  const d = parseISODate(s);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const jan4 = new Date(d.getFullYear(), 0, 4, 12);
  return 1 + Math.round(((d.getTime() - jan4.getTime()) / 86_400_000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
}

/** Index de la semaine dans l'année (0 à 51), comme dans les maquettes. */
export function weekOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.min(51, Math.max(0, Math.floor((d.getTime() - start.getTime()) / (7 * 86_400_000))));
}

export function toMin(t: string | null | undefined): number {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Minutes → HH:MM (24:00 reste 24:00 pour une fin de journée). */
export function toTime(m: number): string {
  const c = Math.max(0, Math.min(24 * 60, Math.round(m)));
  return `${pad(Math.floor(c / 60))}:${pad(c % 60)}`;
}

/** Postgres renvoie « 08:00:00 » : on garde HH:MM. */
export function hhmm(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : '';
}

export function fmtDuration(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r} min`;
  return r ? `${h} h ${pad(r)}` : `${h} h`;
}

export function hms(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return (h ? pad(h) + ':' : '') + pad(m) + ':' + pad(s);
}

export function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Formatage en français avec date-fns. */
export function fmtDate(s: string, pattern = 'EEEE d MMMM'): string {
  return format(parseISODate(s), pattern, { locale: fr });
}

export function fmtNumber(n: number): string {
  return Math.max(0, Math.round(n))
    .toLocaleString('fr-FR')
    .replace(/[  ]/g, ' ');
}

export function nowMinutes(now: Date = new Date()): number {
  return now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
}
