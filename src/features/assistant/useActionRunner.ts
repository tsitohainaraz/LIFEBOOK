// Application des actions proposées par l'assistante, avec les hooks existants (jamais par la fonction).
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useGoalMutations } from '../../hooks/useGoals';
import { useAddTasks, useDeleteTask, useUpdateTask } from '../../hooks/useTasks';
import type { AiActionStatus, AiMemoryKind, Category, GoalDomain, GoalLevel, Json, Priority, TaskRow } from '../../types/database';
import type { PlanOp } from '../../utils/planOps';
import { resolveRefs, type StoredAction } from './assistantUtils';

export function useActionRunner() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const addTasks = useAddTasks();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const { addGoal, addStep } = useGoalMutations();

  /** Applique des opérations sur les tâches ; renvoie les opérations inverses (vrais identifiants). */
  async function runOps(ops: PlanOp[]): Promise<PlanOp[]> {
    const refs = new Map<string, string>();
    const inverse: PlanOp[] = [];
    const ids = ops.flatMap((o) => (o.op === 'create' ? [] : [o.id]));
    const current = new Map<string, TaskRow>();
    if (ids.length) {
      const { data, error } = await supabase.from('tasks').select('*').in('id', ids);
      if (error) throw error;
      for (const t of data) current.set(t.id, t);
    }
    for (const raw of ops) {
      const op = resolveRefs(raw, refs);
      if (op.op === 'create') {
        const [row] = await addTasks.mutateAsync([
          {
            title: op.task.title,
            category: op.task.category as Category,
            date: op.task.date,
            start_time: op.task.start,
            end_time: op.task.end,
            goal_id: op.task.goal_id ?? null,
            is_priority: op.task.is_priority ?? false,
          },
        ]);
        if (op.ref) refs.set(op.ref, row.id);
        inverse.unshift({ op: 'delete', id: row.id });
        continue;
      }
      const cur = current.get(op.id);
      if (!cur) continue;
      if (op.op === 'delete') {
        await deleteTask.mutateAsync({ id: op.id });
        if (cur.start_time && cur.end_time) {
          inverse.unshift({
            op: 'create',
            task: { title: cur.title, category: cur.category, date: cur.date, start: cur.start_time.slice(0, 5), end: cur.end_time.slice(0, 5), goal_id: cur.goal_id, is_priority: cur.is_priority },
          });
        }
      } else if (op.op === 'move') {
        await updateTask.mutateAsync({ id: op.id, values: { date: op.date ?? cur.date, start_time: op.start, end_time: op.end } });
        inverse.unshift({ op: 'move', id: op.id, date: cur.date, start: (cur.start_time ?? op.start).slice(0, 5), end: (cur.end_time ?? op.end).slice(0, 5) });
      } else if (op.op === 'resize') {
        await updateTask.mutateAsync({ id: op.id, values: { end_time: op.end } });
        inverse.unshift({ op: 'resize', id: op.id, end: (cur.end_time ?? op.end).slice(0, 5) });
      } else {
        const values: { title?: string; category?: Category } = {};
        if (op.fields.title) values.title = op.fields.title;
        if (op.fields.category) values.category = op.fields.category as Category;
        await updateTask.mutateAsync({ id: op.id, values });
        inverse.unshift({ op: 'update', id: op.id, fields: { title: values.title ? cur.title : undefined, category: values.category ? cur.category : undefined } });
      }
    }
    return inverse;
  }

  async function setStatus(action: StoredAction, status: AiActionStatus, inverse?: PlanOp[]) {
    if (!action.id) return;
    await supabase.from('ai_actions').update(inverse ? { status, inverse: inverse as unknown as Json } : { status }).eq('id', action.id);
  }

  /** Applique une action ; renvoie ses opérations inverses (tâches) pour pouvoir annuler. */
  async function apply(action: StoredAction, status: AiActionStatus = 'accepted'): Promise<PlanOp[]> {
    let inverse: PlanOp[] = [];
    switch (action.type) {
      case 'task_ops':
        inverse = await runOps(action.ops);
        break;
      case 'day_priorities': {
        const priorities: Priority[] = action.priorities.map((text) => ({ text, done: false }));
        const { error } = await supabase
          .from('plans')
          .upsert(
            { user_id: user?.id, period: 'day', period_start: action.date, priorities, ...(action.intention ? { theme: action.intention } : {}) },
            { onConflict: 'user_id,period,period_start' },
          );
        if (error) throw error;
        void qc.invalidateQueries({ queryKey: ['plan', user?.id] });
        break;
      }
      case 'create_goal':
        await addGoal.mutateAsync({
          title: action.goal.title,
          domain: action.goal.domain as GoalDomain,
          level: action.goal.level as GoalLevel,
          deadline: action.goal.deadline,
          target_age: action.goal.target_age,
        });
        break;
      case 'add_goal_steps':
        for (const s of action.steps) await addStep.mutateAsync({ goal_id: action.goal_id, title: s.title, due_date: s.due_date });
        break;
      case 'remember': {
        const { error } = await supabase.from('ai_memory').insert({ kind: action.kind as AiMemoryKind, text: action.text, source: 'assistant' });
        if (error) throw error;
        void qc.invalidateQueries({ queryKey: ['ai_memory', user?.id] });
        break;
      }
    }
    await setStatus(action, status, action.type === 'task_ops' ? inverse : undefined);
    return inverse;
  }

  async function undo(actions: StoredAction[], inverses: PlanOp[][]) {
    for (let i = actions.length - 1; i >= 0; i--) {
      await runOps(inverses[i]);
      await setStatus(actions[i], 'undone');
    }
  }

  async function ignore(action: StoredAction) {
    await setStatus(action, 'ignored');
  }

  return { apply, undo, ignore, runOps };
}
