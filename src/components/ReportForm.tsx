import { useEffect, useState, type FormEvent } from 'react';
import { useReport, useSaveReport } from '../hooks/useReport';
import { useLatestWellbeing } from '../hooks/useHealth';
import { useToast } from './Toast';
import type { ReportPeriod } from '../types/database';

interface Props {
  period: Extract<ReportPeriod, 'day' | 'week'>;
  periodStart: string;
  /** Afficher le formulaire déplié. */
  open?: boolean;
  /** Afficher dans un bloc dépliable (sinon une carte simple). */
  collapsible?: boolean;
}

/** Rapport du jour ou bilan de la semaine. */
export function ReportForm({ period, periodStart, open = false, collapsible = true }: Props) {
  const isDay = period === 'day';
  const reportQ = useReport(period, periodStart);
  const wellbeing = useLatestWellbeing();
  const save = useSaveReport();
  const toast = useToast();
  const r = reportQ.data;
  const [mood, setMood] = useState<number | null>(null);
  const [health, setHealth] = useState(70);
  const [wins, setWins] = useState('');
  const [lessons, setLessons] = useState('');
  const [blockers, setBlockers] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setMood(r?.mood ?? null);
    setHealth(r?.wellbeing_pct ?? wellbeing.data?.value ?? 70);
    setWins(r?.wins ?? '');
    setLessons(r?.lessons ?? '');
    setBlockers(r?.blockers ?? '');
    setNext(r?.next ?? '');
  }, [r, wellbeing.data?.value]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await save.mutateAsync({
        period,
        period_start: periodStart,
        mood,
        wellbeing_pct: isDay ? health : null,
        wins: wins.trim() || null,
        lessons: lessons.trim() || null,
        blockers: blockers.trim() || null,
        next: next.trim() || null,
      });
      toast(isDay ? 'Rapport du jour enregistré' : 'Bilan de la semaine enregistré');
    } catch {
      setError("L'enregistrement a échoué. Vérifie ta connexion et réessaie.");
    }
  }

  const form = reportQ.isLoading ? (
    <p className="muted small">Chargement…</p>
  ) : reportQ.isError ? (
    <p className="error-text">Impossible de charger le rapport.</p>
  ) : (
    <form className="list" onSubmit={onSubmit}>
      <div className="field">
        <span>{isDay ? 'Mon humeur' : "Comment s'est passée ma semaine ?"}</span>
        <div className="moods" role="group" aria-label="Note de 1 à 5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" aria-pressed={mood === n} onClick={() => setMood(mood === n ? null : n)}>
              {n}
            </button>
          ))}
        </div>
      </div>
      {isDay && (
        <label className="field">
          <span>
            Mon état de santé :{' '}
            <b className="mono lime">{health} %</b>
          </span>
          <input type="range" min={0} max={100} step={5} value={health} onChange={(e) => setHealth(Number(e.target.value))} />
        </label>
      )}
      <label className="field">
        <span>{isDay ? "Ce que j'ai accompli" : 'Ma plus belle victoire'}</span>
        <textarea maxLength={2000} value={wins} onChange={(e) => setWins(e.target.value)} />
      </label>
      <label className="field">
        <span>Ce que j'ai appris</span>
        <textarea maxLength={2000} value={lessons} onChange={(e) => setLessons(e.target.value)} />
      </label>
      {isDay && (
        <label className="field">
          <span>Ce qui a bloqué</span>
          <textarea maxLength={2000} value={blockers} onChange={(e) => setBlockers(e.target.value)} />
        </label>
      )}
      <label className="field">
        <span>{isDay ? 'Demain, je commence par' : 'La semaine prochaine, je change…'}</span>
        <input maxLength={200} value={next} onChange={(e) => setNext(e.target.value)} />
      </label>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <button className="btn primary" type="submit" disabled={save.isPending}>
        {save.isPending ? 'Enregistrement…' : r ? 'Mettre à jour' : 'Enregistrer'}
      </button>
    </form>
  );

  const title = isDay ? 'Rapport du jour' : 'Bilan de la semaine';
  if (!collapsible) {
    return (
      <div className="card">
        <div className="between">
          <h2 style={{ fontSize: 16 }}>{title}</h2>
          {r && <span className="st ok">écrit</span>}
        </div>
        {form}
      </div>
    );
  }
  return (
    <details className="box" open={open} id="rapport">
      <summary>
        <span>{title}</span>
        {r && (
          <span className="st ok" style={{ marginLeft: 'auto' }}>
            écrit
          </span>
        )}
      </summary>
      {form}
    </details>
  );
}
