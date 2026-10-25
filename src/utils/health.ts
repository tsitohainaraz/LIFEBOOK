// Calculs de santé purs. LifeBook ne pose jamais de diagnostic : ces lectures sont indicatives.

export type Tone = 'info' | 'ok' | 'warn' | 'bad';

export interface Reading {
  label: string;
  tone: Tone;
}

/** IMC = poids (kg) / taille (m)². null si les mesures sont absentes ou invraisemblables. */
export function bmi(heightCm: number | null | undefined, weightKg: number | null | undefined): number | null {
  if (!heightCm || !weightKg || heightCm < 80 || weightKg <= 0) return null;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

export function bmiCategory(value: number | null): Reading | null {
  if (value == null) return null;
  if (value < 18.5) return { label: 'Insuffisance pondérale', tone: 'info' };
  if (value < 25) return { label: 'Corpulence normale', tone: 'ok' };
  if (value < 30) return { label: 'Surpoids', tone: 'warn' };
  return { label: 'Obésité', tone: 'bad' };
}

export type BpLevel = 'basse' | 'normale' | 'normale_haute' | 'elevee' | 'tres_elevee';

export interface BpReading extends Reading {
  level: BpLevel;
  /** Message « consulte rapidement » à afficher. */
  urgent: boolean;
}

/** Classification de la tension (mmHg), reprise de la maquette 4. */
export function classifyBloodPressure(
  systolic: number | null | undefined,
  diastolic: number | null | undefined,
): BpReading | null {
  if (!systolic || !diastolic) return null;
  if (systolic >= 180 || diastolic >= 120) {
    return { level: 'tres_elevee', label: 'Très élevée : consulte rapidement', tone: 'bad', urgent: true };
  }
  if (systolic >= 140 || diastolic >= 90) return { level: 'elevee', label: 'Élevée', tone: 'bad', urgent: false };
  if (systolic >= 130 || diastolic >= 85) {
    return { level: 'normale_haute', label: 'Normale haute', tone: 'warn', urgent: false };
  }
  if (systolic < 90 || diastolic < 60) return { level: 'basse', label: 'Basse', tone: 'info', urgent: false };
  return { level: 'normale', label: 'Normale', tone: 'ok', urgent: false };
}

export function formatBmi(value: number | null): string {
  return value == null ? '—' : value.toFixed(1).replace('.', ',');
}

/** Conditions qui interdisent de proposer du sport intense. */
export const NO_INTENSE_CONDITIONS = ['Maladie cardiaque', 'Grossesse', 'Drépanocytose', 'Épilepsie'];

export interface HealthContext {
  systolic?: number | null;
  diastolic?: number | null;
  conditions?: string[];
  diabetes?: string | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  /** Maladies familiales répondues « oui » : cancer, diabete, avc, hypertension, coeur. */
  familyYes?: string[];
}

/** Vrai si l'application doit renvoyer vers un médecin au lieu de proposer un effort intense. */
export function mustAskDoctor(h: HealthContext): boolean {
  const bp = classifyBloodPressure(h.systolic, h.diastolic);
  if (bp?.level === 'tres_elevee') return true;
  return (h.conditions ?? []).some((c) => NO_INTENSE_CONDITIONS.includes(c));
}

export const REASONS = {
  avc: 'pour réduire ton risque d’AVC',
  tension: 'pour garder une tension normale',
  diabete: 'pour éloigner le diabète de type 2',
  coeur: 'pour protéger ton cœur',
  stress: 'pour baisser ton stress',
} as const;

export type ReasonKey = keyof typeof REASONS;

/**
 * Raisons de bouger, en commençant par les risques réels de la personne
 * (antécédents familiaux, tension, diabète, cœur), puis les autres.
 */
export function healthReasons(h: HealthContext): ReasonKey[] {
  const fam = new Set(h.familyYes ?? []);
  const cond = new Set(h.conditions ?? []);
  const bp = classifyBloodPressure(h.systolic, h.diastolic);
  const v = bmi(h.height_cm, h.weight_kg);
  const first: ReasonKey[] = [];
  if (fam.has('avc')) first.push('avc');
  if (fam.has('hypertension') || cond.has('Hypertension') || (bp && bp.level !== 'normale' && bp.level !== 'basse')) {
    first.push('tension');
  }
  if (
    fam.has('diabete') ||
    h.diabetes === 'prediabete' ||
    h.diabetes === 'type2' ||
    (v != null && v >= 25)
  ) {
    first.push('diabete');
  }
  if (fam.has('coeur') || cond.has('Maladie cardiaque')) first.push('coeur');
  const all: ReasonKey[] = ['avc', 'tension', 'diabete', 'coeur', 'stress'];
  return [...first, ...all.filter((k) => !first.includes(k))];
}

/** Durée de sport proposée : le temps libre avant la prochaine tâche, entre 10 et 60 min (par pas de 5). */
export function suggestedSportMinutes(freeMinutes: number | null): number {
  if (freeMinutes == null) return 60;
  const usable = Math.floor((freeMinutes - 5) / 5) * 5;
  return Math.max(10, Math.min(60, usable));
}

/** Recommandation OMS : 150 min d’activité modérée par semaine. */
export const WHO_WEEKLY_MINUTES = 150;
