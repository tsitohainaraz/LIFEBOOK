import { addDaysISO, parseISODate } from './dates';

/** Jour ISO de la semaine : 1 = lundi … 7 = dimanche. */
export function isoWeekday(date: string): number {
  const d = parseISODate(date).getDay();
  return d === 0 ? 7 : d;
}

export function isPlannedDay(daysOfWeek: number[], date: string): boolean {
  return daysOfWeek.includes(isoWeekday(date));
}

/**
 * Série : jours prévus cochés d'affilée jusqu'à aujourd'hui.
 * Aujourd'hui non coché ne casse pas la série (la journée n'est pas finie).
 */
export function habitStreak(done: Set<string>, daysOfWeek: number[], today: string, maxDays = 400): number {
  let streak = 0;
  for (let i = 0; i < maxDays; i++) {
    const d = addDaysISO(today, -i);
    if (!isPlannedDay(daysOfWeek, d)) continue;
    if (done.has(d)) streak++;
    else if (i === 0) continue;
    else break;
  }
  return streak;
}

/** Taux de réussite entre deux dates incluses (jours prévus seulement), de 0 à 1. */
export function habitRate(done: Set<string>, daysOfWeek: number[], from: string, to: string): number | null {
  let planned = 0;
  let ok = 0;
  for (let d = from; d <= to; d = addDaysISO(d, 1)) {
    if (!isPlannedDay(daysOfWeek, d)) continue;
    planned++;
    if (done.has(d)) ok++;
  }
  return planned ? ok / planned : null;
}
