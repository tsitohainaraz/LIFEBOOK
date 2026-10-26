import { useEffect, useId } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { nowISO } from '../../lib/serverTime';
import type { NotificationRow } from '../../types/database';
import { isMissingTableError } from '../boards/boardUtils';

const key = (uid: string | undefined) => ['notifications', uid];

/** Mes notifications (les 100 dernières), mises à jour en direct. */
export function useNotifications() {
  const { user } = useAuth();
  const qc = useQueryClient();
  // Nom unique par composant (la cloche et la page écoutent en même temps) : supabase-js réutilise
  // un canal du même nom et refuse d'y ajouter un écouteur après l'abonnement.
  const instance = useId();

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`notifications:${user.id}:${instance}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => {
        void qc.invalidateQueries({ queryKey: key(user.id) });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [user, qc, instance]);

  return useQuery({
    queryKey: key(user?.id),
    enabled: !!user,
    retry: (n, err) => !isMissingTableError(err) && n < 1,
    queryFn: async (): Promise<NotificationRow[]> => {
      const { data, error } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return data;
    },
  });
}

export function useMarkRead() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[] | 'all') => {
      let q = supabase.from('notifications').update({ read_at: nowISO() }).is('read_at', null);
      if (ids !== 'all') q = q.in('id', ids);
      const { error } = await q;
      if (error) throw error;
    },
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: key(user?.id) });
      const previous = qc.getQueryData<NotificationRow[]>(key(user?.id));
      const now = nowISO();
      qc.setQueryData<NotificationRow[]>(key(user?.id), (list) =>
        (list ?? []).map((n) => (!n.read_at && (ids === 'all' || ids.includes(n.id)) ? { ...n, read_at: now } : n)),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(key(user?.id), ctx?.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: key(user?.id) }),
  });
}

/** Remet une notification en « non lu ». */
export function useMarkUnread() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('notifications').update({ read_at: null }).eq('id', id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key(user?.id) });
      const previous = qc.getQueryData<NotificationRow[]>(key(user?.id));
      qc.setQueryData<NotificationRow[]>(key(user?.id), (list) => (list ?? []).map((n) => (n.id === id ? { ...n, read_at: null } : n)));
      return { previous };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(key(user?.id), ctx?.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: key(user?.id) }),
  });
}

/** Types de notifications coupés (notification_prefs.muted). */
export function useNotificationPrefs() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['notification_prefs', user?.id],
    enabled: !!user,
    retry: (n, err) => !isMissingTableError(err) && n < 1,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.from('notification_prefs').select('muted').maybeSingle();
      if (error) throw error;
      return data?.muted ?? [];
    },
  });
}

export function useSaveNotificationPrefs() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const k = ['notification_prefs', user?.id];
  return useMutation({
    mutationFn: async (muted: string[]) => {
      const { error } = await supabase.from('notification_prefs').upsert({ user_id: user?.id, muted }, { onConflict: 'user_id' });
      if (error) throw error;
    },
    onMutate: async (muted) => {
      await qc.cancelQueries({ queryKey: k });
      const previous = qc.getQueryData<string[]>(k);
      qc.setQueryData(k, muted);
      return { previous };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(k, ctx?.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: k }),
  });
}

/** Accepter ou refuser une demande pour rejoindre une carte. */
export function useAnswerJoin() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId, accept }: { requestId: string; accept: boolean }) => {
      const { error } = await supabase.rpc('answer_card_join', { p_request: requestId, p_accept: accept });
      if (error) throw error;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key(user?.id) });
      void qc.invalidateQueries({ queryKey: ['card_join_requests'] });
      void qc.invalidateQueries({ queryKey: ['board'] });
    },
  });
}
