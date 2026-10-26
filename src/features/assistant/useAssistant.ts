// Données de l'assistante : conversations, messages, quota, réglages, avis.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { AiConversationRow, AiFeedbackReason, AiMessageRow, AiQuota, AiSettingsRow } from '../../types/database';
import type { StoredAction } from './assistantUtils';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  actions: StoredAction[];
  feedback: -1 | 0 | 1 | null;
  feedback_reason: AiFeedbackReason | null;
  crisis?: boolean;
}

export function useConversations() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['ai_conversations', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<AiConversationRow[]> => {
      const { data, error } = await supabase.from('ai_conversations').select('*').order('updated_at', { ascending: false }).limit(50);
      if (error) throw error;
      return data;
    },
  });
}

export function useDeleteConversation() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ai_conversations').delete().eq('id', id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['ai_conversations', user?.id] }),
  });
}

/** Messages d'une conversation ; les actions viennent d'ai_actions (avec leur statut). */
export function useConversationMessages(conversationId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['ai_messages', user?.id, conversationId],
    enabled: !!user && !!conversationId,
    queryFn: async (): Promise<ChatMessage[]> => {
      const { data, error } = await supabase
        .from('ai_messages')
        .select('*')
        .eq('conversation_id', conversationId!)
        .order('created_at')
        .limit(200);
      if (error) throw error;
      const rows = data as AiMessageRow[];
      const ids = rows.filter((m) => m.role === 'assistant').map((m) => m.id);
      const acts = ids.length ? await supabase.from('ai_actions').select('id, message_id, payload, status').in('message_id', ids) : { data: [], error: null };
      if (acts.error) throw acts.error;
      const byMessage = new Map<string, StoredAction[]>();
      for (const a of (acts.data ?? []) as { id: string; message_id: string; payload: unknown; status: string }[]) {
        const list = byMessage.get(a.message_id) ?? [];
        list.push({ ...(a.payload as StoredAction), id: a.id, status: a.status });
        byMessage.set(a.message_id, list);
      }
      return rows.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        actions: (byMessage.get(m.id) ?? []).sort((x, y) => ((x as { index?: number }).index ?? 0) - ((y as { index?: number }).index ?? 0)),
        feedback: m.feedback,
        feedback_reason: m.feedback_reason,
      }));
    },
  });
}

export function useAiQuota() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['ai_quota', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<AiQuota | null> => {
      const { data, error } = await supabase.rpc('ai_quota');
      if (error) throw error;
      return (data as AiQuota[] | null)?.[0] ?? null;
    },
  });
}

const DEFAULT_SETTINGS = { auto_apply: false, use_health: true };

export function useAiSettings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['ai_settings', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Pick<AiSettingsRow, 'auto_apply' | 'use_health'>> => {
      const { data, error } = await supabase.from('ai_settings').select('auto_apply, use_health').maybeSingle();
      if (error) throw error;
      return data ?? DEFAULT_SETTINGS;
    },
  });
}

export function useSaveAiSettings() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const key = ['ai_settings', user?.id];
  return useMutation({
    mutationFn: async (patch: Partial<Pick<AiSettingsRow, 'auto_apply' | 'use_health'>>) => {
      const current = qc.getQueryData<typeof DEFAULT_SETTINGS>(key) ?? DEFAULT_SETTINGS;
      const { error } = await supabase.from('ai_settings').upsert({ user_id: user?.id, ...current, ...patch }, { onConflict: 'user_id' });
      if (error) throw error;
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<typeof DEFAULT_SETTINGS>(key);
      qc.setQueryData(key, { ...(previous ?? DEFAULT_SETTINGS), ...patch });
      return { previous };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(key, ctx?.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useFeedback() {
  return useMutation({
    mutationFn: async ({ id, feedback, reason }: { id: string; feedback: -1 | 1; reason?: AiFeedbackReason | null }) => {
      const { error } = await supabase.from('ai_messages').update({ feedback, feedback_reason: reason ?? null }).eq('id', id);
      if (error) throw error;
    },
  });
}
