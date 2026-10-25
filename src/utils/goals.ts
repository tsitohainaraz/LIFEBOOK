import { diffDays, toISODate } from './dates';

// Règle commune à tous les objectifs (vie, année, mois, semaine).

export type GoalStatus = 'late' | 'urgent' | 'soon' | 'ok' | 'done';

export interface GoalLike {
  deadline: string | null;
  done_at: string | null;
}

/** Semaines restantes avant l'échéance (arrondi au-dessus ; 0 = cette semaine ; négatif = dépassée). */
export function weeksLeft(deadline: string, now: Date): number {
  const days = diffDays(deadline, toISODate(now));
  if (days < 0) return -Math.ceil(-days / 7);
  return Math.ceil(days / 7);
}

export function goalStatus(goal: GoalLike, now: Date): GoalStatus {
  if (goal.done_at) return 'done';
  if (!goal.deadline) return 'ok';
  const days = diffDays(goal.deadline, toISODate(now));
  if (days < 0) return 'late';
  const w = Math.ceil(days / 7);
  if (w <= 2) return 'urgent';
  if (w <= 8) return 'soon';
  return 'ok';
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

/** Libellé de la pastille : « Reste X semaines », « En retard », « Atteint »… */
export function goalStatusLabel(goal: GoalLike, now: Date): string {
  const s = goalStatus(goal, now);
  if (s === 'done') return 'Atteint';
  if (!goal.deadline) return 'En cours';
  if (s === 'late') return 'En retard';
  const days = diffDays(goal.deadline, toISODate(now));
  if (days === 0) return "Aujourd'hui";
  const w = weeksLeft(goal.deadline, now);
  if (s === 'urgent') return days < 7 ? `Urgent · ${plural(days, 'jour')}` : `Urgent · ${w} sem.`;
  return `Reste ${plural(w, 'semaine')}`;
}

/** Ordre d'affichage : en retard, urgent, bientôt, en cours, atteint. */
export const STATUS_ORDER: Record<GoalStatus, number> = { late: 0, urgent: 1, soon: 2, ok: 3, done: 4 };

export interface Progress {
  done: number;
  total: number;
  /** De 0 à 1 ; null si rien à compter. */
  ratio: number | null;
}

/**
 * Progression : étapes faites + tâches liées faites (+ cartes terminées des tableaux reliés),
 * sur le total.
 */
export function goalProgress(
  steps: { done_at: string | null }[],
  linkedTasks: { done_at: string | null }[],
  boardCards: { done: number; total: number } = { done: 0, total: 0 },
): Progress {
  const total = steps.length + linkedTasks.length + boardCards.total;
  const done = steps.filter((s) => s.done_at).length + linkedTasks.filter((t) => t.done_at).length + boardCards.done;
  return { done, total, ratio: total ? done / total : null };
}

/** Échéance d'un objectif de vie : la veille de l'anniversaire de l'âge visé. */
export function deadlineForAge(birthDate: string, targetAge: number): string {
  const [y, m, d] = birthDate.split('-').map(Number);
  const date = new Date(y + targetAge + 1, m - 1, d, 12);
  date.setDate(date.getDate() - 1);
  return toISODate(date);
}
