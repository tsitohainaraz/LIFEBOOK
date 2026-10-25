import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { nowISO } from '../../lib/serverTime';
import { Sheet } from '../../components/Sheet';
import { useToast } from '../../components/Toast';

/** Termine une carte et la range dans la liste « Fait » de son tableau si elle existe. */
export async function markCardDone(cardId: string): Promise<void> {
  const { data: card, error } = await supabase.from('cards').select('board_id').eq('id', cardId).single();
  if (error) throw error;
  const { data: lists } = await supabase.from('lists').select('id, title').eq('board_id', card.board_id);
  const done = (lists ?? []).find((l) => /^fait$/i.test(l.title.trim()));
  const { error: e2 } = await supabase
    .from('cards')
    .update({ done_at: nowISO(), ...(done ? { list_id: done.id } : {}) })
    .eq('id', cardId);
  if (e2) throw e2;
}

/**
 * Après avoir coché une tâche liée à une carte : « Marquer aussi la carte comme faite ? ».
 * `ask` ouvre la question ; `element` doit être rendu par l'écran.
 */
export function useCardDonePrompt(): { ask: (task: { card_id: string | null; title: string }, cardTitle?: string) => void; element: ReactNode } {
  const qc = useQueryClient();
  const toast = useToast();
  const [pending, setPending] = useState<{ cardId: string; title: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const ask = (task: { card_id: string | null; title: string }, cardTitle?: string) => {
    if (task.card_id) setPending({ cardId: task.card_id, title: cardTitle ?? task.title });
  };

  const element = pending ? (
    <Sheet title="Marquer aussi la carte comme faite ?" onClose={() => setPending(null)}>
      <p className="small" style={{ margin: 0 }}>
        Cette tâche est liée à la carte « {pending.title} ». Veux-tu la terminer aussi dans son tableau ?
      </p>
      <div className="grid2">
        <button type="button" className="btn" onClick={() => setPending(null)}>
          Non, merci
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await markCardDone(pending.cardId);
              void qc.invalidateQueries({ queryKey: ['board'] });
              void qc.invalidateQueries({ queryKey: ['my-cards'] });
              void qc.invalidateQueries({ queryKey: ['linked-cards'] });
              toast('Carte terminée, bravo !');
              setPending(null);
            } catch {
              toast("La carte n'a pas pu être terminée.");
            } finally {
              setBusy(false);
            }
          }}
        >
          Oui, carte faite
        </button>
      </div>
    </Sheet>
  ) : null;

  return { ask, element };
}
