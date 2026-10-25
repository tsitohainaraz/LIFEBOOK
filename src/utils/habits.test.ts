import { describe, expect, it } from 'vitest';
import { habitRate, habitStreak, isoWeekday } from './habits';

const ALL = [1, 2, 3, 4, 5, 6, 7];

describe('isoWeekday', () => {
  it('lundi = 1, dimanche = 7', () => {
    expect(isoWeekday('2026-10-26')).toBe(1);
    expect(isoWeekday('2026-11-01')).toBe(7);
  });
});

describe('habitStreak', () => {
  it('compte les jours d’affilée', () => {
    const done = new Set(['2026-10-24', '2026-10-25', '2026-10-26']);
    expect(habitStreak(done, ALL, '2026-10-26')).toBe(3);
  });
  it('aujourd’hui non coché ne casse pas la série', () => {
    const done = new Set(['2026-10-24', '2026-10-25']);
    expect(habitStreak(done, ALL, '2026-10-26')).toBe(2);
  });
  it('un jour manqué casse la série', () => {
    const done = new Set(['2026-10-23', '2026-10-25', '2026-10-26']);
    expect(habitStreak(done, ALL, '2026-10-26')).toBe(2);
  });
  it('ignore les jours non prévus', () => {
    // du lundi au vendredi : le week-end ne casse pas la série
    const done = new Set(['2026-10-23', '2026-10-26']);
    expect(habitStreak(done, [1, 2, 3, 4, 5], '2026-10-26')).toBe(2);
  });
});

describe('habitRate', () => {
  it('calcule le taux sur les jours prévus', () => {
    const done = new Set(['2026-10-26', '2026-10-27']);
    expect(habitRate(done, ALL, '2026-10-26', '2026-10-29')).toBe(0.5);
    expect(habitRate(done, [6], '2026-10-26', '2026-10-30')).toBeNull();
  });
});
