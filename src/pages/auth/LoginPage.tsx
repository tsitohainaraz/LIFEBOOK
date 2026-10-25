import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { authErrorMessage, isValidEmail } from '../../utils/authErrors';
import { Icon } from '../../components/Icon';
import { Logo } from '../../components/Logo';
import { GoogleLogo } from './GoogleLogo';
import { readPendingEmail, savePendingEmail } from './pendingEmail';
import styles from './Auth.module.css';

const GOOGLE_UNAVAILABLE = "La connexion Google n'est pas encore disponible. Utilise ton adresse e-mail.";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const initialError = (location.state as { error?: string } | null)?.error ?? '';
  const [email, setEmail] = useState(readPendingEmail());
  const [emailError, setEmailError] = useState('');
  const [formError, setFormError] = useState(initialError);
  const [sending, setSending] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  async function onGoogle() {
    setFormError('');
    setGoogleBusy(true);
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { prompt: 'select_account' },
        skipBrowserRedirect: true,
      },
    });
    if (error || !data.url) {
      setGoogleBusy(false);
      const msg = authErrorMessage(error);
      setFormError(!error || msg.includes('Google') || error.status === 400 ? GOOGLE_UNAVAILABLE : msg);
      return;
    }
    // Si Google n'est pas activé dans Supabase, l'URL d'autorisation répond 400 au lieu de rediriger.
    try {
      const probe = await fetch(data.url, { redirect: 'manual' });
      if (probe.type !== 'opaqueredirect' && probe.status >= 400) {
        setGoogleBusy(false);
        setFormError(GOOGLE_UNAVAILABLE);
        return;
      }
    } catch {
      /* vérification impossible (réseau, CORS) : on tente quand même la redirection */
    }
    window.location.assign(data.url);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setEmailError('');
    setFormError('');
    const clean = email.trim().toLowerCase();
    if (!isValidEmail(clean)) {
      setEmailError('Cette adresse e-mail ne semble pas valide.');
      return;
    }
    setSending(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: clean,
      options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setSending(false);
    if (error) {
      setFormError(authErrorMessage(error));
      return;
    }
    savePendingEmail(clean);
    navigate('/verify', { state: { email: clean, sentAt: Date.now() } });
  }

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <header className={styles.brand}>
          <Logo size={96} />
          <h1>Bienvenue dans LifeBook</h1>
          <p>Ta vie tient sur une page. Connecte-toi pour retrouver ton programme et tes objectifs.</p>
        </header>

        <button type="button" className={styles.google} onClick={onGoogle} disabled={googleBusy}>
          <GoogleLogo />
          {googleBusy ? 'Ouverture de Google…' : 'Continuer avec Google'}
        </button>

        <div className={styles.or}>ou</div>

        <form className={styles.form} onSubmit={onSubmit} noValidate>
          <div className={styles.field}>
            <label htmlFor="email">Adresse e-mail</label>
            <div className={styles.box}>
              <Icon name="mail" strokeWidth={1.8} />
              <input
                id="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="nom@exemple.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={emailError ? true : undefined}
                aria-describedby={emailError ? 'emailErr' : undefined}
              />
            </div>
            {emailError && (
              <p className={styles.err} id="emailErr">
                {emailError}
              </p>
            )}
          </div>
          {formError && (
            <p className={styles.err} role="alert">
              {formError}
            </p>
          )}
          <button className={styles.primary} type="submit" disabled={sending}>
            {sending ? 'Envoi du code…' : 'Recevoir un code'}
            <Icon name="right" strokeWidth={2} />
          </button>
        </form>

        <p className={styles.legal}>
          Pas besoin de mot de passe : tu reçois un code à 6 chiffres par e-mail. En continuant, tu acceptes les
          conditions d'utilisation et la politique de confidentialité de LifeBook.
        </p>
      </div>
    </div>
  );
}
