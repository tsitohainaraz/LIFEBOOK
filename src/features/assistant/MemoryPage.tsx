import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '../../components/Icon';
import { ErrorState, LoadingState } from '../../components/States';
import { ToastProvider, useToast } from '../../components/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import type { AiMemoryKind, AiMemoryRow } from '../../types/database';
import { useAiSettings, useSaveAiSettings } from './useAssistant';
import styles from './Assistant.module.css';

const KIND_LABEL: Record<AiMemoryKind, string> = { preference: 'Préférence', contrainte: 'Contrainte', objectif: 'Objectif', sante: 'Santé' };

export function MemoryPage() {
  return (
    <ToastProvider>
      <Memory />
    </ToastProvider>
  );
}

function Memory() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const key = ['ai_memory', user?.id];
  const settings = useAiSettings();
  const saveSettings = useSaveAiSettings();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirmAll, setConfirmAll] = useState(false);

  const q = useQuery({
    queryKey: key,
    enabled: !!user,
    queryFn: async (): Promise<AiMemoryRow[]> => {
      const { data, error } = await supabase.from('ai_memory').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, text }: { id: string; text: string }) => {
      const { error } = await supabase.from('ai_memory').update({ text }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => setEditing(null),
    onError: () => toast('Non enregistré : vérifie ta connexion.'),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ai_memory').delete().eq('id', id);
      if (error) throw error;
    },
    onError: () => toast('Non supprimé : vérifie ta connexion.'),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
  const eraseAll = useMutation({
    mutationFn: async () => {
      const a = await supabase.from('ai_memory').delete().eq('user_id', user!.id);
      if (a.error) throw a.error;
      const b = await supabase.from('ai_conversations').delete().eq('user_id', user!.id);
      if (b.error) throw b.error;
    },
    onSuccess: () => {
      setConfirmAll(false);
      toast('Souvenirs et conversations effacés');
    },
    onError: () => toast("L'effacement n'a pas abouti. Réessaie."),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: ['ai_conversations', user?.id] });
      void qc.invalidateQueries({ queryKey: ['ai_messages', user?.id] });
    },
  });

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <button type="button" className="iconbtn" aria-label="Retour" onClick={() => navigate(-1)}>
          <Icon name="left" />
        </button>
        <div className={styles.headTitle}>
          <strong>Ce que l'assistante sait de moi</strong>
        </div>
      </header>
      <div className={styles.scroller}>
        <div className="card">
          <label className={styles.autoRow}>
            <input type="checkbox" checked={settings.data?.use_health ?? true} onChange={(e) => saveSettings.mutate({ use_health: e.target.checked })} />
            <span>Utiliser mes données de santé (un résumé en mots, jamais tes mesures)</span>
          </label>
          <label className={styles.autoRow}>
            <input type="checkbox" checked={!!settings.data?.auto_apply} onChange={(e) => saveSettings.mutate({ auto_apply: e.target.checked })} />
            <span>Mode automatique : laisser l'assistante modifier mon emploi du temps</span>
          </label>
        </div>

        <div className="card">
          <div className="label">Souvenirs</div>
          {q.isLoading ? (
            <LoadingState />
          ) : q.isError ? (
            <ErrorState message="Impossible de charger les souvenirs." onRetry={() => void q.refetch()} />
          ) : !q.data?.length ? (
            <p className="empty">Aucun souvenir pour l'instant. Quand l'assistante propose de retenir quelque chose et que tu acceptes, cela apparaît ici.</p>
          ) : (
            q.data.map((m) => (
              <div key={m.id} className={styles.memory}>
                <span className="chip">{KIND_LABEL[m.kind]}</span>
                {editing === m.id ? (
                  <form
                    className={styles.inputRow}
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (draft.trim()) update.mutate({ id: m.id, text: draft.trim().slice(0, 500) });
                    }}
                  >
                    <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={500} aria-label="Modifier le souvenir" autoFocus />
                    <button type="submit" className="btn primary sm" disabled={update.isPending}>
                      OK
                    </button>
                  </form>
                ) : (
                  <div className="between">
                    <span className={styles.memoryText}>{m.text}</span>
                    <div className="row">
                      <button
                        type="button"
                        className="iconbtn"
                        aria-label="Modifier"
                        onClick={() => {
                          setEditing(m.id);
                          setDraft(m.text);
                        }}
                      >
                        <Icon name="pen" />
                      </button>
                      <button type="button" className="iconbtn" aria-label="Supprimer" onClick={() => remove.mutate(m.id)}>
                        <Icon name="trash" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {!confirmAll ? (
          <button type="button" className="btn danger block" onClick={() => setConfirmAll(true)}>
            Tout effacer
          </button>
        ) : (
          <div className="card">
            <p className="error-text" style={{ margin: 0 }}>
              Tous les souvenirs et toutes les conversations seront effacés définitivement.
            </p>
            <button type="button" className="btn danger block" disabled={eraseAll.isPending} onClick={() => eraseAll.mutate()}>
              {eraseAll.isPending ? 'Effacement…' : 'Confirmer'}
            </button>
            <button type="button" className="btn block" onClick={() => setConfirmAll(false)}>
              Annuler
            </button>
          </div>
        )}
        <p className={styles.disclaimer}>L'assistante peut se tromper. Elle ne remplace pas l'avis d'un médecin.</p>
      </div>
    </div>
  );
}
