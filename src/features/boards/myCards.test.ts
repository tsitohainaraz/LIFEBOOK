import { describe, expect, it } from 'vitest';
import { cardAsTask, cardsProgress, isCardTask, urgentCards, type MyCard } from './myCards';
import { goalProgress } from '../../utils/goals';
import { pickNow } from '../../utils/now';

const card = (id: string, due_date: string | null, due_time: string | null = null, done = false): MyCard => ({
  id,
  board_id: 'b',
  boardTitle: 'Projet',
  boardColor: '#c6f432',
  title: `Carte ${id}`,
  due_date,
  due_time,
  done_at: done ? 'x' : null,
  list_id: 'l',
});

describe('cardAsTask', () => {
  it('donne une tâche d’1 h à l’heure de l’échéance', () => {
    const t = cardAsTask(card('c1', '2026-10-26', '15:00:00'));
    expect(t).toMatchObject({ id: 'card:c1', date: '2026-10-26', start_time: '15:00', end_time: '16:00', card_id: 'c1' });
    expect(isCardTask(t)).toBe(true);
    expect(cardAsTask(card('c2', '2026-10-26')).start_time).toBeNull();
  });
  it('apparaît dans le cercle Maintenant', () => {
    const r = pickNow([cardAsTask(card('c1', '2026-10-26', '15:00'))], new Date(2026, 9, 26, 15, 20));
    expect(r.mode).toBe('now');
    expect(r.task?.id).toBe('card:c1');
  });
});

describe('urgentCards', () => {
  it('garde les cartes en retard ou dues dans les 48 h', () => {
    const r = urgentCards(
      [card('loin', '2026-11-10'), card('retard', '2026-10-20'), card('demain', '2026-10-27'), card('fait', '2026-10-26', null, true), card('j2', '2026-10-28')],
      '2026-10-26',
    );
    expect(r.map((c) => c.id)).toEqual(['retard', 'demain', 'j2']);
  });
});

describe('progression d’un objectif relié à un tableau', () => {
  it('compte les cartes terminées', () => {
    expect(cardsProgress([{ done_at: 'x' }, { done_at: null }])).toEqual({ done: 1, total: 2 });
  });
  it('s’ajoute aux étapes et aux tâches liées', () => {
    expect(goalProgress([{ done_at: 'x' }], [], { done: 1, total: 3 })).toEqual({ done: 2, total: 4, ratio: 0.5 });
  });
});
