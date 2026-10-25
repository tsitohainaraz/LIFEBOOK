import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useAddHealthLog, useDeleteHealthLog, useHealthLogs, useHealthProfile } from '../../hooks/useHealth';
import { useTasksRange } from '../../hooks/useTasks';
import { ErrorState, LoadingState } from '../../components/States';
import { useToast } from '../../components/Toast';
import { addDaysISO, fmtDate, mondayOf, toISODate, todayISO, toMin } from '../../utils/dates';
import { bmi, bmiCategory, classifyBloodPressure, formatBmi, WHO_WEEKLY_MINUTES } from '../../utils/health';
import { niceRange, pathOf, scalePoints, type Point } from '../../utils/chart';
import { taskEnd } from '../../utils/now';
import type { HealthLogRow } from '../../types/database';
import styles from './Health.module.css';

const num = (v: string): number | null => {
  const n = Number(v.replace(',', '.'));
  return v.trim() === '' || Number.isNaN(n) ? null : n;
};

export function HealthPage() {
  const { profile } = useAuth();
  const consent = !!profile?.health_consent_at;
  const logsQ = useHealthLogs(90);
  const healthQ = useHealthProfile(consent);
  const logs = logsQ.data ?? [];
  const lastWeight = logs.find((l) => l.weight_kg != null)?.weight_kg ?? healthQ.data?.weight_kg ?? null;
  const currentBmi = bmi(healthQ.data?.height_cm, lastWeight);
  const bmiCat = bmiCategory(currentBmi);

  return (
    <>
      <div className="pagehead">
        <div className="label">Santé</div>
        <h1>
          Mon journal <span>de santé</span>
        </h1>
        <p className="muted small" style={{ margin: 0 }}>
          Tension, poids, pouls, sommeil et bien-être, jour après jour.
        </p>
      </div>
      <p className="medical" role="note">
        LifeBook ne remplace pas l'avis d'un médecin. Les lectures ci-dessous sont indicatives et ne sont pas un
        diagnostic.
      </p>

      {!consent && (
        <div className="card">
          <p className="small" style={{ margin: 0 }}>
            Tu as passé l'étape santé du profil. Tu peux quand même noter tes mesures ici ; pour des conseils adaptés,
            complète ton profil santé.
          </p>
          <Link className="btn sm outline" to="/onboarding?etape=1">
            Compléter mon profil santé
          </Link>
        </div>
      )}

      <WhoCounter />

      <div className="stats3">
        <div className="lime">
          <b>{formatBmi(currentBmi)}</b>
          <small>IMC {bmiCat ? `· ${bmiCat.label}` : '(taille et poids)'}</small>
        </div>
        <div>
          <b>{lastWeight ?? '—'}</b>
          <small>kg, dernière pesée</small>
        </div>
        <div>
          <b>{logs.find((l) => l.wellbeing_pct != null)?.wellbeing_pct ?? '—'}</b>
          <small>% bien-être</small>
        </div>
      </div>

      <AddMeasure />

      {logsQ.isLoading ? (
        <LoadingState label="Chargement de ton journal…" />
      ) : logsQ.isError ? (
        <ErrorState message="Impossible de charger ton journal de santé." onRetry={() => void logsQ.refetch()} />
      ) : (
        <>
          <Charts logs={logs} />
          <History logs={logs} />
        </>
      )}
    </>
  );
}

/** Compteur OMS : minutes de sport faites cette semaine. */
function WhoCounter() {
  const week = mondayOf(todayISO());
  const tasks = useTasksRange(week, addDaysISO(week, 6)).data ?? [];
  const minutes = tasks
    .filter((t) => t.category === 'sport' && t.done_at && t.start_time)
    .reduce((a, t) => a + taskEnd(t) - toMin(t.start_time), 0);
  const ratio = Math.min(1, minutes / WHO_WEEKLY_MINUTES);
  return (
    <div className="card">
      <div className="between">
        <div className="label">Activité de la semaine</div>
        <span className="mono small">
          {minutes} / {WHO_WEEKLY_MINUTES} min
        </span>
      </div>
      <div className="bar">
        <i style={{ width: `${ratio * 100}%` }} />
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        Réf. OMS : au moins 150 min d'activité physique modérée par semaine. Compte les activités « Sport » cochées.
      </p>
    </div>
  );
}

function AddMeasure() {
  const add = useAddHealthLog();
  const toast = useToast();
  const [f, setF] = useState({ sys: '', dia: '', weight: '', pulse: '', sleep: '', wellbeing: 70, withWellbeing: false });
  const [error, setError] = useState('');
  const bp = classifyBloodPressure(num(f.sys), num(f.dia));
  const set = (k: keyof typeof f, v: string | number | boolean) => setF((x) => ({ ...x, [k]: v }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const values = {
      systolic: num(f.sys),
      diastolic: num(f.dia),
      weight_kg: num(f.weight),
      pulse: num(f.pulse),
      sleep_h: num(f.sleep),
      wellbeing_pct: f.withWellbeing ? f.wellbeing : null,
    };
    if ((values.systolic == null) !== (values.diastolic == null)) return setError('Indique les deux chiffres de la tension.');
    if (values.systolic != null && (values.systolic < 60 || values.systolic > 260)) return setError('Systolique : entre 60 et 260.');
    if (values.diastolic != null && (values.diastolic < 30 || values.diastolic > 160)) return setError('Diastolique : entre 30 et 160.');
    if (values.weight_kg != null && (values.weight_kg < 20 || values.weight_kg > 350)) return setError('Poids : entre 20 et 350 kg.');
    if (values.pulse != null && (values.pulse < 30 || values.pulse > 200)) return setError('Pouls : entre 30 et 200.');
    if (values.sleep_h != null && (values.sleep_h < 0 || values.sleep_h > 24)) return setError('Sommeil : entre 0 et 24 h.');
    if (Object.values(values).every((v) => v == null)) return setError('Remplis au moins une mesure.');
    try {
      await add.mutateAsync(values);
      setF({ sys: '', dia: '', weight: '', pulse: '', sleep: '', wellbeing: 70, withWellbeing: false });
      toast('Mesure enregistrée');
    } catch {
      setError("L'enregistrement a échoué. Vérifie ta connexion.");
    }
  }

  return (
    <form className="card" onSubmit={onSubmit} noValidate>
      <div className="label">Nouvelle mesure</div>
      <div className="grid2">
        <label className="field">
          <span>Systolique (mmHg)</span>
          <input type="number" inputMode="numeric" placeholder="120" value={f.sys} onChange={(e) => set('sys', e.target.value)} />
        </label>
        <label className="field">
          <span>Diastolique (mmHg)</span>
          <input type="number" inputMode="numeric" placeholder="80" value={f.dia} onChange={(e) => set('dia', e.target.value)} />
        </label>
      </div>
      {bp && (
        <div className={styles.readout}>
          <span>
            Tension {f.sys} / {f.dia}
          </span>
          <span className={`st ${bp.tone === 'ok' ? 'ok' : bp.tone === 'warn' ? 'urgent' : bp.tone === 'bad' ? 'late' : 'soon'}`}>{bp.label}</span>
        </div>
      )}
      {bp?.urgent && (
        <p className="error-text" role="alert">
          Ta tension est très élevée : consulte rapidement un médecin. Évite tout effort intense en attendant.
        </p>
      )}
      <div className="grid2">
        <label className="field">
          <span>Poids (kg)</span>
          <input type="number" inputMode="decimal" step="0.1" value={f.weight} onChange={(e) => set('weight', e.target.value)} />
        </label>
        <label className="field">
          <span>Pouls (bpm)</span>
          <input type="number" inputMode="numeric" value={f.pulse} onChange={(e) => set('pulse', e.target.value)} />
        </label>
      </div>
      <label className="field">
        <span>Sommeil de la nuit (h)</span>
        <input type="number" inputMode="decimal" step="0.5" value={f.sleep} onChange={(e) => set('sleep', e.target.value)} />
      </label>
      <label className="row small" style={{ minHeight: 44 }}>
        <input type="checkbox" checked={f.withWellbeing} onChange={(e) => set('withWellbeing', e.target.checked)} style={{ accentColor: 'var(--lime)', width: 20, height: 20 }} />
        Noter aussi mon bien-être
      </label>
      {f.withWellbeing && (
        <label className="field">
          <span>
            Bien-être : <b className="mono lime">{f.wellbeing} %</b>
          </span>
          <input type="range" min={0} max={100} step={5} value={f.wellbeing} onChange={(e) => set('wellbeing', Number(e.target.value))} />
        </label>
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <button className="btn primary" type="submit" disabled={add.isPending}>
        Enregistrer la mesure
      </button>
    </form>
  );
}

function LineChart({ series, unit, label }: { series: { name: string; color: string; points: Point[] }[]; unit: string; label: string }) {
  const W = 320;
  const H = 120;
  const all = series.flatMap((s) => s.points.map((p) => p.v));
  if (all.length < 2) return <p className="empty">Ajoute au moins deux mesures pour voir la courbe.</p>;
  const range = niceRange(all);
  const allPoints = series.flatMap((s) => s.points);
  const t0 = Math.min(...allPoints.map((p) => p.t));
  const t1 = Math.max(...allPoints.map((p) => p.t));
  return (
    <figure className={styles.chart} aria-label={label}>
      <svg viewBox={`-30 -8 ${W + 38} ${H + 26}`} role="img" aria-label={label}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={0} x2={W} y1={H * f} y2={H * f} stroke="var(--line)" strokeDasharray="3 4" />
            <text x={-6} y={H * f + 3} textAnchor="end" fontSize="9" fill="var(--muted)" fontFamily="JetBrains Mono, monospace">
              {Math.round(range[1] - (range[1] - range[0]) * f)}
            </text>
          </g>
        ))}
        {series.map((s) => {
          // Même échelle de temps pour toutes les séries.
          const pts = scalePoints([{ t: t0, v: range[0] }, ...s.points, { t: t1, v: range[0] }], W, H, range).slice(1, -1);
          return (
            <g key={s.name}>
              <path d={pathOf(pts)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" />
              {pts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="3" fill={s.color} />
              ))}
            </g>
          );
        })}
        <text x={0} y={H + 16} fontSize="9" fill="var(--muted)" fontFamily="JetBrains Mono, monospace">
          {fmtDate(toISODate(new Date(t0)), 'd MMM')}
        </text>
        <text x={W} y={H + 16} textAnchor="end" fontSize="9" fill="var(--muted)" fontFamily="JetBrains Mono, monospace">
          {fmtDate(toISODate(new Date(t1)), 'd MMM')}
        </text>
      </svg>
      <figcaption className="legend2">
        {series.map((s) => (
          <span key={s.name}>
            <i style={{ background: s.color }} />
            {s.name} ({unit})
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

function Charts({ logs }: { logs: HealthLogRow[] }) {
  const asc = logs.slice().reverse();
  const t = (l: HealthLogRow) => new Date(l.logged_at).getTime();
  const sys = asc.filter((l) => l.systolic != null).map((l) => ({ t: t(l), v: l.systolic as number }));
  const dia = asc.filter((l) => l.diastolic != null).map((l) => ({ t: t(l), v: l.diastolic as number }));
  const weight = asc.filter((l) => l.weight_kg != null).map((l) => ({ t: t(l), v: Number(l.weight_kg) }));
  return (
    <>
      <div className="card">
        <div className="label">Tension</div>
        <LineChart
          label="Courbe de la tension"
          unit="mmHg"
          series={[
            { name: 'Systolique', color: 'var(--late)', points: sys },
            { name: 'Diastolique', color: 'var(--soon)', points: dia },
          ]}
        />
      </div>
      <div className="card">
        <div className="label">Poids</div>
        <LineChart label="Courbe du poids" unit="kg" series={[{ name: 'Poids', color: 'var(--lime)', points: weight }]} />
      </div>
    </>
  );
}

function History({ logs }: { logs: HealthLogRow[] }) {
  const del = useDeleteHealthLog();
  const toast = useToast();
  return (
    <div className="card">
      <div className="label">Historique</div>
      {logs.length === 0 ? (
        <p className="empty">Aucune mesure pour l'instant. Ajoute la première ci-dessus.</p>
      ) : (
        <div className="list">
          {logs.map((l) => {
            const bp = classifyBloodPressure(l.systolic, l.diastolic);
            const parts = [
              l.systolic != null && l.diastolic != null ? `${l.systolic}/${l.diastolic} mmHg` : null,
              l.weight_kg != null ? `${l.weight_kg} kg` : null,
              l.pulse != null ? `${l.pulse} bpm` : null,
              l.sleep_h != null ? `${l.sleep_h} h de sommeil` : null,
              l.wellbeing_pct != null ? `bien-être ${l.wellbeing_pct} %` : null,
            ].filter(Boolean);
            const d = new Date(l.logged_at);
            return (
              <div key={l.id} className="item">
                <div className="t">
                  <span>{parts.join(' · ')}</span>
                  <small>
                    {fmtDate(toISODate(d), 'EEEE d MMMM')} à {d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </small>
                </div>
                {bp && <span className={`st ${bp.tone === 'ok' ? 'ok' : bp.tone === 'warn' ? 'urgent' : bp.tone === 'bad' ? 'late' : 'soon'}`}>{bp.label}</span>}
                <button type="button" className="x" aria-label="Supprimer la mesure" onClick={() => del.mutate(l.id, { onSuccess: () => toast('Mesure supprimée') })}>
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
