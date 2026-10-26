// Validation des outils d'écriture : rien n'est exécuté ici, tout devient une action proposée,
// vérifiée par planOps (dates du calendrier, heures valides, catégories, pas de chevauchement).
import type { SleepWindow } from '../planning/freeSlots.ts';
import type { Range } from '../planning/insights.ts';
import { applyOps, CATEGORIES, describeOp, type PlanOp, type PlanTask } from '../planning/planOps.ts';
import { proposeDayPlan, type Energy, type Priority, type ToPlace } from '../planning/scheduler.ts';
import { frenchDate, isValidDate, isValidTime, toMin } from '../planning/time.ts';
import type { RefMap } from './context.ts';

export type ProposedAction =
  | { type: 'task_ops'; tool: string; label: string; details: string[]; date: string | null; ops: PlanOp[]; inverse: PlanOp[] }
  | { type: 'day_priorities'; tool: 'set_day_priorities'; label: string; date: string; intention: string | null; priorities: string[] }
  | {
      type: 'create_goal';
      tool: 'create_goal';
      label: string;
      goal: { title: string; domain: string; level: string; deadline: string | null; target_age: number | null };
    }
  | { type: 'add_goal_steps'; tool: 'add_goal_steps'; label: string; goal_id: string; steps: { title: string; due_date: string | null }[] }
  | { type: 'remember'; tool: 'remember'; label: string; kind: string; text: string };

export interface ValidationState {
  /** Tâches connues (14 jours), mises à jour à chaque action acceptée pour éviter deux propositions qui se chevauchent. */
  tasks: PlanTask[];
  refs: RefMap;
  allowedDates: string[];
  sleep: SleepWindow;
  now: { date: string; minutes: number };
  goalIds: Set<string>;
  bestRanges: Range[];
  sportWeekMin: number;
  healthGuard: boolean;
}

export type ValidationResult = { ok: true; action: ProposedAction; summary: string } | { ok: false; error: string };

const DOMAINS = ['sante', 'sport', 'famille', 'relations', 'carriere', 'argent', 'spirituel', 'apprendre', 'voyage', 'loisirs', 'autre'];
const LEVELS = ['life', 'year', 'month', 'week'];
const KINDS = ['preference', 'contrainte', 'objectif', 'sante'];

const str = (v: unknown, max = 200): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

function inPast(state: ValidationState, date: string, start: string): boolean {
  return date < state.now.date || (date === state.now.date && toMin(start) < state.now.minutes);
}

function taskOps(state: ValidationState, tool: string, rawOps: PlanOp[], date: string | null, extra: string[] = []): ValidationResult {
  // Références uniques pour les créations (plusieurs propositions peuvent se suivre).
  const ops = rawOps.map((op) => (op.op === 'create' ? { ...op, ref: `new-${crypto.randomUUID().slice(0, 8)}` } : op));
  for (const op of ops) {
    const d = op.op === 'create' ? op.task.date : op.op === 'move' ? op.date ?? state.tasks.find((t) => t.id === op.id)?.date : null;
    const s = op.op === 'create' ? op.task.start : op.op === 'move' ? op.start : null;
    if (d && s && isValidDate(d) && isValidTime(s) && inPast(state, d, s)) return { ok: false, error: `Cet horaire est déjà passé (${frenchDate(d)} ${s}).` };
  }
  const res = applyOps(state.tasks, ops, { sleep: state.sleep, allowedDates: state.allowedDates });
  if (!res.ok) return { ok: false, error: res.errors.join(' ') };
  const details = ops.map((op) => describeOp(op, state.tasks));
  state.tasks = res.tasks;
  const label = details.length === 1 ? details[0] : `Programme du ${date ? frenchDate(date) : 'jour'} : ${details.length} changements`;
  return { ok: true, action: { type: 'task_ops', tool, label, details: [...details, ...extra], date, ops, inverse: res.inverse }, summary: label };
}

function taskId(state: ValidationState, v: unknown): string | null {
  const id = state.refs.resolve(v);
  return id && state.tasks.some((t) => t.id === id) ? id : null;
}

/** Valide un appel d'outil d'écriture et le transforme en action proposée. */
export function validateWriteTool(name: string, args: Record<string, unknown>, state: ValidationState): ValidationResult {
  switch (name) {
    case 'create_task': {
      const title = str(args.title);
      if (!title) return { ok: false, error: 'Titre manquant.' };
      const goalId = args.goal_id != null ? state.refs.resolve(args.goal_id) : null;
      const op: PlanOp = {
        op: 'create',
        task: { title, category: String(args.category ?? ''), date: String(args.date ?? ''), start: String(args.start ?? ''), end: String(args.end ?? ''), goal_id: goalId && state.goalIds.has(goalId) ? goalId : null },
      };
      return taskOps(state, name, [op], op.task.date);
    }
    case 'move_task': {
      const id = taskId(state, args.task_id);
      if (!id) return { ok: false, error: 'Tâche introuvable : utilise un identifiant de la liste (t1, t2…).' };
      const current = state.tasks.find((t) => t.id === id)!;
      const date = args.date != null ? String(args.date) : current.date;
      return taskOps(state, name, [{ op: 'move', id, date, start: String(args.start ?? ''), end: String(args.end ?? '') }], date);
    }
    case 'resize_task': {
      const id = taskId(state, args.task_id);
      if (!id) return { ok: false, error: 'Tâche introuvable.' };
      return taskOps(state, name, [{ op: 'resize', id, end: String(args.end ?? '') }], state.tasks.find((t) => t.id === id)!.date);
    }
    case 'delete_task': {
      const id = taskId(state, args.task_id);
      if (!id) return { ok: false, error: 'Tâche introuvable.' };
      return taskOps(state, name, [{ op: 'delete', id }], state.tasks.find((t) => t.id === id)!.date);
    }
    case 'update_task': {
      const id = taskId(state, args.task_id);
      if (!id) return { ok: false, error: 'Tâche introuvable.' };
      const fields: { title?: string; category?: string } = {};
      if (args.title != null) {
        const t = str(args.title);
        if (!t) return { ok: false, error: 'Titre vide.' };
        fields.title = t;
      }
      if (args.category != null) fields.category = String(args.category);
      if (!Object.keys(fields).length) return { ok: false, error: 'Rien à modifier.' };
      return taskOps(state, name, [{ op: 'update', id, fields }], state.tasks.find((t) => t.id === id)!.date);
    }
    case 'plan_day': {
      const date = String(args.date ?? '');
      if (!state.allowedDates.includes(date)) return { ok: false, error: `Date hors du calendrier : ${date}.` };
      const energy: Energy = args.energy === 'fatigue' || args.energy === 'top' ? args.energy : 'normal';
      const raw = Array.isArray(args.items) ? args.items : [];
      const items = raw.map((it) => sanitizeItem(it, state)).filter((x): x is ToPlace => x !== null);
      if (!items.length) return { ok: false, error: 'Aucun élément valide à placer.' };
      const plan = proposeDayPlan(
        date,
        items,
        state.tasks.filter((t) => t.date === date && t.start && t.end).map((t) => ({ date: t.date, start: t.start!, end: t.end! })),
        { bestRanges: state.bestRanges, sportWeekMin: state.sportWeekMin },
        { sleep: state.sleep, startMin: date === state.now.date ? state.now.minutes : undefined, healthGuard: state.healthGuard },
        energy,
      );
      if (!plan.ops.length) return { ok: false, error: 'Aucun créneau libre ce jour-là pour ces éléments.' };
      const extra = plan.nonPlaces.map((n) => `Sans place : ${n.title}`);
      return taskOps(state, name, plan.ops, date, extra);
    }
    case 'set_day_priorities': {
      const date = String(args.date ?? '');
      if (!state.allowedDates.includes(date)) return { ok: false, error: `Date hors du calendrier : ${date}.` };
      const priorities = (Array.isArray(args.priorities) ? args.priorities : []).map((p) => str(p)).filter((p): p is string => !!p).slice(0, 3);
      if (!priorities.length) return { ok: false, error: 'Aucune priorité.' };
      const intention = str(args.intention, 300);
      const label = `Priorités du ${frenchDate(date)} : ${priorities.join(' · ')}`;
      return { ok: true, action: { type: 'day_priorities', tool: 'set_day_priorities', label, date, intention, priorities }, summary: label };
    }
    case 'create_goal': {
      const title = str(args.title);
      if (!title) return { ok: false, error: 'Titre manquant.' };
      const domain = String(args.domain ?? 'autre');
      const level = String(args.level ?? 'year');
      if (!DOMAINS.includes(domain)) return { ok: false, error: `Domaine inconnu : ${domain}.` };
      if (!LEVELS.includes(level)) return { ok: false, error: `Niveau inconnu : ${level}.` };
      const deadline = args.deadline != null ? String(args.deadline) : null;
      if (deadline && (!isValidDate(deadline) || deadline < state.now.date)) return { ok: false, error: `Échéance invalide : ${deadline}.` };
      const ta = args.target_age != null ? Number(args.target_age) : null;
      if (ta != null && (!Number.isInteger(ta) || ta < 1 || ta > 120)) return { ok: false, error: 'Âge visé invalide.' };
      const label = `Nouvel objectif : ${title}${deadline ? ` · ${frenchDate(deadline)}` : ta ? ` · à ${ta} ans` : ''}`;
      return { ok: true, action: { type: 'create_goal', tool: 'create_goal', label, goal: { title, domain, level, deadline, target_age: ta } }, summary: label };
    }
    case 'add_goal_steps': {
      const goalId = state.refs.resolve(args.goal_id);
      if (!goalId || !state.goalIds.has(goalId)) return { ok: false, error: 'Objectif introuvable : utilise un identifiant de la liste (g1, g2…).' };
      const steps = (Array.isArray(args.steps) ? args.steps : [])
        .map((s) => {
          const o = (s ?? {}) as Record<string, unknown>;
          const title = str(o.title);
          const due = o.due_date != null && isValidDate(o.due_date) && String(o.due_date) >= state.now.date ? String(o.due_date) : null;
          return title ? { title, due_date: due } : null;
        })
        .filter((s): s is { title: string; due_date: string | null } => !!s)
        .slice(0, 10);
      if (!steps.length) return { ok: false, error: 'Aucune étape valide.' };
      const label = `Étapes : ${steps.map((s) => s.title).join(' · ')}`;
      return { ok: true, action: { type: 'add_goal_steps', tool: 'add_goal_steps', label, goal_id: goalId, steps }, summary: label };
    }
    case 'remember': {
      const kind = String(args.kind ?? '');
      const text = str(args.text, 500);
      if (!KINDS.includes(kind)) return { ok: false, error: `Type de souvenir inconnu : ${kind}.` };
      if (!text) return { ok: false, error: 'Souvenir vide.' };
      return { ok: true, action: { type: 'remember', tool: 'remember', label: `Retenir : ${text}`, kind, text }, summary: `Retenir : ${text}` };
    }
    default:
      return { ok: false, error: `Outil inconnu : ${name}.` };
  }
}

const PRIORITIES: Priority[] = ['must', 'should', 'nice'];

/** Élément à placer (plan_day, guided_parse) : nettoyé, jamais rejeté pour un détail. */
export function sanitizeItem(raw: unknown, state: { refs: RefMap; goalIds: Set<string> }): ToPlace | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const title = str(o.title);
  if (!title) return null;
  const category = (CATEGORIES as readonly string[]).includes(String(o.category)) ? String(o.category) : 'autre';
  const d = Math.round(Number(o.duration_min));
  const duration_min = Number.isFinite(d) ? Math.min(480, Math.max(5, Math.round(d / 5) * 5)) : 60;
  const priority = PRIORITIES.includes(o.priority as Priority) ? (o.priority as Priority) : 'should';
  const fixed_time = isValidTime(o.fixed_time) ? String(o.fixed_time) : null;
  const goalId = o.goal_id != null ? state.refs.resolve(o.goal_id) : null;
  return { title, category, duration_min, priority, fixed_time, goal_id: goalId && state.goalIds.has(goalId) ? goalId : null };
}
