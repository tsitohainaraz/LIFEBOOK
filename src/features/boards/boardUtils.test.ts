import { describe, expect, it } from 'vitest';
import {
  cardDueStatus,
  extractMentions,
  inviteLink,
  isMissingTableError,
  mentionQuery,
  needsRenumber,
  planMove,
  positionAt,
  renumber,
} from './boardUtils';
import { inviteErrorMessage } from './pendingInvite';

describe('positionAt', () => {
  it('liste vide, début, milieu, fin', () => {
    expect(positionAt([], 0)).toBe(1000);
    expect(positionAt([1000, 2000], 0)).toBe(500);
    expect(positionAt([1000, 2000], 1)).toBe(1500);
    expect(positionAt([1000, 2000], 2)).toBe(3000);
  });
});

describe('needsRenumber et renumber', () => {
  it('détecte un écart trop petit', () => {
    expect(needsRenumber([1000, 1000.00005])).toBe(true);
    expect(needsRenumber([1000, 1500])).toBe(false);
    expect(needsRenumber([0.00001])).toBe(true);
  });
  it('renumérote 1000, 2000, …', () => {
    expect([...renumber(['a', 'b', 'c']).entries()]).toEqual([
      ['a', 1000],
      ['b', 2000],
      ['c', 3000],
    ]);
  });
});

describe('planMove', () => {
  const list = [
    { id: 'a', position: 1000 },
    { id: 'b', position: 2000 },
    { id: 'c', position: 3000 },
  ];
  it('déplace dans la même liste sans renuméroter', () => {
    expect(planMove(list, 'c', 0)).toEqual({ position: 500, renumbered: null });
    expect(planMove(list, 'a', 2)).toEqual({ position: 4000, renumbered: null });
  });
  it('insère dans une autre liste', () => {
    expect(planMove(list, 'x', 1).position).toBe(1500);
  });
  it('renumérote quand les positions se serrent', () => {
    const tight = [
      { id: 'a', position: 1000 },
      { id: 'b', position: 1000.00005 },
    ];
    const r = planMove(tight, 'x', 1);
    expect(r.renumbered && [...r.renumbered.entries()]).toEqual([
      ['a', 1000],
      ['x', 2000],
      ['b', 3000],
    ]);
    expect(r.position).toBe(2000);
  });
});

describe('isMissingTableError', () => {
  it('reconnaît les erreurs de table absente', () => {
    expect(isMissingTableError({ code: '42P01' })).toBe(true);
    expect(isMissingTableError({ code: 'PGRST205', message: "Could not find the table 'public.boards'" })).toBe(true);
    expect(isMissingTableError({ code: '23505' })).toBe(false);
    expect(isMissingTableError(null)).toBe(false);
  });
});

describe('mentions', () => {
  const members = [
    { id: 'u1', name: 'Aina' },
    { id: 'u2', name: 'Bako' },
  ];
  it('extrait les @mentions', () => {
    expect(extractMentions('Merci @Aina, et @bako !', members)).toEqual(['u1', 'u2']);
    expect(extractMentions('mail aina@x.mg', members)).toEqual([]);
  });
  it('repère le mot en cours après @', () => {
    expect(mentionQuery('Salut @Ai', 9)).toEqual({ start: 6, query: 'Ai' });
    expect(mentionQuery('Salut @', 7)).toEqual({ start: 6, query: '' });
    expect(mentionQuery('a@b', 3)).toBeNull();
  });
});

describe('cardDueStatus', () => {
  const T = '2026-10-26';
  it('classe les échéances', () => {
    expect(cardDueStatus({ due_date: '2026-10-25', done_at: null }, T)).toBe('late');
    expect(cardDueStatus({ due_date: T, done_at: null }, T)).toBe('today');
    expect(cardDueStatus({ due_date: '2026-10-28', done_at: null }, T)).toBe('soon');
    expect(cardDueStatus({ due_date: '2026-11-10', done_at: null }, T)).toBe('ok');
    expect(cardDueStatus({ due_date: '2026-10-01', done_at: 'x' }, T)).toBe('done');
    expect(cardDueStatus({ due_date: null, done_at: null }, T)).toBeNull();
  });
});

describe('inviteLink', () => {
  it('construit le lien', () => {
    expect(inviteLink('https://lifebook-rust.vercel.app/', 'ab_c-1')).toBe('https://lifebook-rust.vercel.app/invitation/ab_c-1');
  });
});

describe('inviteErrorMessage', () => {
  it('traduit les erreurs de accept_invite', () => {
    expect(inviteErrorMessage('invitation_expiree')).toMatch(/expiré/);
    expect(inviteErrorMessage('invitation_utilisee')).toMatch(/déjà été utilisée/);
    expect(inviteErrorMessage('invitation_introuvable')).toMatch(/introuvable/);
    expect(inviteErrorMessage(undefined)).toMatch(/Réessaie/);
  });
});
