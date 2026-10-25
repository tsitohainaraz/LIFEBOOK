import { useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { Sheet } from './Sheet';
import { useToast } from './Toast';
import { useGoals } from '../hooks/useGoals';
import { useAddTasks, useDeleteTask, useUpdateTask } from '../hooks/useTasks';
import { CATEGORIES } from '../utils/categories';
import { fmtDate, fmtDuration, hhmm, toMin, toTime } from '../utils/dates';
import { REPEAT_OPTIONS, occurrenceDates, type Repeat } from '../utils/recurrence';
import { overlaps } from '../utils/schedule';
import type { Category, TaskRow } from '../types/database';
import styles from './TaskSheet.module.css';

const DURATIONS = [15, 30, 45, 60, 90, 120];
const REMINDERS = [
  { value: 0, label: 'Aucun' },
  { value: 10, label: '10 min avant' },
  { value: 30, label: '30 min avant' },
  { value: 60, label: '1 h avant' },
];

interface Props {
  /** Tâche à modifier ; absente pour un ajout. */
  task?: TaskRow | null;
  /** Jour de l'ajout (AAAA-MM-JJ). */
  date: string;
  /** Heure de début proposée pour un ajout. */
  startTime?: string;
  /** Jours proposés dans une liste (vue semaine) ; sinon le jour est fixe. */
  dayChoices?: string[];
  /** Tâches connues, pour prévenir d'un chevauchement. */
  existing: TaskRow[];
  onClose: () => void;
}

/** Ajouter, modifier ou supprimer une activité. */
export function TaskSheet({ task, date, startTime, dayChoices, existing, onClose }: Props) {
  const edit = !!task;
  const goals = (useGoals().data ?? []).filter((g) => !g.done_at || g.id === task?.goal_id);
  const add = useAddTasks();
  const update = useUpdateTask();
  const del = useDeleteTask();
  const toast = useToast();
  const initialStart = task?.start_time ? hhmm(task.start_time) : (startTime ?? '09:00');
  const [title, setTitle] = useState(task?.title ?? '');
  const [category, setCategory] = useState<Category>(task?.category ?? 'autre');
  const [day, setDay] = useState(task?.date ?? date);
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(
    task?.end_time ? hhmm(task.end_time) : toTime(Math.min(toMin(initialStart) + 60, 24 * 60 - 1)),
  );
  const [reminder, setReminder] = useState(task?.reminder_min ?? 10);
  const [goalId, setGoalId] = useState(task?.goal_id ?? '');
  const [repeat, setRepeat] = useState<Repeat>('once');
  const [titleErr, setTitleErr] = useState('');
  const [timeErr, setTimeErr] = useState('');
  const [askDelete, setAskDelete] = useState(false);
  const busy = add.isPending || update.isPending || del.isPending;

  const overlap = useMemo(
    () => !!start && !!end && toMin(end) > toMin(start) && overlaps(existing, { date: day, start_time: start, end_time: end }, task?.id),
    [existing, day, start, end, task?.id],
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTitleErr('');
    setTimeErr('');
    let ok = true;
    if (!title.trim()) {
      setTitleErr('Donne un nom à cette activité.');
      ok = false;
    }
    if (!start || !end || toMin(end) <= toMin(start)) {
      setTimeErr("L'heure de fin doit être après le début.");
      ok = false;
    }
    if (!ok) return;
    const values = {
      title: title.trim(),
      category,
      start_time: start,
      end_time: end,
      reminder_min: reminder || null,
      goal_id: goalId || null,
    };
    try {
      if (task) {
        await update.mutateAsync({ id: task.id, values: { ...values, date: day } });
        toast('Activité modifiée');
      } else {
        const dates = occurrenceDates(day, repeat);
        const group = dates.length > 1 ? crypto.randomUUID() : null;
        await add.mutateAsync(dates.map((d) => ({ ...values, date: d, recurrence_group: group })));
        toast(dates.length > 1 ? `Ajouté sur ${dates.length} jours` : 'Ajouté à ta journée');
      }
      onClose();
    } catch {
      setTimeErr("L'enregistrement a échoué. Vérifie ta connexion et réessaie.");
    }
  }

  async function remove(all: boolean) {
    if (!task) return;
    try {
      if (all && task.recurrence_group) await del.mutateAsync({ group: task.recurrence_group, fromDate: task.date });
      else await del.mutateAsync({ id: task.id });
      toast(all ? 'Activités supprimées' : 'Activité supprimée');
      onClose();
    } catch {
      setTimeErr('La suppression a échoué.');
    }
  }

  return (
    <Sheet title={edit ? "Modifier l'activité" : 'Nouvelle activité'} onClose={onClose}>
      <form className="list" onSubmit={onSubmit} noValidate style={{ gap: 14 }}>
        <label className="field">
          <span>Activité</span>
          <input
            value={title}
            maxLength={120}
            placeholder="Ex. Séance de musculation"
            onChange={(e) => setTitle(e.target.value)}
            aria-invalid={titleErr ? true : undefined}
          />
          {titleErr && <span className={styles.err}>{titleErr}</span>}
        </label>

        <div className="field">
          <span>Catégorie</span>
          <div className={styles.cats} role="radiogroup" aria-label="Catégorie">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                type="button"
                role="radio"
                aria-checked={category === c.key}
                className={styles.cat}
                style={{ '--c': c.color } as CSSProperties}
                onClick={() => setCategory(c.key)}
              >
                <i />
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {dayChoices && (
          <label className="field">
            <span>Jour</span>
            <select value={day} onChange={(e) => setDay(e.target.value)}>
              {dayChoices.map((d) => (
                <option key={d} value={d}>
                  {fmtDate(d, 'EEEE d MMMM')}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="grid2">
          <label className="field">
            <span>Début</span>
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="field">
            <span>Fin</span>
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} aria-invalid={timeErr ? true : undefined} />
          </label>
        </div>
        <div className={styles.durs} aria-label="Durée rapide">
          {DURATIONS.map((m) => (
            <button key={m} type="button" onClick={() => setEnd(toTime(Math.min(toMin(start || '08:00') + m, 23 * 60 + 59)))}>
              {fmtDuration(m)}
            </button>
          ))}
        </div>
        {timeErr && (
          <p className={styles.err} role="alert">
            {timeErr}
          </p>
        )}
        {overlap && !timeErr && (
          <p className={styles.warn} role="status">
            Ce créneau chevauche une autre activité. Tu peux quand même l'enregistrer.
          </p>
        )}

        <div className="grid2">
          <label className="field">
            <span>Rappel</span>
            <select value={reminder} onChange={(e) => setReminder(Number(e.target.value))}>
              {REMINDERS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          {!edit ? (
            <label className="field">
              <span>Répéter</span>
              <select value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat)}>
                {REPEAT_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span />
          )}
        </div>
        {repeat !== 'once' && <p className="muted small" style={{ margin: 0 }}>La répétition crée l'activité sur 8 semaines.</p>}

        <label className="field">
          <span>Objectif lié</span>
          <select value={goalId} onChange={(e) => setGoalId(e.target.value)}>
            <option value="">Aucun</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        </label>

        {askDelete && task ? (
          <div className="list">
            <p className="small" style={{ margin: 0 }}>
              Cette activité se répète. Que veux-tu supprimer ?
            </p>
            <button type="button" className="btn danger" onClick={() => void remove(false)} disabled={busy}>
              Cette occurrence seulement
            </button>
            <button type="button" className="btn danger" onClick={() => void remove(true)} disabled={busy}>
              Toutes les suivantes
            </button>
            <button type="button" className="btn" onClick={() => setAskDelete(false)}>
              Annuler
            </button>
          </div>
        ) : (
          <div className={styles.btns}>
            {edit ? (
              <button
                type="button"
                className={`btn ${styles.del}`}
                disabled={busy}
                onClick={() => (task?.recurrence_group ? setAskDelete(true) : void remove(false))}
              >
                Supprimer
              </button>
            ) : (
              <span />
            )}
            <button className="btn primary" type="submit" disabled={busy}>
              {edit ? 'Enregistrer' : 'Ajouter'}
            </button>
          </div>
        )}
      </form>
    </Sheet>
  );
}
