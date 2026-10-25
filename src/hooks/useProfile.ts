import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Database } from '../types/database';

type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];

/** Met à jour la ligne profiles de la personne connectée, puis recharge le profil. */
export function useUpdateProfile() {
  const { user, refreshProfile } = useAuth();
  return useMutation({
    mutationFn: async (values: ProfileUpdate) => {
      if (!user) throw new Error('Non connecté');
      const { error } = await supabase.from('profiles').update(values).eq('id', user.id);
      if (error) throw error;
      await refreshProfile();
    },
  });
}

/** avatar_url : une URL (photo Google) ou un chemin dans le bucket privé « avatars ». */
export function isStoragePath(avatar: string | null | undefined): boolean {
  return !!avatar && !/^https?:\/\//.test(avatar);
}

/** URL affichable de la photo : URL signée valable 1 h pour une photo du bucket privé. */
export function useAvatarUrl(avatar: string | null | undefined) {
  return useQuery({
    queryKey: ['avatar_url', avatar],
    enabled: !!avatar,
    staleTime: 50 * 60 * 1000,
    queryFn: async (): Promise<string | null> => {
      if (!avatar) return null;
      if (!isStoragePath(avatar)) return avatar;
      const path = avatar.split('?')[0];
      const { data, error } = await supabase.storage.from('avatars').createSignedUrl(path, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

/** Envoie la photo dans avatars/{user_id}/avatar.jpg et renvoie le chemin à enregistrer. */
export async function uploadAvatar(userId: string, blob: Blob): Promise<string> {
  const path = `${userId}/avatar.jpg`;
  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, blob, { contentType: 'image/jpeg', upsert: true, cacheControl: '60' });
  if (error) throw error;
  // Le suffixe change à chaque envoi pour que l'ancienne URL signée ne soit pas réutilisée.
  return `${path}?v=${Date.now()}`;
}
