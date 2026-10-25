import { describe, expect, it } from 'vitest';
import { collectPlannedItems, formatRelative, getUpcoming, phraseUpcoming, type PlannedItem } from './now';

// Lundi 26 octobre 2026, 10:00 (heure murale)
const NOW = new Date(2026, 9, 26, 10, 0, 0);
const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m, 0);
const item = (id: string, start: Date, mins = 60, done = false): PlannedItem => ({
  id,
  title: id,
  start,
  end: new Date(start.getTime() + mins * 60_000),
  category: 'autre',
  source: 'task',
  done,
});

describe('getUpcoming', () => {
  it('ignore la tâche en cours et renvoie les suivantes, au plus 3', () => {
    const r = getUpcoming(
      [item('en-cours', at(26, 9, 30)), item('a', at(26, 11)), item('b', at(26, 12)), item('c', at(26, 14)), item('d', at(26, 16))],
      NOW,
    );
    expect(r.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });
  it('trie et ignore les éléments faits', () => {
    const r = getUpcoming([item('tard', at(26, 18)), item('fait', at(26, 11), 60, true), item('tot', at(26, 12))], NOW, 2);
    expect(r.map((x) => x.id)).toEqual(['tot', 'tard']);
  });
  it('plus rien aujourd’hui : le premier élément de demain', () => {
    const r = getUpcoming([item('hier', at(25, 11)), item('demain2', at(27, 9)), item('demain1', at(27, 6))], NOW);
    expect(r.map((x) => x.id)).toEqual(['demain1']);
  });
  it('rien du tout', () => {
    expect(getUpcoming([], NOW)).toEqual([]);
    expect(getUpcoming([item('apres-demain', at(28, 9))], NOW)).toEqual([]);
  });
});

describe('formatRelative', () => {
  const rel = (start: Date) => formatRelative((start.getTime() - NOW.getTime()) / 60_000, start);
  it('maintenant, minutes, heures', () => {
    expect(rel(new Date(NOW.getTime() + 30_000))).toBe('maintenant');
    expect(rel(at(26, 10, 45))).toBe('dans 45 min');
    expect(rel(at(26, 12, 15))).toBe('dans 2 h 15');
    expect(rel(at(26, 12))).toBe('dans 2 h');
  });
  it('demain et au-delà', () => {
    expect(rel(at(27, 6))).toBe('demain à 06:00');
    expect(rel(at(29, 9))).toBe('jeudi à 09:00');
  });
});

describe('phraseUpcoming', () => {
  it('avec un verbe à l’infinitif', () => {
    expect(phraseUpcoming("Réviser l'examen", 'dans 2 h 15')).toBe("Dans 2 h 15, tu dois réviser l'examen selon ton plan");
    expect(phraseUpcoming('Faire du footing', 'demain à 06:00')).toBe('Demain à 06:00, tu dois faire du footing selon ton plan');
  });
  it('sans verbe', () => {
    expect(phraseUpcoming("Réunion d'équipe", 'dans 2 h 15')).toBe("Dans 2 h 15 : Réunion d'équipe, selon ton plan");
  });
});

describe('collectPlannedItems', () => {
  it('garde les tâches avec une heure et les cartes avec une échéance horaire', () => {
    const r = collectPlannedItems({
      tasks: [
        { id: 't1', date: '2026-10-26', title: 'Prier', start_time: '06:00:00', end_time: '06:30:00', done_at: null, category: 'spirituel' },
        { id: 't2', date: '2026-10-26', title: 'Sans heure', start_time: null, end_time: null, done_at: null, category: 'autre' },
      ],
      cards: [
        { id: 'c1', board_id: 'b1', boardName: 'Projet', title: 'Maquette', due_date: '2026-10-26', due_time: '15:00', done_at: null },
        { id: 'c2', board_id: 'b1', boardName: 'Projet', title: 'Sans heure', due_date: '2026-10-26', due_time: null, done_at: null },
      ],
    });
    expect(r.map((x) => x.id)).toEqual(['t1', 'card:c1']);
    expect(r[0].start.getHours()).toBe(6);
    expect(r[0].end.getMinutes()).toBe(30);
    expect(r[1]).toMatchObject({ source: 'card', boardName: 'Projet' });
    expect(r[1].end.getHours()).toBe(16);
  });
});
