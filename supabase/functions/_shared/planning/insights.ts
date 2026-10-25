// Analyses des 28 derniers jours : transforme les agrégats du RPC get_insights en faits courts.

export const RANGES = ['06-09', '09-12', '12-14', '14-17', '17-20', '20-23'] as const;
export type Range = (typeof RANGES)[number];

export interface InsightAggregates {
  days: number;
  ranges: { range: Range; planned: number; done: number }[];
  weekdays: { dow: number; planned: number; done: number }[];
  daily: { date: string; planned_min: number; done_min: number }[];
  postponed: { title: string; count: number }[];
  categories: { category: string; minutes: number }[];
  wheel: Record<string, number>;
  sport_week_min: number;
  health: null | {
    systolic?: { first: number | null; last: number | null };
    weight_kg?: { first: number | null; last: number | null };
    sleep_h?: { first: number | null; last: number | null };
    wellbeing_pct?: { first: number | null; last: number | null };
  };
  mood: { with_sport: { days: number; avg: number | null }; without_sport: { days: number; avg: number | null } };
}

export interface Insights {
  /** Tranches classées de la meilleure à la pire (au moins 3 tâches planifiées). */
  bestRanges: Range[];
  worstRange: Range | null;
  rangeRates: Partial<Record<Range, number>>;
  weekdayRates: Partial<Record<number, number>>;
  /** Moyenne planifié / réalisé sur les jours avec des tâches (1 = tout fait). */
  overload: number | null;
  postponed: { title: string; count: number }[];
  sportWeekMin: number;
  sentences: string[];
}

const WEEKDAYS = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const CAT_FOR_WHEEL: Record<string, string> = { sante: 'sante', sport: 'sante', famille: 'famille', travail: 'carriere', etudes: 'apprendre', spirituel: 'spirituel', repos: 'loisirs' };
const MIN_TASKS = 3;
const pct = (r: number) => `${Math.round(r * 100)} %`;

export function computeInsights(a: InsightAggregates): Insights {
  const s: string[] = [];
  const rangeRates: Partial<Record<Range, number>> = {};
  for (const r of a.ranges) if (r.planned >= MIN_TASKS) rangeRates[r.range] = r.done / r.planned;
  const ranked = (Object.keys(rangeRates) as Range[]).sort((x, y) => (rangeRates[y] ?? 0) - (rangeRates[x] ?? 0));
  const bestRanges = ranked;
  const worstRange = ranked.length >= 2 ? ranked[ranked.length - 1] : null;
  if (ranked.length) s.push(`Tu réalises le plus de tâches entre ${ranked[0].replace('-', ' h et ')} h (${pct(rangeRates[ranked[0]] ?? 0)}).`);
  if (worstRange && worstRange !== ranked[0]) s.push(`La tranche ${worstRange.replace('-', ' h – ')} h est la moins réussie (${pct(rangeRates[worstRange] ?? 0)}).`);

  const weekdayRates: Partial<Record<number, number>> = {};
  for (const w of a.weekdays) if (w.planned >= MIN_TASKS) weekdayRates[w.dow] = w.done / w.planned;
  const wd = Object.entries(weekdayRates).sort((x, y) => (y[1] ?? 0) - (x[1] ?? 0));
  if (wd.length >= 2) s.push(`Ton meilleur jour est le ${WEEKDAYS[Number(wd[0][0])]}, le plus difficile le ${WEEKDAYS[Number(wd[wd.length - 1][0])]}.`);

  const active = a.daily.filter((d) => d.planned_min > 0);
  const overload = active.length ? active.reduce((t, d) => t + d.planned_min / Math.max(1, d.done_min), 0) / active.length : null;
  const avgPlanned = active.length ? active.reduce((t, d) => t + d.planned_min, 0) / active.length : 0;
  const avgDone = active.length ? active.reduce((t, d) => t + d.done_min, 0) / active.length : 0;
  if (active.length >= 3) {
    s.push(`En moyenne, tu planifies ${Math.round(avgPlanned / 60 * 10) / 10} h par jour et tu en réalises ${Math.round(avgDone / 60 * 10) / 10} h.`);
    if (avgDone > 0 && avgPlanned / avgDone >= 1.5) s.push('Tes journées sont souvent surchargées : prévois moins pour finir plus.');
  }

  const postponed = a.postponed.filter((p) => p.count >= 3).sort((x, y) => y.count - x.count);
  if (postponed.length) s.push(`Souvent reporté : ${postponed.slice(0, 3).map((p) => `« ${p.title} » (${p.count} fois)`).join(', ')}.`);

  // Temps par catégorie comparé à la roue de la vie : domaine faible et peu de temps passé.
  const wheelLow = Object.entries(a.wheel ?? {}).filter(([, v]) => typeof v === 'number' && v <= 4);
  for (const [domain] of wheelLow.slice(0, 2)) {
    const minutes = a.categories.filter((c) => CAT_FOR_WHEEL[c.category] === domain).reduce((t, c) => t + c.minutes, 0);
    if (minutes < 120) s.push(`Le domaine « ${domain} » est noté bas dans ta roue de la vie et n'a presque pas de temps planifié.`);
  }

  s.push(`${a.sport_week_min} min de sport cette semaine sur les 150 recommandées.`);

  if (a.health) {
    const h = a.health;
    const trend = (v?: { first: number | null; last: number | null }) => (v && v.first != null && v.last != null ? v.last - v.first : null);
    const sys = trend(h.systolic);
    if (sys != null && Math.abs(sys) >= 5) s.push(`Ta tension ${sys > 0 ? 'monte' : 'baisse'} ces dernières semaines.`);
    const w = trend(h.weight_kg);
    if (w != null && Math.abs(w) >= 1) s.push(`Ton poids ${w > 0 ? 'augmente' : 'diminue'} (${w > 0 ? '+' : ''}${Math.round(w * 10) / 10} kg).`);
    const sl = trend(h.sleep_h);
    if (sl != null && Math.abs(sl) >= 0.5) s.push(`Tu dors ${sl > 0 ? 'plus' : 'moins'} qu'au début du mois.`);
    const wb = trend(h.wellbeing_pct);
    if (wb != null && Math.abs(wb) >= 10) s.push(`Ton état de santé ressenti ${wb > 0 ? 's’améliore' : 'baisse'}.`);
  }

  const m = a.mood;
  if (m.with_sport.days >= 5 && m.without_sport.days >= 5 && m.with_sport.avg != null && m.without_sport.avg != null) {
    const diff = m.with_sport.avg - m.without_sport.avg;
    if (Math.abs(diff) >= 0.3) s.push(`Les jours où tu fais du sport, ton humeur est ${diff > 0 ? 'meilleure' : 'moins bonne'} (${m.with_sport.avg.toFixed(1)} contre ${m.without_sport.avg.toFixed(1)} sur 5).`);
  }

  return { bestRanges, worstRange, rangeRates, weekdayRates, overload, postponed, sportWeekMin: a.sport_week_min, sentences: s };
}

/** Tranche horaire d'une heure de début (null en dehors de 06:00 – 23:00). */
export function rangeOf(startMin: number): Range | null {
  const h = Math.floor(startMin / 60);
  if (h >= 6 && h < 9) return '06-09';
  if (h >= 9 && h < 12) return '09-12';
  if (h >= 12 && h < 14) return '12-14';
  if (h >= 14 && h < 17) return '14-17';
  if (h >= 17 && h < 20) return '17-20';
  if (h >= 20 && h < 23) return '20-23';
  return null;
}

export const EMPTY_AGGREGATES: InsightAggregates = {
  days: 28,
  ranges: [],
  weekdays: [],
  daily: [],
  postponed: [],
  categories: [],
  wheel: {},
  sport_week_min: 0,
  health: null,
  mood: { with_sport: { days: 0, avg: null }, without_sport: { days: 0, avg: null } },
};
