import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { addDaysISO, hhmm, toMin, toTime } from '../../utils/dates';
import type { TaskRow } from '../../types/database';
import { isMissingTableError } from './boardUtils';

/** Carte qui m'est assignée, avec le nom et la couleur de son tableau. */
export interface MyCard {
  id: string;
  board_id: string;
  boardTitle: string;
  boardColor: string;
  title: string;
  due_date: string | null;
  due_time: string | null;
  done_at: string | null;
  list_id: string;
}

export const CARD_TASK_PREFIX = 'card:';

/** Une carte avec échéance horaire devient une « tâche » d'1 h pour la frise et le cercle Maintenant. */
export function cardAsTask(c: MyCard): TaskRow {
  const start = c.due_time ? hhmm(c.due_time) : null;
  return {
    id: CARD_TASK_PREFIX + c.id,
    user_id: '',
    date: c.due_date ?? '',
    start_time: start,
    end_time: start ? toTime(Math.min(toMin(start) + 60, 24 * 60 - 1)) : null,
    title: c.title,
    category: 'travail',
    is_priority: false,
    done_at: c.done_at,
    goal_id: null,
    reminder_min: null,
    recurrence_group: null,
    postponed_count: 0,
    card_id: c.id,
    created_at: '',
    updated_at: '',
  };
}

export const isCardTask = (t: { id: string }) => t.id.startsWith(CARD_TASK_PREFIX);

/** Cartes en retard ou dues dans les 48 h, non terminées, triées par échéance. */
export function urgentCards(cards: MyCard[], today: string): MyCard[] {
  const limit = addDaysISO(today, 2);
  return cards
    .filter((c) => !c.done_at && c.due_date && c.due_date <= limit)
    .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? '') || (a.due_time ?? '99').localeCompare(b.due_time ?? '99'));
}

/** Avancement d'un tableau : cartes terminées / total. */
export function cardsProgress(cards: { done_at: string | null }[]): { done: number; total: number } {
  return { done: cards.filter((c) => c.done_at).length, total: cards.length };
}

/** Mes cartes (assignées à moi) dont l'échéance est entre `from` (facultatif) et `to`. */
export function useMyCards(to: string, from?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['my-cards', user?.id, from ?? '', to],
    enabled: !!user,
    staleTime: 30_000,
    retry: (n, err) => !isMissingTableError(err) && n < 1,
    queryFn: async (): Promise<MyCard[]> => {
      let q = supabase
        .from('cards')
        .select('id, board_id, title, due_date, due_time, done_at, list_id')
        .is('archived_at', null)
        .not('due_date', 'is', null)
        .lte('due_date', to);
      if (from) q = q.gte('due_date', from);
      const { data: cards, error } = await q;
      if (error) {
        if (isMissingTableError(error)) return [];
        throw error;
      }
      if (!cards.length) return [];
      const [mine, boards] = await Promise.all([
        supabase.from('card_members').select('card_id').eq('user_id', user?.id ?? '').in('card_id', cards.map((c) => c.id)),
        supabase.from('boards').select('id, title, color').in('id', [...new Set(cards.map((c) => c.board_id))]),
      ]);
      if (mine.error) throw mine.error;
      if (boards.error) throw boards.error;
      const ids = new Set(mine.data.map((m) => m.card_id));
      const byBoard = new Map(boards.data.map((b) => [b.id, b]));
      return cards
        .filter((c) => ids.has(c.id))
        .map((c) => ({
          ...c,
          boardTitle: byBoard.get(c.board_id)?.title ?? 'Tableau',
          boardColor: byBoard.get(c.board_id)?.color ?? '#c6f432',
        }));
    },
  });
}

/** Titre et tableau des cartes liées à des tâches (tasks.card_id). */
export function useLinkedCards(cardIds: string[]) {
  const { user } = useAuth();
  const ids = [...new Set(cardIds)].sort();
  return useQuery({
    queryKey: ['linked-cards', user?.id, ids.join(',')],
    enabled: !!user && ids.length > 0,
    retry: (n, err) => !isMissingTableError(err) && n < 1,
    queryFn: async (): Promise<Map<string, { id: string; title: string; board_id: string; done_at: string | null; list_id: string }>> => {
      const { data, error } = await supabase.from('cards').select('id, title, board_id, done_at, list_id').in('id', ids);
      if (error) {
        if (isMissingTableError(error)) return new Map();
        throw error;
      }
      return new Map(data.map((c) => [c.id, c]));
    },
  });
}

/** Avancement des cartes des tableaux reliés à chaque objectif. */
export function useGoalBoardProgress() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['goal-boards', user?.id],
    enabled: !!user,
    retry: (n, err) => !isMissingTableError(err) && n < 1,
    queryFn: async (): Promise<Map<string, { done: number; total: number }>> => {
      const result = new Map<string, { done: number; total: number }>();
      const { data: boards, error } = await supabase.from('boards').select('id, goal_id').not('goal_id', 'is', null).is('archived_at', null);
      if (error) {
        if (isMissingTableError(error)) return result;
        throw error;
      }
      if (!boards.length) return result;
      const { data: cards, error: e2 } = await supabase
        .from('cards')
        .select('board_id, done_at')
        .in('board_id', boards.map((b) => b.id))
        .is('archived_at', null);
      if (e2) throw e2;
      for (const b of boards) {
        if (!b.goal_id) continue;
        const p = cardsProgress(cards.filter((c) => c.board_id === b.id));
        const prev = result.get(b.goal_id) ?? { done: 0, total: 0 };
        result.set(b.goal_id, { done: prev.done + p.done, total: prev.total + p.total });
      }
      return result;
    },
  });
}
