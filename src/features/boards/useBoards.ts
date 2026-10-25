import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { nowISO } from '../../lib/serverTime';
import { todayISO } from '../../utils/dates';
import type {
  BoardActivityRow,
  BoardLabelRow,
  BoardMemberRow,
  BoardRole,
  BoardRow,
  CardCommentRow,
  CardLabelRow,
  CardMemberRow,
  CardRow,
  ChecklistItemRow,
  Database,
  ListRow,
  MemberProfileRow,
} from '../../types/database';
import { planMove } from './boardUtils';

type CardUpdate = Database['public']['Tables']['cards']['Update'];
type ChecklistUpdate = Database['public']['Tables']['checklist_items']['Update'];

export type Member = BoardMemberRow & { profile: MemberProfileRow | null };

export interface BoardData {
  board: BoardRow;
  myRole: BoardRole;
  lists: ListRow[];
  cards: CardRow[];
  members: Member[];
  labels: BoardLabelRow[];
  cardMembers: CardMemberRow[];
  cardLabels: CardLabelRow[];
  checklist: Pick<ChecklistItemRow, 'id' | 'card_id' | 'done_at'>[];
}

export interface BoardSummary {
  board: BoardRow;
  cardCount: number;
  lateCount: number;
  members: Member[];
}

async function profilesFor(ids: string[]): Promise<Map<string, MemberProfileRow>> {
  if (!ids.length) return new Map();
  const { data, error } = await supabase.from('member_profiles').select('*').in('id', ids);
  if (error) throw error;
  return new Map(data.map((p) => [p.id, p]));
}

export const memberName = (m: Pick<Member, 'profile'> | null | undefined) =>
  [m?.profile?.first_name, m?.profile?.last_name].filter(Boolean).join(' ') || 'Membre';

/** Mes tableaux (ceux dont je suis membre), avec compteurs. */
export function useMyBoards() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['boards', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<BoardSummary[]> => {
      const { data: boards, error } = await supabase
        .from('boards')
        .select('*')
        .is('archived_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const ids = boards.map((b) => b.id);
      if (!ids.length) return [];
      const [cardsRes, membersRes] = await Promise.all([
        supabase.from('cards').select('board_id, due_date, done_at').in('board_id', ids).is('archived_at', null),
        supabase.from('board_members').select('*').in('board_id', ids),
      ]);
      if (cardsRes.error) throw cardsRes.error;
      if (membersRes.error) throw membersRes.error;
      const profiles = await profilesFor([...new Set(membersRes.data.map((m) => m.user_id))]);
      const today = todayISO();
      return boards.map((board) => {
        const cards = cardsRes.data.filter((c) => c.board_id === board.id);
        return {
          board,
          cardCount: cards.length,
          lateCount: cards.filter((c) => !c.done_at && c.due_date && c.due_date < today).length,
          members: membersRes.data
            .filter((m) => m.board_id === board.id)
            .map((m) => ({ ...m, profile: profiles.get(m.user_id) ?? null })),
        };
      });
    },
  });
}

export const boardKey = (id: string | undefined) => ['board', id];

/** Tout le contenu d'un tableau, en une seule entrée de cache. */
export function useBoard(boardId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: boardKey(boardId),
    enabled: !!user && !!boardId,
    queryFn: async (): Promise<BoardData | null> => {
      const id = boardId as string;
      const { data: board, error } = await supabase.from('boards').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!board) return null;
      const [lists, cards, members, labels] = await Promise.all([
        supabase.from('lists').select('*').eq('board_id', id).is('archived_at', null).order('position'),
        supabase.from('cards').select('*').eq('board_id', id).is('archived_at', null).order('position'),
        supabase.from('board_members').select('*').eq('board_id', id),
        supabase.from('board_labels').select('*').eq('board_id', id),
      ]);
      for (const r of [lists, cards, members, labels]) if (r.error) throw r.error;
      const cardIds = (cards.data ?? []).map((c) => c.id);
      const [cm, cl, ck, profiles] = await Promise.all([
        cardIds.length ? supabase.from('card_members').select('*').in('card_id', cardIds) : Promise.resolve({ data: [], error: null }),
        cardIds.length ? supabase.from('card_labels').select('*').in('card_id', cardIds) : Promise.resolve({ data: [], error: null }),
        cardIds.length
          ? supabase.from('checklist_items').select('id, card_id, done_at').in('card_id', cardIds)
          : Promise.resolve({ data: [], error: null }),
        profilesFor((members.data ?? []).map((m) => m.user_id)),
      ]);
      for (const r of [cm, cl, ck]) if (r.error) throw r.error;
      const memberRows = (members.data ?? []).map((m) => ({ ...m, profile: profiles.get(m.user_id) ?? null }));
      return {
        board,
        myRole: memberRows.find((m) => m.user_id === user?.id)?.role ?? 'viewer',
        lists: lists.data ?? [],
        cards: cards.data ?? [],
        members: memberRows,
        labels: labels.data ?? [],
        cardMembers: (cm.data ?? []) as CardMemberRow[],
        cardLabels: (cl.data ?? []) as CardLabelRow[],
        checklist: (ck.data ?? []) as BoardData['checklist'],
      };
    },
  });
}

function patchBoard(qc: QueryClient, boardId: string, fn: (d: BoardData) => BoardData) {
  const previous = qc.getQueryData<BoardData | null>(boardKey(boardId));
  if (previous) qc.setQueryData<BoardData>(boardKey(boardId), fn(previous));
  return previous;
}

export function useCreateBoard() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (values: { title: string; color: string; goal_id: string | null }) => {
      const { data, error } = await supabase.from('boards').insert(values).select('*').single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['boards', user?.id] }),
  });
}

/** Mutations d'un tableau. Les modifications de cartes sont optimistes et annulées en cas d'erreur. */
export function useBoardMutations(boardId: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['my-cards'] });
    void qc.invalidateQueries({ queryKey: ['linked-cards'] });
    return qc.invalidateQueries({ queryKey: boardKey(boardId) });
  };
  const invalidateList = () => qc.invalidateQueries({ queryKey: ['boards', user?.id] });

  const updateBoard = useMutation({
    mutationFn: async (values: Partial<Pick<BoardRow, 'title' | 'color' | 'goal_id' | 'archived_at'>>) => {
      const { error } = await supabase.from('boards').update(values).eq('id', boardId);
      if (error) throw error;
    },
    onMutate: (values) => ({ previous: patchBoard(qc, boardId, (d) => ({ ...d, board: { ...d.board, ...values } })) }),
    onError: (_e, _v, ctx) => qc.setQueryData(boardKey(boardId), ctx?.previous),
    onSettled: () => {
      void invalidate();
      void invalidateList();
    },
  });

  const deleteBoard = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('boards').delete().eq('id', boardId);
      if (error) throw error;
    },
    onSuccess: () => invalidateList(),
  });

  const addList = useMutation({
    mutationFn: async (title: string) => {
      const d = qc.getQueryData<BoardData>(boardKey(boardId));
      const position = Math.max(0, ...(d?.lists ?? []).map((l) => l.position)) + 1000;
      const { error } = await supabase.from('lists').insert({ board_id: boardId, title, position });
      if (error) throw error;
    },
    onSettled: () => invalidate(),
  });

  const updateList = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Partial<Pick<ListRow, 'title' | 'archived_at'>> }) => {
      const { error } = await supabase.from('lists').update(values).eq('id', id);
      if (error) throw error;
    },
    onSettled: () => invalidate(),
  });

  const addCard = useMutation({
    mutationFn: async ({ listId, title }: { listId: string; title: string }) => {
      const d = qc.getQueryData<BoardData>(boardKey(boardId));
      const inList = (d?.cards ?? []).filter((c) => c.list_id === listId);
      const position = Math.max(0, ...inList.map((c) => c.position)) + 1000;
      const { data, error } = await supabase
        .from('cards')
        .insert({ board_id: boardId, list_id: listId, title, position })
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (row) => patchBoard(qc, boardId, (d) => ({ ...d, cards: [...d.cards, row] })),
    onSettled: () => invalidateList(),
  });

  const updateCard = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: CardUpdate }) => {
      const { error } = await supabase.from('cards').update(values).eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, values }) => {
      await qc.cancelQueries({ queryKey: boardKey(boardId) });
      return {
        previous: patchBoard(qc, boardId, (d) => ({
          ...d,
          cards: d.cards
            .map((c) => (c.id === id ? { ...c, ...values } : c))
            .filter((c) => !c.archived_at),
        })),
      };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(boardKey(boardId), ctx?.previous),
    onSettled: () => invalidate(),
  });

  /** Déplace une carte vers `listId` à l'index `index` (renumérote la liste si besoin). */
  const moveCard = useMutation({
    mutationFn: async ({ updates }: { cardId: string; listId: string; index: number; updates: { id: string; list_id: string; position: number }[] }) => {
      for (const u of updates) {
        const { error } = await supabase.from('cards').update({ list_id: u.list_id, position: u.position }).eq('id', u.id);
        if (error) throw error;
      }
    },
    onMutate: async ({ updates }) => {
      await qc.cancelQueries({ queryKey: boardKey(boardId) });
      const map = new Map(updates.map((u) => [u.id, u]));
      return {
        previous: patchBoard(qc, boardId, (d) => ({
          ...d,
          cards: d.cards.map((c) => {
            const u = map.get(c.id);
            return u ? { ...c, list_id: u.list_id, position: u.position } : c;
          }),
        })),
      };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(boardKey(boardId), ctx?.previous),
    onSettled: () => invalidate(),
  });

  /** Calcule les mises à jour d'un déplacement (pour moveCard). */
  const planCardMove = (cardId: string, listId: string, index: number) => {
    const d = qc.getQueryData<BoardData>(boardKey(boardId));
    const target = (d?.cards ?? []).filter((c) => c.list_id === listId);
    const { position, renumbered } = planMove(target, cardId, index);
    if (!renumbered) return [{ id: cardId, list_id: listId, position }];
    return [...renumbered.entries()].map(([id, pos]) => ({ id, list_id: listId, position: pos }));
  };

  const setCardMember = useMutation({
    mutationFn: async ({ cardId, userId, on }: { cardId: string; userId: string; on: boolean }) => {
      const q = on
        ? supabase.from('card_members').insert({ card_id: cardId, user_id: userId })
        : supabase.from('card_members').delete().eq('card_id', cardId).eq('user_id', userId);
      const { error } = await q;
      if (error) throw error;
    },
    onMutate: ({ cardId, userId, on }) => ({
      previous: patchBoard(qc, boardId, (d) => ({
        ...d,
        cardMembers: on
          ? [...d.cardMembers, { card_id: cardId, user_id: userId }]
          : d.cardMembers.filter((m) => !(m.card_id === cardId && m.user_id === userId)),
      })),
    }),
    onError: (_e, _v, ctx) => qc.setQueryData(boardKey(boardId), ctx?.previous),
    onSettled: () => invalidate(),
  });

  const setCardLabel = useMutation({
    mutationFn: async ({ cardId, labelId, on }: { cardId: string; labelId: string; on: boolean }) => {
      const q = on
        ? supabase.from('card_labels').insert({ card_id: cardId, label_id: labelId })
        : supabase.from('card_labels').delete().eq('card_id', cardId).eq('label_id', labelId);
      const { error } = await q;
      if (error) throw error;
    },
    onMutate: ({ cardId, labelId, on }) => ({
      previous: patchBoard(qc, boardId, (d) => ({
        ...d,
        cardLabels: on
          ? [...d.cardLabels, { card_id: cardId, label_id: labelId }]
          : d.cardLabels.filter((m) => !(m.card_id === cardId && m.label_id === labelId)),
      })),
    }),
    onError: (_e, _v, ctx) => qc.setQueryData(boardKey(boardId), ctx?.previous),
    onSettled: () => invalidate(),
  });

  const addLabel = useMutation({
    mutationFn: async (values: { name: string; color: string }) => {
      const { error } = await supabase.from('board_labels').insert({ board_id: boardId, ...values });
      if (error) throw error;
    },
    onSettled: () => invalidate(),
  });

  const deleteLabel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('board_labels').delete().eq('id', id);
      if (error) throw error;
    },
    onSettled: () => invalidate(),
  });

  const setRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: 'member' | 'viewer' }) => {
      const { error } = await supabase.from('board_members').update({ role }).eq('board_id', boardId).eq('user_id', userId);
      if (error) throw error;
    },
    onSettled: () => invalidate(),
  });

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from('board_members').delete().eq('board_id', boardId).eq('user_id', userId);
      if (error) throw error;
    },
    onSettled: () => {
      void invalidate();
      void invalidateList();
    },
  });

  const createInvite = useMutation({
    mutationFn: async (role: 'member' | 'viewer') => {
      const { data, error } = await supabase.rpc('create_invite', { b: boardId, r: role });
      if (error) throw error;
      return data;
    },
  });

  return {
    updateBoard,
    deleteBoard,
    addList,
    updateList,
    addCard,
    updateCard,
    moveCard,
    planCardMove,
    setCardMember,
    setCardLabel,
    addLabel,
    deleteLabel,
    setRole,
    removeMember,
    createInvite,
  };
}

/** Détails d'une carte : checklist, commentaires, historique. */
export function useCardDetails(cardId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['card', cardId],
    enabled: !!user && !!cardId,
    queryFn: async () => {
      const id = cardId as string;
      const [checklist, comments, activity] = await Promise.all([
        supabase.from('checklist_items').select('*').eq('card_id', id).order('position'),
        supabase.from('card_comments').select('*').eq('card_id', id).order('created_at'),
        supabase.from('board_activity').select('*').eq('payload->>card_id', id).order('created_at', { ascending: false }).limit(30),
      ]);
      for (const r of [checklist, comments, activity]) if (r.error) throw r.error;
      return {
        checklist: (checklist.data ?? []) as ChecklistItemRow[],
        comments: (comments.data ?? []) as CardCommentRow[],
        activity: (activity.data ?? []) as BoardActivityRow[],
      };
    },
  });
}

export function useCardMutations(boardId: string, cardId: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const key = ['card', cardId];
  type Details = { checklist: ChecklistItemRow[]; comments: CardCommentRow[]; activity: BoardActivityRow[] };
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: boardKey(boardId) });
  };

  const addItem = useMutation({
    mutationFn: async (text: string) => {
      const d = qc.getQueryData<Details>(key);
      const position = Math.max(0, ...(d?.checklist ?? []).map((i) => i.position)) + 1000;
      const { error } = await supabase.from('checklist_items').insert({ card_id: cardId, text, position });
      if (error) throw error;
    },
    onSettled: refresh,
  });

  const updateItem = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: ChecklistUpdate }) => {
      const { error } = await supabase.from('checklist_items').update(values).eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, values }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Details>(key);
      if (previous) qc.setQueryData<Details>(key, { ...previous, checklist: previous.checklist.map((i) => (i.id === id ? { ...i, ...values } : i)) });
      return { previous };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(key, ctx?.previous),
    onSettled: refresh,
  });

  const toggleItem = (item: ChecklistItemRow) =>
    updateItem.mutate({ id: item.id, values: item.done_at ? { done_at: null, done_by: null } : { done_at: nowISO(), done_by: user?.id ?? null } });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('checklist_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSettled: refresh,
  });

  const addComment = useMutation({
    mutationFn: async (body: string) => {
      const { data, error } = await supabase.from('card_comments').insert({ card_id: cardId, body }).select('*').single();
      if (error) throw error;
      return data;
    },
    onSettled: refresh,
  });

  const editComment = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) => {
      const { error } = await supabase.from('card_comments').update({ body, edited_at: nowISO() }).eq('id', id);
      if (error) throw error;
    },
    onSettled: refresh,
  });

  const deleteComment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('card_comments').delete().eq('id', id);
      if (error) throw error;
    },
    onSettled: refresh,
  });

  return { addItem, updateItem, toggleItem, deleteItem, addComment, editComment, deleteComment };
}

export function useLeaveBoard() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (boardId: string) => {
      const { error } = await supabase.from('board_members').delete().eq('board_id', boardId).eq('user_id', user?.id ?? '');
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['boards', user?.id] }),
  });
}
