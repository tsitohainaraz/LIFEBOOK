import { useEffect, useRef, useId } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { nowISO } from '../../lib/serverTime';
import type { AttachmentRow, MessageRow } from '../../types/database';
import { isMissingTableError } from '../boards/boardUtils';

export const PAGE_SIZE = 30;
type Pages = InfiniteData<MessageRow[], string | null>;
const chatKey = (boardId: string) => ['messages', boardId];

/** Messages d'un tableau, du plus récent au plus ancien, par pages de 30. */
export function useMessages(boardId: string) {
  const { user } = useAuth();
  return useInfiniteQuery({
    queryKey: chatKey(boardId),
    enabled: !!user,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<MessageRow[]> => {
      let q = supabase.from('messages').select('*').eq('board_id', boardId).order('created_at', { ascending: false }).limit(PAGE_SIZE);
      if (pageParam) q = q.lt('created_at', pageParam);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    getNextPageParam: (last) => (last.length === PAGE_SIZE ? last[last.length - 1].created_at : undefined),
  });
}

/** Ajoute ou remplace un message dans le cache (temps réel, envoi). */
export function upsertMessage(qc: ReturnType<typeof useQueryClient>, boardId: string, msg: MessageRow) {
  qc.setQueryData<Pages>(chatKey(boardId), (data) => {
    if (!data) return data;
    const exists = data.pages.some((p) => p.some((m) => m.id === msg.id));
    if (exists) return { ...data, pages: data.pages.map((p) => p.map((m) => (m.id === msg.id ? msg : m))) };
    const [first = [], ...rest] = data.pages;
    return { ...data, pages: [[msg, ...first], ...rest] };
  });
}

/** Temps réel de la discussion : nouveaux messages et modifications. */
export function useChatRealtime(boardId: string, onNew: (m: MessageRow) => void) {
  const qc = useQueryClient();
  const onNewRef = useRef(onNew);
  onNewRef.current = onNew;
  const instance = useId();
  useEffect(() => {
    const channel = supabase
      .channel(`chat:${boardId}:${instance}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `board_id=eq.${boardId}` }, (p) => {
        const m = p.new as MessageRow;
        upsertMessage(qc, boardId, m);
        onNewRef.current(m);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `board_id=eq.${boardId}` }, (p) => {
        upsertMessage(qc, boardId, p.new as MessageRow);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [boardId, qc, instance]);
}

export function useMessageAttachments(boardId: string, messageIds: string[]) {
  const key = messageIds.join(',');
  return useQuery({
    queryKey: ['attachments', 'messages', boardId, key],
    enabled: messageIds.length > 0,
    queryFn: async (): Promise<AttachmentRow[]> => {
      const { data, error } = await supabase.from('attachments').select('*').in('message_id', messageIds).order('created_at');
      if (error) throw error;
      return data;
    },
  });
}

export function useChatMutations(boardId: string) {
  const qc = useQueryClient();
  const send = useMutation({
    mutationFn: async (values: { body: string; reply_to?: string | null; kind?: 'text' | 'report'; report_id?: string | null }) => {
      const { data, error } = await supabase
        .from('messages')
        .insert({ board_id: boardId, body: values.body, reply_to: values.reply_to ?? null, kind: values.kind ?? 'text', report_id: values.report_id ?? null })
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (m) => upsertMessage(qc, boardId, m),
  });
  const edit = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) => {
      const { data, error } = await supabase.from('messages').update({ body, edited_at: nowISO() }).eq('id', id).select('*').single();
      if (error) throw error;
      return data;
    },
    onSuccess: (m) => upsertMessage(qc, boardId, m),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('messages').update({ body: '', deleted_at: nowISO() }).eq('id', id).select('*').single();
      if (error) throw error;
      return data;
    },
    onSuccess: (m) => upsertMessage(qc, boardId, m),
  });
  return { send, edit, remove };
}

/** Marque la discussion comme lue jusqu'à maintenant. */
export async function markRead(boardId: string, userId: string) {
  await supabase.from('message_reads').upsert({ board_id: boardId, user_id: userId, last_read_at: nowISO() }, { onConflict: 'board_id,user_id' });
}

/** Enregistre les @mentions (la notification est créée par un trigger). */
export async function saveMentions(args: { boardId: string; userIds: string[]; cardId?: string; commentId?: string; messageId?: string }) {
  if (!args.userIds.length) return;
  await supabase.from('mentions').insert(
    args.userIds.map((u) => ({
      user_id: u,
      board_id: args.boardId,
      card_id: args.cardId ?? null,
      comment_id: args.commentId ?? null,
      message_id: args.messageId ?? null,
    })),
  );
}

/** Messages non lus par tableau (hors messages système et hors les miens). */
export function useUnreadCounts(boardIds?: string[]) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['unread', user?.id, (boardIds ?? []).join(',')],
    enabled: !!user,
    refetchInterval: 30_000,
    queryFn: async (): Promise<Map<string, number>> => {
      const result = new Map<string, number>();
      let ids = boardIds;
      if (!ids) {
        const { data, error } = await supabase.from('board_members').select('board_id').eq('user_id', user?.id ?? '');
        if (error) {
          if (isMissingTableError(error)) return result;
          throw error;
        }
        ids = data.map((r) => r.board_id);
      }
      if (!ids.length) return result;
      const reads = await supabase.from('message_reads').select('*').in('board_id', ids).eq('user_id', user?.id ?? '');
      if (reads.error) {
        if (isMissingTableError(reads.error)) return result;
        throw reads.error;
      }
      const last = new Map(reads.data.map((r) => [r.board_id, r.last_read_at]));
      await Promise.all(
        ids.map(async (b) => {
          let q = supabase
            .from('messages')
            .select('id', { count: 'exact', head: true })
            .eq('board_id', b)
            .neq('kind', 'system')
            .neq('user_id', user?.id ?? '')
            .is('deleted_at', null);
          const since = last.get(b);
          if (since) q = q.gt('created_at', since);
          const { count } = await q;
          if (count) result.set(b, count);
        }),
      );
      return result;
    },
  });
}
