import { describe, expect, it } from 'vitest';
import { computeOffset, isValidTimeZone, toZoned, zoneOffsetMs } from './serverTime';

describe('computeOffset', () => {
  const server = Date.parse('Mon, 26 Oct 2026 07:00:00 GMT');

  it('mesure un téléphone en retard de 3 jours', () => {
    const local = server - 3 * 86_400_000;
    const off = computeOffset('Mon, 26 Oct 2026 07:00:00 GMT', local - 100, local + 100);
    expect(off).toBe(3 * 86_400_000 + 500);
  });

  it('mesure un téléphone en avance', () => {
    const local = server + 60_000;
    expect(computeOffset('Mon, 26 Oct 2026 07:00:00 GMT', local, local)).toBe(-60_000 + 500);
  });

  it('ignore un en-tête absent ou illisible', () => {
    expect(computeOffset(null, 0, 0)).toBeNull();
    expect(computeOffset('pas une date', 0, 0)).toBeNull();
  });
});

describe('fuseau horaire', () => {
  // 25 octobre 2026 à 20:12:20 UTC = 23:12:20 à Antananarivo (UTC+3).
  const instant = Date.UTC(2026, 9, 25, 20, 12, 20);

  it('calcule le décalage d’un fuseau', () => {
    expect(zoneOffsetMs(instant, 'Indian/Antananarivo')).toBe(3 * 3_600_000);
    expect(zoneOffsetMs(instant, 'UTC')).toBe(0);
    expect(zoneOffsetMs(instant, 'Europe/Paris')).toBe(3_600_000); // heure d'hiver depuis le 25 octobre
  });

  it('donne l’heure murale du profil, même si l’appareil est mal réglé', () => {
    const d = toZoned(instant, 'Indian/Antananarivo');
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([
      2026, 10, 25, 23, 12, 20,
    ]);
  });

  it('valide les noms de fuseau', () => {
    expect(isValidTimeZone('Indian/Antananarivo')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
  });
});
