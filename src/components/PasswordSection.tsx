import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { authErrorMessage } from '../utils/authErrors';
import { passwordError } from '../utils/password';
import { PasswordRules } from './PasswordRules';
import { useToast } from './Toast';

/** Mon compte : définir un mot de passe (compte créé avec un code ou Google) ou le changer. */
export function PasswordSection() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

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
    setPassword('');
    setConfirm('');
    setOpen(false);
    toast('Mot de passe enregistré');
  }

  if (!open) {
    return (
      <button type="button" className="btn outline" onClick={() => setOpen(true)}>
        Définir ou changer mon mot de passe
      </button>
    );
  }

  return (
    <form className="card" onSubmit={onSubmit} noValidate>
      <div className="label">Mot de passe</div>
      <label className="field">
        <span>Nouveau mot de passe</span>
        <input
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby="accountPwRules"
        />
      </label>
      <PasswordRules value={password} id="accountPwRules" />
      <label className="field">
        <span>Confirme le mot de passe</span>
        <input type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </label>
      <label className="row small muted">
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} style={{ width: 18, height: 18, minHeight: 0 }} />
        Afficher le mot de passe
      </label>
      {error && (
        <p className="error-text" role="alert" style={{ margin: 0 }}>
          {error}
        </p>
      )}
      <div className="row">
        <button type="button" className="btn" onClick={() => setOpen(false)} disabled={saving}>
          Annuler
        </button>
        <button type="submit" className="btn primary" style={{ flex: 1 }} disabled={saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  );
}
