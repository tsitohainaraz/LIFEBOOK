import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useClock } from '../../hooks/useClock';
import { usePlan, useSavePlan } from '../../hooks/usePlan';
import { useTasksRange, useToggleTask } from '../../hooks/useTasks';
import { Icon } from '../../components/Icon';
import { Priorities } from '../../components/Priorities';
import { ReportForm } from '../../components/ReportForm';
import { ErrorState, LoadingState } from '../../components/States';
import { TaskSheet } from '../../components/TaskSheet';
import { useToast } from '../../components/Toast';
import { CATEGORY_COLOR, CATEGORY_LABEL } from '../../utils/categories';
import { addDaysISO, cap, fmtDate, fmtDuration, hhmm, mondayOf, pad, parseISODate, toMin, toTime, todayISO } from '../../utils/dates';
import { taskEnd } from '../../utils/now';
import { layoutLanes } from '../../utils/timeline';
import type { TaskRow } from '../../types/database';
import { CategorySplit } from './CategorySplit';
import styles from './Day.module.css';

const START = 5;
const END = 24;
const HOUR = 64;
const AWAKE_MIN = 16 * 60;
const isISO = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export function DayPage() {
  const [params, setParams] = useSearchParams();
  const today = todayISO();
  const date = isISO(params.get('date')) ? (params.get('date') as string) : today;
  const weekStart = mondayOf(date);
  const weekEnd = addDaysISO(weekStart, 6);
  const tasksQ = useTasksRange(weekStart, weekEnd);
  const [sheet, setSheet] = useState<{ task?: TaskRow; start?: string } | null>(null);
  const reportOpen = params.get('rapport') === '1';

  const setDate = (d: string) => {
    const next = new URLSearchParams(params);
    next.set('date', d);
    next.delete('rapport');
    setParams(next, { replace: true });
  };

  const weekTasks = useMemo(() => tasksQ.data ?? [], [tasksQ.data]);
  const tasks = weekTasks.filter((t) => t.date === date);
  const timed = tasks.filter((t) => t.start_time);
  const untimed = tasks.filter((t) => !t.start_time);
  const planned = timed.reduce((a, t) => a + (taskEnd(t) - toMin(t.start_time)), 0);
  const label = fmtDate(date, 'EEEE d MMMM');

  return (
    <>
      <div className={styles.strip}>
        <button className={styles.nav} type="button" aria-label="Semaine précédente" onClick={() => setDate(addDaysISO(date, -7))}>
          ‹
        </button>
        {Array.from({ length: 7 }, (_, i) => {
          const d = addDaysISO(weekStart, i);
          const has = weekTasks.some((t) => t.date === d);
          return (
            <button
              key={d}
              type="button"
              className={`${styles.d} ${d === today ? styles.isToday : ''} ${has ? styles.has : ''}`}
              aria-pressed={d === date}
              aria-label={cap(fmtDate(d, 'EEEE d MMMM'))}
              onClick={() => setDate(d)}
            >
              <small>{fmtDate(d, 'EEE').replace('.', '').slice(0, 3)}</small>
              <b>{parseISODate(d).getDate()}</b>
              <i />
            </button>
          );
        })}
        <button className={styles.nav} type="button" aria-label="Semaine suivante" onClick={() => setDate(addDaysISO(date, 7))}>
          ›
        </button>
      </div>

      <div className={styles.titleRow}>
        <div className={styles.title}>
          <span className={styles.k}>Programme</span>
          <h1>
            {date === today ? 'Aujourd’hui, ' : ''}
            {date === today ? label : cap(label)}
          </h1>
        </div>
        {date !== today && (
          <button className={styles.today} type="button" onClick={() => setDate(today)}>
            Aujourd'hui
          </button>
        )}
      </div>

      <DayPlan key={date} date={date} />

      {tasksQ.isLoading ? (
        <LoadingState label="Chargement de ta journée…" />
      ) : tasksQ.isError ? (
        <ErrorState message="Impossible de charger tes activités." onRetry={() => void tasksQ.refetch()} />
      ) : (
        <>
          <div className="stats3">
            <div className="lime">
              <b>{fmtDuration(planned)}</b>
              <small>planifiées</small>
            </div>
            <div>
              <b>{fmtDuration(Math.max(0, AWAKE_MIN - planned))}</b>
              <small>libres (éveillé)</small>
            </div>
            <div>
              <b>
                {tasks.filter((t) => t.done_at).length}/{tasks.length}
              </b>
              <small>faites</small>
            </div>
          </div>
          <CategorySplit
            items={timed.map((t) => ({ key: t.category, minutes: taskEnd(t) - toMin(t.start_time) }))}
            base={AWAKE_MIN}
          />

          <Timeline
            date={date}
            isToday={date === today}
            timed={timed}
            untimed={untimed}
            onAdd={(start) => setSheet({ start })}
            onEdit={(task) => setSheet({ task })}
          />
        </>
      )}

      <ReportForm key={`r-${date}`} period="day" periodStart={date} open={reportOpen} />

      <button className={styles.fab} type="button" aria-label="Ajouter une activité" onClick={() => setSheet({})}>
        <Icon name="plus" strokeWidth={2.4} />
      </button>

      {sheet && (
        <TaskSheet
          task={sheet.task}
          date={date}
          startTime={sheet.start ?? `${pad(Math.min(22, Math.max(START, new Date().getHours() + 1)))}:00`}
          existing={weekTasks}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  );
}

/** Intention du jour et 3 priorités (plans, period = 'day'). */
function DayPlan({ date }: { date: string }) {
  const planQ = usePlan('day', date);
  const save = useSavePlan('day', date);
  const toast = useToast();
  const [intent, setIntent] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const typing = useRef(false);

  useEffect(() => {
    if (!typing.current) setIntent(planQ.data?.theme ?? '');
  }, [planQ.data?.theme]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onError = () => toast("Non enregistré : vérifie ta connexion.");
  return (
    <>
      <label className={styles.intent}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="4" />
        </svg>
        <input
          maxLength={100}
          placeholder="Mon intention du jour"
          aria-label="Mon intention du jour"
          value={intent}
          onChange={(e) => {
            const v = e.target.value;
            setIntent(v);
            typing.current = true;
            clearTimeout(timer.current);
            timer.current = setTimeout(() => {
              typing.current = false;
              save.mutate({ theme: v.trim() || null }, { onError });
            }, 700);
          }}
        />
      </label>
      <Priorities
        title="Mes 3 priorités"
        value={planQ.data?.priorities}
        onSave={(priorities) => save.mutate({ priorities }, { onError })}
      />
    </>
  );
}

function Timeline({
  date,
  isToday,
  timed,
  untimed,
  onAdd,
  onEdit,
}: {
  date: string;
  isToday: boolean;
  timed: TaskRow[];
  untimed: TaskRow[];
  onAdd: (start: string) => void;
  onEdit: (t: TaskRow) => void;
}) {
  const toggle = useToggleTask();
  const toast = useToast();
  const clock = useClock(60_000);
  const nowRef = useRef<HTMLDivElement>(null);
  const height = (END - START) * HOUR;
  const placed = layoutLanes(timed.map((t) => ({ id: t.id, start: toMin(t.start_time), end: taskEnd(t) })));
  const byId = new Map(timed.map((t) => [t.id, t]));
  const nowMin = clock.getHours() * 60 + clock.getMinutes();

  // Centre la frise sur l'heure actuelle à l'ouverture.
  useEffect(() => {
    if (isToday) nowRef.current?.scrollIntoView({ block: 'center' });
  }, [isToday, date]);

  async function onToggle(t: TaskRow) {
    try {
      await toggle.toggle(t);
      if (!t.done_at) toast("Bravo, c'est fait");
    } catch {
      toast("Non enregistré : vérifie ta connexion.");
    }
  }

  return (
    <div className={`card ${styles.tlCard}`}>
      <div className={styles.tlHead}>
        <h2>Mon emploi du temps</h2>
        <small>touche une heure libre pour ajouter</small>
      </div>
      {untimed.length > 0 && (
        <div className={styles.untimed}>
          {untimed.map((t) => (
            <div key={t.id} className={`item ${t.done_at ? 'done' : ''}`}>
              <button type="button" className="check" aria-pressed={!!t.done_at} aria-label={`Marquer ${t.title} comme faite`} onClick={() => void onToggle(t)}>
                {t.done_at ? '✓' : ''}
              </button>
              <button type="button" className="t" style={{ background: 'none', border: 'none', textAlign: 'left', padding: 0 }} onClick={() => onEdit(t)}>
                <span>{t.title}</span>
                <small>sans heure · {CATEGORY_LABEL[t.category]}</small>
              </button>
            </div>
          ))}
        </div>
      )}
      {timed.length === 0 && untimed.length === 0 && (
        <p className="empty">Aucune activité ce jour-là. Touche une heure ou le bouton + pour ajouter la première.</p>
      )}
      <div className={styles.tl}>
        <div className={styles.hours} style={{ height }}>
          {Array.from({ length: END - START + 1 }, (_, i) => (
            <span key={i} style={{ top: i * HOUR }}>
              {pad((START + i) % 24)}:00
            </span>
          ))}
        </div>
        <div className={styles.lane} style={{ height }}>
          {Array.from({ length: END - START }, (_, i) => (
            <div key={i}>
              <div className={styles.hl} style={{ top: i * HOUR }} />
              <button
                type="button"
                className={styles.slot}
                style={{ top: i * HOUR, height: HOUR }}
                aria-label={`Ajouter une activité à ${START + i} h`}
                onClick={() => onAdd(`${pad(START + i)}:00`)}
              />
            </div>
          ))}
          {placed.map((p) => {
            const t = byId.get(p.id);
            if (!t) return null;
            const s = Math.max(p.start, START * 60);
            const top = ((s - START * 60) / 60) * HOUR;
            const h = Math.max(26, ((p.end - s) / 60) * HOUR - 3);
            const short = h < 46;
            const w = 100 / p.lanes;
            const style = {
              '--c': CATEGORY_COLOR[t.category],
              top: top + 1,
              height: h,
              left: `calc(${p.lane * w}% + 6px)`,
              width: `calc(${w}% - 10px)`,
            } as CSSProperties;
            return (
              <div key={t.id} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                <button
                  type="button"
                  className={`${styles.blk} ${short ? styles.short : ''} ${t.done_at ? styles.done : ''}`}
                  style={{ ...style, pointerEvents: 'auto' }}
                  onClick={() => onEdit(t)}
                  aria-label={`${t.title}, ${hhmm(t.start_time)} – ${toTime(p.end)}, modifier`}
                >
                  {!short && <span className={styles.cat}>{CATEGORY_LABEL[t.category]}</span>}
                  <b>{t.title}</b>
                  <small>
                    {hhmm(t.start_time)} – {toTime(p.end)}
                  </small>
                </button>
                <button
                  type="button"
                  className={`${styles.ck} ${t.done_at ? styles.ckDone : ''}`}
                  style={{
                    '--c': CATEGORY_COLOR[t.category],
                    pointerEvents: 'auto',
                    top: top + 1 + (short ? Math.max(0, h / 2 - 20) : 0),
                    left: `calc(${(p.lane + 1) * w}% - 4px - 40px)`,
                    right: 'auto',
                  } as CSSProperties}
                  aria-pressed={!!t.done_at}
                  aria-label={`Marquer ${t.title} comme faite`}
                  onClick={() => void onToggle(t)}
                >
                  <span>{t.done_at ? '✓' : ''}</span>
                </button>
              </div>
            );
          })}
          {isToday && nowMin >= START * 60 && nowMin <= END * 60 && (
            <div ref={nowRef} className={styles.now} style={{ top: ((nowMin - START * 60) / 60) * HOUR }}>
              <span>{toTime(nowMin)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
