import { describe, expect, it } from 'vitest';
import { layoutLanes, minutesByKey } from './timeline';

describe('layoutLanes', () => {
  it('une seule voie sans chevauchement', () => {
    const r = layoutLanes([
      { id: 'a', start: 480, end: 540 },
      { id: 'b', start: 540, end: 600 },
    ]);
    expect(r.every((x) => x.lane === 0 && x.lanes === 1)).toBe(true);
  });
  it('côte à côte en cas de chevauchement', () => {
    const r = layoutLanes([
      { id: 'a', start: 480, end: 600 },
      { id: 'b', start: 510, end: 570 },
      { id: 'c', start: 580, end: 620 },
    ]);
    const byId = Object.fromEntries(r.map((x) => [x.id, x]));
    expect(byId.a.lane).toBe(0);
    expect(byId.b.lane).toBe(1);
    expect(byId.c.lane).toBe(1);
    expect(byId.a.lanes).toBe(2);
    expect(byId.c.lanes).toBe(2);
  });
  it('trois activités simultanées', () => {
    const r = layoutLanes([
      { id: 'a', start: 0, end: 60 },
      { id: 'b', start: 0, end: 60 },
      { id: 'c', start: 30, end: 90 },
    ]);
    expect(Math.max(...r.map((x) => x.lane))).toBe(2);
    expect(r.every((x) => x.lanes === 3)).toBe(true);
  });
});

describe('minutesByKey', () => {
  it('additionne par catégorie', () => {
    const r = minutesByKey([
      { key: 'sport', minutes: 30 },
      { key: 'travail', minutes: 120 },
      { key: 'sport', minutes: 45 },
    ]);
    expect(r.total).toBe(195);
    expect(r.by).toEqual({ sport: 75, travail: 120 });
  });
});
