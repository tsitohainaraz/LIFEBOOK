// Courbes SVG simples : conversion des mesures en coordonnées.

export interface Point {
  t: number; // horodatage (ms)
  v: number;
}

export interface Scaled {
  x: number;
  y: number;
}

/** Bornes arrondies avec une marge, pour l'axe vertical. */
export function niceRange(values: number[], pad = 0.1): [number, number] {
  if (!values.length) return [0, 1];
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const m = (max - min) * pad;
  return [Math.floor(min - m), Math.ceil(max + m)];
}

/** Place les points dans un rectangle w × h (y vers le bas). */
export function scalePoints(points: Point[], w: number, h: number, range: [number, number]): Scaled[] {
  if (!points.length) return [];
  const t0 = Math.min(...points.map((p) => p.t));
  const t1 = Math.max(...points.map((p) => p.t));
  const [lo, hi] = range;
  return points.map((p) => ({
    x: t1 === t0 ? w / 2 : ((p.t - t0) / (t1 - t0)) * w,
    y: h - ((p.v - lo) / (hi - lo)) * h,
  }));
}

export function pathOf(points: Scaled[]): string {
  return points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}
