import { describe, expect, it } from 'vitest';
import { firstFreeSlot, overlaps, postponeSlot } from './schedule';

const NOW = new Date(2026, 9, 26, 10, 2);
const T = { date: '2026-10-26', start_time: '09:00:00', end_time: '09:45:00' };

describe('postponeSlot', () => {
  it('dans 15 min, arrondi à 5 min, durée conservée', () => {
    expect(postponeSlot(T, 15, NOW)).toEqual({ date: '2026-10-26', start_time: '10:20', end_time: '11:05' });
  });
  it('dans 1 h', () => {
    expect(postponeSlot(T, 60, NOW).start_time).toBe('11:05');
  });
  it('ce soir 19:00', () => {
    expect(postponeSlot(T, 'evening', NOW)).toEqual({ date: '2026-10-26', start_time: '19:00', end_time: '19:45' });
  });
  it('ce soir après 19:00 : demain soir', () => {
    expect(postponeSlot(T, 'evening', new Date(2026, 9, 26, 20)).date).toBe('2026-10-27');
  });
  it('demain à la même heure', () => {
    expect(postponeSlot(T, 'tomorrow', NOW)).toEqual({ date: '2026-10-27', start_time: '09:00', end_time: '09:45' });
  });
  it('heure choisie déjà passée : demain', () => {
    expect(postponeSlot(T, { time: '08:00' }, NOW).date).toBe('2026-10-27');
    expect(postponeSlot(T, { time: '16:30' }, NOW).start_time).toBe('16:30');
  });
  it('passe au lendemain après minuit', () => {
    const r = postponeSlot(T, 60, new Date(2026, 9, 26, 23, 30));
    expect(r.date).toBe('2026-10-27');
    expect(r.start_time).toBe('00:30');
  });
});

describe('firstFreeSlot', () => {
  const tasks = [
    { date: '2026-10-26', start_time: '10:00', end_time: '11:00' },
    { date: '2026-10-26', start_time: '11:20', end_time: '12:00' },
  ];
  it('saute les créneaux occupés', () => {
    expect(firstFreeSlot(tasks, '2026-10-26', 9 * 60 + 50, 30)).toEqual({
      date: '2026-10-26',
      start_time: '12:00',
      end_time: '12:30',
    });
  });
  it('utilise un trou assez grand', () => {
    expect(firstFreeSlot(tasks, '2026-10-26', 9 * 60 + 50, 15)?.start_time).toBe('11:00');
  });
  it('null s’il n’y a plus de place', () => {
    expect(firstFreeSlot([], '2026-10-26', 23 * 60 + 50, 30)).toBeNull();
  });
});

describe('overlaps', () => {
  it('détecte un chevauchement', () => {
    const list = [{ id: 'a', date: '2026-10-26', start_time: '10:00', end_time: '11:00' }];
    expect(overlaps(list, { date: '2026-10-26', start_time: '10:30', end_time: '11:30' })).toBe(true);
    expect(overlaps(list, { date: '2026-10-26', start_time: '11:00', end_time: '11:30' })).toBe(false);
    expect(overlaps(list, { date: '2026-10-26', start_time: '10:30', end_time: '11:30' }, 'a')).toBe(false);
  });
});
