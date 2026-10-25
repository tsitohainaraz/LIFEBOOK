import { useCallback, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { AttachmentRow } from '../../types/database';
import { signedUrl, uploadAttachment, type UploadTarget } from './upload';

/** URL signée d'1 h, gardée en cache 50 min. */
export function useSignedUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['signed', path],
    enabled: !!path,
    staleTime: 50 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    queryFn: () => signedUrl(path as string),
  });
}

export function useCardAttachments(cardId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['attachments', 'card', cardId],
    enabled: !!user && !!cardId,
    queryFn: async (): Promise<AttachmentRow[]> => {
      const { data, error } = await supabase.from('attachments').select('*').eq('card_id', cardId as string).order('created_at');
      if (error) throw error;
      return data;
    },
  });
}

/** Nombre de fichiers par carte (icône trombone). */
export function useBoardAttachmentCounts(boardId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['attachments', 'counts', boardId],
    enabled: !!user && !!boardId,
    queryFn: async (): Promise<Map<string, number>> => {
      const { data, error } = await supabase.from('attachments').select('card_id').eq('board_id', boardId as string).not('card_id', 'is', null);
      if (error) throw error;
      const m = new Map<string, number>();
      for (const r of data) if (r.card_id) m.set(r.card_id, (m.get(r.card_id) ?? 0) + 1);
      return m;
    },
  });
}

export function useBoardStorage(boardId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['attachments', 'bytes', boardId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('board_storage_bytes', { b: boardId });
      if (error) throw error;
      return Number(data ?? 0);
    },
  });
}

export interface UploadItem {
  id: string;
  name: string;
  progress: number;
  error: string | null;
  done: boolean;
}

/** File d'envoi : progression, annulation, erreurs, et rafraîchissement des listes de fichiers. */
export function useUploader() {
  const qc = useQueryClient();
  const [items, setItems] = useState<UploadItem[]>([]);
  const controllers = useRef(new Map<string, AbortController>());

  const patch = (id: string, p: Partial<UploadItem>) => setItems((list) => list.map((i) => (i.id === id ? { ...i, ...p } : i)));

  const upload = useCallback(
    async (files: File[], target: UploadTarget): Promise<AttachmentRow[]> => {
      const done: AttachmentRow[] = [];
      for (const file of files) {
        const id = crypto.randomUUID();
        const ctrl = new AbortController();
        controllers.current.set(id, ctrl);
        setItems((list) => [...list, { id, name: file.name, progress: 0, error: null, done: false }]);
        try {
          const row = await uploadAttachment(file, target, (r) => patch(id, { progress: r }), ctrl.signal);
          done.push(row);
          patch(id, { progress: 1, done: true });
          setTimeout(() => setItems((list) => list.filter((i) => i.id !== id)), 1200);
        } catch (e) {
          const aborted = e instanceof DOMException && e.name === 'AbortError';
          if (aborted) setItems((list) => list.filter((i) => i.id !== id));
          else patch(id, { error: e instanceof Error ? e.message : "L'envoi a échoué." });
        } finally {
          controllers.current.delete(id);
        }
      }
      void qc.invalidateQueries({ queryKey: ['attachments'] });
      return done;
    },
    [qc],
  );

  const cancel = (id: string) => controllers.current.get(id)?.abort();
  const dismiss = (id: string) => setItems((list) => list.filter((i) => i.id !== id));
  return { items, upload, cancel, dismiss, busy: items.some((i) => !i.done && !i.error) };
}
