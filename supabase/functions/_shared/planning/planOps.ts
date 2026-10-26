// Opérations sur une journée (créer, déplacer, redimensionner, supprimer, modifier),
// vérifiées (heures valides, pas de chevauchement, pas d'empiètement sur le sommeil) et inversibles.
import { awakeWindow, type SleepWindow } from './freeSlots.ts';
import { frenchDate, isValidDate, isValidTime, toMin } from './time.ts';

export const CATEGORIES = ['travail', 'etudes', 'sport', 'spirituel', 'sante', 'famille', 'repos', 'autre'] as const;
export type PlanCategory = (typeof CATEGORIES)[number];

export interface PlanTask {
  id: string;
  title: string;
  category: string;
  date: string;
  start: string | null;
  end: string | null;
  done?: boolean;
  goal_id?: string | null;
  is_priority?: boolean;
}

export interface NewTask {
  title: string;
  category: string;
  date: string;
  start: string;
  end: string;
  goal_id?: string | null;
  is_priority?: boolean;
}

export type PlanOp =
  | { op: 'create'; ref?: string; task: NewTask }
  | { op: 'move'; id: string; date?: string; start: string; end: string }
  | { op: 'resize'; id: string; end: string }
  | { op: 'delete'; id: string }
  | { op: 'update'; id: string; fields: { title?: string; category?: string; goal_id?: string | null; is_priority?: boolean } };

export interface ApplyOptions {
  sleep?: SleepWindow;
  /** Dates autorisées (calendrier envoyé au modèle). */
  allowedDates?: string[];
}

export interface ApplyResult {
  ok: boolean;
  tasks: PlanTask[];
  errors: string[];
  /** Opérations à appliquer pour tout annuler, dans l'ordre. */
  inverse: PlanOp[];
}

const hm = (t: string) => t.slice(0, 5);

function checkSlot(tasks: PlanTask[], t: { id?: string; date: string; start: string; end: string; category?: string; title?: string }, o: ApplyOptions): string | null {
  if (t.title !== undefined && !t.title.trim()) return 'Titre vide.';
  if (t.category !== undefined && !(CATEGORIES as readonly string[]).includes(t.category)) return `Catégorie inconnue : ${t.category}.`;
  if (!isValidDate(t.date)) return `Date invalide : ${t.date}.`;
  if (o.allowedDates && !o.allowedDates.includes(t.date)) return `Date hors du calendrier : ${t.date}.`;
  if (!isValidTime(t.start) || !isValidTime(t.end)) return `Heure invalide : ${t.start} – ${t.end}.`;
  const s = toMin(t.start);
  const e = toMin(t.end);
  if (e <= s) return `La fin (${hm(t.end)}) doit être après le début (${hm(t.start)}).`;
  if (o.sleep) {
    const w = awakeWindow(o.sleep);
    if (s < w.start || e > w.end) return `« ${t.title ?? 'Tâche'} » empiète sur le sommeil (${hm(t.start)} – ${hm(t.end)}).`;
  }
  const clash = tasks.find(
    (x) => x.id !== t.id && !x.done && x.date === t.date && x.start && x.end && toMin(x.start) < e && s < toMin(x.end),
  );
  if (clash) return `${hm(t.start)} – ${hm(t.end)} chevauche « ${clash.title} » (${hm(clash.start ?? '')} – ${hm(clash.end ?? '')}).`;
  return null;
}

/** Applique les opérations une par une ; une opération invalide est ignorée et signalée. */
export function applyOps(initial: PlanTask[], ops: PlanOp[], options: ApplyOptions = {}): ApplyResult {
  let tasks = initial.map((t) => ({ ...t }));
  const errors: string[] = [];
  const inverse: PlanOp[] = [];
  ops.forEach((op, i) => {
    const fail = (msg: string) => errors.push(`Action ${i + 1} : ${msg}`);
    if (op.op === 'create') {
      const id = op.ref ?? `new-${i + 1}`;
      const err = checkSlot(tasks, { ...op.task, id }, options);
      if (err) return fail(err);
      tasks.push({ id, ...op.task });
      inverse.unshift({ op: 'delete', id });
      return;
    }
    const cur = tasks.find((t) => t.id === op.id);
    if (!cur) return fail('tâche introuvable.');
    if (op.op === 'delete') {
      tasks = tasks.filter((t) => t.id !== op.id);
      if (cur.start && cur.end) {
        inverse.unshift({
          op: 'create',
          ref: cur.id,
          task: { title: cur.title, category: cur.category, date: cur.date, start: cur.start, end: cur.end, goal_id: cur.goal_id ?? null, is_priority: cur.is_priority },
        });
      }
      return;
    }
    if (op.op === 'update') {
      const next = { ...cur, ...op.fields };
      if (op.fields.title !== undefined && !op.fields.title.trim()) return fail('Titre vide.');
      if (op.fields.category !== undefined && !(CATEGORIES as readonly string[]).includes(op.fields.category)) return fail(`Catégorie inconnue : ${op.fields.category}.`);
      const old: Record<string, unknown> = {};
      for (const k of Object.keys(op.fields)) old[k] = (cur as unknown as Record<string, unknown>)[k] ?? null;
      tasks = tasks.map((t) => (t.id === op.id ? next : t));
      inverse.unshift({ op: 'update', id: op.id, fields: old as Extract<PlanOp, { op: 'update' }>['fields'] });
      return;
    }
    const target =
      op.op === 'move'
        ? { date: op.date ?? cur.date, start: op.start, end: op.end }
        : { date: cur.date, start: cur.start ?? '', end: op.end };
    const err = checkSlot(tasks, { id: cur.id, title: cur.title, ...target }, options);
    if (err) return fail(err);
    tasks = tasks.map((t) => (t.id === op.id ? { ...t, ...target } : t));
    if (op.op === 'move') inverse.unshift({ op: 'move', id: cur.id, date: cur.date, start: cur.start ?? op.start, end: cur.end ?? op.end });
    else inverse.unshift({ op: 'resize', id: cur.id, end: cur.end ?? op.end });
  });
  return { ok: errors.length === 0, tasks, errors, inverse };
}

/** Texte lisible d'une opération : « Ajouter : Marche rapide · mar. 28 oct. 2026 · 06:30 – 07:00 ». */
export function describeOp(op: PlanOp, tasks: PlanTask[]): string {
  const title = (id: string) => tasks.find((t) => t.id === id)?.title ?? 'Tâche';
  switch (op.op) {
    case 'create':
      return `Ajouter : ${op.task.title} · ${frenchDate(op.task.date)} · ${hm(op.task.start)} – ${hm(op.task.end)}`;
    case 'move': {
      const cur = tasks.find((t) => t.id === op.id);
      const day = op.date && op.date !== cur?.date ? ` · ${frenchDate(op.date)}` : '';
      return `Déplacer : ${title(op.id)} → ${hm(op.start)}${day}`;
    }
    case 'resize':
      return `Changer la fin : ${title(op.id)} → ${hm(op.end)}`;
    case 'delete':
      return `Retirer : ${title(op.id)}`;
    case 'update':
      return `Modifier : ${title(op.id)}${op.fields.title ? ` → « ${op.fields.title} »` : ''}`;
  }
}
