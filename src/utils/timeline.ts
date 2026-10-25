// Placement des blocs de la frise horaire : les activités qui se chevauchent sont mises côte à côte.

export interface Span {
  id: string;
  start: number; // minutes
  end: number; // minutes
}

export interface Placed extends Span {
  lane: number;
  lanes: number;
}

export function layoutLanes(spans: Span[]): Placed[] {
  const sorted = spans.slice().sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Placed[] = [];
  let cluster: Placed[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((x) => x.lane + 1));
    cluster.forEach((x) => (x.lanes = lanes));
    cluster = [];
  };
  for (const s of sorted) {
    if (cluster.length && s.start >= clusterEnd) flush();
    const used = cluster.filter((x) => x.end > s.start).map((x) => x.lane);
    let lane = 0;
    while (used.includes(lane)) lane++;
    const p: Placed = { ...s, lane, lanes: 1 };
    cluster.push(p);
    out.push(p);
    clusterEnd = Math.max(clusterEnd, s.end);
  }
  if (cluster.length) flush();
  return out;
}

/** Minutes par catégorie et total, pour le résumé et la barre de répartition. */
export function minutesByKey<K extends string>(items: { key: K; minutes: number }[]): { total: number; by: Partial<Record<K, number>> } {
  const by: Partial<Record<K, number>> = {};
  let total = 0;
  for (const it of items) {
    const m = Math.max(0, it.minutes);
    by[it.key] = (by[it.key] ?? 0) + m;
    total += m;
  }
  return { total, by };
}
