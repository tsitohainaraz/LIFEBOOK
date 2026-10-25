import { useMemo, useState, type CSSProperties } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { usePlan, useSavePlan } from '../../hooks/usePlan';
import { useDeleteTask, useTasksRange, useToggleTask } from '../../hooks/useTasks';
import { AutoSaveInput } from '../../components/AutoSaveInput';
import { Icon } from '../../components/Icon';
import { Priorities } from '../../components/Priorities';
import { ReportForm } from '../../components/ReportForm';
import { ErrorState, LoadingState } from '../../components/States';
import { TaskSheet } from '../../components/TaskSheet';
import { useToast } from '../../components/Toast';
import { CATEGORY_COLOR, CATEGORY_LABEL } from '../../utils/categories';
import {
  addDaysISO,
  cap,
  diffDays,
  fmtDate,
  fmtDuration,
  hhmm,
  isoWeekNumber,
  mondayOf,
  parseISODate,
  toMin,
  toTime,
  todayISO,
} from '../../utils/dates';
import { taskEnd } from '../../utils/now';
import type { TaskRow } from '../../types/database';
import { CategorySplit } from '../day/CategorySplit';
import styles from './Period.module.css';

const H0 = 6;
const H1 = 22;
const PX = 20;
const isISO = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export function WeekPage() {
  const [params, setParams] = useSearchParams();
  const today = todayISO();
  const week = mondayOf(isISO(params.get('date')) ? (params.get('date') as string) : today);
  const end = addDaysISO(week, 6);
  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(week, i));
  const tasksQ = useTasksRange(week, end);
  const tasks = useMemo(() => tasksQ.data ?? [], [tasksQ.data]);
  const planQ = usePlan('week', week);
  const savePlan = useSavePlan('week', week);
  const toast = useToast();
  const [openDays, setOpenDays] = useState<Set<string>>(() => new Set([today]));
  const [sheet, setSheet] = useState<{ date: string; task?: TaskRow } | null>(null);
  const isCurrent = today >= week && today <= end;

  const go = (n: number) => {
    setParams({ date: addDaysISO(week, 7 * n) }, { replace: true });
    setOpenDays(new Set([today]));
  };
  const onError = () => toast('Non enregistré : vérifie ta connexion.');
  const left = today < week ? 7 : today > end ? 0 : 7 - diffDays(today, week);
  const timed = tasks.filter((t) => t.start_time);
  const planned = timed.reduce((a, t) => a + taskEnd(t) - toMin(t.start_time), 0);

  return (
    <>
      <div className={styles.head}>
        <div className={styles.title}>
          <span className={styles.k}>Programme</span>
          <h1>
            Ma <span>semaine</span>
          </h1>
        </div>
        <div className={styles.sel}>
          <button type="button" aria-label="Semaine précédente" onClick={() => go(-1)}>
            ‹
          </button>
          <span>
            {parseISODate(week).getDate()}–{fmtDate(end, 'd MMM')}
          </span>
          <button type="button" aria-label="Semaine suivante" onClick={() => go(1)}>
            ›
          </button>
        </div>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        Semaine {isoWeekNumber(week)} · du {fmtDate(week, 'EEEE d MMMM')} au {fmtDate(end, 'EEEE d MMMM')}
      </p>
      {!isCurrent && (
        <button type="button" className={styles.todayBtn} onClick={() => setParams({}, { replace: true })}>
          Revenir à cette semaine
        </button>
      )}

      <label className={styles.theme}>
        <small>Le thème de ma semaine</small>
        <AutoSaveInput
          key={week}
          maxLength={60}
          placeholder="Ex. Semaine de la discipline"
          value={planQ.data?.theme ?? ''}
          onSave={(v) => savePlan.mutate({ theme: v.trim() || null }, { onError })}
        />
      </label>

      {tasksQ.isLoading ? (
        <LoadingState label="Chargement de ta semaine…" />
      ) : tasksQ.isError ? (
        <ErrorState message="Impossible de charger ta semaine." onRetry={() => void tasksQ.refetch()} />
      ) : (
        <>
          <div className="stats3">
            <div className="lime">
              <b>{left}</b>
              <small>jours restants</small>
            </div>
            <div>
              <b>
                {tasks.filter((t) => t.done_at).length}/{tasks.length}
              </b>
              <small>activités faites</small>
            </div>
            <div>
              <b>{fmtDuration(planned)}</b>
              <small>planifiées</small>
            </div>
          </div>
          <CategorySplit items={timed.map((t) => ({ key: t.category, minutes: taskEnd(t) - toMin(t.start_time) }))} />
        </>
      )}

      <Priorities
        key={`p-${week}`}
        title="Mes 3 priorités de la semaine"
        value={planQ.data?.priorities}
        onSave={(priorities) => savePlan.mutate({ priorities }, { onError })}
      />

      {!tasksQ.isLoading && !tasksQ.isError && (
        <>
          <WeekGrid
            days={days}
            today={today}
            tasks={tasks}
            onOpen={(d) => {
              setOpenDays((s) => new Set(s).add(d));
              setTimeout(() => document.getElementById(`jour-${d}`)?.scrollIntoView({ block: 'center' }), 0);
            }}
          />
          <DayList
            days={days}
            today={today}
            tasks={tasks}
            openDays={openDays}
            onToggleOpen={(d, open) =>
              setOpenDays((s) => {
                const n = new Set(s);
                if (open) n.add(d);
                else n.delete(d);
                return n;
              })
            }
            onAdd={(d) => setSheet({ date: d })}
            onEdit={(t) => setSheet({ date: t.date, task: t })}
          />
        </>
      )}

      <ReportForm key={`r-${week}`} period="week" periodStart={week} collapsible={false} />

      <button className={styles.fab} type="button" aria-label="Ajouter une activité" onClick={() => setSheet({ date: isCurrent ? today : week })}>
        <Icon name="plus" strokeWidth={2.4} />
      </button>

      {sheet && (
        <TaskSheet
          task={sheet.task}
          date={sheet.date}
          dayChoices={sheet.task ? undefined : days}
          existing={tasks}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  );
}

function WeekGrid({ days, today, tasks, onOpen }: { days: string[]; today: string; tasks: TaskRow[]; onOpen: (d: string) => void }) {
  const H = (H1 - H0) * PX;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return (
    <div className="card" style={{ padding: '14px 10px' }}>
      <div className={styles.cardTitle} style={{ padding: '0 4px' }}>
        <h2>Vue de la semaine</h2>
        <small>06:00 – 22:00</small>
      </div>
      <div className={styles.wv}>
        <span />
        {days.map((d) => (
          <button
            key={d}
            type="button"
            className={`${styles.hd} ${d === today ? styles.today : ''}`}
            onClick={() => onOpen(d)}
            aria-label={`Voir ${fmtDate(d, 'EEEE d MMMM')}`}
          >
            <small>{fmtDate(d, 'EEE').replace('.', '').slice(0, 3)}</small>
            <b>{parseISODate(d).getDate()}</b>
          </button>
        ))}
        <div className={styles.hrs} style={{ height: H }}>
          {Array.from({ length: (H1 - H0) / 2 + 1 }, (_, i) => (
            <span key={i} style={{ top: i * 2 * PX }}>
              {H0 + i * 2}h
            </span>
          ))}
        </div>
        {days.map((d) => (
          <div key={d} className={`${styles.col} ${d === today ? styles.today : ''}`} style={{ height: H }}>
            {Array.from({ length: (H1 - H0) / 2 }, (_, i) => (
              <div key={i} className={styles.hl} style={{ top: i * 2 * PX }} />
            ))}
            {tasks
              .filter((t) => t.date === d && t.start_time)
              .map((t) => {
                const s = Math.max(toMin(t.start_time), H0 * 60);
                const e = Math.min(taskEnd(t), H1 * 60);
                if (e <= s) return null;
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`${styles.b} ${t.done_at ? styles.done : ''}`}
                    style={
                      {
                        '--c': CATEGORY_COLOR[t.category],
                        top: ((s - H0 * 60) / 60) * PX,
                        height: Math.max(4, ((e - s) / 60) * PX - 1),
                      } as CSSProperties
                    }
                    aria-label={`${t.title}, ${hhmm(t.start_time)} – ${toTime(taskEnd(t))}`}
                    onClick={() => onOpen(d)}
                  />
                );
              })}
            {d === today && nowMin >= H0 * 60 && nowMin <= H1 * 60 && (
              <div className={styles.nowLine} style={{ top: ((nowMin - H0 * 60) / 60) * PX }} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function DayList({
  days,
  today,
  tasks,
  openDays,
  onToggleOpen,
  onAdd,
  onEdit,
}: {
  days: string[];
  today: string;
  tasks: TaskRow[];
  openDays: Set<string>;
  onToggleOpen: (d: string, open: boolean) => void;
  onAdd: (d: string) => void;
  onEdit: (t: TaskRow) => void;
}) {
  const toggle = useToggleTask();
  const del = useDeleteTask();
  const toast = useToast();
  const navigate = useNavigate();
  return (
    <div className="card">
      <div className={styles.cardTitle}>
        <h2>Jour par jour</h2>
      </div>
      <div className={styles.days}>
        {days.map((d) => {
          const evs = tasks.filter((t) => t.date === d);
          const dn = evs.filter((t) => t.done_at).length;
          return (
            <details
              key={d}
              id={`jour-${d}`}
              className={`${styles.dd} ${d === today ? styles.today : ''}`}
              open={openDays.has(d)}
              onToggle={(e) => onToggleOpen(d, (e.currentTarget as HTMLDetailsElement).open)}
            >
              <summary>
                <div className={styles.dl}>
                  <small>{fmtDate(d, 'EEE').replace('.', '')}</small>
                  <b>{parseISODate(d).getDate()}</b>
                </div>
                <div className={styles.ds}>
                  <span>{evs.length ? evs.map((e) => e.title).join(' · ') : 'Rien de prévu'}</span>
                  {evs.length > 0 && (
                    <div className="mini">
                      <i style={{ width: `${(dn / evs.length) * 100}%` }} />
                    </div>
                  )}
                </div>
                <span className={styles.chev} aria-hidden="true">
                  ›
                </span>
              </summary>
              <div className={styles.dbody}>
                {evs.length === 0 && <p className="empty">Aucune activité. Ajoute la première ci-dessous.</p>}
                {evs.map((e) => (
                  <div key={e.id} className={`${styles.ev} ${e.done_at ? styles.done : ''}`} style={{ '--c': CATEGORY_COLOR[e.category] } as CSSProperties}>
                    <span className={styles.time}>
                      {e.start_time ? `${hhmm(e.start_time)} – ${toTime(taskEnd(e))}` : 'sans heure'}
                    </span>
                    <button type="button" className={styles.t} onClick={() => onEdit(e)}>
                      <small>{CATEGORY_LABEL[e.category]}</small>
                      <span>{e.title}</span>
                    </button>
                    <button
                      type="button"
                      className="check"
                      aria-pressed={!!e.done_at}
                      aria-label={`Marquer ${e.title} comme faite`}
                      onClick={() =>
                        void toggle.toggle(e).then(
                          () => !e.done_at && toast("Bravo, c'est fait"),
                          () => toast('Non enregistré : vérifie ta connexion.'),
                        )
                      }
                    >
                      {e.done_at ? '✓' : ''}
                    </button>
                    <button
                      type="button"
                      className="x"
                      aria-label={`Supprimer ${e.title}`}
                      onClick={() =>
                        e.recurrence_group
                          ? onEdit(e)
                          : void del.mutateAsync({ id: e.id }).then(
                              () => toast('Activité supprimée'),
                              () => toast('La suppression a échoué.'),
                            )
                      }
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <div className="grid2">
                  <button type="button" className={styles.addday} onClick={() => onAdd(d)}>
                    + Ajouter à ce jour
                  </button>
                  <button type="button" className="btn sm" onClick={() => navigate(`/jour?date=${d}`)}>
                    {cap(fmtDate(d, 'EEEE'))} en détail
                  </button>
                </div>
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
