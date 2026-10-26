import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../components/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { remainingLabel } from './assistantUtils';
import { useAiQuota, useAiSettings, useSaveAiSettings } from './useAssistant';
import styles from './Assistant.module.css';

function usePremiumInterest() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['premium_interest', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.from('premium_interest').select('user_id').maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });
}

/** Bloc « Assistante » de Mon compte : offre, messages restants, mode automatique, mémoire, Premium. */
export function AssistantAccount({ onNavigate }: { onNavigate: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const quota = useAiQuota().data;
  const settings = useAiSettings().data;
  const save = useSaveAiSettings();
  const interest = usePremiumInterest();
  const mark = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('premium_interest').upsert({ user_id: user?.id }, { onConflict: 'user_id', ignoreDuplicates: true });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.setQueryData(['premium_interest', user?.id], true);
      toast('Merci ! On te prévient dès que Premium arrive.');
    },
    onError: () => toast("Non enregistré : vérifie ta connexion."),
  });

  return (
    <div className="list">
      <div className="card">
        <div className="between">
          <span>
            Ton offre : <strong>{quota?.plan === 'premium' ? 'Premium' : 'Gratuite'}</strong>
          </span>
          <span className="small muted">{remainingLabel(quota?.remaining)}</span>
        </div>
        <label className={styles.autoRow}>
          <input type="checkbox" checked={!!settings?.auto_apply} onChange={(e) => save.mutate({ auto_apply: e.target.checked })} />
          <span>Laisser l'assistante modifier mon emploi du temps</span>
        </label>
        <button
          type="button"
          className="linkbtn"
          onClick={() => {
            onNavigate();
            navigate('/assistante/memoire');
          }}
        >
          Ce que l'assistante sait de moi
        </button>
      </div>
      {quota?.plan !== 'premium' && (
        <div className={styles.premium}>
          <div className="label">LifeBook Premium · bientôt disponible</div>
          <ul>
            <li>Une assistante plus puissante</li>
            <li>Plus de messages chaque jour</li>
            <li>Le bilan de ta semaine</li>
            <li>Le livre de ta vie</li>
          </ul>
          <button type="button" className="btn outline sm" disabled={interest.data || mark.isPending} onClick={() => mark.mutate()}>
            {interest.data ? 'Intérêt enregistré ✓' : 'Je suis intéressé(e)'}
          </button>
        </div>
      )}
    </div>
  );
}
