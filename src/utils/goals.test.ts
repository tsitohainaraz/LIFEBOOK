import { describe, expect, it } from 'vitest';
import { deadlineForAge, goalProgress, goalStatus, goalStatusLabel, weeksLeft } from './goals';

const NOW = new Date(2026, 9, 26, 10);
const g = (deadline: string | null, done = false) => ({ deadline, done_at: done ? '2026-10-01T00:00:00Z' : null });

describe('goalStatus', () => {
  it('done si atteint, même en retard', () => {
    expect(goalStatus(g('2020-01-01', true), NOW)).toBe('done');
  });
  it('late si l’échéance est passée', () => {
    expect(goalStatus(g('2026-10-25'), NOW)).toBe('late');
  });
  it('urgent à 2 semaines ou moins', () => {
    expect(goalStatus(g('2026-10-26'), NOW)).toBe('urgent');
    expect(goalStatus(g('2026-11-09'), NOW)).toBe('urgent');
  });
  it('soon à 8 semaines ou moins', () => {
    expect(goalStatus(g('2026-11-10'), NOW)).toBe('soon');
    expect(goalStatus(g('2026-12-21'), NOW)).toBe('soon');
  });
  it('ok au-delà, ou sans échéance', () => {
    expect(goalStatus(g('2026-12-22'), NOW)).toBe('ok');
    expect(goalStatus(g(null), NOW)).toBe('ok');
  });
});

describe('weeksLeft et libellé', () => {
  it('arrondit au-dessus', () => {
    expect(weeksLeft('2026-11-02', NOW)).toBe(1);
    expect(weeksLeft('2026-11-03', NOW)).toBe(2);
  });
  it('affiche « Reste X semaines »', () => {
    expect(goalStatusLabel(g('2027-01-25'), NOW)).toBe('Reste 13 semaines');
    expect(goalStatusLabel(g('2026-10-20'), NOW)).toBe('En retard');
    expect(goalStatusLabel(g('2026-10-29'), NOW)).toBe('Urgent · 3 jours');
    expect(goalStatusLabel(g('2026-10-26'), NOW)).toBe("Aujourd'hui");
    expect(goalStatusLabel(g('2026-10-20', true), NOW)).toBe('Atteint');
  });
});

describe('goalProgress', () => {
  it('compte les étapes et les tâches liées', () => {
    const p = goalProgress([{ done_at: 'x' }, { done_at: null }], [{ done_at: 'x' }, { done_at: null }]);
    expect(p).toEqual({ done: 2, total: 4, ratio: 0.5 });
  });
  it('ratio null sans rien à compter', () => {
    expect(goalProgress([], []).ratio).toBeNull();
  });
});

describe('deadlineForAge', () => {
  it('donne la veille de l’anniversaire suivant l’âge visé', () => {
    expect(deadlineForAge('1996-06-15', 35)).toBe('2032-06-14');
  });
});
