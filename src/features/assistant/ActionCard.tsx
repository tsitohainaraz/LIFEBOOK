import { useMemo } from 'react';
import { useTasksOn } from '../../hooks/useTasks';
import { fmtDate, cap } from '../../utils/dates';
import { previewDay, type StoredAction } from './assistantUtils';
import styles from './Assistant.module.css';

const STATUS_LABEL: Record<string, string> = {
  accepted: 'Appliqué',
  auto_applied: 'Appliqué automatiquement',
  ignored: 'Ignoré',
  undone: 'Annulé',
};

/** Carte d'une action proposée, avec l'aperçu de la journée concernée. */
export function ActionCard({
  action,
  status,
  busy,
  onApply,
  onIgnore,
}: {
  action: StoredAction;
  status: string;
  busy: boolean;
  onApply: () => void;
  onIgnore: () => void;
}) {
  const done = status !== 'proposed';
  const lines = action.type === 'task_ops' ? action.details : [];
  return (
    <div className={`${styles.action} ${done ? styles.actionDone : ''}`}>
      <div className={styles.actionLabel}>{action.label}</div>
      {lines.length > 1 && (
        <ul className={styles.details}>
          {lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
      {action.type === 'task_ops' && action.date && !done && <DayPreview action={action} date={action.date} />}
      {done ? (
        <span className="small muted">{STATUS_LABEL[status] ?? status}</span>
      ) : (
        <div className="row">
          <button type="button" className="btn primary sm" disabled={busy} onClick={onApply}>
            Appliquer
          </button>
          <button type="button" className="btn sm" disabled={busy} onClick={onIgnore}>
            Ignorer
          </button>
        </div>
      )}
    </div>
  );
}

function DayPreview({ action, date }: { action: Extract<StoredAction, { type: 'task_ops' }>; date: string }) {
  const q = useTasksOn(date);
  const rows = useMemo(() => {
    const tasks = (q.data ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      category: t.category,
      date: t.date,
      start: t.start_time?.slice(0, 5) ?? null,
      end: t.end_time?.slice(0, 5) ?? null,
      done: !!t.done_at,
    }));
    return previewDay(tasks, action.ops, date);
  }, [q.data, action.ops, date]);
  if (q.isLoading || !rows.length) return null;
  return (
    <div className={styles.preview} aria-label={`Aperçu de ${fmtDate(date)}`}>
      <div className="label">{cap(fmtDate(date))}</div>
      {rows.map((r) => (
        <div key={`${r.id}-${r.state}`} className={`${styles.pRow} ${styles[r.state]}`}>
          <span className="mono small">{r.start}</span>
          <span className={styles.pDot} style={{ background: `var(--cat-${r.category})` }} aria-hidden="true" />
          <span className={styles.pTitle}>{r.title}</span>
          {r.state !== 'same' && <span className="chip">{r.state === 'new' ? 'nouveau' : r.state === 'moved' ? 'déplacé' : 'retiré'}</span>}
        </div>
      ))}
    </div>
  );
}
