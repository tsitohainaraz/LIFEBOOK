import { WHEEL_DOMAINS } from './categories';

export interface LifePeriod {
  from: number;
  to: number;
  name: string;
}

/** Périodes de vie de la maquette E ; la dernière va jusqu'à l'espérance de vie. */
export function lifePeriods(lifeExpectancy: number): LifePeriod[] {
  return [
    { from: 0, to: 19, name: 'Grandir' },
    { from: 20, to: 29, name: 'Se construire' },
    { from: 30, to: 39, name: 'Bâtir' },
    { from: 40, to: 49, name: 'Consolider' },
    { from: 50, to: 59, name: 'Transmettre' },
    { from: 60, to: Math.max(60, lifeExpectancy), name: 'Profiter' },
  ];
}

export function periodState(p: LifePeriod, age: number): 'past' | 'now' | 'future' {
  if (age > p.to) return 'past';
  if (age >= p.from) return 'now';
  return 'future';
}

export const WHEEL_DEFAULT = 5;

/** Note d'un domaine de la roue (1 à 10, 5 par défaut). */
export function wheelScore(wheel: Record<string, number | undefined> | null | undefined, key: string): number {
  const v = wheel?.[key];
  return typeof v === 'number' && v >= 1 && v <= 10 ? v : WHEEL_DEFAULT;
}

/** Domaine le plus faible de la roue de la vie (le premier en cas d'égalité) et moyenne. */
export function wheelSummary(wheel: Record<string, number | undefined> | null | undefined) {
  let weakest = WHEEL_DOMAINS[0];
  let sum = 0;
  for (const d of WHEEL_DOMAINS) {
    const v = wheelScore(wheel, d.key);
    sum += v;
    if (v < wheelScore(wheel, weakest.key)) weakest = d;
  }
  return { weakest, weakestScore: wheelScore(wheel, weakest.key), average: sum / WHEEL_DOMAINS.length };
}

/** Ajoute ou retire une valeur, sans dépasser `max`. Renvoie null si la limite est atteinte. */
export function toggleValue(values: string[], v: string, max = 5): string[] | null {
  if (values.includes(v)) return values.filter((x) => x !== v);
  if (values.length >= max) return null;
  return [...values, v];
}
