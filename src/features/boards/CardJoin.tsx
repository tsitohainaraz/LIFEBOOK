import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../components/Toast';
import type { CardJoinRequestRow, CardRow } from '../../types/database';
import { useAnswerJoin } from '../notifications/useNotifications';
import { memberName, type BoardData } from './useBoards';
import styles from './Boards.module.css';

/** « Je veux participer » pour qui n'est pas assigné ; demandes en attente pour le créateur et les propriétaires. */
export function CardJoin({ card, data, assigned }: { card: CardRow; data: BoardData; assigned: Set<string> }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const answer = useAnswerJoin();
  const canAnswer = card.created_by === user?.id || data.myRole === 'owner';
  const key = ['card_join_requests', card.id];

  const q = useQuery({
    queryKey: key,
    enabled: !!user,
    retry: false,
    queryFn: async (): Promise<CardJoinRequestRow[]> => {
      const { data: rows, error } = await supabase.from('card_join_requests').select('*').eq('card_id', card.id).eq('status', 'pending');
      if (error) throw error;
      return rows;
    },
  });

  const ask = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('request_card_join', { p_card: card.id });
      if (error) throw error;
    },
    onSuccess: () => toast('Demande envoyée'),
    onError: () => toast("La demande n'a pas pu être envoyée."),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  if (q.isError) return null;
  const pending = q.data ?? [];
  const mine = pending.some((r) => r.user_id === user?.id);
  const isAssigned = !!user && assigned.has(user.id);
  const others = canAnswer ? pending.filter((r) => r.user_id !== user?.id) : [];

  return (
    <>
      {!isAssigned && !card.done_at && (
        <button type="button" className="btn outline sm" disabled={mine || ask.isPending} onClick={() => ask.mutate()}>
          {mine ? 'Demande envoyée · en attente' : 'Je veux participer'}
        </button>
      )}
      {others.map((r) => {
        const who = data.members.find((m) => m.user_id === r.user_id);
        return (
          <div key={r.id} className={styles.joinRow}>
            <span className="small">
              <b>{who ? memberName(who) : 'Quelqu’un'}</b> veut participer
            </span>
            <div className="row">
              <button
                type="button"
                className="btn primary sm"
                disabled={answer.isPending}
                onClick={() => answer.mutate({ requestId: r.id, accept: true }, { onError: () => toast("Réponse non enregistrée.") })}
              >
                Accepter
              </button>
              <button
                type="button"
                className="btn sm"
                disabled={answer.isPending}
                onClick={() => answer.mutate({ requestId: r.id, accept: false }, { onError: () => toast("Réponse non enregistrée.") })}
              >
                Refuser
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}
