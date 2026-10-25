import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Splash } from './Splash';
import { ErrorState } from './States';

/** Écrans réservés aux personnes connectées dont le profil est terminé. */
export function ProtectedRoute() {
  const { session, profile, loading, profileError, refreshProfile } = useAuth();
  const location = useLocation();
  if (loading) return <Splash />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!profile) return <ProfileFailure message={profileError} retry={refreshProfile} />;
  if (!profile.onboarding_done_at) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

/** Profil en cours de création : connecté, mais pas encore terminé. */
export function OnboardingRoute() {
  const { session, profile, loading, profileError, refreshProfile } = useAuth();
  if (loading) return <Splash />;
  if (!session) return <Navigate to="/login" replace />;
  if (!profile) return <ProfileFailure message={profileError} retry={refreshProfile} />;
  return <Outlet />;
}

/** /login et /verify : une personne déjà connectée part vers l'accueil (ou son profil). */
export function GuestRoute() {
  const { session, profile, loading } = useAuth();
  if (loading) return <Splash />;
  if (session && profile) return <Navigate to={profile.onboarding_done_at ? '/' : '/onboarding'} replace />;
  return <Outlet />;
}

function ProfileFailure({ message, retry }: { message: string | null; retry: () => Promise<unknown> }) {
  const { signOut } = useAuth();
  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '48px 16px' }}>
      <ErrorState message={message ?? 'Impossible de charger ton profil.'} onRetry={() => void retry()} />
      <button type="button" className="btn outline block" style={{ marginTop: 12 }} onClick={() => void signOut()}>
        Me déconnecter
      </button>
    </div>
  );
}
