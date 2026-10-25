import { addDaysISO, mondayOf } from './dates';

export interface PastTask {
  date: string;
  done_at: string | null;
}

export interface PastReport {
  period_start: string;
  mood: number | null;
  wellbeing_pct: number | null;
  wins: string | null;
}

export interface PastItem {
  /** Jour (AAAA-MM-JJ) ou lundi de la semaine. */
  key: string;
  done: number;
  total: number;
  pct: number;
  report: PastReport | null;
}

const pct = (done: number, total: number) => (total ? Math.round((done / total) * 100) : 0);

/** Journées passées avec des tâches ou un rapport, de la plus récente à la plus ancienne. */
export function pastDays(tasks: PastTask[], reports: PastReport[]): PastItem[] {
  const keys = new Set<string>([...tasks.map((t) => t.date), ...reports.map((r) => r.period_start)]);
  return [...keys]
    .sort()
    .reverse()
    .map((key) => {
      const ts = tasks.filter((t) => t.date === key);
      const done = ts.filter((t) => t.done_at).length;
      return { key, done, total: ts.length, pct: pct(done, ts.length), report: reports.find((r) => r.period_start === key) ?? null };
    });
}

/** Semaines passées (lundi) avec des tâches ou un bilan. */
export function pastWeeks(tasks: PastTask[], reports: PastReport[]): PastItem[] {
  const keys = new Set<string>([...tasks.map((t) => mondayOf(t.date)), ...reports.map((r) => r.period_start)]);
  return [...keys]
    .sort()
    .reverse()
    .map((key) => {
      const end = addDaysISO(key, 6);
      const ts = tasks.filter((t) => t.date >= key && t.date <= end);
      const done = ts.filter((t) => t.done_at).length;
      return { key, done, total: ts.length, pct: pct(done, ts.length), report: reports.find((r) => r.period_start === key) ?? null };
    });
}

export function excerpt(text: string | null | undefined, max = 90): string {
  if (!text) return '';
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
