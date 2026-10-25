import { describe, expect, it } from 'vitest';
import { niceRange, pathOf, scalePoints } from './chart';

describe('niceRange', () => {
  it('ajoute une marge', () => {
    expect(niceRange([100, 200])).toEqual([90, 210]);
  });
  it('gère une seule valeur', () => {
    expect(niceRange([70])).toEqual([68, 72]);
  });
});

describe('scalePoints et pathOf', () => {
  it('place le premier point à gauche et le maximum en haut', () => {
    const s = scalePoints(
      [
        { t: 0, v: 0 },
        { t: 10, v: 10 },
      ],
      100,
      50,
      [0, 10],
    );
    expect(s).toEqual([
      { x: 0, y: 50 },
      { x: 100, y: 0 },
    ]);
    expect(pathOf(s)).toBe('M0.0,50.0 L100.0,0.0');
  });
  it('centre un point unique', () => {
    expect(scalePoints([{ t: 5, v: 1 }], 100, 50, [0, 2])[0].x).toBe(50);
  });
});
