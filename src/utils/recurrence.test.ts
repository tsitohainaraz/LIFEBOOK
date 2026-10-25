import { describe, expect, it } from 'vitest';
import { occurrenceDates } from './recurrence';

describe('occurrenceDates', () => {
  it('une seule fois', () => {
    expect(occurrenceDates('2026-10-26', 'once')).toEqual(['2026-10-26']);
  });
  it('tous les jours pendant 8 semaines', () => {
    const d = occurrenceDates('2026-10-26', 'daily');
    expect(d).toHaveLength(56);
    expect(d[1]).toBe('2026-10-27');
    expect(d[55]).toBe('2026-12-20');
  });
  it('du lundi au vendredi', () => {
    const d = occurrenceDates('2026-10-24', 'weekdays'); // samedi
    expect(d[0]).toBe('2026-10-26');
    expect(d).toHaveLength(40);
    expect(d).not.toContain('2026-10-31');
  });
  it('chaque semaine', () => {
    expect(occurrenceDates('2026-10-26', 'weekly')).toEqual([
      '2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30', '2026-12-07', '2026-12-14',
    ]);
  });
});
