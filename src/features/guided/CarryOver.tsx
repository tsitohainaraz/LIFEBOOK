import { useState } from 'react';
import { useToast } from '../../components/Toast';
import { useDeleteTask, useUpdateTask } from '../../hooks/useTasks';
import type { TaskRow } from '../../types/database';
import { addDaysISO, fmtDate } from '../../utils/dates';
import type { ToPlace } from '../../utils/scheduler';
import { carryDuration, LATER_DAYS } from './carry';
import styles from './Guided.module.css';

type Choice = 'keep' | 'later' | 'drop';

/** Report du soir : chaque tâche non faite aujourd'hui → Garder (demain), Plus tard ou Abandonner. */
export function CarryOver({ today, tasks, onKeep }: { today: string; tasks: TaskRow[]; onKeep: (items: ToPlace[]) => void }) {
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const update = useUpdateTask();
  const del = useDeleteTask();
  const toast = useToast();
  if (!tasks.length) return null;

  async function choose(t: TaskRow, c: Choice) {
    const next = { ...choices, [t.id]: c };
    try {
      if (c === 'later') {
        const date = addDaysISO(today, LATER_DAYS);
        await update.mutateAsync({ id: t.id, values: { date, postponed_count: t.postponed_count + 1 } });
        toast(`Reporté à ${fmtDate(date, 'EEEE')}`);
      } else if (c === 'drop') {
        await del.mutateAsync({ id: t.id });
      }
    } catch {
      toast("Le changement n'a pas pu être enregistré.");
      return;
    }
    setChoices(next);
    onKeep(
      tasks
        .filter((x) => next[x.id] === 'keep')
        .map((x) => ({ key: `task:${x.id}`, title: x.title, category: x.category, duration_min: carryDuration(x.start_time, x.end_time), priority: 'must' as const, goal_id: x.goal_id })),
    );
  }

  return (
    <div className={styles.carry}>
      <div className="label">Pas fait aujourd'hui</div>
      {tasks.map((t) => {
        const c = choices[t.id];
        return (
          <div key={t.id} className={styles.carryRow}>
            <span className={styles.tlTitle}>{t.title}</span>
            {c && c !== 'keep' ? (
              <span className="small muted">{c === 'later' ? 'Plus tard' : 'Abandonné'}</span>
            ) : (
              <div className="row">
                <button type="button" className="pill" aria-pressed={c === 'keep'} onClick={() => void choose(t, 'keep')}>
                  Garder
                </button>
                <button type="button" className="pill" onClick={() => void choose(t, 'later')}>
                  Plus tard
                </button>
                <button type="button" className="pill" onClick={() => void choose(t, 'drop')}>
                  Abandonner
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
