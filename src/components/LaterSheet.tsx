import { useState } from 'react';
import { Sheet } from './Sheet';
import { useToast } from './Toast';
import { useUpdateTask } from '../hooks/useTasks';
import { fmtDate, fmtDuration, hhmm, todayISO, toMin } from '../utils/dates';
import { taskEnd } from '../utils/now';
import { postponeSlot, type LaterOption } from '../utils/schedule';
import type { TaskRow } from '../types/database';
import { currentDate } from '../lib/serverTime';

/** « Faire plus tard » : 15 min, 30 min, 1 h, ce soir, demain, ou une heure choisie. La durée est conservée. */
export function LaterSheet({ task, onClose }: { task: TaskRow; onClose: () => void }) {
  const update = useUpdateTask();
  const toast = useToast();
  const [time, setTime] = useState('');
  const [error, setError] = useState('');
  const duration = task.start_time ? taskEnd(task) - toMin(task.start_time) : 60;

  async function choose(option: LaterOption) {
    setError('');
    const slot = postponeSlot(task, option, currentDate());
    try {
      await update.mutateAsync({
        id: task.id,
        values: { ...slot, postponed_count: task.postponed_count + 1 },
      });
      onClose();
      toast(`Reporté à ${slot.start_time}${slot.date !== todayISO() ? ` (${fmtDate(slot.date, 'EEEE')})` : ''}`);
    } catch {
      setError("Le report n'a pas pu être enregistré. Réessaie.");
    }
  }

  return (
    <Sheet title="Faire plus tard" onClose={onClose}>
      <p className="muted small" style={{ margin: 0 }}>
        {task.title} · {fmtDuration(duration)}
        {task.start_time ? ` · prévu à ${hhmm(task.start_time)}` : ''}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <button className="btn" type="button" onClick={() => choose(15)} disabled={update.isPending}>
          Dans 15 min
        </button>
        <button className="btn" type="button" onClick={() => choose(30)} disabled={update.isPending}>
          Dans 30 min
        </button>
        <button className="btn" type="button" onClick={() => choose(60)} disabled={update.isPending}>
          Dans 1 h
        </button>
        <button className="btn" type="button" onClick={() => choose('evening')} disabled={update.isPending}>
          Ce soir 19:00
        </button>
      </div>
      <button className="btn primary" type="button" onClick={() => choose('tomorrow')} disabled={update.isPending}>
        Demain à la même heure
      </button>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!time) {
            setError('Choisis une heure.');
            return;
          }
          void choose({ time });
        }}
      >
        <label className="field" style={{ flex: 1 }}>
          <span>À une heure choisie</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <button className="btn sm" type="submit" style={{ alignSelf: 'flex-end' }} disabled={update.isPending}>
          Reporter
        </button>
      </form>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </Sheet>
  );
}
