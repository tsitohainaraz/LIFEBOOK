import { addDaysISO, toISODate, toMin, toTime } from './dates';
import { taskEnd } from './now';

export type LaterOption = 15 | 30 | 60 | 'evening' | 'tomorrow' | { time: string };

interface Timed {
  date: string;
  start_time: string | null;
  end_time: string | null;
}

export interface Slot {
  date: string;
  start_time: string;
  end_time: string;
}

const roundUp5 = (m: number) => Math.ceil(m / 5) * 5;
const DAY_END = 23 * 60 + 59;

/**
 * Nouvelle place d'une tâche reportée. La durée est conservée.
 * 15/30/60 : maintenant + délai ; evening : ce soir 19:00 (demain si déjà passé) ; tomorrow : demain même heure.
 */
export function postponeSlot(task: Timed, option: LaterOption, now: Date): Slot {
  const start0 = task.start_time ? toMin(task.start_time) : 9 * 60;
  const duration = Math.max(5, (task.start_time ? taskEnd(task) : start0 + 60) - start0);
  const today = toISODate(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let date = today;
  let start: number;
  if (option === 'tomorrow') {
    date = addDaysISO(task.date > today ? task.date : today, 1);
    start = start0;
  } else if (option === 'evening') {
    start = 19 * 60;
    if (nowMin >= 19 * 60) date = addDaysISO(today, 1);
  } else if (typeof option === 'object') {
    start = toMin(option.time);
    if (start <= nowMin) date = addDaysISO(today, 1);
  } else {
    start = roundUp5(nowMin + option);
    if (start >= 24 * 60) {
      date = addDaysISO(today, 1);
      start -= 24 * 60;
    }
  }
  return { date, start_time: toTime(start), end_time: toTime(Math.min(start + duration, DAY_END)) };
}

/**
 * Premier créneau libre d'une durée donnée à partir de `fromMin`, entre les tâches horodatées du jour.
 * Renvoie null s'il n'y a plus de place avant minuit.
 */
export function firstFreeSlot(tasks: Timed[], date: string, fromMin: number, duration: number): Slot | null {
  const busy = tasks
    .filter((t) => t.date === date && t.start_time)
    .map((t) => ({ s: toMin(t.start_time), e: taskEnd(t) }))
    .sort((a, b) => a.s - b.s);
  let start = roundUp5(fromMin);
  for (const b of busy) {
    if (b.e <= start) continue;
    if (b.s >= start + duration) break;
    start = roundUp5(Math.max(start, b.e));
  }
  if (start + duration > 24 * 60) return null;
  return { date, start_time: toTime(start), end_time: toTime(start + duration) };
}

/** Vrai si le créneau [start, end[ chevauche une autre tâche du même jour. */
export function overlaps(tasks: (Timed & { id: string })[], slot: Slot, ignoreId?: string): boolean {
  const s = toMin(slot.start_time);
  const e = toMin(slot.end_time);
  return tasks.some(
    (t) => t.id !== ignoreId && t.date === slot.date && t.start_time && toMin(t.start_time) < e && s < taskEnd(t),
  );
}
