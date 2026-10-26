// Planificateur de journée sans IA : place les éléments dans les créneaux libres selon les priorités,
// les meilleures tranches horaires, la charge maximale et le sommeil.
import { awakeWindow, busyOf, type SleepWindow, type TimedItem } from './freeSlots.ts';
import { RANGES, type Range } from './insights.ts';
import type { NewTask, PlanOp } from './planOps.ts';
import { gaps, isValidTime, toHHMM, toMin, type Interval } from './time.ts';

export type Priority = 'must' | 'should' | 'nice';
export type Energy = 'fatigue' | 'normal' | 'top';

export interface ToPlace {
  key?: string;
  title: string;
  category: string;
  duration_min: number;
  priority: Priority;
  fixed_time?: string | null;
  goal_id?: string | null;
}

export interface PlacedItem {
  key: string;
  title: string;
  category: string;
  date: string;
  start: string;
  end: string;
  priority: Priority;
  goal_id: string | null;
  fixed: boolean;
  /** Séance n sur total, pour une longue tâche découpée. */
  session: { index: number; total: number } | null;
}

export interface DayPlanPrefs {
  sleep: SleepWindow;
  /** Ne rien placer avant (minutes) : pour réorganiser le reste d'aujourd'hui. */
  startMin?: number;
  sportMinutes?: number;
  /** Garde-fou santé (tension très élevée, cœur, grossesse…) : pas de sport ajouté. */
  healthGuard?: boolean;
  planningMeeting?: { start: string; end: string } | null;
}

export interface DayPlan {
  placed: PlacedItem[];
  nonPlaces: ToPlace[];
  loadMin: number;
  capMin: number;
  ops: PlanOp[];
}

export const ENERGY_CAP_MIN: Record<Energy, number> = { fatigue: 7 * 60, normal: 9 * 60, top: 10 * 60 };
export const MARGIN = 0.15;
export const GAP_MIN = 5;
export const SESSION_BREAK_MIN = 10;
export const SPLIT_OVER_MIN = 90;
export const SESSION_MAX_MIN = 50;
export const SPORT_GOAL_MIN = 150;

const RANGE_INTERVAL: Record<Range, Interval> = {
  '06-09': { start: 360, end: 540 },
  '09-12': { start: 540, end: 720 },
  '12-14': { start: 720, end: 840 },
  '14-17': { start: 840, end: 1020 },
  '17-20': { start: 1020, end: 1200 },
  '20-23': { start: 1200, end: 1380 },
};

/** Découpe une longue tâche en séances de 25 à 50 min. */
export function splitDuration(duration: number): number[] {
  if (duration <= SPLIT_OVER_MIN) return [duration];
  const n = Math.ceil(duration / SESSION_MAX_MIN);
  const base = Math.floor(duration / n);
  return Array.from({ length: n }, (_, i) => base + (i < duration - base * n ? 1 : 0));
}

const ORDER: Record<Priority, number> = { must: 0, should: 1, nice: 3 };

export function proposeDayPlan(
  date: string,
  items: ToPlace[],
  fixed: TimedItem[],
  insights: { bestRanges?: Range[]; sportWeekMin?: number } | null,
  prefs: DayPlanPrefs,
  energy: Energy,
): DayPlan {
  const win = awakeWindow(prefs.sleep);
  const start = Math.max(win.start, prefs.startMin != null ? Math.ceil(prefs.startMin / 5) * 5 : win.start);
  const window: Interval = { start, end: win.end };
  const occupied: Interval[] = busyOf(fixed, date);
  if (prefs.planningMeeting && isValidTime(prefs.planningMeeting.start) && isValidTime(prefs.planningMeeting.end)) {
    occupied.push({ start: toMin(prefs.planningMeeting.start), end: toMin(prefs.planningMeeting.end) });
  }
  const fixedLoad = occupied.reduce((t, i) => t + Math.max(0, Math.min(i.end, window.end) - Math.max(i.start, window.start)), 0);
  const usable = Math.floor((window.end - window.start) * (1 - MARGIN));
  const capMin = Math.min(ENERGY_CAP_MIN[energy], usable);
  let load = fixedLoad;
  const placed: PlacedItem[] = [];
  const nonPlaces: ToPlace[] = [];
  const preferred: Range[] = [...(insights?.bestRanges ?? []), ...RANGES.filter((r) => !(insights?.bestRanges ?? []).includes(r))];

  const freeGaps = (from: number) =>
    gaps(
      { start: Math.max(window.start, from), end: window.end },
      occupied.map((i) => ({ start: i.start - GAP_MIN, end: i.end + GAP_MIN })),
    );

  /** Premier début possible pour `d` minutes, d'abord dans les meilleures tranches. */
  const findStart = (d: number, from: number, useRanges: boolean): number | null => {
    const free = freeGaps(from);
    if (useRanges) {
      for (const r of preferred) {
        const ri = RANGE_INTERVAL[r];
        for (const g of free) {
          const s = Math.max(g.start, ri.start);
          // Le début tombe dans la tranche et la tâche tient dans le trou.
          if (s < ri.end && s + d <= g.end) return s;
        }
      }
    }
    for (const g of free) if (g.end - g.start >= d) return g.start;
    return null;
  };

  const key = (it: ToPlace, i: number) => it.key ?? `item-${i + 1}`;
  const all = items.map((it, i) => ({ it, k: key(it, i) }));

  // 1. Éléments à heure fixe
  for (const { it, k } of all.filter((x) => x.it.fixed_time)) {
    const s = toMin(it.fixed_time as string);
    const e = s + it.duration_min;
    const free = isValidTime(it.fixed_time) && s >= window.start && e <= window.end && !occupied.some((o) => o.start < e && s < o.end);
    if (!free) {
      nonPlaces.push(it);
      continue;
    }
    occupied.push({ start: s, end: e });
    load += it.duration_min;
    placed.push({ key: k, title: it.title, category: it.category, date, start: toHHMM(s), end: toHHMM(e), priority: it.priority, goal_id: it.goal_id ?? null, fixed: true, session: null });
  }

  // 2. Sport ajouté si la semaine est sous 150 min (sans garde-fou de santé)
  const flexible = all.filter((x) => !x.it.fixed_time);
  const wantsSport =
    (insights?.sportWeekMin ?? SPORT_GOAL_MIN) < SPORT_GOAL_MIN && !prefs.healthGuard && !items.some((x) => x.category === 'sport');
  const queue: { it: ToPlace; k: string; rank: number }[] = flexible.map((x) => ({ ...x, rank: ORDER[x.it.priority] }));
  if (wantsSport) queue.push({ it: { title: 'Sport', category: 'sport', duration_min: prefs.sportMinutes ?? 30, priority: 'should' }, k: 'sport', rank: 2 });
  queue.sort((a, b) => a.rank - b.rank);

  // 3. must, should, sport, nice
  for (const { it, k } of queue) {
    const sessions = splitDuration(it.duration_min);
    const total = sessions.reduce((t, d) => t + d, 0);
    if (load + total > capMin) {
      nonPlaces.push(it);
      continue;
    }
    const tentative: Interval[] = [];
    let from = window.start;
    let ok = true;
    // Les séances se suivent (pause de 10 min) ; elles ne sont réservées qu'une fois toutes trouvées.
    for (const d of sessions) {
      const s = findStart(d, from, it.priority !== 'nice');
      if (s == null) {
        ok = false;
        break;
      }
      tentative.push({ start: s, end: s + d });
      from = s + d + SESSION_BREAK_MIN;
    }
    if (!ok) {
      nonPlaces.push(it);
      continue;
    }
    occupied.push(...tentative);
    load += total;
    tentative.forEach((t, i) =>
      placed.push({
        key: sessions.length > 1 ? `${k}#${i + 1}` : k,
        title: sessions.length > 1 ? `${it.title} (${i + 1}/${sessions.length})` : it.title,
        category: it.category,
        date,
        start: toHHMM(t.start),
        end: toHHMM(t.end),
        priority: it.priority,
        goal_id: it.goal_id ?? null,
        fixed: false,
        session: sessions.length > 1 ? { index: i + 1, total: sessions.length } : null,
      }),
    );
  }

  placed.sort((a, b) => a.start.localeCompare(b.start));
  const ops: PlanOp[] = placed.map((p) => {
    const task: NewTask = { title: p.title, category: p.category, date: p.date, start: p.start, end: p.end, goal_id: p.goal_id, is_priority: p.priority === 'must' };
    return { op: 'create', ref: p.key, task };
  });
  return { placed, nonPlaces, loadMin: load, capMin, ops };
}
