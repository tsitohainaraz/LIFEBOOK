import { describe, expect, it } from 'vitest';
import { counts, filterNotifications, iconOf, NOTIF_TYPES, pendingJoinRequestId, toggleMuted, typesByGroup } from './notifUtils';

const list = [{ read_at: null }, { read_at: '2026-10-26T10:00:00Z' }, { read_at: null }];

describe('notifications', () => {
  it('filtres lu / non lu et compteurs', () => {
    expect(filterNotifications(list, 'unread').length).toBe(2);
    expect(filterNotifications(list, 'read').length).toBe(1);
    expect(filterNotifications(list, 'all').length).toBe(3);
    expect(counts(list)).toEqual({ all: 3, unread: 2, read: 1 });
  });

  it('réglages : couper puis rétablir un type', () => {
    const m = toggleMuted([], 'card_moved', false);
    expect(m).toEqual(['card_moved']);
    expect(toggleMuted(m, 'card_moved', true)).toEqual([]);
    expect(toggleMuted(['a'], 'a', false)).toEqual(['a']);
  });

  it('catalogue : chaque type a une icône et un groupe', () => {
    expect(new Set(NOTIF_TYPES.map((t) => t.type)).size).toBe(NOTIF_TYPES.length);
    expect(typesByGroup().reduce((n, g) => n + g.types.length, 0)).toBe(NOTIF_TYPES.length);
    expect(iconOf('card_moved')).toBe('⇄');
    expect(iconOf('inconnu')).toBe('•');
  });

  it('demande pour rejoindre une carte : boutons seulement si en attente', () => {
    expect(pendingJoinRequestId({ type: 'card_join_request', payload: { request_id: 'r1' }, read_at: null })).toBe('r1');
    expect(pendingJoinRequestId({ type: 'card_join_request', payload: { request_id: 'r1' }, read_at: 'x' })).toBeNull();
    expect(pendingJoinRequestId({ type: 'mention', payload: {}, read_at: null })).toBeNull();
  });
});
