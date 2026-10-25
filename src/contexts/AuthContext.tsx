import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { setAppTimeZone } from '../lib/serverTime';
import type { ProfileRow } from '../types/database';

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: ProfileRow | null;
  loading: boolean;
  profileError: string | null;
  refreshProfile: () => Promise<ProfileRow | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Charge la ligne profiles ; la crée si le déclencheur SQL ne l'a pas encore fait. */
async function loadProfile(user: User): Promise<ProfileRow> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (error) throw error;
  if (data) return data;
  const meta = user.user_metadata as Record<string, string | undefined>;
  const { data: created, error: insertError } = await supabase
    .from('profiles')
    .insert({
      id: user.id,
      email: user.email ?? null,
      first_name: meta.given_name ?? null,
      last_name: meta.family_name ?? null,
      avatar_url: meta.avatar_url ?? meta.picture ?? null,
    })
    .select('*')
    .single();
  if (insertError) throw insertError;
  return created;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const userIdRef = useRef<string | null>(null);

  const fetchProfile = useCallback(async (user: User | null): Promise<ProfileRow | null> => {
    if (!user) {
      setProfile(null);
      return null;
    }
    try {
      const p = await loadProfile(user);
      setAppTimeZone(p.timezone);
      setProfile(p);
      setProfileError(null);
      return p;
    } catch {
      setProfileError(
        'Impossible de charger ton profil. Vérifie ta connexion, ou que la base de données LifeBook est bien installée.',
      );
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      userIdRef.current = data.session?.user.id ?? null;
      await fetchProfile(data.session?.user ?? null);
      if (active) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      setSession(next);
      const nextId = next?.user.id ?? null;
      if (nextId !== userIdRef.current) {
        userIdRef.current = nextId;
        if (!nextId) {
          setProfile(null);
          queryClient.clear();
          return;
        }
        // Nouvelle session : on charge le profil hors du rappel (recommandation Supabase).
        setLoading(true);
        setTimeout(() => {
          void fetchProfile(next?.user ?? null).finally(() => {
            if (active) setLoading(false);
          });
        }, 0);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [fetchProfile, queryClient]);

  const refreshProfile = useCallback(() => fetchProfile(session?.user ?? null), [fetchProfile, session]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo<AuthState>(
    () => ({ session, user: session?.user ?? null, profile, loading, profileError, refreshProfile, signOut }),
    [session, profile, loading, profileError, refreshProfile, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>.');
  return ctx;
}

/** Profil garanti dans les écrans protégés. */
export function useProfile(): ProfileRow {
  const { profile } = useAuth();
  if (!profile) throw new Error('Profil indisponible.');
  return profile;
}
