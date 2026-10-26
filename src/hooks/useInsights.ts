import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { computeInsights, type InsightAggregates, type Insights } from '../utils/insights';

/** Analyses des 28 derniers jours (get_insights, RLS appliquée), résumées par computeInsights. */
export function useInsights(days = 28) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['insights', user?.id, days],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Insights | null> => {
      const { data, error } = await supabase.rpc('get_insights', { days });
      if (error) return null;
      return data ? computeInsights(data as unknown as InsightAggregates) : null;
    },
  });
}
