import { describe, expect, it } from 'vitest';
import { lifePeriods, periodState, toggleValue, wheelScore, wheelSummary } from './lifeplan';

describe('lifePeriods', () => {
  it('6 périodes, la dernière jusqu’à l’espérance de vie', () => {
    const p = lifePeriods(85);
    expect(p).toHaveLength(6);
    expect(p[5]).toEqual({ from: 60, to: 85, name: 'Profiter' });
  });
  it('marque la période actuelle', () => {
    const p = lifePeriods(80);
    expect(periodState(p[2], 30)).toBe('now');
    expect(periodState(p[1], 30)).toBe('past');
    expect(periodState(p[3], 30)).toBe('future');
  });
});

describe('roue de la vie', () => {
  it('5 par défaut', () => {
    expect(wheelScore({}, 'sante')).toBe(5);
    expect(wheelScore({ sante: 12 }, 'sante')).toBe(5);
  });
  it('trouve le domaine le plus faible', () => {
    const s = wheelSummary({ sante: 6, famille: 8, relations: 6, carriere: 7, argent: 4, apprendre: 7, spirituel: 8, loisirs: 3 });
    expect(s.weakest.key).toBe('loisirs');
    expect(s.weakestScore).toBe(3);
    expect(s.average).toBeCloseTo(6.125);
  });
});

describe('toggleValue', () => {
  it('ajoute et retire', () => {
    expect(toggleValue(['Foi'], 'Paix')).toEqual(['Foi', 'Paix']);
    expect(toggleValue(['Foi', 'Paix'], 'Foi')).toEqual(['Paix']);
  });
  it('refuse une 6e valeur', () => {
    expect(toggleValue(['a', 'b', 'c', 'd', 'e'], 'f')).toBeNull();
  });
});
