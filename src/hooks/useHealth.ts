import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Database, FamilyHistoryRow, HealthLogRow, HealthProfileRow } from '../types/database';
import type { HealthContext } from '../utils/health';

type HealthProfileInsert = Database['public']['Tables']['health_profiles']['Insert'];
type FamilyInsert = Database['public']['Tables']['family_history']['Insert'];
type HealthLogInsert = Database['public']['Tables']['health_logs']['Insert'];

export function useHealthProfile(enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['health_profile', user?.id],
    enabled: !!user && enabled,
    queryFn: async (): Promise<HealthProfileRow | null> => {
      const { data, error } = await supabase.from('health_profiles').select('*').maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useSaveHealthProfile() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (values: HealthProfileInsert) => {
      const { data, error } = await supabase
        .from('health_profiles')
        .upsert({ ...values, user_id: user?.id }, { onConflict: 'user_id' })
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (row) => qc.setQueryData(['health_profile', user?.id], row),
  });
}

export function useFamilyHistory(enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['family_history', user?.id],
    enabled: !!user && enabled,
    queryFn: async (): Promise<FamilyHistoryRow[]> => {
      const { data, error } = await supabase.from('family_history').select('*');
      if (error) throw error;
      return data;
    },
  });
}

export function useSaveFamilyHistory() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (rows: FamilyInsert[]) => {
      const { data, error } = await supabase
        .from('family_history')
        .upsert(
          rows.map((r) => ({ ...r, user_id: user?.id })),
          { onConflict: 'user_id,disease' },
        )
        .select('*');
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['family_history', user?.id] }),
  });
}

export function useHealthLogs(limit = 60) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['health_logs', user?.id, limit],
    enabled: !!user,
    queryFn: async (): Promise<HealthLogRow[]> => {
      const { data, error } = await supabase
        .from('health_logs')
        .select('*')
        .order('logged_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data;
    },
  });
}

/** Dernier « état de santé » en % (journal de santé ou rapport du jour). */
export function useLatestWellbeing() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['wellbeing', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<{ value: number; at: string } | null> => {
      const { data, error } = await supabase
        .from('health_logs')
        .select('wellbeing_pct, logged_at')
        .not('wellbeing_pct', 'is', null)
        .order('logged_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data && data.wellbeing_pct != null ? { value: data.wellbeing_pct, at: data.logged_at } : null;
    },
  });
}

export function useAddHealthLog() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (values: HealthLogInsert) => {
      const { data, error } = await supabase.from('health_logs').insert(values).select('*').single();
      if (error) throw error;
      // Le poids met à jour le profil santé pour recalculer l'IMC.
      if (values.weight_kg != null) {
        await supabase.from('health_profiles').upsert({ user_id: user?.id, weight_kg: values.weight_kg }, { onConflict: 'user_id' });
      }
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['health_logs', user?.id] });
      void qc.invalidateQueries({ queryKey: ['wellbeing', user?.id] });
      void qc.invalidateQueries({ queryKey: ['health_profile', user?.id] });
    },
  });
}

export function useDeleteHealthLog() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('health_logs').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['health_logs', user?.id] });
      void qc.invalidateQueries({ queryKey: ['wellbeing', user?.id] });
    },
  });
}

/** Contexte santé pour les recommandations (vide sans consentement). */
export function useHealthContext(): HealthContext {
  const { profile } = useAuth();
  const consent = !!profile?.health_consent_at;
  const h = useHealthProfile(consent).data;
  const fam = useFamilyHistory(consent).data;
  if (!consent) return {};
  return {
    systolic: h?.systolic,
    diastolic: h?.diastolic,
    conditions: h?.conditions ?? [],
    diabetes: h?.diabetes,
    height_cm: h?.height_cm,
    weight_kg: h?.weight_kg,
    familyYes: (fam ?? []).filter((r) => r.answer === 'oui').map((r) => r.disease),
  };
}
