// Calculs purs de l'assistante côté application : aperçu de la frise, textes, suggestions.
import type { ProposedAction } from '../../../supabase/functions/_shared/assistant/actions.ts';
import { applyOps, type PlanOp, type PlanTask } from '../../utils/planOps';

export type { ProposedAction };
export type StoredAction = ProposedAction & { id?: string; status?: string };

export const SUGGESTIONS = [
  { key: 'guided', label: 'Planifie ma journée de demain' },
  { key: 'sport', label: 'Trouve-moi 1 h pour le sport cette semaine' },
  { key: 'replan', label: 'Réorganise le reste de ma journée' },
  { key: 'goal', label: 'Aide-moi à avancer sur mon objectif' },
] as const;

export const FEEDBACK_REASONS = ['Pas clair', 'Pas adapté à moi', 'Faux', 'Trop long'] as const;

export const DISCLAIMER = "L'assistante peut se tromper. Elle ne remplace pas l'avis d'un médecin.";

export function remainingLabel(n: number | null | undefined): string {
  if (n == null) return '';
  if (n <= 0) return 'Plus de message aujourd’hui';
  return `${n} message${n > 1 ? 's' : ''} restant${n > 1 ? 's' : ''} aujourd’hui`;
}

export function appliedBanner(n: number): string {
  return `${n} changement${n > 1 ? 's' : ''} appliqué${n > 1 ? 's' : ''}`;
}

/** Les actions sur les tâches peuvent être appliquées automatiquement ; objectifs et souvenirs demandent toujours une confirmation. */
export function isAutoApplicable(a: ProposedAction): boolean {
  return a.type === 'task_ops';
}

export function countChanges(actions: ProposedAction[]): number {
  return actions.reduce((n, a) => n + (a.type === 'task_ops' ? a.ops.length : 0), 0);
}

export type PreviewState = 'same' | 'new' | 'moved' | 'removed';
export interface PreviewRow {
  id: string;
  title: string;
  category: string;
  start: string;
  end: string;
  state: PreviewState;
}

/** Frise d'une journée avant/après les opérations, avec les changements en surbrillance. */
export function previewDay(tasks: PlanTask[], ops: PlanOp[], date: string): PreviewRow[] {
  const after = applyOps(tasks, ops).tasks;
  const before = new Map(tasks.map((t) => [t.id, t]));
  const afterIds = new Set(after.map((t) => t.id));
  const rows: PreviewRow[] = [];
  for (const t of after) {
    if (t.date !== date || !t.start || !t.end) continue;
    const b = before.get(t.id);
    const state: PreviewState = !b ? 'new' : b.date !== t.date || b.start !== t.start || b.end !== t.end ? 'moved' : 'same';
    rows.push({ id: t.id, title: t.title, category: t.category, start: t.start.slice(0, 5), end: t.end.slice(0, 5), state });
  }
  for (const t of tasks) {
    if (t.date === date && t.start && t.end && !afterIds.has(t.id)) {
      rows.push({ id: t.id, title: t.title, category: t.category, start: t.start.slice(0, 5), end: t.end.slice(0, 5), state: 'removed' });
    }
  }
  return rows.sort((a, b) => a.start.localeCompare(b.start));
}

/** Remplace les références (« new-… ») par les vrais identifiants créés. */
export function resolveRefs(op: PlanOp, refs: Map<string, string>): PlanOp {
  if (op.op === 'create') return op;
  const id = refs.get(op.id) ?? op.id;
  return { ...op, id } as PlanOp;
}
