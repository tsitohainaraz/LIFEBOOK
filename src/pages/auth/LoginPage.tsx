import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { authErrorMessage, isValidEmail } from '../../utils/authErrors';
import { passwordError } from '../../utils/password';
import { Icon } from '../../components/Icon';
import { Logo } from '../../components/Logo';
import { PasswordRules } from '../../components/PasswordRules';
import { GoogleLogo } from './GoogleLogo';
import { readPendingEmail, savePendingEmail } from './pendingEmail';
import styles from './Auth.module.css';
import { currentMs } from '../../lib/serverTime';

const GOOGLE_UNAVAILABLE = "La connexion Google n'est pas encore disponible. Utilise ton adresse e-mail.";

type Method = 'password' | 'code';
type PasswordMode = 'signin' | 'signup';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const initialError = (location.state as { error?: string } | null)?.error ?? '';
  const [method, setMethod] = useState<Method>('password');
  const [mode, setMode] = useState<PasswordMode>('signin');
  const [email, setEmail] = useState(readPendingEmail());
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [formError, setFormError] = useState(initialError);
  const [info, setInfo] = useState('');
  const [sending, setSending] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  const redirect = `${window.location.origin}/auth/callback`;

  function reset(next?: { method?: Method; mode?: PasswordMode }) {
    setFormError('');
    setEmailError('');
    setInfo('');
    setPassword('');
    setConfirm('');
    if (next?.method) setMethod(next.method);
    if (next?.mode) setMode(next.mode);
  }

  function cleanEmail(): string | null {
    const clean = email.trim().toLowerCase();
    if (!isValidEmail(clean)) {
      setEmailError('Cette adresse e-mail ne semble pas valide.');
      return null;
    }
    return clean;
  }

  async function onGoogle() {
    setFormError('');
    setGoogleBusy(true);
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirect,
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

  async function onCode(e: FormEvent) {
    e.preventDefault();
    setEmailError('');
    setFormError('');
    const clean = cleanEmail();
    if (!clean) return;
    setSending(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: clean,
      options: { shouldCreateUser: true, emailRedirectTo: redirect },
    });
    setSending(false);
    if (error) {
      setFormError(authErrorMessage(error));
      return;
    }
    savePendingEmail(clean);
    navigate('/verify', { state: { email: clean, sentAt: currentMs() } });
  }

  async function onPassword(e: FormEvent) {
    e.preventDefault();
    setEmailError('');
    setFormError('');
    setInfo('');
    const clean = cleanEmail();
    if (!clean) return;

    if (mode === 'signin') {
      if (!password) {
        setFormError('Entre ton mot de passe.');
        return;
      }
      setSending(true);
      const { error } = await supabase.auth.signInWithPassword({ email: clean, password });
      setSending(false);
      // Une fois connecté, la garde de route envoie vers l'accueil (ou le profil).
      if (error) setFormError(authErrorMessage(error));
      return;
    }

    const problem = passwordError(password, confirm);
    if (problem) {
      setFormError(problem);
      return;
    }
    setSending(true);
    const { data, error } = await supabase.auth.signUp({ email: clean, password, options: { emailRedirectTo: redirect } });
    setSending(false);
    if (error) {
      setFormError(authErrorMessage(error));
      return;
    }
    if (data.session) return; // confirmation de l'e-mail désactivée : déjà connecté
    // Adresse déjà utilisée : Supabase ne renvoie pas d'erreur (pour ne rien révéler), mais aucune identité.
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      setFormError('Un compte existe déjà avec cet e-mail. Connecte-toi, ou touche « Mot de passe oublié ».');
      return;
    }
    savePendingEmail(clean);
    navigate('/verify', { state: { email: clean, sentAt: currentMs(), type: 'signup' } });
  }

  async function onForgot() {
    setFormError('');
    setInfo('');
    const clean = cleanEmail();
    if (!clean) return;
    setSending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(clean, { redirectTo: `${window.location.origin}/nouveau-mot-de-passe` });
    setSending(false);
    if (error) {
      setFormError(authErrorMessage(error));
      return;
    }
    setInfo(`Si un compte existe pour ${clean}, un e-mail vient d'être envoyé avec un lien pour choisir un nouveau mot de passe.`);
  }

  const signup = method === 'password' && mode === 'signup';

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <header className={styles.brand}>
          <Logo size={96} />
          <h1>{signup ? 'Crée ton compte LifeBook' : 'Bienvenue dans LifeBook'}</h1>
          <p>Ta vie tient sur une page. Connecte-toi pour retrouver ton programme et tes objectifs.</p>
        </header>

        <button type="button" className={styles.google} onClick={onGoogle} disabled={googleBusy}>
          <GoogleLogo />
          {googleBusy ? 'Ouverture de Google…' : 'Continuer avec Google'}
        </button>

        <div className={styles.or}>ou</div>

        <div className={styles.tabs} role="tablist" aria-label="Méthode de connexion">
          <button type="button" role="tab" aria-selected={method === 'password'} className={styles.tab} onClick={() => reset({ method: 'password' })}>
            Mot de passe
          </button>
          <button type="button" role="tab" aria-selected={method === 'code'} className={styles.tab} onClick={() => reset({ method: 'code' })}>
            Code par e-mail
          </button>
        </div>

        <form className={styles.form} onSubmit={method === 'code' ? onCode : onPassword} noValidate>
          <div className={styles.field}>
            <label htmlFor="email">Adresse e-mail</label>
            <div className={styles.box}>
              <Icon name="mail" strokeWidth={1.8} />
              <input
                id="email"
                type="email"
                autoComplete={signup ? 'email' : 'username'}
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

          {method === 'password' && (
            <>
              <div className={styles.field}>
                <label htmlFor="password">Mot de passe</label>
                <div className={styles.box}>
                  <Icon name="lock" strokeWidth={1.8} />
                  <input
                    id="password"
                    type={show ? 'text' : 'password'}
                    autoComplete={signup ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-describedby={signup ? 'pwRules' : undefined}
                  />
                  <button type="button" className={styles.show} onClick={() => setShow((s) => !s)} aria-pressed={show}>
                    {show ? 'Masquer' : 'Afficher'}
                  </button>
                </div>
                {signup && <PasswordRules value={password} id="pwRules" />}
              </div>
              {signup && (
                <div className={styles.field}>
                  <label htmlFor="confirm">Confirme le mot de passe</label>
                  <div className={styles.box}>
                    <Icon name="lock" strokeWidth={1.8} />
                    <input id="confirm" type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                  </div>
                </div>
              )}
            </>
          )}

          {formError && (
            <p className={styles.err} role="alert">
              {formError}
            </p>
          )}
          {info && (
            <p className={styles.info} role="status">
              {info}
            </p>
          )}

          <button className={styles.primary} type="submit" disabled={sending}>
            {method === 'code'
              ? sending
                ? 'Envoi du code…'
                : 'Recevoir un code'
              : sending
                ? 'Un instant…'
                : signup
                  ? 'Créer mon compte'
                  : 'Se connecter'}
            <Icon name="right" strokeWidth={2} />
          </button>
        </form>

        {method === 'password' && (
          <div className={styles.links}>
            {mode === 'signin' ? (
              <>
                <button type="button" className={styles.link} onClick={() => void onForgot()} disabled={sending}>
                  Mot de passe oublié ?
                </button>
                <button type="button" className={styles.link} onClick={() => reset({ mode: 'signup' })}>
                  Créer un compte
                </button>
              </>
            ) : (
              <button type="button" className={styles.link} onClick={() => reset({ mode: 'signin' })}>
                J'ai déjà un compte
              </button>
            )}
          </div>
        )}

        <p className={styles.legal}>
          {method === 'code'
            ? 'Pas besoin de mot de passe : tu reçois un code à 6 chiffres par e-mail.'
            : 'Tu as créé ton compte avec un code ? Touche « Mot de passe oublié » pour choisir un mot de passe.'}{' '}
          En continuant, tu acceptes les conditions d'utilisation et la politique de confidentialité de LifeBook.
        </p>
      </div>
    </div>
  );
}
