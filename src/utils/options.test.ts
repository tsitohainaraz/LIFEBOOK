import { describe, expect, it } from 'vitest';
import { ageOn, birthDateError } from './options';

const TODAY = new Date(2026, 9, 26);

describe('ageOn', () => {
  it('compte les années révolues', () => {
    expect(ageOn('1996-06-15', TODAY)).toBe(30);
    expect(ageOn('1996-10-27', TODAY)).toBe(29);
    expect(ageOn('1996-10-26', TODAY)).toBe(30);
  });
});

describe('birthDateError', () => {
  it('exige une date', () => {
    expect(birthDateError('', TODAY)).toMatch(/Indique/);
  });
  it('refuse le futur', () => {
    expect(birthDateError('2027-01-01', TODAY)).toMatch(/futur/);
  });
  it('refuse moins de 10 ans et plus de 110 ans', () => {
    expect(birthDateError('2020-01-01', TODAY)).toMatch(/10 ans/);
    expect(birthDateError('1900-01-01', TODAY)).toMatch(/110 ans/);
  });
  it('accepte une date valide', () => {
    expect(birthDateError('1996-06-15', TODAY)).toBe('');
  });
});
