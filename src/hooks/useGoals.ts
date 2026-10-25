import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Database, GoalRow, GoalStepRow } from '../types/database';

type GoalInsert = Database['public']['Tables']['goals']['Insert'];
type GoalUpdate = Database['public']['Tables']['goals']['Update'];
type StepInsert = Database['public']['Tables']['goal_steps']['Insert'];
type StepUpdate = Database['public']['Tables']['goal_steps']['Update'];

/** Tous les objectifs de la personne (vie, année, mois, semaine). */
export function useGoals() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['goals', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<GoalRow[]> => {
      const { data, error } = await supabase.from('goals').select('*').order('deadline', { nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useGoalSteps() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['goal_steps', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<GoalStepRow[]> => {
      const { data, error } = await supabase.from('goal_steps').select('*').order('due_date', { nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useGoalMutations() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const goalsKey = ['goals', user?.id];
  const stepsKey = ['goal_steps', user?.id];

  const addGoal = useMutation({
    mutationFn: async (values: GoalInsert) => {
      const { data, error } = await supabase.from('goals').insert(values).select('*').single();
      if (error) throw error;
      return data;
    },
    onSuccess: (row) => qc.setQueryData<GoalRow[]>(goalsKey, (list) => [...(list ?? []), row]),
  });

  const updateGoal = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: GoalUpdate }) => {
      const { data, error } = await supabase.from('goals').update(values).eq('id', id).select('*').single();
      if (error) throw error;
      return data;
    },
    onMutate: async ({ id, values }) => {
      await qc.cancelQueries({ queryKey: goalsKey });
      const previous = qc.getQueryData<GoalRow[]>(goalsKey);
      qc.setQueryData<GoalRow[]>(goalsKey, (list) => (list ?? []).map((g) => (g.id === id ? { ...g, ...values } : g)));
      return { previous };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(goalsKey, ctx?.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: goalsKey }),
  });

  const deleteGoal = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('goals').delete().eq('id', id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: goalsKey });
      const previous = qc.getQueryData<GoalRow[]>(goalsKey);
      qc.setQueryData<GoalRow[]>(goalsKey, (list) => (list ?? []).filter((g) => g.id !== id));
      return { previous };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(goalsKey, ctx?.previous),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: goalsKey });
      void qc.invalidateQueries({ queryKey: stepsKey });
      void qc.invalidateQueries({ queryKey: ['tasks', user?.id] });
    },
  });

  const addStep = useMutation({
    mutationFn: async (values: StepInsert) => {
      const { data, error } = await supabase.from('goal_steps').insert(values).select('*').single();
      if (error) throw error;
      return data;
    },
    onSuccess: (row) => qc.setQueryData<GoalStepRow[]>(stepsKey, (list) => [...(list ?? []), row]),
  });

  const updateStep = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: StepUpdate }) => {
      const { data, error } = await supabase.from('goal_steps').update(values).eq('id', id).select('*').single();
      if (error) throw error;
      return data;
    },
    onMutate: async ({ id, values }) => {
      await qc.cancelQueries({ queryKey: stepsKey });
      const previous = qc.getQueryData<GoalStepRow[]>(stepsKey);
      qc.setQueryData<GoalStepRow[]>(stepsKey, (list) => (list ?? []).map((s) => (s.id === id ? { ...s, ...values } : s)));
      return { previous };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(stepsKey, ctx?.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: stepsKey }),
  });

  const deleteStep = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('goal_steps').delete().eq('id', id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: stepsKey });
      const previous = qc.getQueryData<GoalStepRow[]>(stepsKey);
      qc.setQueryData<GoalStepRow[]>(stepsKey, (list) => (list ?? []).filter((s) => s.id !== id));
      return { previous };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(stepsKey, ctx?.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: stepsKey }),
  });

  return { addGoal, updateGoal, deleteGoal, addStep, updateStep, deleteStep };
}
