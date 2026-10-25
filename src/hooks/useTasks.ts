import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Database, TaskRow } from '../types/database';

export type TaskInsert = Database['public']['Tables']['tasks']['Insert'];
export type TaskUpdate = Database['public']['Tables']['tasks']['Update'];

const sortTasks = (a: TaskRow, b: TaskRow) =>
  a.date.localeCompare(b.date) || (a.start_time ?? '99').localeCompare(b.start_time ?? '99') || a.title.localeCompare(b.title);

/** Tâches entre deux dates incluses (AAAA-MM-JJ). */
export function useTasksRange(from: string, to: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['tasks', user?.id, from, to],
    enabled: !!user,
    queryFn: async (): Promise<TaskRow[]> => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .gte('date', from)
        .lte('date', to)
        .order('date')
        .order('start_time', { nullsFirst: false });
      if (error) throw error;
      return data.slice().sort(sortTasks);
    },
  });
}

export function useTasksOn(date: string) {
  return useTasksRange(date, date);
}

/** Tâches liées à des objectifs (pour la progression des objectifs). */
export function useGoalTasks() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['tasks', user?.id, 'goal-links'],
    enabled: !!user,
    queryFn: async (): Promise<Pick<TaskRow, 'id' | 'goal_id' | 'done_at'>[]> => {
      const { data, error } = await supabase.from('tasks').select('id, goal_id, done_at').not('goal_id', 'is', null);
      if (error) throw error;
      return data;
    },
  });
}

type Snapshot = [readonly unknown[], unknown][];

/** Applique une modification à toutes les listes de tâches en cache. */
function patchTaskLists(qc: QueryClient, userId: string | undefined, fn: (list: TaskRow[]) => TaskRow[]): Snapshot {
  const snapshot = qc.getQueriesData<unknown>({ queryKey: ['tasks', userId] }) as Snapshot;
  for (const [key, value] of snapshot) {
    if (Array.isArray(value) && key[2] !== 'goal-links') {
      qc.setQueryData<TaskRow[]>(key, fn(value as TaskRow[]));
    }
  }
  return snapshot;
}

function restore(qc: QueryClient, snapshot: Snapshot | undefined) {
  snapshot?.forEach(([key, value]) => qc.setQueryData(key, value));
}

export function useAddTasks() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (rows: TaskInsert[]) => {
      const { data, error } = await supabase.from('tasks').insert(rows).select('*');
      if (error) throw error;
      return data;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['tasks', user?.id] }),
  });
}

/** Modifie une tâche avec mise à jour optimiste (cocher, reporter, éditer). */
export function useUpdateTask() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: TaskUpdate }) => {
      const { data, error } = await supabase.from('tasks').update(values).eq('id', id).select('*').single();
      if (error) throw error;
      return data;
    },
    onMutate: async ({ id, values }) => {
      await qc.cancelQueries({ queryKey: ['tasks', user?.id] });
      const snapshot = patchTaskLists(qc, user?.id, (list) =>
        list.map((t) => (t.id === id ? { ...t, ...values } : t)).sort(sortTasks),
      );
      return { snapshot };
    },
    onError: (_e, _v, ctx) => restore(qc, ctx?.snapshot),
    onSettled: () => qc.invalidateQueries({ queryKey: ['tasks', user?.id] }),
  });
}

export function useToggleTask() {
  const update = useUpdateTask();
  return {
    ...update,
    toggle: (task: Pick<TaskRow, 'id' | 'done_at'>) =>
      update.mutateAsync({ id: task.id, values: { done_at: task.done_at ? null : new Date().toISOString() } }),
  };
}

/** Supprime une tâche, ou toutes les occurrences suivantes d'une répétition. */
export function useDeleteTask() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (args: { id: string } | { group: string; fromDate: string }) => {
      const query =
        'id' in args
          ? supabase.from('tasks').delete().eq('id', args.id)
          : supabase.from('tasks').delete().eq('recurrence_group', args.group).gte('date', args.fromDate);
      const { error } = await query;
      if (error) throw error;
    },
    onMutate: async (args) => {
      await qc.cancelQueries({ queryKey: ['tasks', user?.id] });
      const snapshot = patchTaskLists(qc, user?.id, (list) =>
        list.filter((t) =>
          'id' in args ? t.id !== args.id : !(t.recurrence_group === args.group && t.date >= args.fromDate),
        ),
      );
      return { snapshot };
    },
    onError: (_e, _v, ctx) => restore(qc, ctx?.snapshot),
    onSettled: () => qc.invalidateQueries({ queryKey: ['tasks', user?.id] }),
  });
}
