import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { BucketItemRow, LifePlanRow } from '../types/database';
import { nowISO } from '../lib/serverTime';

type LifePatch = Partial<Pick<LifePlanRow, 'mission' | 'values' | 'wheel' | 'legacy'>>;

export function useLifePlan() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['life_plan', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<LifePlanRow | null> => {
      const { data, error } = await supabase.from('life_plan').select('*').maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Mission, valeurs, roue de la vie, héritage (mise à jour optimiste). */
export function useSaveLifePlan() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const key = ['life_plan', user?.id];
  return useMutation({
    mutationFn: async (patch: LifePatch) => {
      const { data, error } = await supabase
        .from('life_plan')
        .upsert({ user_id: user?.id, ...patch }, { onConflict: 'user_id' })
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<LifePlanRow | null>(key);
      if (previous) qc.setQueryData<LifePlanRow>(key, { ...previous, ...patch });
      return { previous };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(key, ctx?.previous ?? null),
    onSuccess: (row) => qc.setQueryData(key, row),
  });
}

export function useBucketItems() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['bucket', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<BucketItemRow[]> => {
      const { data, error } = await supabase.from('bucket_items').select('*').order('created_at');
      if (error) throw error;
      return data;
    },
  });
}

export function useBucketMutations() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const key = ['bucket', user?.id];

  const add = useMutation({
    mutationFn: async (title: string) => {
      const { data, error } = await supabase.from('bucket_items').insert({ title }).select('*').single();
      if (error) throw error;
      return data;
    },
    onSuccess: (row) => qc.setQueryData<BucketItemRow[]>(key, (l) => [...(l ?? []), row]),
  });

  const toggle = useMutation({
    mutationFn: async (item: BucketItemRow) => {
      const { error } = await supabase
        .from('bucket_items')
        .update({ done_at: item.done_at ? null : nowISO() })
        .eq('id', item.id);
      if (error) throw error;
    },
    onMutate: async (item) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<BucketItemRow[]>(key);
      qc.setQueryData<BucketItemRow[]>(key, (l) =>
        (l ?? []).map((b) => (b.id === item.id ? { ...b, done_at: item.done_at ? null : nowISO() } : b)),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(key, ctx?.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('bucket_items').delete().eq('id', id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<BucketItemRow[]>(key);
      qc.setQueryData<BucketItemRow[]>(key, (l) => (l ?? []).filter((b) => b.id !== id));
      return { previous };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(key, ctx?.previous),
  });

  return { add, toggle, remove };
}
