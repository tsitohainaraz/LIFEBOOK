import { describe, expect, it } from 'vitest';
import {
  ageAt,
  daysUsedAndLeft,
  lifeCountdown,
  lifeEnd,
  lifeSummary,
  sleepWeeksLeft,
  weeksLivedAndLeft,
  workWeeksLeft,
} from './life';

const P = { birthDate: '2000-01-01', lifeExpectancy: 80, sleepHours: 8, workHours: 40, retireAge: 60 };

describe('lifeEnd et âge', () => {
  it('ajoute l’espérance de vie à la naissance', () => {
    const end = lifeEnd(P);
    expect(end.getFullYear()).toBe(2080);
    expect(end.getMonth()).toBe(0);
    expect(end.getDate()).toBe(1);
  });
  it('calcule l’âge', () => {
    expect(ageAt('2000-06-15', new Date(2026, 5, 14))).toBe(25);
    expect(ageAt('2000-06-15', new Date(2026, 5, 15))).toBe(26);
  });
});

describe('weeksLivedAndLeft', () => {
  it('compte 52 semaines par an', () => {
    const r = weeksLivedAndLeft(P, new Date(2000, 0, 1, 12));
    expect(r.total).toBe(4160);
    expect(r.lived).toBe(0);
    expect(r.left).toBe(4160);
  });
  it('avance d’une semaine après 7 jours', () => {
    expect(weeksLivedAndLeft(P, new Date(2000, 0, 8, 12)).lived).toBe(1);
  });
  it('ne descend jamais sous zéro', () => {
    expect(weeksLivedAndLeft(P, new Date(2100, 0, 1)).left).toBe(0);
  });
});

describe('daysUsedAndLeft', () => {
  it('compte les jours épuisés et restants', () => {
    const r = daysUsedAndLeft(P, new Date(2000, 0, 11, 12));
    expect(r.used).toBe(10);
    expect(r.left).toBeGreaterThan(29000);
  });
});

describe('lifeCountdown', () => {
  it('découpe en jours, heures, minutes, secondes', () => {
    const now = new Date(2079, 11, 30, 22, 58, 30);
    expect(lifeCountdown(P, now)).toEqual({ days: 1, hours: 1, minutes: 1, seconds: 30 });
  });
  it('s’arrête à zéro', () => {
    expect(lifeCountdown(P, new Date(2090, 0, 1))).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  });
});

describe('sommeil, travail, temps libre', () => {
  it('semaines à dormir = semaines restantes × sommeil / 24', () => {
    expect(sleepWeeksLeft(2400, 8)).toBe(800);
  });
  it('semaines à travailler = semaines jusqu’à la retraite × travail / 168', () => {
    const now = new Date(2059, 11, 31, 0, 0, 0);
    // 1 jour avant la retraite : 1/7 de semaine × 40/168
    expect(workWeeksLeft(P, now)).toBeCloseTo((1 / 7) * (40 / 168), 3);
    expect(workWeeksLeft(P, new Date(2070, 0, 1))).toBe(0);
  });
  it('temps libre = restant − sommeil − travail', () => {
    const s = lifeSummary(P, new Date(2026, 0, 1, 12));
    expect(s.freeWeeks).toBeCloseTo(s.leftWeeks - s.sleepWeeks - s.workWeeks, 6);
    expect(s.age).toBe(26);
    expect(s.yearsLeft).toBe(54);
  });
});
