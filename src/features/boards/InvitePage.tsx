import { useState, type CSSProperties } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Logo } from '../../components/Logo';
import { Splash } from '../../components/Splash';
import { isMissingTableError } from './boardUtils';
import { BoardsUnavailable } from './BoardsUnavailable';
import { clearPendingInvite, inviteErrorMessage, savePendingInvite } from './pendingInvite';
import styles from './Boards.module.css';

/**
 * /invitation/:token
 * Pas connecté : on garde le jeton et on part sur /login ; profil incomplet : /onboarding d'abord.
 * Les gardes de route ramènent ensuite ici (voir RouteGuards).
 */
export function InviteGate() {
  const { token = '' } = useParams();
  const { session, profile, loading } = useAuth();
  if (token) savePendingInvite(token);
  if (loading) return <Splash />;
  if (!session) return <Navigate to="/login" replace />;
  if (!profile?.onboarding_done_at) return <Navigate to="/onboarding" replace />;
  return <InvitePage token={token} />;
}

function InvitePage({ token }: { token: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const preview = useQuery({
    queryKey: ['invite', token],
    queryFn: async () => {
      const { data, error: err } = await supabase.rpc('get_invite_preview', { t: token });
      if (err) throw err;
      return data[0] ?? null;
    },
  });

  async function join() {
    setJoining(true);
    setError('');
    const { data, error: err } = await supabase.rpc('accept_invite', { t: token });
    setJoining(false);
    if (err) {
      setError(inviteErrorMessage(err.message));
      return;
    }
    clearPendingInvite();
    await qc.invalidateQueries({ queryKey: ['boards'] });
    navigate(`/tableaux/${data}`, { replace: true });
  }

  const p = preview.data;
  const stop = () => {
    clearPendingInvite();
    navigate('/', { replace: true });
  };

  return (
    <div className={styles.invite}>
      <Logo size={72} />
      {preview.isLoading ? (
        <p className="muted">Lecture de l'invitation…</p>
      ) : preview.isError ? (
        isMissingTableError(preview.error) ? (
          <BoardsUnavailable />
        ) : (
          <p className="error-text">Impossible de lire l'invitation. Vérifie ta connexion.</p>
        )
      ) : !p ? (
        <>
          <h1 style={{ fontSize: 22 }}>Invitation introuvable</h1>
          <p className="muted">Vérifie le lien reçu, ou demande-en un nouveau.</p>
        </>
      ) : p.status === 'expired' ? (
        <>
          <h1 style={{ fontSize: 22 }}>Invitation expirée</h1>
          <p className="muted">Ce lien n'est plus valable. Demande un nouveau lien à {p.inviter_first_name ?? 'la personne qui t’a invité'}.</p>
        </>
      ) : p.status === 'used' ? (
        <>
          <h1 style={{ fontSize: 22 }}>Invitation déjà utilisée</h1>
          <p className="muted">Ce lien a déjà servi à quelqu'un d'autre. Demande un nouveau lien.</p>
        </>
      ) : (
        <>
          <h1 style={{ fontSize: 22 }}>{p.inviter_first_name ?? 'Quelqu’un'} t'invite à rejoindre un tableau</h1>
          <div className={styles.inviteBoard} style={{ '--c': p.board_color } as CSSProperties}>
            <span className="label">Tableau</span>
            <b>{p.board_title}</b>
          </div>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <button type="button" className="btn primary block" onClick={() => void join()} disabled={joining}>
            {joining ? 'Un instant…' : 'Rejoindre'}
          </button>
        </>
      )}
      <button type="button" className="linkbtn" onClick={stop}>
        Plus tard
      </button>
      <button
        type="button"
        className="linkbtn"
        style={{ color: 'var(--muted)' }}
        onClick={() => {
          clearPendingInvite();
          navigate('/tableaux', { replace: true });
        }}
      >
        Mes tableaux
      </button>
    </div>
  );
}
