import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useProfile } from '../contexts/AuthContext';
import { useUpdateProfile } from '../hooks/useProfile';
import { supabase } from '../lib/supabase';
import { birthDateError } from '../utils/options';
import { DEFAULT_TIME_ZONE, isValidTimeZone } from '../lib/serverTime';

// Fuseaux proposés : Madagascar et la région, puis quelques grandes villes.
const TIME_ZONES = [
  ['Indian/Antananarivo', 'Madagascar (UTC+3)'],
  ['Indian/Comoro', 'Comores (UTC+3)'],
  ['Indian/Mauritius', 'Maurice (UTC+4)'],
  ['Indian/Reunion', 'La Réunion (UTC+4)'],
  ['Africa/Nairobi', 'Nairobi (UTC+3)'],
  ['Africa/Johannesburg', 'Johannesburg (UTC+2)'],
  ['Europe/Paris', 'Paris'],
  ['Europe/London', 'Londres'],
  ['America/Montreal', 'Montréal'],
  ['America/New_York', 'New York'],
  ['Asia/Shanghai', 'Chine'],
  ['UTC', 'UTC'],
];
import { Sheet } from './Sheet';
import { AssistantAccount } from '../features/assistant/AssistantAccount';
import { PasswordSection } from './PasswordSection';
import { useToast } from './Toast';

/** Mon compte : identité, paramètres de vie, déconnexion, suppression du compte. */
export function AccountSheet({ onClose }: { onClose: () => void }) {
  const profile = useProfile();
  const { signOut, user } = useAuth();
  const update = useUpdateProfile();
  const toast = useToast();
  const navigate = useNavigate();
  const [f, setF] = useState({
    first: profile.first_name ?? '',
    last: profile.last_name ?? '',
    birth: profile.birth_date ?? '',
    exp: String(profile.life_expectancy),
    sleep: String(profile.sleep_hours),
    work: String(profile.work_hours),
    retire: String(profile.retire_age),
    tz: isValidTimeZone(profile.timezone) ? profile.timezone : DEFAULT_TIME_ZONE,
  });
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setError('');
    const exp = Number(f.exp);
    const sleep = Number(f.sleep);
    const work = Number(f.work);
    const retire = Number(f.retire);
    const birthErr = birthDateError(f.birth);
    if (!f.first.trim()) return setError('Indique ton prénom.');
    if (birthErr) return setError(birthErr);
    if (!(exp >= 40 && exp <= 120)) return setError('L’espérance de vie doit être entre 40 et 120 ans.');
    if (!(sleep >= 3 && sleep <= 14)) return setError('Le sommeil doit être entre 3 et 14 h par nuit.');
    if (!(work >= 0 && work <= 100)) return setError('Le travail doit être entre 0 et 100 h par semaine.');
    if (!(retire >= 30 && retire <= 90)) return setError('L’âge de la retraite doit être entre 30 et 90 ans.');
    try {
      await update.mutateAsync({
        first_name: f.first.trim(),
        last_name: f.last.trim() || null,
        birth_date: f.birth,
        life_expectancy: exp,
        sleep_hours: sleep,
        work_hours: work,
        retire_age: retire,
        timezone: f.tz,
      });
      toast('Compte mis à jour');
      onClose();
    } catch {
      setError("L'enregistrement a échoué. Vérifie ta connexion.");
    }
  }

  async function onDelete() {
    setDeleting(true);
    const { error: err } = await supabase.rpc('delete_my_account');
    if (err) {
      setDeleting(false);
      setError('La suppression a échoué. Réessaie plus tard.');
      return;
    }
    await signOut();
    navigate('/login', { replace: true, state: { error: 'Ton compte et toutes tes données ont été supprimés.' } });
  }

  return (
    <Sheet title="Mon compte" onClose={onClose}>
      <p className="muted small" style={{ margin: 0 }}>
        Connecté avec {user?.email}
      </p>
      <form className="list" onSubmit={onSave}>
        <div className="grid2">
          <label className="field">
            <span>Prénom</span>
            <input value={f.first} maxLength={40} onChange={(e) => set('first', e.target.value)} autoComplete="given-name" />
          </label>
          <label className="field">
            <span>Nom</span>
            <input value={f.last} maxLength={40} onChange={(e) => set('last', e.target.value)} autoComplete="family-name" />
          </label>
        </div>
        <div className="grid2">
          <label className="field">
            <span>Date de naissance</span>
            <input type="date" value={f.birth} onChange={(e) => set('birth', e.target.value)} />
          </label>
          <label className="field">
            <span>Espérance de vie (ans)</span>
            <input type="number" min={40} max={120} value={f.exp} onChange={(e) => set('exp', e.target.value)} />
          </label>
        </div>
        <div className="grid2">
          <label className="field">
            <span>Sommeil (h/nuit)</span>
            <input type="number" min={3} max={14} step={0.5} value={f.sleep} onChange={(e) => set('sleep', e.target.value)} />
          </label>
          <label className="field">
            <span>Travail (h/semaine)</span>
            <input type="number" min={0} max={100} value={f.work} onChange={(e) => set('work', e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>Âge de la retraite</span>
          <input type="number" min={30} max={90} value={f.retire} onChange={(e) => set('retire', e.target.value)} />
        </label>
        <label className="field">
          <span>Fuseau horaire (pour « aujourd’hui » et « maintenant »)</span>
          <select value={f.tz} onChange={(e) => set('tz', e.target.value)}>
            {!TIME_ZONES.some(([z]) => z === f.tz) && <option value={f.tz}>{f.tz}</option>}
            {TIME_ZONES.map(([z, label]) => (
              <option key={z} value={z}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <button className="btn primary" type="submit" disabled={update.isPending}>
          Enregistrer
        </button>
      </form>

      <AssistantAccount onNavigate={onClose} />

      <PasswordSection />

      <button
        type="button"
        className="btn outline"
        onClick={() => {
          onClose();
          navigate('/onboarding?etape=1');
        }}
      >
        Modifier mon profil et ma santé
      </button>
      <button
        type="button"
        className="btn"
        onClick={async () => {
          await signOut();
          navigate('/login', { replace: true });
        }}
      >
        Me déconnecter
      </button>

      <details className="box">
        <summary>Confidentialité</summary>
        <p className="muted small" style={{ marginTop: 0 }}>
          Tes données sont privées : seule ta session peut les lire. Tes données de santé sont rangées à part et ne
          servent qu'à adapter ton programme. La suppression du compte efface tout, définitivement.
        </p>
        {!confirmDelete ? (
          <button type="button" className="btn danger block" onClick={() => setConfirmDelete(true)}>
            Supprimer mon compte et toutes mes données
          </button>
        ) : (
          <div className="list">
            <p className="error-text">Cette action est définitive. Tes tâches, objectifs, rapports et données de santé seront effacés.</p>
            <button type="button" className="btn danger block" onClick={onDelete} disabled={deleting} style={{ borderColor: 'var(--late)' }}>
              {deleting ? 'Suppression…' : 'Confirmer la suppression'}
            </button>
            <button type="button" className="btn block" onClick={() => setConfirmDelete(false)}>
              Annuler
            </button>
          </div>
        )}
      </details>
    </Sheet>
  );
}
