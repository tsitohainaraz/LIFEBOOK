import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { boardKey, type BoardData } from './useBoards';

/**
 * Temps réel d'un tableau : les changements de cartes, listes, checklists et membres invalident le cache,
 * et Realtime Presence donne la liste des membres connectés en ce moment.
 * Le désabonnement se fait en quittant l'écran.
 */
export function useBoardRealtime(boardId: string | undefined): Set<string> {
  const qc = useQueryClient();
  const { user, profile } = useAuth();
  const [online, setOnline] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!boardId || !user) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Regroupe les rafales d'évènements (un déplacement peut toucher plusieurs cartes).
    const refresh = (cardId?: string) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void qc.invalidateQueries({ queryKey: boardKey(boardId) });
        if (cardId) void qc.invalidateQueries({ queryKey: ['card', cardId] });
      }, 250);
    };
    const filter = `board_id=eq.${boardId}`;
    const channel = supabase
      .channel(`board:${boardId}`, { config: { presence: { key: user.id } } })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cards', filter }, (p) => {
        const row = (p.new && 'id' in p.new ? p.new : p.old) as { id?: string };
        refresh(row?.id);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lists', filter }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'board_members', filter }, () => refresh())
      // checklist_items n'a pas de board_id : la RLS ne transmet que les lignes visibles ; on garde celles de ce tableau.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checklist_items' }, (p) => {
        const row = (p.new && 'card_id' in p.new ? p.new : p.old) as { card_id?: string };
        const d = qc.getQueryData<BoardData | null>(boardKey(boardId));
        if (!row?.card_id || d?.cards.some((c) => c.id === row.card_id)) refresh(row?.card_id);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'card_comments' }, (p) => {
        const row = (p.new && 'card_id' in p.new ? p.new : p.old) as { card_id?: string };
        if (row?.card_id) void qc.invalidateQueries({ queryKey: ['card', row.card_id] });
      })
      .on('presence', { event: 'sync' }, () => {
        setOnline(new Set(Object.keys(channel.presenceState())));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void channel.track({ user_id: user.id, first_name: profile?.first_name ?? '' });
      });

    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [boardId, user, profile?.first_name, qc]);

  return online;
}
