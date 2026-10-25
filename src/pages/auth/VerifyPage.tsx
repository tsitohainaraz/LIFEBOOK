import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { authErrorMessage } from '../../utils/authErrors';
import { Logo } from '../../components/Logo';
import { clearPendingEmail, readPendingEmail } from './pendingEmail';
import styles from './Auth.module.css';
import { currentMs } from '../../lib/serverTime';

const LEN = 6;
const RESEND_DELAY = 60;

export function VerifyPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { email?: string; sentAt?: number } | null;
  const email = state?.email ?? readPendingEmail();
  const [digits, setDigits] = useState<string[]>(() => Array(LEN).fill(''));
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [checking, setChecking] = useState(false);
  const [wait, setWait] = useState(() => {
    const elapsed = state?.sentAt ? Math.floor((currentMs() - state.sentAt) / 1000) : 0;
    return Math.max(0, RESEND_DELAY - elapsed);
  });
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  useEffect(() => {
    inputs.current[0]?.focus();
  }, []);

  if (!email) return <Navigate to="/login" replace />;

  async function verify(code: string) {
    setChecking(true);
    setError('');
    setInfo('');
    const { error: err } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
    setChecking(false);
    if (err) {
      setError(authErrorMessage(err));
      setDigits(Array(LEN).fill(''));
      inputs.current[0]?.focus();
      return;
    }
    clearPendingEmail();
    // La redirection (accueil ou profil) est faite par la garde de route dès que la session est chargée.
  }

  function setAt(index: number, value: string) {
    const next = [...digits];
    next[index] = value;
    setDigits(next);
    if (next.every((d) => d !== '')) void verify(next.join(''));
  }

  function onChange(index: number, raw: string) {
    const only = raw.replace(/\D/g, '');
    if (!only) {
      setAt(index, '');
      return;
    }
    if (only.length > 1) {
      fill(only, index);
      return;
    }
    setAt(index, only);
    if (index < LEN - 1) inputs.current[index + 1]?.focus();
  }

  function fill(code: string, from = 0) {
    const next = [...digits];
    for (let i = 0; i < code.length && from + i < LEN; i++) next[from + i] = code[i];
    setDigits(next);
    const firstEmpty = next.findIndex((d) => d === '');
    inputs.current[firstEmpty === -1 ? LEN - 1 : firstEmpty]?.focus();
    if (next.every((d) => d !== '')) void verify(next.join(''));
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const code = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, LEN);
    if (!code) return;
    e.preventDefault();
    fill(code);
  }

  function onKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  }

  async function resend() {
    setError('');
    setInfo('');
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (err) {
      setError(authErrorMessage(err));
      return;
    }
    setInfo(`Un nouveau code a été envoyé à ${email}.`);
    setWait(RESEND_DELAY);
  }

  function changeEmail() {
    navigate('/login', { replace: true });
  }

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.verify}>
          <div className={styles.orb} aria-hidden="true">
            <Logo size={112} />
            <span className={styles.comet}>
              <span className={styles.star} />
            </span>
            <span className={styles.dot} />
            <span className={`${styles.dot} ${styles.d2}`} />
            <span className={`${styles.dot} ${styles.d3}`} />
          </div>
          <div className={styles.waiting} role="status">
            <span>{checking ? 'Vérification du code' : 'En attente de vérification'}</span>
            <i />
            <i />
            <i />
          </div>
          <h2>Vérifie ta boîte mail</h2>
          <p>
            Entre le code envoyé à <span className={styles.mail}>{email}</span>
          </p>

          <div className={styles.code} role="group" aria-label="Code à 6 chiffres">
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => {
                  inputs.current[i] = el;
                }}
                value={d}
                inputMode="numeric"
                autoComplete={i === 0 ? 'one-time-code' : 'off'}
                pattern="[0-9]*"
                maxLength={LEN}
                aria-label={`Chiffre ${i + 1}`}
                aria-invalid={error ? true : undefined}
                disabled={checking}
                onChange={(e) => onChange(i, e.target.value)}
                onKeyDown={(e) => onKeyDown(i, e)}
                onPaste={onPaste}
                onFocus={(e) => e.target.select()}
              />
            ))}
          </div>

          {error && (
            <p className={styles.err} role="alert">
              {error}
            </p>
          )}
          {info && (
            <p className={styles.info} role="status">
              {info}
            </p>
          )}

          <p>Tu peux aussi toucher le lien reçu dans l'e-mail (pense à regarder dans les spams).</p>

          <div className={styles.vbtns}>
            <button className={styles.ghost} type="button" onClick={resend} disabled={wait > 0}>
              {wait > 0 ? `Renvoyer le code (${wait} s)` : 'Renvoyer le code'}
            </button>
            <button className={styles.link} type="button" onClick={changeEmail}>
              Modifier l'adresse e-mail
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
