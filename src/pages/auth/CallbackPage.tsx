import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Splash } from '../../components/Splash';
import { authErrorMessage } from '../../utils/authErrors';
import { clearPendingEmail } from './pendingEmail';

/**
 * Retour de Google ou du lien reçu par e-mail.
 * La redirection finale (accueil ou profil) est faite par la garde de route une fois la session chargée.
 */
export function CallbackPage() {
  const navigate = useNavigate();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    const params = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const errorDescription =
      params.get('error_description') ?? hash.get('error_description') ?? params.get('error') ?? hash.get('error');
    const code = params.get('code');

    async function run() {
      if (errorDescription) {
        const msg = /provider|not enabled/i.test(errorDescription)
          ? "La connexion Google n'est pas encore disponible. Utilise ton adresse e-mail."
          : /expired|invalid/i.test(errorDescription)
            ? 'Ce lien a expiré ou a déjà servi. Demande un nouveau code.'
            : `Connexion impossible : ${errorDescription}`;
        navigate('/login', { replace: true, state: { error: msg } });
        return;
      }
      // Le client échange déjà le code automatiquement (detectSessionInUrl) : on attend la session.
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        clearPendingEmail();
        navigate('/', { replace: true });
        return;
      }
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
          clearPendingEmail();
          navigate('/', { replace: true });
          return;
        }
        const msg = /verifier/i.test(error.message)
          ? "Ouvre le lien sur le même téléphone et le même navigateur que ta demande, ou entre le code à 6 chiffres."
          : authErrorMessage(error);
        navigate('/login', { replace: true, state: { error: msg } });
        return;
      }
      navigate('/login', { replace: true });
    }
    void run();
  }, [navigate]);

  return <Splash message="Connexion en cours…" />;
}
