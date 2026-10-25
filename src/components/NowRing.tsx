import type { ReactNode } from 'react';
import { hms, toTime } from '../utils/dates';
import { phrase, type NowResult } from '../utils/now';
import styles from './NowRing.module.css';

const R = 96;
const C = 2 * Math.PI * R;
const URGENT_SEC = 600;

interface Props {
  result: NowResult;
  /** Minutes depuis minuit, avec les secondes (rafraîchi chaque seconde). */
  nowMin: number;
  onFinish: () => void;
  onLater: () => void;
  onPlan: () => void;
  onReport: () => void;
  busy?: boolean;
  /** Contenu affiché sous les boutons (bloc « À suivre »). */
  footer?: ReactNode;
}

/** Cercle « Maintenant » : 5 états, anneau de progression et compte à rebours. */
export function NowRing({ result, nowMin, onFinish, onLater, onPlan, onReport, busy, footer }: Props) {
  const { mode, task, start, end, lateCount } = result;
  let sec = 0;
  let frac = 0;
  if (mode === 'now') {
    sec = (end - nowMin) * 60;
    frac = (nowMin - start) / Math.max(1, end - start);
  } else if (mode === 'late') {
    sec = (nowMin - end) * 60;
    frac = 1;
  } else if (mode === 'next') {
    sec = (start - nowMin) * 60;
    frac = Math.max(0, 1 - (start - nowMin) / 120);
  }
  const urgent = mode === 'now' && sec <= URGENT_SEC;
  const tone = mode === 'late' ? styles.late : urgent ? styles.urgent : mode === 'now' ? '' : styles.calm;
  const offset = C * (1 - Math.min(1, Math.max(0, frac)));

  const ring = (
    <svg viewBox="0 0 220 220" aria-hidden="true">
      <circle cx="110" cy="110" r={R} fill="none" stroke="var(--empty)" strokeWidth="10" />
      <circle
        className={styles.arc}
        cx="110"
        cy="110"
        r={R}
        fill="none"
        stroke="var(--ring)"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={C}
        strokeDashoffset={offset}
        transform="rotate(-90 110 110)"
      />
      <g className={styles.spin}>
        <circle cx="110" cy="110" r="107" fill="none" stroke="var(--ring)" strokeWidth="1.5" strokeDasharray="2 9" opacity=".6" />
        <circle cx="110" cy="3" r="4" fill="var(--ring)" />
      </g>
    </svg>
  );

  if (mode === 'free' || mode === 'done' || !task) {
    const done = mode === 'done';
    return (
      <section className={`${styles.card} ${styles.calm}`} aria-live="polite">
        <div className={styles.tag}>
          <i />
          {done ? 'JOURNÉE ACCOMPLIE' : 'TEMPS LIBRE'}
        </div>
        <div className={styles.wrap}>
          {ring}
          <div className={styles.inner}>
            <small>{done ? 'tout est fait' : 'rien de prévu'}</small>
            <b>{done ? '✓' : '—'}</b>
          </div>
        </div>
        <p className={styles.say}>
          {done
            ? 'Bravo, ta journée est faite. Écris ton rapport.'
            : 'Aucune activité en ce moment. Planifie ta journée pour savoir quoi faire.'}
        </p>
        <div className={styles.acts}>
          <button className="btn primary" type="button" onClick={onPlan}>
            Planifier
          </button>
          <button className="btn outline" type="button" onClick={onReport}>
            Mon rapport
          </button>
        </div>
        {footer}
      </section>
    );
  }

  const p = phrase(task.title, mode);
  const tag = mode === 'now' ? 'MAINTENANT' : mode === 'late' ? 'EN RETARD' : 'À SUIVRE';
  const lbl = mode === 'now' ? 'reste' : mode === 'late' ? 'retard' : 'dans';
  const sub = mode === 'next' ? `début à ${toTime(start)}` : `fin ${mode === 'late' ? 'prévue ' : 'à '}${toTime(end)}`;
  let more: ReactNode = null;
  if (mode !== 'late' && lateCount) {
    more = (
      <div className={styles.more}>
        <b>{lateCount}</b> activité{lateCount > 1 ? 's' : ''} en retard aujourd’hui
      </div>
    );
  } else if (mode === 'late' && lateCount > 1) {
    more = (
      <div className={styles.more}>
        <b>{lateCount - 1}</b> autre{lateCount > 2 ? 's' : ''} en retard
      </div>
    );
  }

  return (
    <section className={`${styles.card} ${tone}`} aria-live="polite">
      <div className={styles.tag}>
        <i />
        {tag}
      </div>
      <div className={styles.wrap}>
        {ring}
        <div className={styles.inner}>
          <small>{lbl}</small>
          <b>{hms(sec)}</b>
          <span>{sub}</span>
        </div>
      </div>
      <p className={styles.say}>
        {p.before}
        <em>{p.em}</em>
        {p.after}
      </p>
      <div className={styles.when}>
        {toTime(start)} – {toTime(end)}
      </div>
      <div className={styles.acts}>
        <button className="btn primary" type="button" onClick={onFinish} disabled={busy}>
          Tâche terminée
        </button>
        <button className="btn outline" type="button" onClick={onLater}>
          Faire plus tard
        </button>
      </div>
      {more}
      {footer}
    </section>
  );
}
