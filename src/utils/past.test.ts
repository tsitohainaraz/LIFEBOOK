import { describe, expect, it } from 'vitest';
import { excerpt, pastDays, pastWeeks } from './past';

const tasks = [
  { date: '2026-10-20', done_at: 'x' },
  { date: '2026-10-20', done_at: null },
  { date: '2026-10-22', done_at: 'x' },
  { date: '2026-10-13', done_at: null },
];
const reports = [{ period_start: '2026-10-21', mood: 4, wellbeing_pct: 80, wins: 'Fini le rapport' }];

describe('pastDays', () => {
  it('liste les jours avec tâches ou rapport, du plus récent au plus ancien', () => {
    const r = pastDays(tasks, reports);
    expect(r.map((x) => x.key)).toEqual(['2026-10-22', '2026-10-21', '2026-10-20', '2026-10-13']);
    expect(r[2]).toMatchObject({ done: 1, total: 2, pct: 50 });
    expect(r[1].report?.mood).toBe(4);
    expect(r[1].pct).toBe(0);
  });
});

describe('pastWeeks', () => {
  it('regroupe par lundi', () => {
    const r = pastWeeks(tasks, []);
    expect(r.map((x) => x.key)).toEqual(['2026-10-19', '2026-10-12']);
    expect(r[0]).toMatchObject({ done: 2, total: 3, pct: 67 });
  });
});

describe('excerpt', () => {
  it('coupe les textes longs', () => {
    expect(excerpt('a'.repeat(100), 10)).toBe('aaaaaaaaa…');
    expect(excerpt('  court  ')).toBe('court');
    expect(excerpt(null)).toBe('');
  });
});
