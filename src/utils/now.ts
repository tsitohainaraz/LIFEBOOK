import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { addDaysISO, pad, parseISODate, toISODate, toMin } from './dates';
import type { Category } from '../types/database';

// « Maintenant » : quelle activité de la journée compte en ce moment.

export type NowMode = 'now' | 'late' | 'next' | 'free' | 'done';

export interface NowTask {
  id: string;
  date: string;
  title: string;
  start_time: string | null;
  end_time: string | null;
  done_at: string | null;
}

export interface NowResult<T extends NowTask = NowTask> {
  mode: NowMode;
  task: T | null;
  /** Début et fin de la tâche choisie, en minutes depuis minuit. */
  start: number;
  end: number;
  /** Nombre de tâches du jour dont la fin est passée sans être faites. */
  lateCount: number;
  /** Minutes depuis minuit (avec les secondes). */
  nowMin: number;
}

/** Fin d'une tâche : heure de fin si elle est après le début, sinon début + 1 h. */
export function taskEnd(t: Pick<NowTask, 'start_time' | 'end_time'>): number {
  const s = toMin(t.start_time);
  const e = t.end_time ? toMin(t.end_time) : 0;
  return e > s ? e : s + 60;
}

export function pickNow<T extends NowTask>(tasks: T[], now: Date): NowResult<T> {
  const today = toISODate(now);
  const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const todays = tasks.filter((t) => t.date === today);
  const open = todays
    .filter((t) => t.start_time && !t.done_at)
    .map((t) => ({ t, s: toMin(t.start_time), e: taskEnd(t) }));

  const current = open.filter((o) => o.s <= nowMin && nowMin < o.e).sort((a, b) => a.s - b.s);
  const late = open.filter((o) => o.e <= nowMin).sort((a, b) => b.e - a.e);
  const next = open.filter((o) => o.s > nowMin).sort((a, b) => a.s - b.s);

  if (current.length) return { mode: 'now', task: current[0].t, start: current[0].s, end: current[0].e, lateCount: late.length, nowMin };
  if (late.length) return { mode: 'late', task: late[0].t, start: late[0].s, end: late[0].e, lateCount: late.length, nowMin };
  if (next.length) return { mode: 'next', task: next[0].t, start: next[0].s, end: next[0].e, lateCount: 0, nowMin };
  const allDone = todays.length > 0 && todays.every((t) => !!t.done_at);
  return { mode: allDone ? 'done' : 'free', task: null, start: 0, end: 0, lateCount: 0, nowMin };
}

/** Vrai si le premier mot ressemble à un verbe à l'infinitif (prier, lire, faire, courir, voir…). */
export function startsWithInfinitive(title: string): boolean {
  const first = title.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  if (/^(le|la|les|un|une|des|du|de|mon|ma|mes|ton|ta|tes|son|sa|ses)$/.test(first)) return false;
  if (/^(se|s'|s’)/.test(first)) return true;
  return first.length > 2 && /(er|ir|re|oir)$/.test(first);
}

export interface Phrase {
  before: string;
  em: string;
  after: string;
}

/**
 * Phrase du cercle « Maintenant ».
 * now : « Tu devrais être en train de prier maintenant » ou « Maintenant, place à : Réunion ».
 */
export function phrase(title: string, mode: NowMode): Phrase {
  const t = title.trim();
  const verb = startsWithInfinitive(t);
  const act = t.charAt(0).toLowerCase() + t.slice(1);
  const de = /^[aeiouyéèêàâîôûh]/i.test(act) ? 'd’' : 'de ';
  if (mode === 'now') {
    return verb
      ? { before: `Tu devrais être en train ${de}`, em: act, after: ' maintenant' }
      : { before: 'Maintenant, place à : ', em: t, after: '' };
  }
  if (mode === 'late') {
    return verb ? { before: 'Tu devais ', em: act, after: '' } : { before: 'Pas encore fait : ', em: t, after: '' };
  }
  return verb ? { before: 'Prépare-toi à ', em: act, after: '' } : { before: 'À suivre : ', em: t, after: '' };
}

export function phraseText(title: string, mode: NowMode): string {
  const p = phrase(title, mode);
  return p.before + p.em + p.after;
}

/** Minutes libres avant la prochaine tâche (null s'il n'y en a pas). */
export function freeMinutesBeforeNext(r: NowResult): number | null {
  if (r.mode !== 'next') return null;
  return Math.floor(r.start - r.nowMin);
}

// ---------------------------------------------------------------------------
// « À suivre » : les prochains éléments planifiés (tâches, cartes de tableaux…)
// ---------------------------------------------------------------------------

export type PlannedSource = 'task' | 'planning' | 'card';

export interface PlannedItem {
  id: string;
  title: string;
  /** Début et fin en heure murale (comme currentDate()). */
  start: Date;
  end: Date;
  category: Category;
  source: PlannedSource;
  boardName?: string;
  /** Carte : identifiants pour l'ouvrir. */
  boardId?: string;
  cardId?: string;
  done: boolean;
}

/**
 * Prochains éléments non faits qui commencent après `now` aujourd'hui (au plus `limit`).
 * S'il n'y a plus rien aujourd'hui, renvoie le premier élément de demain.
 */
export function getUpcoming(items: PlannedItem[], now: Date, limit = 3): PlannedItem[] {
  const today = toISODate(now);
  const tomorrow = addDaysISO(today, 1);
  const open = items.filter((i) => !i.done && i.start.getTime() > now.getTime()).sort((a, b) => a.start.getTime() - b.start.getTime());
  const todays = open.filter((i) => toISODate(i.start) === today);
  if (todays.length) return todays.slice(0, limit);
  const next = open.find((i) => toISODate(i.start) === tomorrow);
  return next ? [next] : [];
}

/**
 * Temps relatif lisible : « maintenant », « dans 45 min », « dans 2 h 15 », « demain à 06:00 », « jeudi à 09:00 ».
 * `minutes` = minutes entre maintenant et `start`.
 */
export function formatRelative(minutes: number, start: Date): string {
  const m = Math.max(0, Math.floor(minutes));
  const at = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
  const now = new Date(start.getTime() - minutes * 60_000);
  const sameDay = toISODate(now) === toISODate(start);
  if (m < 1) return 'maintenant';
  if (m < 60) return `dans ${m} min`;
  if (m < 24 * 60 && sameDay) {
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r ? `dans ${h} h ${pad(r)}` : `dans ${h} h`;
  }
  if (toISODate(start) === addDaysISO(toISODate(now), 1)) return `demain à ${at}`;
  return `${format(start, 'EEEE', { locale: fr })} à ${at}`;
}

/** Morceaux de la phrase « À suivre », pour mettre l'activité en valeur. */
export function phraseUpcomingParts(title: string, relatif: string): Phrase {
  const t = title.trim();
  const rel = relatif.charAt(0).toUpperCase() + relatif.slice(1);
  if (startsWithInfinitive(t)) {
    return { before: `${rel}, tu dois `, em: t.charAt(0).toLowerCase() + t.slice(1), after: ' selon ton plan' };
  }
  return { before: `${rel} : `, em: t, after: ', selon ton plan' };
}

/** « Dans 2 h 15, tu dois réviser l'examen selon ton plan » ou « Dans 2 h 15 : Réunion d'équipe, selon ton plan ». */
export function phraseUpcoming(title: string, relatif: string): string {
  const p = phraseUpcomingParts(title, relatif);
  return p.before + p.em + p.after;
}

/** Date murale d'un jour AAAA-MM-JJ à une heure en minutes. */
function atMinutes(date: string, minutes: number): Date {
  const d = parseISODate(date);
  d.setHours(0, 0, 0, 0);
  return new Date(d.getTime() + minutes * 60_000);
}

export interface PlannedSources {
  tasks?: (NowTask & { category: Category })[];
  cards?: {
    id: string;
    board_id: string;
    boardName: string;
    title: string;
    due_date: string | null;
    due_time: string | null;
    done_at: string | null;
  }[];
}

/** Réunit toutes les sources planifiées (tâches avec une heure, cartes avec une échéance horaire). */
export function collectPlannedItems(src: PlannedSources): PlannedItem[] {
  const items: PlannedItem[] = [];
  for (const t of src.tasks ?? []) {
    if (!t.start_time) continue;
    items.push({
      id: t.id,
      title: t.title,
      start: atMinutes(t.date, toMin(t.start_time)),
      end: atMinutes(t.date, taskEnd(t)),
      category: t.category,
      source: 'task',
      done: !!t.done_at,
    });
  }
  for (const c of src.cards ?? []) {
    if (!c.due_date || !c.due_time) continue;
    const s = toMin(c.due_time);
    items.push({
      id: `card:${c.id}`,
      title: c.title,
      start: atMinutes(c.due_date, s),
      end: atMinutes(c.due_date, s + 60),
      category: 'travail',
      source: 'card',
      boardName: c.boardName,
      boardId: c.board_id,
      cardId: c.id,
      done: !!c.done_at,
    });
  }
  return items.sort((a, b) => a.start.getTime() - b.start.getTime());
}
