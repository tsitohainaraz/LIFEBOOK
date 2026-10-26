import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { authErrorMessage } from '../../utils/authErrors';
import { passwordError } from '../../utils/password';
import { Icon } from '../../components/Icon';
import { Logo } from '../../components/Logo';
import { PasswordRules } from '../../components/PasswordRules';
import styles from './Auth.module.css';

/** Retour du lien « Mot de passe oublié » : choisir un nouveau mot de passe. */
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState<'wait' | 'ok' | 'expired'>('wait');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const params = new URLSearchParams(window.location.search);
    if (params.get('error') || hash.get('error')) {
      setReady('expired');
      return;
    }
    // Le client échange le code du lien tout seul (detectSessionInUrl) ; on attend la session.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) setReady('ok');
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady('ok');
    });
    const timer = setTimeout(() => setReady((r) => (r === 'wait' ? 'expired' : r)), 8000);
    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const problem = passwordError(password, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError('');
    const { error: err } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (err) {
      setError(authErrorMessage(err));
      return;
    }
    setDone(true);
  }

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <header className={styles.brand}>
          <Logo size={80} />
          <h1>Nouveau mot de passe</h1>
        </header>

        {ready === 'wait' ? (
          <p className={styles.legal} role="status">
            Vérification du lien…
          </p>
        ) : ready === 'expired' ? (
          <div className={styles.form}>
            <p className={styles.err} role="alert">
              Ce lien a expiré ou a déjà servi. Demande un nouveau lien depuis l'écran de connexion.
            </p>
            <button type="button" className={styles.primary} onClick={() => navigate('/login', { replace: true })}>
              Retour à la connexion
              <Icon name="right" strokeWidth={2} />
            </button>
          </div>
        ) : done ? (
          <div className={styles.form}>
            <p className={styles.info} role="status">
              C'est fait : ton nouveau mot de passe est enregistré.
            </p>
            <button type="button" className={styles.primary} onClick={() => navigate('/', { replace: true })}>
              Continuer vers LifeBook
              <Icon name="right" strokeWidth={2} />
            </button>
          </div>
        ) : (
          <form className={styles.form} onSubmit={onSubmit} noValidate>
            <div className={styles.field}>
              <label htmlFor="newPassword">Nouveau mot de passe</label>
              <div className={styles.box}>
                <Icon name="lock" strokeWidth={1.8} />
                <input
                  id="newPassword"
                  type={show ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-describedby="newRules"
                />
                <button type="button" className={styles.show} onClick={() => setShow((s) => !s)} aria-pressed={show}>
                  {show ? 'Masquer' : 'Afficher'}
                </button>
              </div>
              <PasswordRules value={password} id="newRules" />
            </div>
            <div className={styles.field}>
              <label htmlFor="newConfirm">Confirme le mot de passe</label>
              <div className={styles.box}>
                <Icon name="lock" strokeWidth={1.8} />
                <input id="newConfirm" type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </div>
            </div>
            {error && (
              <p className={styles.err} role="alert">
                {error}
              </p>
            )}
            <button className={styles.primary} type="submit" disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer mon mot de passe'}
              <Icon name="right" strokeWidth={2} />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
