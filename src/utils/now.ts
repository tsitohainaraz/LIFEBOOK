import { toISODate, toMin } from './dates';

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
