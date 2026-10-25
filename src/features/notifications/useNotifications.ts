import { useEffect } from 'react';
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

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`notifications:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => {
        void qc.invalidateQueries({ queryKey: key(user.id) });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [user, qc]);

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
