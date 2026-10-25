import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useAvatarUrl, uploadAvatar, useUpdateProfile } from '../../hooks/useProfile';
import { useFamilyHistory, useHealthProfile, useSaveFamilyHistory, useSaveHealthProfile } from '../../hooks/useHealth';
import { Icon } from '../../components/Icon';
import { Logo } from '../../components/Logo';
import { bmi, bmiCategory, classifyBloodPressure, formatBmi } from '../../utils/health';
import { squareJpeg } from '../../utils/image';
import {
  ACTIVITY_OPTIONS,
  ALCOHOL_OPTIONS,
  BLOOD_TYPES,
  CONDITION_OPTIONS,
  DIABETES_OPTIONS,
  FAITH_OPTIONS,
  FAMILY_ANSWERS,
  FAMILY_DISEASES,
  NATIONALITIES,
  RELATIVES,
  SMOKING_OPTIONS,
  STATUS_OPTIONS,
  ageOn,
  birthDateError,
  labelOf,
} from '../../utils/options';
import type {
  ActivityLevel,
  Alcohol,
  BloodType,
  Database,
  Diabetes,
  Disease,
  Faith,
  FamilyAnswer,
  LifeStatus,
  Smoking,
} from '../../types/database';
import styles from './Onboarding.module.css';
import { nowISO } from '../../lib/serverTime';
import { todayISO } from '../../utils/dates';

// Phases enregistrées dans profiles.onboarding_step (1 à 6).
const PHASES = ['identity', 'situation', 'consent', 'health', 'family', 'summary'] as const;
type Phase = (typeof PHASES)[number];
const stepOf = (p: Phase) => PHASES.indexOf(p) + 1;
/** Numéro affiché « Étape n sur 4 ». */
const DISPLAY: Record<Phase, number> = { identity: 1, situation: 2, consent: 3, health: 3, family: 4, summary: 4 };

type FamilyInsert = Database['public']['Tables']['family_history']['Insert'];
type FamilyState =Record<Exclude<Disease, 'autre'>, { answer: FamilyAnswer | ''; relatives: string[] }>;

interface Form {
  first: string;
  last: string;
  birth: string;
  nat: string;
  status: LifeStatus | '';
  statusDetail: string;
  faith: Faith | '';
  faithDetail: string;
  height: string;
  weight: string;
  sys: string;
  dia: string;
  pulse: string;
  blood: BloodType | '';
  diabetes: Diabetes | '';
  conditions: string[];
  condOther: string;
  meds: string;
  allergies: string;
  activity: ActivityLevel | '';
  sleep: string;
  water: string;
  smoking: Smoking;
  alcohol: Alcohol;
  family: FamilyState;
  famOther: string;
}

const emptyFamily = (): FamilyState => ({
  cancer: { answer: '', relatives: [] },
  diabete: { answer: '', relatives: [] },
  avc: { answer: '', relatives: [] },
  hypertension: { answer: '', relatives: [] },
  coeur: { answer: '', relatives: [] },
});

const str = (v: number | string | null | undefined) => (v == null ? '' : String(v));
const num = (v: string): number | null => {
  const n = Number(v.replace(',', '.'));
  return v.trim() === '' || Number.isNaN(n) ? null : n;
};

/** Contrôle d'une mesure facultative : vide ou dans l'intervalle. */
function rangeError(v: string, min: number, max: number, label: string): string {
  const n = num(v);
  if (v.trim() === '') return '';
  if (n == null || n < min || n > max) return `${label} : entre ${min} et ${max}.`;
  return '';
}

export function OnboardingPage() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const { user, profile, refreshProfile } = useAuth();
  const updateProfile = useUpdateProfile();
  const saveHealth = useSaveHealthProfile();
  const saveFamily = useSaveFamilyHistory();
  const hasConsent = !!profile?.health_consent_at;
  const healthQ = useHealthProfile(hasConsent);
  const familyQ = useFamilyHistory(hasConsent);

  const initialPhase = (): Phase => {
    if (search.get('etape') === '1') return 'identity';
    const i = Math.min(6, Math.max(1, profile?.onboarding_step ?? 1)) - 1;
    const p = PHASES[i];
    if ((p === 'health' || p === 'family') && !hasConsent) return 'consent';
    return p;
  };
  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [form, setForm] = useState<Form>(() => ({
    first: profile?.first_name ?? '',
    last: profile?.last_name ?? '',
    birth: profile?.birth_date ?? '',
    nat: profile?.nationality ?? '',
    status: profile?.status ?? '',
    statusDetail: profile?.status_detail ?? '',
    faith: profile?.faith ?? '',
    faithDetail: profile?.faith_detail ?? '',
    height: '',
    weight: '',
    sys: '',
    dia: '',
    pulse: '',
    blood: '',
    diabetes: '',
    conditions: [],
    condOther: '',
    meds: '',
    allergies: '',
    activity: '',
    sleep: str(profile?.sleep_hours ?? 8),
    water: '',
    smoking: 'non',
    alcohol: 'jamais',
    family: emptyFamily(),
    famOther: '',
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState('');
  const [busy, setBusy] = useState(false);
  const [avatarPath, setAvatarPath] = useState<string | null>(profile?.avatar_url ?? null);
  const [localPhoto, setLocalPhoto] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const avatarQ = useAvatarUrl(avatarPath);
  const hydratedHealth = useRef(false);
  const hydratedFamily = useRef(false);

  // Reprise : on recharge les réponses santé et famille déjà enregistrées.
  useEffect(() => {
    const h = healthQ.data;
    if (!h || hydratedHealth.current) return;
    hydratedHealth.current = true;
    setForm((f) => ({
      ...f,
      height: str(h.height_cm),
      weight: str(h.weight_kg),
      sys: str(h.systolic),
      dia: str(h.diastolic),
      pulse: str(h.pulse),
      blood: h.blood_type ?? '',
      diabetes: h.diabetes ?? '',
      conditions: h.conditions ?? [],
      condOther: h.other_condition ?? '',
      meds: h.medications ?? '',
      allergies: h.allergies ?? '',
      activity: h.activity_level ?? '',
      sleep: str(h.sleep_hours ?? profile?.sleep_hours ?? 8),
      water: str(h.water_l),
      smoking: h.smoking ?? 'non',
      alcohol: h.alcohol ?? 'jamais',
    }));
  }, [healthQ.data, profile?.sleep_hours]);

  useEffect(() => {
    const rows = familyQ.data;
    if (!rows || rows.length === 0 || hydratedFamily.current) return;
    hydratedFamily.current = true;
    setForm((f) => {
      const family = emptyFamily();
      let famOther = f.famOther;
      for (const r of rows) {
        if (r.disease === 'autre') famOther = r.other_text ?? '';
        else family[r.disease] = { answer: r.answer, relatives: r.relatives ?? [] };
      }
      return { ...f, family, famOther };
    });
  }, [familyQ.data]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [phase]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const bmiValue = bmi(num(form.height), num(form.weight));
  const bmiCat = bmiCategory(bmiValue);
  const bp = classifyBloodPressure(num(form.sys), num(form.dia));

  async function onPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user) return;
    setPhotoBusy(true);
    setSaveError('');
    try {
      const blob = await squareJpeg(file, 512);
      setLocalPhoto(URL.createObjectURL(blob));
      const path = await uploadAvatar(user.id, blob);
      setAvatarPath(path);
    } catch {
      setSaveError("La photo n'a pas pu être envoyée. Réessaie avec une autre image.");
      setLocalPhoto(null);
    } finally {
      setPhotoBusy(false);
    }
  }

  function removePhoto() {
    setLocalPhoto(null);
    setAvatarPath(null);
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (phase === 'identity') {
      if (!form.first.trim()) e.first = 'Indique ton prénom.';
      if (!form.last.trim()) e.last = 'Indique ton nom.';
      const b = birthDateError(form.birth);
      if (b) e.birth = b;
      if (!form.nat.trim()) e.nat = 'Indique ta nationalité.';
    }
    if (phase === 'situation') {
      if (!form.status) e.status = 'Choisis ta situation.';
      if (!form.faith) e.faith = 'Choisis une option, ou « Rien ».';
    }
    if (phase === 'health') {
      const checks: [string, string, number, number, string][] = [
        ['height', form.height, 80, 250, 'Taille'],
        ['weight', form.weight, 20, 350, 'Poids'],
        ['sys', form.sys, 60, 260, 'Systolique'],
        ['dia', form.dia, 30, 160, 'Diastolique'],
        ['pulse', form.pulse, 30, 200, 'Pouls'],
        ['sleep', form.sleep, 2, 14, 'Sommeil'],
        ['water', form.water, 0, 8, 'Eau'],
      ];
      for (const [k, v, min, max, label] of checks) {
        const msg = rangeError(v, min, max, label);
        if (msg) e[k] = msg;
      }
      if ((form.sys.trim() === '') !== (form.dia.trim() === '')) e.dia = 'Indique les deux chiffres de la tension.';
    }
    setErrors(e);
    if (Object.keys(e).length) {
      setTimeout(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
    }
    return Object.keys(e).length === 0;
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setSaveError('');
    try {
      await action();
    } catch {
      setSaveError("L'enregistrement a échoué. Vérifie ta connexion et réessaie.");
    } finally {
      setBusy(false);
    }
  }

  function goTo(next: Phase) {
    setErrors({});
    setPhase(next);
  }

  async function onNext() {
    if (!validate()) return;
    await run(async () => {
      if (phase === 'identity') {
        await updateProfile.mutateAsync({
          first_name: form.first.trim(),
          last_name: form.last.trim(),
          birth_date: form.birth,
          nationality: form.nat.trim(),
          avatar_url: avatarPath,
          onboarding_step: Math.max(profile?.onboarding_step ?? 1, stepOf('situation')),
        });
        goTo('situation');
      } else if (phase === 'situation') {
        await updateProfile.mutateAsync({
          status: form.status || null,
          status_detail: form.status !== 'aucun' ? form.statusDetail.trim() || null : null,
          faith: form.faith || null,
          faith_detail: ['chretien', 'islam', 'autre'].includes(form.faith) ? form.faithDetail.trim() || null : null,
          onboarding_step: Math.max(profile?.onboarding_step ?? 1, stepOf(hasConsent ? 'health' : 'consent')),
        });
        goTo(hasConsent ? 'health' : 'consent');
      } else if (phase === 'health') {
        await saveHealth.mutateAsync({
          height_cm: num(form.height),
          weight_kg: num(form.weight),
          systolic: num(form.sys),
          diastolic: num(form.dia),
          pulse: num(form.pulse),
          blood_type: form.blood || null,
          diabetes: form.diabetes || null,
          conditions: form.conditions,
          other_condition: form.condOther.trim() || null,
          medications: form.meds.trim() || null,
          allergies: form.allergies.trim() || null,
          activity_level: form.activity || null,
          sleep_hours: num(form.sleep),
          water_l: num(form.water),
          smoking: form.smoking,
          alcohol: form.alcohol,
        });
        const sleep = num(form.sleep);
        await updateProfile.mutateAsync({
          ...(sleep != null ? { sleep_hours: sleep } : {}),
          onboarding_step: Math.max(profile?.onboarding_step ?? 1, stepOf('family')),
        });
        goTo('family');
      } else if (phase === 'family') {
        const rows: FamilyInsert[] = FAMILY_DISEASES.filter((d) => form.family[d.value].answer).map((d) => ({
          disease: d.value,
          answer: form.family[d.value].answer as FamilyAnswer,
          relatives: form.family[d.value].answer === 'oui' ? form.family[d.value].relatives : [],
        }));
        if (form.famOther.trim()) {
          rows.push({ disease: 'autre', answer: 'oui', relatives: [], other_text: form.famOther.trim() });
        }
        if (rows.length) await saveFamily.mutateAsync(rows);
        await updateProfile.mutateAsync({ onboarding_step: stepOf('summary') });
        goTo('summary');
      }
    });
  }

  async function onConsent(accept: boolean) {
    await run(async () => {
      if (accept) {
        await updateProfile.mutateAsync({
          health_consent_at: nowISO(),
          onboarding_step: Math.max(profile?.onboarding_step ?? 1, stepOf('health')),
        });
        goTo('health');
      } else {
        await updateProfile.mutateAsync({ onboarding_step: stepOf('summary') });
        goTo('summary');
      }
    });
  }

  async function onFinish() {
    await run(async () => {
      await updateProfile.mutateAsync({ onboarding_done_at: nowISO() });
      await refreshProfile();
      navigate('/', { replace: true });
    });
  }

  function onBack() {
    const order: Phase[] = hasConsent
      ? ['identity', 'situation', 'health', 'family', 'summary']
      : ['identity', 'situation', 'consent', 'summary'];
    const i = order.indexOf(phase);
    if (phase === 'consent') goTo('situation');
    else if (i > 0) goTo(order[i - 1]);
  }

  const photoUrl = localPhoto ?? avatarQ.data ?? null;
  const shown = DISPLAY[phase];

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        {phase !== 'summary' && (
          <div className={styles.top}>
            <div className={styles.toprow}>
              <Logo size={30} />
              <b>
                Life<span>Book</span>
              </b>
              <small>Étape {shown} sur 4</small>
            </div>
            <div className={styles.prog} aria-hidden="true">
              {[1, 2, 3, 4].map((n) => (
                <i key={n} className={n <= shown ? styles.on : undefined} />
              ))}
            </div>
          </div>
        )}

        {phase === 'identity' && (
          <section>
            <div className={styles.head}>
              <span className={styles.k}>Ton profil</span>
              <h1>Faisons connaissance</h1>
              <p>Adresse confirmée. Quelques informations pour personnaliser ton LifeBook.</p>
            </div>
            <div className={styles.card} style={{ marginTop: 18 }}>
              <div className={styles.photo}>
                <div
                  className={`${styles.avatar} ${photoUrl ? styles.has : ''}`}
                  style={photoUrl ? { backgroundImage: `url("${photoUrl}")` } : undefined}
                  role="img"
                  aria-label={photoUrl ? 'Ta photo de profil' : 'Pas encore de photo'}
                >
                  {!photoUrl && <Icon name="user" strokeWidth={1.6} />}
                </div>
                <div className={styles.photoBtns}>
                  <label className={styles.pick} htmlFor="photo">
                    <Icon name="camera" strokeWidth={1.8} />
                    {photoBusy ? 'Envoi…' : photoUrl ? 'Changer la photo' : 'Ajouter une photo'}
                  </label>
                  <input
                    id="photo"
                    className={styles.hiddenFile}
                    type="file"
                    accept="image/*"
                    onChange={onPhoto}
                    disabled={photoBusy}
                  />
                  {photoUrl && (
                    <button type="button" className="linkbtn" onClick={removePhoto}>
                      Retirer la photo
                    </button>
                  )}
                  <span className={styles.opt}>Photo de profil, facultative</span>
                </div>
              </div>
              <div className="grid2">
                <TextField id="first" label="Prénom" value={form.first} onChange={(v) => set('first', v)} error={errors.first} autoComplete="given-name" />
                <TextField id="last" label="Nom" value={form.last} onChange={(v) => set('last', v)} error={errors.last} autoComplete="family-name" />
              </div>
              <div className={styles.field}>
                <label htmlFor="birth">Date de naissance</label>
                <input
                  id="birth"
                  type="date"
                  max={todayISO()}
                  value={form.birth}
                  onChange={(e) => set('birth', e.target.value)}
                  aria-invalid={errors.birth ? true : undefined}
                />
                {errors.birth && <p className={styles.err}>{errors.birth}</p>}
              </div>
              <div className={styles.field}>
                <label htmlFor="nat">Nationalité</label>
                <input
                  id="nat"
                  list="natList"
                  placeholder="Commence à écrire…"
                  autoComplete="off"
                  value={form.nat}
                  onChange={(e) => set('nat', e.target.value)}
                  aria-invalid={errors.nat ? true : undefined}
                />
                <datalist id="natList">
                  {NATIONALITIES.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
                {errors.nat && <p className={styles.err}>{errors.nat}</p>}
              </div>
            </div>
          </section>
        )}

        {phase === 'situation' && (
          <section>
            <div className={styles.head}>
              <span className={styles.k}>Ta situation</span>
              <h1>Ton quotidien</h1>
              <p>Pour organiser tes semaines autour de tes cours, de ton travail et de ta foi.</p>
            </div>
            <div className={styles.card} style={{ marginTop: 18 }}>
              <h2>Tu es actuellement…</h2>
              <div className={styles.tiles} role="radiogroup" aria-label="Situation">
                {STATUS_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={form.status === o.value}
                    className={styles.chip}
                    onClick={() => set('status', o.value)}
                  >
                    <StatusIcon value={o.value} />
                    {o.label}
                  </button>
                ))}
              </div>
              {errors.status && <p className={styles.err}>{errors.status}</p>}
              {form.status && form.status !== 'aucun' && (
                <TextField
                  id="statusDetail"
                  label={form.status === 'etudiant' ? 'Filière ou école' : 'Métier'}
                  optional
                  value={form.statusDetail}
                  onChange={(v) => set('statusDetail', v)}
                  maxLength={80}
                />
              )}
            </div>
            <div className={styles.card} style={{ marginTop: 14 }}>
              <h2>Ta croyance</h2>
              <div className={styles.chips} role="radiogroup" aria-label="Croyance">
                {FAITH_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={form.faith === o.value}
                    className={styles.chip}
                    onClick={() => set('faith', o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              {['chretien', 'islam', 'autre'].includes(form.faith) && (
                <TextField
                  id="faithDetail"
                  label={
                    form.faith === 'chretien'
                      ? 'Église ou confession (catholique, protestante…)'
                      : form.faith === 'islam'
                        ? 'Courant'
                        : 'Laquelle ?'
                  }
                  optional
                  value={form.faithDetail}
                  onChange={(v) => set('faithDetail', v)}
                  maxLength={60}
                />
              )}
              {errors.faith && <p className={styles.err}>{errors.faith}</p>}
            </div>
          </section>
        )}

        {phase === 'consent' && (
          <section className={styles.consent}>
            <div className={styles.head}>
              <span className={styles.k}>Ta santé</span>
              <h1>Tes données de santé</h1>
              <p>Avant de parler de ta santé, nous avons besoin de ton accord.</p>
            </div>
            <div className={styles.card}>
              <h2>À quoi servent ces informations ?</h2>
              <ul>
                <li>Adapter la durée et l'intensité du sport proposé.</li>
                <li>Te rappeler de bouger quand tes antécédents l'expliquent (AVC, tension, diabète, cœur).</li>
                <li>Suivre ta tension, ton poids et ton sommeil dans le journal de santé.</li>
              </ul>
              <p className={styles.note}>
                <Icon name="lock" strokeWidth={1.8} />
                <span>
                  Tes informations de santé restent privées, dans des tables séparées. Tu peux les supprimer à tout
                  moment avec ton compte. LifeBook ne remplace pas l'avis d'un médecin.
                </span>
              </p>
            </div>
            <button type="button" className={`${styles.navbtn} ${styles.next}`} onClick={() => onConsent(true)} disabled={busy}>
              J'accepte que LifeBook utilise mes données de santé pour adapter mon programme
            </button>
            <button type="button" className={`${styles.navbtn} ${styles.ghostbtn}`} onClick={() => onConsent(false)} disabled={busy}>
              Passer cette étape
            </button>
          </section>
        )}

        {phase === 'health' && (
          <section>
            <div className={styles.head}>
              <span className={styles.k}>Ta santé</span>
              <h1>Ton état de santé</h1>
              <p>Pour te proposer du sport et un rythme adaptés à ton corps.</p>
            </div>
            {healthQ.isLoading && <p className="muted small">Chargement de tes réponses…</p>}
            <div className={styles.card} style={{ marginTop: 18 }}>
              <h2>Mesures</h2>
              <div className="grid2">
                <UnitField id="height" label="Taille" unit="cm" value={form.height} onChange={(v) => set('height', v)} error={errors.height} />
                <UnitField id="weight" label="Poids" unit="kg" value={form.weight} onChange={(v) => set('weight', v)} error={errors.weight} step="0.1" />
              </div>
              <div className={styles.readout}>
                <div>
                  <small className={styles.opt}>Indice de masse corporelle (IMC)</small>
                  <br />
                  <b>{formatBmi(bmiValue)}</b>
                </div>
                <span className={`${styles.badge} ${bmiCat ? styles[bmiCat.tone] : ''}`}>{bmiCat?.label ?? 'à calculer'}</span>
              </div>
              <div className={styles.field}>
                <span className={styles.lbl}>
                  Ta tension artérielle <span className={styles.opt}>facultatif</span>
                </span>
                <div className="grid2">
                  <UnitField id="sys" label="Systolique" hideLabel unit="mmHg" value={form.sys} onChange={(v) => set('sys', v)} error={errors.sys} placeholder="Systolique" />
                  <UnitField id="dia" label="Diastolique" hideLabel unit="mmHg" value={form.dia} onChange={(v) => set('dia', v)} error={errors.dia} placeholder="Diastolique" />
                </div>
                <span className={styles.opt}>Exemple : 12/8 s'écrit 120 et 80.</span>
              </div>
              <div className={styles.readout}>
                <div>
                  <small className={styles.opt}>Lecture de ta tension</small>
                  <br />
                  <b>{bp ? `${form.sys} / ${form.dia}` : '—'}</b>
                </div>
                <span className={`${styles.badge} ${bp ? styles[bp.tone] : ''}`}>{bp?.label ?? 'non renseignée'}</span>
              </div>
              {bp?.urgent && (
                <p className={styles.err} role="alert">
                  Ta tension est très élevée : consulte rapidement un médecin.
                </p>
              )}
              <div className="grid2">
                <UnitField id="pulse" label="Pouls au repos" optional unit="bpm" value={form.pulse} onChange={(v) => set('pulse', v)} error={errors.pulse} />
                <div className={styles.field}>
                  <label htmlFor="blood">Groupe sanguin</label>
                  <select id="blood" value={form.blood} onChange={(e) => set('blood', e.target.value as BloodType | '')}>
                    <option value="">Je ne sais pas</option>
                    {BLOOD_TYPES.map((b) => (
                      <option key={b.value} value={b.value}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className={styles.note}>LifeBook ne remplace pas l'avis d'un médecin.</p>
            </div>

            <div className={styles.card} style={{ marginTop: 14 }}>
              <h2>Es-tu diabétique ?</h2>
              <ChipRadio options={DIABETES_OPTIONS} value={form.diabetes} onChange={(v) => set('diabetes', v)} label="Diabète" />
            </div>

            <div className={styles.card} style={{ marginTop: 14 }}>
              <h2>As-tu l'un de ces problèmes ?</h2>
              <div className={styles.chips} aria-label="Problèmes de santé" role="group">
                {CONDITION_OPTIONS.map((o) => {
                  const on = form.conditions.includes(o.value);
                  return (
                    <button
                      key={o.value}
                      type="button"
                      aria-pressed={on}
                      className={styles.chip}
                      onClick={() => {
                        if (o.value === 'Aucun') set('conditions', on ? [] : ['Aucun']);
                        else
                          set(
                            'conditions',
                            on
                              ? form.conditions.filter((c) => c !== o.value)
                              : [...form.conditions.filter((c) => c !== 'Aucun'), o.value],
                          );
                      }}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
              <TextField id="condOther" label="Autre problème ou blessure" optional value={form.condOther} onChange={(v) => set('condOther', v)} placeholder="Ex. entorse à la cheville en 2024" maxLength={120} />
              <TextField id="meds" label="Traitement en cours" optional value={form.meds} onChange={(v) => set('meds', v)} maxLength={120} />
              <TextField id="allergies" label="Allergies" optional value={form.allergies} onChange={(v) => set('allergies', v)} maxLength={120} />
            </div>

            <div className={styles.card} style={{ marginTop: 14 }}>
              <h2>Ton mode de vie</h2>
              <div className={styles.field}>
                <span className={styles.lbl}>Activité physique actuelle</span>
                <ChipRadio options={ACTIVITY_OPTIONS} value={form.activity} onChange={(v) => set('activity', v)} label="Activité physique" />
              </div>
              <div className="grid2">
                <UnitField id="sleep" label="Sommeil par nuit" unit="h" value={form.sleep} onChange={(v) => set('sleep', v)} error={errors.sleep} step="0.5" />
                <UnitField id="water" label="Eau par jour" unit="L" value={form.water} onChange={(v) => set('water', v)} error={errors.water} step="0.5" />
              </div>
              <div className="grid2">
                <div className={styles.field}>
                  <label htmlFor="smoke">Tabac</label>
                  <select id="smoke" value={form.smoking} onChange={(e) => set('smoking', e.target.value as Smoking)}>
                    {SMOKING_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={styles.field}>
                  <label htmlFor="alcohol">Alcool</label>
                  <select id="alcohol" value={form.alcohol} onChange={(e) => set('alcohol', e.target.value as Alcohol)}>
                    {ALCOHOL_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </section>
        )}

        {phase === 'family' && (
          <section>
            <div className={styles.head}>
              <span className={styles.k}>Antécédents familiaux</span>
              <h1>Ta famille</h1>
              <p>Certaines maladies de tes parents augmentent ton risque. LifeBook en tiendra compte pour ton programme.</p>
            </div>
            <div className={styles.card} style={{ marginTop: 18 }}>
              <div className={styles.fam}>
                {FAMILY_DISEASES.map((d) => {
                  const row = form.family[d.value];
                  const setRow = (r: Partial<typeof row>) =>
                    set('family', { ...form.family, [d.value]: { ...row, ...r } });
                  return (
                    <div className={styles.famrow} key={d.value}>
                      <span className={styles.q}>{d.question}</span>
                      <ChipRadio options={FAMILY_ANSWERS} value={row.answer} onChange={(v) => setRow({ answer: v })} label={d.question} />
                      {row.answer === 'oui' && (
                        <div className={styles.chips} role="group" aria-label="Qui ?">
                          {RELATIVES.map((r) => {
                            const on = row.relatives.includes(r.value);
                            return (
                              <button
                                key={r.value}
                                type="button"
                                aria-pressed={on}
                                className={styles.chip}
                                onClick={() =>
                                  setRow({
                                    relatives: on ? row.relatives.filter((x) => x !== r.value) : [...row.relatives, r.value],
                                  })
                                }
                              >
                                {r.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className={styles.famrow}>
                  <TextField id="famOther" label="Autre maladie dans la famille" optional value={form.famOther} onChange={(v) => set('famOther', v)} placeholder="Ex. hypertension chez le grand-père" maxLength={120} />
                </div>
              </div>
            </div>
            <p className={styles.note} style={{ marginTop: 14 }}>
              <Icon name="lock" strokeWidth={1.8} />
              <span>
                Tes informations de santé restent privées et servent seulement à adapter ton programme. LifeBook ne
                remplace pas l'avis d'un médecin : en cas de tension élevée ou de maladie, demande-lui quels sports te
                conviennent.
              </span>
            </p>
          </section>
        )}

        {phase === 'summary' && (
          <Summary
            form={form}
            photoUrl={photoUrl}
            hasConsent={hasConsent}
            bmiText={bmiValue != null ? `${formatBmi(bmiValue)} · ${bmiCat?.label ?? ''}` : 'Non renseigné'}
            bpText={bp ? `${form.sys} / ${form.dia} · ${bp.label}` : 'Non renseignée'}
            onEdit={() => goTo('identity')}
          />
        )}

        {saveError && (
          <p className={styles.err} role="alert">
            {saveError}
          </p>
        )}
      </div>

      {phase !== 'consent' && (
        <nav className={`${styles.bar} ${phase === 'identity' || phase === 'summary' ? styles.single : ''}`}>
          <div>
            {phase !== 'identity' && phase !== 'summary' && (
              <button type="button" className={`${styles.navbtn} ${styles.back}`} onClick={onBack} aria-label="Étape précédente">
                <Icon name="left" strokeWidth={2} />
              </button>
            )}
            {phase === 'summary' ? (
              <button type="button" className={`${styles.navbtn} ${styles.next}`} onClick={onFinish} disabled={busy}>
                {busy ? 'Ouverture…' : 'Ouvrir mon LifeBook'} <Icon name="right" strokeWidth={2} />
              </button>
            ) : (
              <button type="button" className={`${styles.navbtn} ${styles.next}`} onClick={onNext} disabled={busy || photoBusy}>
                {busy ? 'Enregistrement…' : phase === 'family' ? 'Terminer' : 'Continuer'} <Icon name="right" strokeWidth={2} />
              </button>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}

function Summary({
  form,
  photoUrl,
  hasConsent,
  bmiText,
  bpText,
  onEdit,
}: {
  form: Form;
  photoUrl: string | null;
  hasConsent: boolean;
  bmiText: string;
  bpText: string;
  onEdit: () => void;
}) {
  const fam = FAMILY_DISEASES.filter((d) => form.family[d.value].answer === 'oui').map(
    (d) => d.label + (form.family[d.value].relatives.length ? ` (${form.family[d.value].relatives.join(', ')})` : ''),
  );
  if (form.famOther.trim()) fam.push(form.famOther.trim());
  const conds = [...form.conditions];
  if (form.condOther.trim()) conds.push(form.condOther.trim());
  const items: [string, string][] = [
    ['Âge', form.birth ? `${ageOn(form.birth)} ans` : '—'],
    ['Nationalité', form.nat || '—'],
    [
      'Situation',
      labelOf(STATUS_OPTIONS, form.status || null) +
        (form.statusDetail.trim() && form.status !== 'aucun' ? ` · ${form.statusDetail.trim()}` : ''),
    ],
    ['Croyance', labelOf(FAITH_OPTIONS, form.faith || null) + (form.faithDetail.trim() ? ` · ${form.faithDetail.trim()}` : '')],
  ];
  if (hasConsent) {
    items.push(
      ['IMC', bmiText],
      ['Tension', bpText],
      ['Diabète', labelOf(DIABETES_OPTIONS, form.diabetes || null) || 'Non renseigné'],
      ['Activité', labelOf(ACTIVITY_OPTIONS, form.activity || null) || 'Non renseignée'],
      ['Santé', conds.length ? conds.join(', ') : 'Non renseigné'],
      ['Famille', fam.length ? fam.join(' ; ') : 'Aucun antécédent signalé'],
    );
  } else {
    items.push(['Santé', 'Étape passée : tu pourras la remplir plus tard.']);
  }
  return (
    <section className={styles.summary}>
      <div
        className={`${styles.avatar} ${photoUrl ? styles.has : ''}`}
        style={photoUrl ? { backgroundImage: `url("${photoUrl}")` } : undefined}
        aria-hidden="true"
      >
        {!photoUrl && (form.first.trim().charAt(0) || '?').toUpperCase()}
      </div>
      <h1>
        {form.first.trim()} {form.last.trim()}
      </h1>
      <p className={styles.opt} style={{ fontSize: 14, margin: 0 }}>
        Ton profil est prêt. LifeBook va préparer un programme adapté.
      </p>
      <div className={styles.sumgrid}>
        {items.map(([k, v]) => (
          <div key={k} className={k === 'Famille' || k === 'Santé' ? styles.wide : undefined}>
            <small>{k}</small>
            <b>{v}</b>
          </div>
        ))}
      </div>
      <button type="button" className="linkbtn" onClick={onEdit}>
        Modifier mes informations
      </button>
    </section>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  error,
  optional,
  placeholder,
  maxLength = 40,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  optional?: boolean;
  placeholder?: string;
  maxLength?: number;
  autoComplete?: string;
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={id}>
        {label} {optional && <span className={styles.opt}>facultatif</span>}
      </label>
      <input
        id={id}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
      />
      {error && <p className={styles.err}>{error}</p>}
    </div>
  );
}

function UnitField({
  id,
  label,
  unit,
  value,
  onChange,
  error,
  optional,
  hideLabel,
  placeholder,
  step,
}: {
  id: string;
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  optional?: boolean;
  hideLabel?: boolean;
  placeholder?: string;
  step?: string;
}) {
  return (
    <div className={styles.field}>
      {!hideLabel && (
        <label htmlFor={id}>
          {label} {optional && <span className={styles.opt}>facultatif</span>}
        </label>
      )}
      <div className={styles.unit}>
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          value={value}
          placeholder={placeholder}
          aria-label={hideLabel ? label : undefined}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
        />
        <span>{unit}</span>
      </div>
      {error && <p className={styles.err}>{error}</p>}
    </div>
  );
}

function ChipRadio<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T | '';
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className={styles.chips} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={styles.chip}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function StatusIcon({ value }: { value: LifeStatus }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  if (value === 'etudiant')
    return (
      <svg {...common}>
        <path d="M2 9l10-5 10 5-10 5z" />
        <path d="M6 11v5c3 2 9 2 12 0v-5" />
      </svg>
    );
  if (value === 'travailleur')
    return (
      <svg {...common}>
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M8 7V5h8v2M3 13h18" />
      </svg>
    );
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h8" />
    </svg>
  );
}
