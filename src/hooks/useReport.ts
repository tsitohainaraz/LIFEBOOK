import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Database, ReportPeriod, ReportRow } from '../types/database';

type ReportInsert = Database['public']['Tables']['reports']['Insert'];

export function useReport(period: ReportPeriod, periodStart: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['report', user?.id, period, periodStart],
    enabled: !!user,
    queryFn: async (): Promise<ReportRow | null> => {
      const { data, error } = await supabase
        .from('reports')
        .select('*')
        .eq('period', period)
        .eq('period_start', periodStart)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useReportsRange(period: ReportPeriod, from: string, to: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['report', user?.id, period, 'range', from, to],
    enabled: !!user,
    queryFn: async (): Promise<ReportRow[]> => {
      const { data, error } = await supabase
        .from('reports')
        .select('*')
        .eq('period', period)
        .gte('period_start', from)
        .lte('period_start', to);
      if (error) throw error;
      return data;
    },
  });
}

export function useSaveReport() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (values: ReportInsert) => {
      const { data, error } = await supabase
        .from('reports')
        .upsert({ ...values, user_id: user?.id }, { onConflict: 'user_id,period,period_start' })
        .select('*')
        .single();
      if (error) throw error;
      // L'état de santé du rapport du jour alimente aussi le journal de santé.
      if (values.period === 'day' && values.wellbeing_pct != null) {
        await supabase.from('health_logs').insert({ wellbeing_pct: values.wellbeing_pct });
      }
      return data;
    },
    onSuccess: (row) => {
      qc.setQueryData(['report', user?.id, row.period, row.period_start], row);
      void qc.invalidateQueries({ queryKey: ['report', user?.id, row.period, 'range'] });
      void qc.invalidateQueries({ queryKey: ['past', user?.id] });
      void qc.invalidateQueries({ queryKey: ['wellbeing', user?.id] });
      void qc.invalidateQueries({ queryKey: ['health_logs', user?.id] });
    },
  });
}

