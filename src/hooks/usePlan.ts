import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Json, PlanPeriod, PlanRow, Priority } from '../types/database';

export function usePlan(period: PlanPeriod, periodStart: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['plan', user?.id, period, periodStart],
    enabled: !!user,
    queryFn: async (): Promise<PlanRow | null> => {
      const { data, error } = await supabase
        .from('plans')
        .select('*')
        .eq('period', period)
        .eq('period_start', periodStart)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Plans d'une période sur un intervalle (ex. les 4 trimestres d'une année). */
export function usePlansRange(period: PlanPeriod, from: string, to: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['plan', user?.id, period, 'range', from, to],
    enabled: !!user,
    queryFn: async (): Promise<PlanRow[]> => {
      const { data, error } = await supabase
        .from('plans')
        .select('*')
        .eq('period', period)
        .gte('period_start', from)
        .lte('period_start', to);
      if (error) throw error;
      return data;
    },
  });
}

export interface PlanPatch {
  theme?: string | null;
  priorities?: Priority[];
  extra?: { [key: string]: Json | undefined };
}

/** Crée ou met à jour le plan d'une période (mise à jour optimiste du cache). */
export function useSavePlan(period: PlanPeriod, periodStart: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const key = ['plan', user?.id, period, periodStart];
  return useMutation({
    mutationFn: async (patch: PlanPatch) => {
      const current = qc.getQueryData<PlanRow | null>(key);
      const { data, error } = await supabase
        .from('plans')
        .upsert(
          {
            user_id: user?.id,
            period,
            period_start: periodStart,
            theme: patch.theme !== undefined ? patch.theme : (current?.theme ?? null),
            priorities: patch.priorities ?? current?.priorities ?? [],
            extra: patch.extra ?? current?.extra ?? {},
          },
          { onConflict: 'user_id,period,period_start' },
        )
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<PlanRow | null>(key);
      const base: PlanRow = previous ?? {
        id: 'temp',
        user_id: user?.id ?? '',
        period,
        period_start: periodStart,
        theme: null,
        priorities: [],
        extra: {},
        created_at: '',
        updated_at: '',
      };
      qc.setQueryData<PlanRow>(key, { ...base, ...patch } as PlanRow);
      return { previous };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(key, ctx?.previous ?? null),
    onSuccess: (row) => qc.setQueryData(key, row),
    onSettled: () => qc.invalidateQueries({ queryKey: ['plan', user?.id, period, 'range'] }),
  });
}

/** Toujours 3 priorités, même si le plan en contient moins. */
export function threePriorities(list: Priority[] | null | undefined): Priority[] {
  const p = (list ?? []).slice(0, 3);
  while (p.length < 3) p.push({ text: '', done: false });
  return p;
}
