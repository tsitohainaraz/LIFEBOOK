import { describe, expect, it } from 'vitest';
import { groupByDay, isNearBottom, timeOf } from './chatUtils';

const TZ = 'Indian/Antananarivo';

describe('groupByDay', () => {
  it('regroupe par jour local avec Aujourd’hui et Hier', () => {
    const msgs = [
      { id: 'a', created_at: '2026-10-20T09:00:00Z' },
      { id: 'b', created_at: '2026-10-25T10:00:00Z' },
      { id: 'c', created_at: '2026-10-25T22:30:00Z' }, // 01:30 le 26 à Madagascar
      { id: 'd', created_at: '2026-10-26T05:00:00Z' },
    ];
    const g = groupByDay(msgs, '2026-10-26', TZ);
    expect(g.map((x) => x.label)).toEqual(['Mardi 20 octobre', 'Hier', "Aujourd'hui"]);
    expect(g[2].items.map((x) => x.id)).toEqual(['c', 'd']);
  });
});

describe('timeOf', () => {
  it('donne l’heure locale du profil', () => {
    expect(timeOf('2026-10-25T20:12:00Z', TZ)).toBe('23:12');
  });
});

describe('isNearBottom', () => {
  it('détecte le bas de la discussion', () => {
    expect(isNearBottom({ scrollHeight: 1000, scrollTop: 560, clientHeight: 400 })).toBe(true);
    expect(isNearBottom({ scrollHeight: 1000, scrollTop: 100, clientHeight: 400 })).toBe(false);
  });
});
