// Scénario de la planification guidée, préparé sans IA : une question par écran, 8 au maximum.
import type { Energy, ToPlace } from '../../utils/scheduler';

export type QuestionId = 'energy' | 'must' | 'fixed' | 'dream' | 'sport' | 'wake' | 'blocker' | 'urgent_goal';

export interface Choice<T = string> {
  value: T;
  label: string;
}

export interface Question {
  id: QuestionId;
  title: string;
  hint?: string;
  kind: 'choice' | 'text' | 'steps' | 'sport' | 'time';
  options?: Choice[];
  suggestions?: string[];
  /** Passage automatique après un choix (énergie). */
  autoAdvanceMs?: number;
  steps?: { goalId: string; goalTitle: string; title: string }[];
  /** Pour « blocker » et « urgent_goal ». */
  subject?: { id: string; title: string };
  defaultValue?: string;
}

export interface ScriptInput {
  isToday: boolean;
  /** Ce qui est déjà connu : ces questions ne sont pas posées. */
  known: { energy?: Energy; wake?: string; sportPlanned?: boolean };
  defaultWake: string;
  mustSuggestions: string[];
  postponed: { id: string; title: string; count: number }[];
  /** Objectifs urgents (2 semaines ou moins) et s'ils ont une tâche cette semaine. */
  urgentGoals: { id: string; title: string; hasTaskThisWeek: boolean }[];
  goalSteps: { goalId: string; goalTitle: string; title: string }[];
  sportWeekMin: number;
  healthGuard: boolean;
}

export const MAX_QUESTIONS = 8;
export const ENERGY_AUTO_ADVANCE_MS = 300;
export const SPORT_GOAL_MIN = 150;

export const ENERGY_CHOICES: Choice<Energy>[] = [
  { value: 'fatigue', label: 'Fatigué·e' },
  { value: 'normal', label: 'Normal' },
  { value: 'top', label: 'En pleine forme' },
];

export function buildScript(input: ScriptInput): Question[] {
  const day = input.isToday ? "aujourd'hui" : 'demain';
  const q: Question[] = [];
  if (!input.known.energy) {
    q.push({ id: 'energy', title: `Comment sera ton énergie ${day} ?`, kind: 'choice', options: ENERGY_CHOICES, autoAdvanceMs: ENERGY_AUTO_ADVANCE_MS });
  }
  q.push({
    id: 'must',
    title: `Qu'est-ce qui doit absolument être fait ${day} ?`,
    hint: 'Une chose par ligne ou séparées par des virgules.',
    kind: 'text',
    suggestions: [...new Set(input.mustSuggestions)].slice(0, 6),
  });
  q.push({ id: 'fixed', title: 'Un rendez-vous à heure fixe ?', hint: 'Par exemple : dentiste à 14 h. Laisse vide si rien.', kind: 'text' });
  q.push({
    id: 'dream',
    title: 'Qu’est-ce qui ferait avancer un de tes rêves ?',
    hint: input.goalSteps.length ? 'Coche une étape ou écris autre chose.' : 'Écris une petite action, même de 20 minutes.',
    kind: 'steps',
    steps: input.goalSteps.slice(0, 6),
  });
  if (!input.known.sportPlanned) {
    q.push({
      id: 'sport',
      title: input.healthGuard ? 'Un peu de mouvement en douceur ?' : 'Combien de sport ?',
      hint: input.healthGuard
        ? 'Demande à ton médecin quels efforts te conviennent.'
        : `${input.sportWeekMin} min sur ${SPORT_GOAL_MIN} cette semaine.`,
      kind: 'sport',
      options: (input.healthGuard ? [0, 15, 20] : [0, 20, 30, 45, 60]).map((m) => ({ value: String(m), label: m ? `${m} min` : 'Pas de sport' })),
    });
  }
  if (!input.isToday && !input.known.wake) {
    q.push({ id: 'wake', title: 'À quelle heure te lèves-tu demain ?', kind: 'time', defaultValue: input.defaultWake });
  }
  // Questions ajoutées selon la situation.
  const extras: Question[] = [];
  const stuck = [...input.postponed].filter((p) => p.count >= 3).sort((a, b) => b.count - a.count)[0];
  if (stuck) {
    extras.push({
      id: 'blocker',
      title: `« ${stuck.title} » a été reporté ${stuck.count} fois. Qu'est-ce qui bloque ?`,
      kind: 'choice',
      subject: { id: stuck.id, title: stuck.title },
      options: [
        { value: 'faire', label: 'Je le fais en premier' },
        { value: 'decouper', label: 'Je le découpe : 30 min seulement' },
        { value: 'abandonner', label: "Je l'abandonne" },
      ],
    });
  }
  const urgent = input.urgentGoals.find((g) => !g.hasTaskThisWeek);
  if (urgent) {
    extras.push({
      id: 'urgent_goal',
      title: `Ton objectif « ${urgent.title} » arrive bientôt. Tu y consacres du temps ?`,
      kind: 'choice',
      subject: { id: urgent.id, title: urgent.title },
      options: [
        { value: '30', label: '30 min' },
        { value: '60', label: '1 h' },
        { value: '0', label: 'Pas cette fois' },
      ],
    });
  }
  // Les questions supplémentaires passent avant le réveil, sans dépasser 8 questions.
  const wake = q.findIndex((x) => x.id === 'wake');
  const at = wake >= 0 ? wake : q.length;
  q.splice(at, 0, ...extras);
  return q.slice(0, MAX_QUESTIONS);
}

export interface Answers {
  energy?: Energy;
  must?: string;
  fixed?: string;
  dreamSteps?: { goalId: string; title: string }[];
  dreamText?: string;
  sportMin?: number;
  wake?: string;
  blocker?: { id: string; title: string; choice: string };
  urgentGoal?: { id: string; title: string; minutes: number };
}

/** « appeler maman, banque et courses » → 3 éléments. */
export function splitFreeText(s: string | undefined): string[] {
  if (!s) return [];
  return s
    .split(/\n|,|;| et (?=[a-zàâçéèêëîïôûùüÿñæœ])/i)
    .map((x) => x.trim().replace(/\.$/, ''))
    .filter((x) => x.length > 1)
    .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
    .slice(0, 12);
}

/** Heure dans un texte libre : « 14 h », « 14h30 », « 9:15 ». */
export function parseTime(s: string): string | null {
  const m = /\b(\d{1,2})\s*(?:h|:)\s*(\d{2})?\b/i.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function parseFixed(s: string | undefined): { title: string; time: string | null }[] {
  return splitFreeText(s).map((line) => {
    const time = parseTime(line);
    const title = line
      .replace(/\s*(?:à|a|vers)?\s*\b\d{1,2}\s*(?:h|:)\s*(?:\d{2})?\b/i, '')
      .trim();
    return { title: title || line, time };
  });
}

/** Réponses libres envoyées en une fois au mode guided_parse. */
export function freeAnswersForAi(questions: Question[], a: Answers): { question: string; answer: string }[] {
  const title = (id: QuestionId) => questions.find((q) => q.id === id)?.title ?? id;
  const out: { question: string; answer: string }[] = [];
  if (a.must?.trim()) out.push({ question: title('must'), answer: a.must.trim() });
  if (a.fixed?.trim()) out.push({ question: title('fixed'), answer: a.fixed.trim() });
  if (a.dreamText?.trim()) out.push({ question: title('dream'), answer: a.dreamText.trim() });
  return out;
}

/** Éléments qui ne demandent pas d'IA : étapes cochées, sport, objectif urgent, tâche bloquée. */
export function structuredItems(a: Answers): ToPlace[] {
  const items: ToPlace[] = [];
  for (const s of a.dreamSteps ?? []) items.push({ title: s.title, category: 'autre', duration_min: 60, priority: 'should', goal_id: s.goalId });
  if (a.sportMin && a.sportMin > 0) items.push({ title: 'Sport', category: 'sport', duration_min: a.sportMin, priority: 'should' });
  if (a.urgentGoal && a.urgentGoal.minutes > 0) {
    items.push({ title: `Avancer : ${a.urgentGoal.title}`, category: 'autre', duration_min: a.urgentGoal.minutes, priority: 'must', goal_id: a.urgentGoal.id });
  }
  if (a.blocker && a.blocker.choice !== 'abandonner') {
    items.push({
      key: `task:${a.blocker.id}`,
      title: a.blocker.title,
      category: 'autre',
      duration_min: a.blocker.choice === 'decouper' ? 30 : 60,
      priority: 'must',
    });
  }
  return items;
}

/** Sans IA : chaque réponse libre devient une tâche d'1 h modifiable. */
export function fallbackItems(a: Answers): ToPlace[] {
  const items: ToPlace[] = [];
  for (const t of splitFreeText(a.must)) items.push({ title: t, category: 'autre', duration_min: 60, priority: 'must' });
  for (const f of parseFixed(a.fixed)) items.push({ title: f.title, category: 'autre', duration_min: 60, priority: 'must', fixed_time: f.time });
  for (const t of splitFreeText(a.dreamText)) items.push({ title: t, category: 'autre', duration_min: 60, priority: 'should' });
  return items;
}

const norm = (s: string) => s.trim().toLowerCase();

/** Fusionne sans doublon (même titre). */
export function mergeItems(...lists: ToPlace[][]): ToPlace[] {
  const seen = new Set<string>();
  const out: ToPlace[] = [];
  for (const it of lists.flat()) {
    const k = norm(it.title);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

/** Les 3 priorités du jour : les « must », dans l'ordre. */
export function guidedPriorities(items: { title: string; priority: string }[]): string[] {
  return items.filter((i) => i.priority === 'must').map((i) => i.title).slice(0, 3);
}

/** Série : nombre de jours consécutifs planifiés jusqu'à `date` incluse. */
export function planningStreak(plannedDates: Set<string>, date: string, addDays: (d: string, n: number) => string): number {
  let n = 0;
  let d = date;
  while (plannedDates.has(d) && n < 366) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export const MAX_ADJUSTMENTS = 3;
