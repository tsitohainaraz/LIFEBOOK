// Types de notifications : icône, libellé pour les réglages, groupe. Calculs purs, testés.
import type { NotificationRow } from '../../types/database';

export interface NotifType {
  type: string;
  icon: string;
  label: string;
  group: 'Cartes' | 'Discussion' | 'Équipe' | 'Échéances et rapports';
}

export const NOTIF_TYPES: NotifType[] = [
  { type: 'card_assigned', icon: '🗂', label: 'Une carte m’est assignée', group: 'Cartes' },
  { type: 'card_unassigned', icon: '↩', label: 'Je suis retiré d’une carte', group: 'Cartes' },
  { type: 'card_created', icon: '＋', label: 'Nouvelles cartes dans mes tableaux', group: 'Cartes' },
  { type: 'card_moved', icon: '⇄', label: 'Une de mes cartes est déplacée', group: 'Cartes' },
  { type: 'card_done', icon: '✓', label: 'Une de mes cartes est terminée', group: 'Cartes' },
  { type: 'card_due_changed', icon: '📅', label: 'L’échéance d’une de mes cartes change', group: 'Cartes' },
  { type: 'card_archived', icon: '🗄', label: 'Une de mes cartes est archivée', group: 'Cartes' },
  { type: 'card_deleted', icon: '🗑', label: 'Une de mes cartes est supprimée', group: 'Cartes' },
  { type: 'card_join_request', icon: '🙋', label: 'Quelqu’un veut rejoindre une carte', group: 'Cartes' },
  { type: 'card_join_answer', icon: '🙋', label: 'Réponse à ma demande', group: 'Cartes' },
  { type: 'card_comment', icon: '💬', label: 'Commentaire sur mes cartes', group: 'Discussion' },
  { type: 'mention', icon: '@', label: 'On me mentionne', group: 'Discussion' },
  { type: 'message', icon: '💬', label: 'Messages de la discussion', group: 'Discussion' },
  { type: 'member_joined', icon: '👋', label: 'Un membre rejoint un tableau', group: 'Équipe' },
  { type: 'role_changed', icon: '🔑', label: 'Mon rôle change', group: 'Équipe' },
  { type: 'report_posted', icon: '📝', label: 'Rapport du jour envoyé', group: 'Échéances et rapports' },
  { type: 'report_reminder', icon: '📝', label: 'Rappel du rapport à 18:00', group: 'Échéances et rapports' },
  { type: 'due_tomorrow', icon: '⏰', label: 'Échéance demain', group: 'Échéances et rapports' },
  { type: 'overdue', icon: '⚠️', label: 'Échéance dépassée', group: 'Échéances et rapports' },
];

const BY_TYPE = new Map(NOTIF_TYPES.map((t) => [t.type, t]));

export function iconOf(type: string): string {
  return BY_TYPE.get(type)?.icon ?? '•';
}

export const GROUPS = ['Cartes', 'Discussion', 'Équipe', 'Échéances et rapports'] as const;

export function typesByGroup(): { group: (typeof GROUPS)[number]; types: NotifType[] }[] {
  return GROUPS.map((group) => ({ group, types: NOTIF_TYPES.filter((t) => t.group === group) }));
}

export type NotifFilter = 'all' | 'unread' | 'read';

export function filterNotifications<T extends Pick<NotificationRow, 'read_at'>>(list: T[], filter: NotifFilter): T[] {
  if (filter === 'unread') return list.filter((n) => !n.read_at);
  if (filter === 'read') return list.filter((n) => !!n.read_at);
  return list;
}

export function counts(list: Pick<NotificationRow, 'read_at'>[]): Record<NotifFilter, number> {
  const unread = list.filter((n) => !n.read_at).length;
  return { all: list.length, unread, read: list.length - unread };
}

/** Coupe ou rétablit un type dans la liste des types coupés. */
export function toggleMuted(muted: string[], type: string, on: boolean): string[] {
  const set = new Set(muted);
  if (on) set.delete(type);
  else set.add(type);
  return [...set].sort();
}

/** Demande à rejoindre une carte encore en attente de réponse (non lue, avec un identifiant). */
export function pendingJoinRequestId(n: Pick<NotificationRow, 'type' | 'payload' | 'read_at'>): string | null {
  if (n.type !== 'card_join_request' || n.read_at) return null;
  const id = n.payload?.request_id;
  return typeof id === 'string' ? id : null;
}
