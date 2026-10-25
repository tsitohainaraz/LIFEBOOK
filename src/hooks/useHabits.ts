import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { HabitLogRow, HabitRow } from '../types/database';

export function useHabits() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['habits', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<HabitRow[]> => {
      const { data, error } = await supabase.from('habits').select('*').is('archived_at', null).order('created_at');
      if (error) throw error;
      return data;
    },
  });
}

/** Coches des habitudes depuis `from` (pour la grille du mois et les séries). */
export function useHabitLogs(from: string, to: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['habit_logs', user?.id, from, to],
    enabled: !!user,
    queryFn: async (): Promise<HabitLogRow[]> => {
      const { data, error } = await supabase.from('habit_logs').select('*').gte('date', from).lte('date', to);
      if (error) throw error;
      return data;
    },
  });
}

export function useHabitMutations() {
  const qc = useQueryClient();
  const { user } = useAuth();

  const addHabit = useMutation({
    mutationFn: async (values: { title: string; days_of_week?: number[] }) => {
      const { data, error } = await supabase.from('habits').insert(values).select('*').single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['habits', user?.id] }),
  });

  const archiveHabit = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('habits').update({ archived_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['habits', user?.id] }),
  });

  /** Coche ou décoche un jour (mise à jour optimiste de toutes les listes en cache). */
  const toggleDay = useMutation({
    mutationFn: async ({ habitId, date, done }: { habitId: string; date: string; done: boolean }) => {
      if (done) {
        const { error } = await supabase.from('habit_logs').delete().eq('habit_id', habitId).eq('date', date);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('habit_logs')
          .upsert({ habit_id: habitId, date, user_id: user?.id }, { onConflict: 'habit_id,date' });
        if (error) throw error;
      }
    },
    onMutate: async ({ habitId, date, done }) => {
      await qc.cancelQueries({ queryKey: ['habit_logs', user?.id] });
      const snapshot = qc.getQueriesData<HabitLogRow[]>({ queryKey: ['habit_logs', user?.id] });
      for (const [key, list] of snapshot) {
        if (!list) continue;
        qc.setQueryData<HabitLogRow[]>(
          key,
          done
            ? list.filter((l) => !(l.habit_id === habitId && l.date === date))
            : [
                ...list,
                { id: `temp-${habitId}-${date}`, habit_id: habitId, date, user_id: user?.id ?? '', created_at: '', updated_at: '' },
              ],
        );
      }
      return { snapshot };
    },
    onError: (_e, _v, ctx) => ctx?.snapshot.forEach(([key, value]) => qc.setQueryData(key, value)),
    onSettled: () => qc.invalidateQueries({ queryKey: ['habit_logs', user?.id] }),
  });

  return { addHabit, archiveHabit, toggleDay };
}
