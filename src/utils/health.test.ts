import { describe, expect, it } from 'vitest';
import {
  bmi,
  bmiCategory,
  classifyBloodPressure,
  formatBmi,
  healthReasons,
  mustAskDoctor,
  suggestedSportMinutes,
} from './health';

describe('bmi', () => {
  it('calcule l’IMC arrondi au dixième', () => {
    expect(bmi(175, 70)).toBe(22.9);
  });
  it('renvoie null sans mesures', () => {
    expect(bmi(null, 70)).toBeNull();
    expect(bmi(170, 0)).toBeNull();
    expect(bmi(50, 70)).toBeNull();
  });
  it('s’affiche avec une virgule', () => {
    expect(formatBmi(22.9)).toBe('22,9');
    expect(formatBmi(null)).toBe('—');
  });
});

describe('bmiCategory', () => {
  it('classe les valeurs aux bornes', () => {
    expect(bmiCategory(18.4)?.label).toBe('Insuffisance pondérale');
    expect(bmiCategory(18.5)?.label).toBe('Corpulence normale');
    expect(bmiCategory(25)?.label).toBe('Surpoids');
    expect(bmiCategory(30)?.label).toBe('Obésité');
    expect(bmiCategory(null)).toBeNull();
  });
});

describe('classifyBloodPressure', () => {
  it('normale', () => {
    expect(classifyBloodPressure(120, 80)?.level).toBe('normale');
  });
  it('normale haute', () => {
    expect(classifyBloodPressure(132, 80)?.level).toBe('normale_haute');
    expect(classifyBloodPressure(120, 86)?.level).toBe('normale_haute');
  });
  it('élevée', () => {
    expect(classifyBloodPressure(145, 85)?.level).toBe('elevee');
  });
  it('très élevée avec alerte', () => {
    const r = classifyBloodPressure(185, 100);
    expect(r?.level).toBe('tres_elevee');
    expect(r?.urgent).toBe(true);
    expect(r?.label).toMatch(/consulte rapidement/);
    expect(classifyBloodPressure(150, 125)?.level).toBe('tres_elevee');
  });
  it('basse', () => {
    expect(classifyBloodPressure(85, 55)?.level).toBe('basse');
  });
  it('null si incomplète', () => {
    expect(classifyBloodPressure(120, null)).toBeNull();
  });
});

describe('mustAskDoctor', () => {
  it('bloque le sport intense si la tension est très élevée', () => {
    expect(mustAskDoctor({ systolic: 190, diastolic: 110 })).toBe(true);
  });
  it('bloque pour grossesse, cœur, drépanocytose, épilepsie', () => {
    expect(mustAskDoctor({ conditions: ['Grossesse'] })).toBe(true);
    expect(mustAskDoctor({ conditions: ['Drépanocytose'] })).toBe(true);
  });
  it('laisse passer sinon', () => {
    expect(mustAskDoctor({ systolic: 120, diastolic: 80, conditions: ['Asthme'] })).toBe(false);
  });
});

describe('healthReasons', () => {
  it('commence par les risques réels', () => {
    expect(healthReasons({ familyYes: ['avc'] })[0]).toBe('avc');
    expect(healthReasons({ systolic: 145, diastolic: 92 })[0]).toBe('tension');
    expect(healthReasons({ familyYes: ['coeur'] })[0]).toBe('coeur');
  });
  it('contient toujours les 5 raisons sans doublon', () => {
    const r = healthReasons({ familyYes: ['diabete', 'hypertension'] });
    expect(r).toHaveLength(5);
    expect(new Set(r).size).toBe(5);
    expect(r.slice(0, 2)).toEqual(['tension', 'diabete']);
  });
});

describe('suggestedSportMinutes', () => {
  it('reste entre 10 et 60 min', () => {
    expect(suggestedSportMinutes(8)).toBe(10);
    expect(suggestedSportMinutes(42)).toBe(35);
    expect(suggestedSportMinutes(300)).toBe(60);
    expect(suggestedSportMinutes(null)).toBe(60);
  });
});
