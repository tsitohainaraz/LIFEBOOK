// Créneaux libres entre le réveil et le coucher, une fois retirés les tâches, les éléments fixes
// (prières, cartes de tableaux avec une heure…) et le rendez-vous de planification.
import { DAY_MIN, datesBetween, gaps, isValidTime, toHHMM, toMin, type Interval } from './time.ts';

export interface TimedItem {
  date: string;
  start: string; // HH:MM
  end: string; // HH:MM
  done?: boolean;
}

export interface SleepWindow {
  /** Heure de réveil HH:MM */
  wake: string;
  /** Heure de coucher HH:MM (après minuit = fin de journée, 24:00) */
  bed: string;
}

export interface FreeSlot {
  date: string;
  start: string;
  end: string;
  minutes: number;
}

/** Fenêtre d'éveil d'une journée, en minutes. Un coucher après minuit est ramené à 24:00. */
export function awakeWindow(sleep: SleepWindow): Interval {
  const wake = isValidTime(sleep.wake) ? toMin(sleep.wake) : 6 * 60;
  let bed = isValidTime(sleep.bed) ? toMin(sleep.bed) : 22 * 60 + 30;
  if (bed <= wake) bed = DAY_MIN;
  return { start: wake, end: bed };
}

/** Réveil et coucher à partir des heures de sommeil voulues (coucher par défaut 22:30). */
export function sleepFromHours(sleepHours: number, bed = '22:30'): SleepWindow {
  const h = Number.isFinite(sleepHours) ? Math.max(4, Math.min(12, sleepHours)) : 8;
  const wake = (toMin(bed) + h * 60) % DAY_MIN;
  return { wake: toHHMM(wake), bed };
}

export function busyOf(items: TimedItem[], date: string): Interval[] {
  return items
    .filter((t) => t.date === date && isValidTime(t.start) && isValidTime(t.end))
    .map((t) => ({ start: toMin(t.start), end: toMin(t.end) > toMin(t.start) ? toMin(t.end) : toMin(t.start) + 60 }));
}

/**
 * getFreeSlots(tâches, tâchesFixes, sommeil, rendezVousPlanification, de, à, duréeMin)
 * `planningMeeting` : rendez-vous quotidien { start, end } (HH:MM), ou null.
 * `now` : pour aujourd'hui, on ne propose rien avant l'heure actuelle.
 */
export function getFreeSlots(
  tasks: TimedItem[],
  fixed: TimedItem[],
  sleep: SleepWindow,
  planningMeeting: { start: string; end: string } | null,
  from: string,
  to: string,
  minDurationMin: number,
  now?: { date: string; minutes: number },
): FreeSlot[] {
  const win = awakeWindow(sleep);
  const out: FreeSlot[] = [];
  for (const date of datesBetween(from, to)) {
    const busy = [...busyOf(tasks, date), ...busyOf(fixed, date)];
    if (planningMeeting && isValidTime(planningMeeting.start) && isValidTime(planningMeeting.end)) {
      busy.push({ start: toMin(planningMeeting.start), end: toMin(planningMeeting.end) });
    }
    let start = win.start;
    if (now && date < now.date) continue;
    if (now && date === now.date) start = Math.max(start, Math.ceil(now.minutes / 5) * 5);
    for (const g of gaps({ start, end: win.end }, busy)) {
      if (g.end - g.start >= minDurationMin) out.push({ date, start: toHHMM(g.start), end: toHHMM(g.end), minutes: g.end - g.start });
    }
  }
  return out;
}
