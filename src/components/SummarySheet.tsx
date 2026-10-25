import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useProfile } from '../contexts/AuthContext';
import { useGoals } from '../hooks/useGoals';
import { useAddHealthLog, useLatestWellbeing } from '../hooks/useHealth';
import { fmtNumber, toISODate, fmtDate } from '../utils/dates';
import { goalStatus } from '../utils/goals';
import { lifeSummary } from '../utils/life';
import { Sheet } from './Sheet';
import { useToast } from './Toast';
import styles from '../pages/home/Home.module.css';
import { currentDate, toZoned } from '../lib/serverTime';

/** « Mon résumé » : semaines à dormir, à travailler, temps libre, santé, objectifs. */
export function SummarySheet({ onClose, onHealthLog }: { onClose: () => void; onHealthLog: () => void }) {
  const profile = useProfile();
  const goals = useGoals().data ?? [];
  const wellbeing = useLatestWellbeing();
  const [editing, setEditing] = useState(false);
  const now = currentDate();
  const L = profile.birth_date
    ? lifeSummary(
        {
          birthDate: profile.birth_date,
          lifeExpectancy: profile.life_expectancy,
          sleepHours: Number(profile.sleep_hours),
          workHours: Number(profile.work_hours),
          retireAge: profile.retire_age,
        },
        now,
      )
    : null;
  const reached = goals.filter((g) => g.done_at).length;
  const open = goals.filter((g) => !g.done_at);
  const urgent = open.filter((g) => ['late', 'urgent'].includes(goalStatus(g, now))).length;
  const w = wellbeing.data;

  if (editing) return <WellbeingSheet initial={w?.value ?? 70} onClose={() => setEditing(false)} />;

  return (
    <Sheet title="Mon résumé" onClose={onClose}>
      {!L ? (
        <p className="empty">Indique ta date de naissance dans ton compte pour voir ton résumé.</p>
      ) : (
        <div className={styles.sum}>
          <div className={styles.tile}>
            <span className={styles.v}>{fmtNumber(L.sleepWeeks)}</span>
            <span className={styles.k}>Semaines restantes à dormir</span>
            <span className={styles.n}>{Number(profile.sleep_hours)} h par nuit</span>
          </div>
          <div className={styles.tile}>
            <span className={styles.v}>{fmtNumber(L.workWeeks)}</span>
            <span className={styles.k}>Semaines restantes à travailler</span>
            <span className={styles.n}>
              {Number(profile.work_hours)} h/sem. jusqu'à {profile.retire_age} ans
            </span>
          </div>
          <button type="button" className={`${styles.tile} ${styles.wide} ${styles.limeTile}`} onClick={() => setEditing(true)}>
            <span className="between" style={{ width: '100%' }}>
              <span className={styles.k}>État de santé</span>
              <span className={styles.n}>
                {w
                  ? `mis à jour ${toISODate(toZoned(Date.parse(w.at))) === toISODate(now) ? "aujourd'hui" : fmtDate(toISODate(toZoned(Date.parse(w.at))), 'd MMM')}`
                  : "touche pour l'indiquer"}
              </span>
            </span>
            <span className={styles.v}>
              {w ? w.value : '—'} <small>%</small>
            </span>
            <span className="meter" style={{ width: '100%' }}>
              <i style={{ width: `${w?.value ?? 0}%` }} />
            </span>
          </button>
          <Link to="/vie" className={styles.tile} onClick={onClose}>
            <span className={styles.v} style={{ color: 'var(--lime)' }}>
              {reached}
            </span>
            <span className={styles.k}>Objectifs atteints</span>
            <span className={styles.n}>{reached ? 'bravo' : 'le premier arrive'}</span>
          </Link>
          <Link to="/vie" className={styles.tile} onClick={onClose}>
            <span className={styles.v}>{open.length}</span>
            <span className={styles.k}>Objectifs à atteindre</span>
            <span className={styles.n}>{urgent} urgents</span>
          </Link>
          <div className={`${styles.tile} ${styles.wide}`}>
            <span className="between">
              <span className={styles.k}>Temps libre restant</span>
              <span className={styles.v} style={{ fontSize: 20 }}>
                {fmtNumber(L.freeWeeks)} <small>sem.</small>
              </span>
            </span>
            <span className={styles.n}>
              Ce qui reste une fois le sommeil et le travail retirés : c'est là que vivent tes rêves.
            </span>
          </div>
        </div>
      )}
      <button type="button" className="btn outline" onClick={onHealthLog}>
        Mon journal de santé
      </button>
    </Sheet>
  );
}

/** Saisie rapide de l'état de santé en % (curseur). */
export function WellbeingSheet({ initial, onClose }: { initial: number; onClose: () => void }) {
  const [value, setValue] = useState(initial);
  const add = useAddHealthLog();
  const toast = useToast();
  return (
    <Sheet title="Mon état de santé" onClose={onClose}>
      <form
        className="list"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await add.mutateAsync({ wellbeing_pct: value });
            toast('État de santé enregistré');
            onClose();
          } catch {
            toast("L'enregistrement a échoué.");
          }
        }}
      >
        <p className="muted small" style={{ margin: 0 }}>
          Comment te sens-tu aujourd'hui, physiquement et moralement ?
        </p>
        <div className={styles.bigPct} aria-hidden="true">
          {value} %
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          aria-label="État de santé en pourcentage"
        />
        <button className="btn primary" type="submit" disabled={add.isPending}>
          Enregistrer
        </button>
      </form>
    </Sheet>
  );
}
