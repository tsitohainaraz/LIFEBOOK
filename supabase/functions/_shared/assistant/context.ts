// Contexte envoyé au modèle : le strict nécessaire, calculé par le code (dates, heures, créneaux).
// Jamais de nom de famille, d'e-mail, de photo ni de mesures brutes de santé.
import { computeInsights, type InsightAggregates } from '../planning/insights.ts';
import type { PlanTask } from '../planning/planOps.ts';
import { calendar, frenchDate, toMin } from '../planning/time.ts';

export interface ProfileLite {
  first_name: string | null;
  birth_date: string | null;
  status: string | null;
  status_detail: string | null;
  faith: string | null;
  faith_detail: string | null;
  sleep_hours: number;
  work_hours: number;
  retire_age: number;
  timezone: string;
  health_consent_at: string | null;
}

export interface GoalLite {
  id: string;
  title: string;
  domain: string;
  level: string;
  deadline: string | null;
  target_age: number | null;
  done: boolean;
  steps: { title: string; due_date: string | null; done: boolean }[];
}

export interface HealthLite {
  systolic: number | null;
  diastolic: number | null;
  conditions: string[];
  diabetes: string | null;
  familyYes: string[];
}

export interface ContextTask extends PlanTask {
  postponed_count?: number;
}

export interface LocalNow {
  date: string;
  time: string;
  minutes: number;
  timezone: string;
}

/** Date et heure locales dans le fuseau du profil (l'horloge du serveur fait foi, jamais celle de l'appareil). */
export function zonedNow(timezone: string, ms: number): LocalNow {
  let tz = timezone;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
  } catch {
    tz = 'Indian/Antananarivo';
  }
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  );
  const time = `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time, minutes: toMin(time), timezone: tz };
}

export function ageOn(birth: string | null, today: string): number | null {
  if (!birth || !/^\d{4}-\d{2}-\d{2}/.test(birth)) return null;
  const [by, bm, bd] = birth.slice(0, 10).split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

const STATUS: Record<string, string> = { etudiant: 'étudiant·e', travailleur: 'travailleur·se', aucun: 'sans activité déclarée' };
const FAITH: Record<string, string> = {
  chretien: 'chrétienne',
  islam: 'musulmane',
  judaisme: 'juive',
  hindouisme: 'hindoue',
  bouddhisme: 'bouddhiste',
  traditionnel: 'traditionnelle',
  autre: 'autre',
};
const FAMILY: Record<string, string> = {
  cancer: 'antécédent familial de cancer',
  diabete: 'antécédent familial de diabète',
  avc: "antécédent familial d'AVC",
  hypertension: "antécédent familial d'hypertension",
  coeur: 'antécédent familial de maladie cardiaque',
};
export const NO_INTENSE_CONDITIONS = ['Maladie cardiaque', 'Grossesse', 'Drépanocytose', 'Épilepsie'];

/** Garde-fou : tension très élevée ou condition qui exclut le sport intense. */
export function healthGuard(h: HealthLite | null): boolean {
  if (!h) return false;
  if ((h.systolic ?? 0) >= 180 || (h.diastolic ?? 0) >= 120) return true;
  return h.conditions.some((c) => NO_INTENSE_CONDITIONS.includes(c));
}

/** Santé résumée en mots, sans aucune mesure brute. */
export function healthSummary(h: HealthLite | null, sportWeekMin: number): string[] {
  const out: string[] = [];
  if (h) {
    if (healthGuard(h)) out.push('garde-fou santé : pas de sport intense, conseiller un avis médical avant tout effort');
    else if ((h.systolic ?? 0) >= 130 || (h.diastolic ?? 0) >= 85) out.push('tension à surveiller');
    if (h.diabetes === 'type1' || h.diabetes === 'type2') out.push('diabète déclaré : repas réguliers');
    else if (h.diabetes === 'prediabete') out.push('prédiabète déclaré');
    for (const f of h.familyYes) if (FAMILY[f]) out.push(FAMILY[f]);
  }
  out.push(`${sportWeekMin} min de sport sur 150 cette semaine`);
  return out;
}

/** Identifiants courts (t1, g1…) pour que le modèle ne recopie jamais de longs identifiants. */
export class RefMap {
  private toRef = new Map<string, string>();
  private toId = new Map<string, string>();
  private n: Record<string, number> = {};

  ref(prefix: string, id: string): string {
    const known = this.toRef.get(id);
    if (known) return known;
    this.n[prefix] = (this.n[prefix] ?? 0) + 1;
    const r = `${prefix}${this.n[prefix]}`;
    this.toRef.set(id, r);
    this.toId.set(r, id);
    return r;
  }

  resolve(refOrId: unknown): string | null {
    if (typeof refOrId !== 'string') return null;
    const v = refOrId.trim();
    return this.toId.get(v) ?? (this.toRef.has(v) ? v : null);
  }
}

export function taskLine(t: ContextTask, refs: RefMap): string {
  const when = t.start && t.end ? `${t.start.slice(0, 5)}–${t.end.slice(0, 5)}` : 'sans horaire';
  const extra = [t.category, t.done ? 'fait' : null, t.postponed_count ? `reporté ${t.postponed_count} fois` : null].filter(Boolean).join(', ');
  return `- ${when} ${t.title} (${extra}) [${refs.ref('t', t.id)}]`;
}

export function goalLine(g: GoalLite, refs: RefMap): string {
  const due = g.deadline ? `échéance ${frenchDate(g.deadline)}` : g.target_age ? `à ${g.target_age} ans` : 'sans échéance';
  const steps = g.steps.length ? ` ; étapes : ${g.steps.map((s) => `${s.title}${s.done ? ' (faite)' : ''}`).join(', ')}` : '';
  return `- ${g.title} (${g.level}, ${due}, ${g.done ? 'atteint' : 'en cours'})${steps} [${refs.ref('g', g.id)}]`;
}

export interface ContextData {
  profile: ProfileLite;
  now: LocalNow;
  tasks: ContextTask[];
  goals: GoalLite[];
  lifePlan: { mission: string | null; values: string[] } | null;
  aggregates: InsightAggregates | null;
  memories: { kind: string; text: string }[];
  health: HealthLite | null;
  useHealth: boolean;
}

/** Texte de contexte, en français. */
export function buildContext(d: ContextData, refs: RefMap): string {
  const p = d.profile;
  const lines: string[] = [];
  const today = d.now.date;
  const tomorrow = calendar(today, 2)[1].date;
  const age = ageOn(p.birth_date, today);

  lines.push('## Utilisateur');
  lines.push(`Prénom : ${p.first_name?.trim() || 'inconnu'}${age != null ? ` ; âge : ${age} ans` : ''}.`);
  if (p.status && STATUS[p.status]) lines.push(`Situation : ${STATUS[p.status]}${p.status_detail ? ` (${p.status_detail})` : ''}.`);
  if (p.faith && p.faith !== 'rien' && FAITH[p.faith]) {
    lines.push(`Croyance : ${FAITH[p.faith]}${p.faith_detail ? ` (${p.faith_detail})` : ''} — à respecter pour les prières et le jour de culte.`);
  }
  lines.push(`Sommeil : ${p.sleep_hours} h par nuit ; travail : ${p.work_hours} h par semaine ; retraite prévue à ${p.retire_age} ans.`);

  lines.push('', '## Maintenant');
  lines.push(`Nous sommes ${frenchDate(today)} (${today}), il est ${d.now.time}, fuseau ${d.now.timezone}.`);
  lines.push('Calendrier des 14 prochains jours (utilise uniquement ces dates) :');
  for (const c of calendar(today, 14)) lines.push(`- ${c.label} = ${c.date}`);

  const byDate = (date: string) =>
    d.tasks.filter((t) => t.date === date).sort((a, b) => (a.start ? toMin(a.start) : 9999) - (b.start ? toMin(b.start) : 9999));
  for (const [label, date] of [["Tâches d'aujourd'hui", today], ['Tâches de demain', tomorrow]] as const) {
    const list = byDate(date);
    lines.push('', `## ${label}`);
    lines.push(...(list.length ? list.map((t) => taskLine(t, refs)) : ['- aucune']));
  }

  lines.push('', '## Objectifs en cours');
  const open = d.goals.filter((g) => !g.done).slice(0, 12);
  lines.push(...(open.length ? open.map((g) => goalLine(g, refs)) : ['- aucun']));
  if (d.lifePlan?.mission || d.lifePlan?.values.length) {
    if (d.lifePlan.mission) lines.push(`Mission : ${d.lifePlan.mission}`);
    if (d.lifePlan.values.length) lines.push(`Valeurs : ${d.lifePlan.values.join(', ')}`);
  }

  const insights = d.aggregates ? computeInsights(d.aggregates) : null;
  if (insights?.sentences.length) {
    lines.push('', '## Ce que montrent ses données');
    lines.push(...insights.sentences.map((s) => `- ${s}`));
  }
  if (d.memories.length) {
    lines.push('', '## Ce que tu sais de lui ou d’elle');
    lines.push(...d.memories.slice(0, 30).map((m) => `- (${m.kind}) ${m.text}`));
  }
  if (d.useHealth && p.health_consent_at) {
    lines.push('', '## Santé (résumé)');
    lines.push(...healthSummary(d.health, insights?.sportWeekMin ?? 0).map((s) => `- ${s}`));
  }
  return lines.join('\n');
}
