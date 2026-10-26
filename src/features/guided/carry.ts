// Report du soir et réorganisation : calculs purs.

/** « Plus tard » repousse la tâche de 2 jours (même heure). */
export const LATER_DAYS = 2;

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Durée d'une tâche reportée : celle prévue, sinon 1 h. */
export function carryDuration(start: string | null, end: string | null): number {
  if (!start || !end) return 60;
  const d = toMin(end) - toMin(start);
  return d > 0 ? d : 60;
}

/**
 * Faut-il proposer « Je réorganise ta fin de journée ? » : une tâche non faite en retard de plus de 30 min,
 * ou au moins 2 « Faire plus tard » aujourd'hui.
 */
export function shouldOfferReplan(
  tasks: { date: string; start_time: string | null; end_time: string | null; done_at: string | null }[],
  today: string,
  nowMin: number,
  laterCountToday: number,
): boolean {
  if (laterCountToday >= 2) return true;
  return tasks.some((t) => t.date === today && !t.done_at && t.start_time && nowMin - toMin(t.end_time ?? t.start_time) > 30);
}
