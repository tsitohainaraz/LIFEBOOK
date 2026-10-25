import { useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useGoals } from '../../hooks/useGoals';
import { useHabitLogs, useHabitMutations, useHabits } from '../../hooks/useHabits';
import { usePlan, useSavePlan } from '../../hooks/usePlan';
import { useAddTasks, useDeleteTask, useTasksRange, useToggleTask } from '../../hooks/useTasks';
import { AutoSaveInput } from '../../components/AutoSaveInput';
import { Priorities } from '../../components/Priorities';
import { Sheet } from '../../components/Sheet';
import { ErrorState, LoadingState } from '../../components/States';
import { useToast } from '../../components/Toast';
import { CATEGORIES, CATEGORY_COLOR, CATEGORY_LABEL } from '../../utils/categories';
import {
  addDaysISO,
  addMonthsISO,
  cap,
  daysInMonth,
  fmtDate,
  hhmm,
  monthStart,
  pad,
  parseISODate,
  toMin,
  toTime,
  todayISO,
} from '../../utils/dates';
import { goalStatus } from '../../utils/goals';
import { habitRate, habitStreak, isPlannedDay } from '../../utils/habits';
import type { Category, Json, TaskRow } from '../../types/database';
import { useLinkedCards, useMyCards, type MyCard } from '../../features/boards/myCards';
import { useCardDonePrompt } from '../../features/boards/CardDonePrompt';
import styles from './Period.module.css';
import { currentDate } from '../../lib/serverTime';

const isMonth = (s: string | null): s is string => !!s && /^\d{4}-\d{2}$/.test(s);

/** Semaines du mois (lundi → dimanche, coupées aux bords du mois). */
function monthWeeks(first: string, dim: number): { start: number; end: number }[] {
  const lead = (parseISODate(first).getDay() + 6) % 7;
  const out: { start: number; end: number }[] = [];
  let d = 1;
  while (d <= dim) {
    const wd = (lead + d - 1) % 7;
    const end = Math.min(dim, d + (6 - wd));
    out.push({ start: d, end });
    d = end + 1;
  }
  return out;
}

export function MonthPage() {
  const [params, setParams] = useSearchParams();
  const today = todayISO();
  const first = isMonth(params.get('mois')) ? `${params.get('mois')}-01` : monthStart(today);
  const dim = daysInMonth(first);
  const last = `${first.slice(0, 8)}${pad(dim)}`;
  const prefix = first.slice(0, 8);
  const tasksQ = useTasksRange(first, last);
  const monthCards = useMyCards(last, first).data ?? [];
  const tasks = useMemo(() => tasksQ.data ?? [], [tasksQ.data]);
  const goals = useGoals().data ?? [];
  const planQ = usePlan('month', first);
  const savePlan = useSavePlan('month', first);
  const toast = useToast();
  const [openDay, setOpenDay] = useState<string | null>(null);
  const onError = () => toast('Non enregistré : vérifie ta connexion.');

  const isCur = today.startsWith(prefix);
  const left = isCur ? dim - parseISODate(today).getDate() : today > last ? 0 : dim;
  const monthName = fmtDate(first, 'MMMM');
  const lead = (parseISODate(first).getDay() + 6) % 7;
  const deadlines = goals.filter((g) => g.deadline && g.deadline >= first && g.deadline <= last && !g.done_at);
  const weeks = monthWeeks(first, dim);
  const weekFocus = (planQ.data?.extra?.weeks ?? {}) as Record<string, string>;

  const go = (n: number) => setParams({ mois: addMonthsISO(first, n).slice(0, 7) }, { replace: true });

  return (
    <>
      <div className={styles.head}>
        <div className={styles.title}>
          <span className={styles.k}>Programme</span>
          <h1>
            Mon mois de <span>{monthName}</span>
          </h1>
        </div>
        <div className={styles.sel}>
          <button type="button" aria-label="Mois précédent" onClick={() => go(-1)}>
            ‹
          </button>
          <span>{fmtDate(first, 'MMM yyyy')}</span>
          <button type="button" aria-label="Mois suivant" onClick={() => go(1)}>
            ›
          </button>
        </div>
      </div>
      {!isCur && (
        <button type="button" className={styles.todayBtn} onClick={() => setParams({}, { replace: true })}>
          Revenir à ce mois
        </button>
      )}

      <label className={styles.theme}>
        <small>Le défi du mois</small>
        <AutoSaveInput
          key={first}
          maxLength={60}
          placeholder="Ex. Zéro sucre ajouté"
          value={planQ.data?.theme ?? ''}
          onSave={(v) => savePlan.mutate({ theme: v.trim() || null }, { onError })}
        />
      </label>

      <HabitsStats first={first} last={last} today={today} tasks={tasks} />
      <div className="bar" aria-hidden="true">
        <i style={{ width: `${((dim - left) / dim) * 100}%` }} />
      </div>

      <Priorities
        key={`o-${first}`}
        title="Mes 3 objectifs du mois"
        value={planQ.data?.priorities}
        placeholder={(i) => `Objectif ${i + 1}`}
        onSave={(priorities) => savePlan.mutate({ priorities }, { onError })}
      />

      <div className="card">
        <div className={styles.cardTitle}>
          <h2>Calendrier</h2>
          <small>touche un jour</small>
        </div>
        {tasksQ.isLoading ? (
          <LoadingState />
        ) : tasksQ.isError ? (
          <ErrorState message="Impossible de charger le calendrier." onRetry={() => void tasksQ.refetch()} />
        ) : (
          <div className={styles.cal}>
            {['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'].map((d) => (
              <span key={d} className={styles.h}>
                {d}
              </span>
            ))}
            {Array.from({ length: lead }, (_, i) => (
              <span key={`o${i}`} className={`${styles.mday} ${styles.out}`} />
            ))}
            {Array.from({ length: dim }, (_, i) => {
              const ds = prefix + pad(i + 1);
              const ts = tasks.filter((t) => t.date === ds);
              const gd = deadlines.filter((g) => g.deadline === ds);
              const cd = monthCards.filter((c) => c.due_date === ds);
              const wd = (lead + i) % 7;
              return (
                <button
                  key={ds}
                  type="button"
                  className={`${styles.mday} ${ds === today ? styles.today : ''} ${ds < today ? styles.past : ''} ${wd >= 5 ? styles.weekend : ''}`}
                  onClick={() => setOpenDay(ds)}
                  aria-label={`${i + 1} ${monthName}${ts.length ? `, ${ts.length} activité(s)` : ''}${cd.length ? `, ${cd.length} carte(s)` : ''}${gd.length ? ", échéance d'objectif" : ''}`}
                >
                  <b>{i + 1}</b>
                  <span className={styles.dots}>
                    {gd.slice(0, 1).map((g) => (
                      <i key={g.id} style={{ '--c': 'var(--urgent)' } as CSSProperties} />
                    ))}
                    {cd.slice(0, 2).map((c) => (
                      <i key={c.id} style={{ '--c': c.done_at ? 'var(--muted)' : c.boardColor, borderRadius: 1 } as CSSProperties} />
                    ))}
                    {ts.slice(0, 4).map((t) => (
                      <i key={t.id} style={{ '--c': t.done_at ? 'var(--muted)' : CATEGORY_COLOR[t.category] } as CSSProperties} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <div className="legend2">
          <span>
            <i style={{ background: 'var(--lime)' }} />
            activité
          </span>
          <span>
            <i style={{ background: 'var(--muted)' }} />
            faite
          </span>
          <span>
            <i style={{ background: 'var(--urgent)' }} />
            échéance d'objectif
          </span>
          <span>
            <i style={{ background: 'var(--soon)', borderRadius: 1 }} />
            carte d'un tableau
          </span>
        </div>
      </div>

      {deadlines.length > 0 && (
        <div className="card">
          <div className="label">Objectifs à atteindre ce mois</div>
          <div className="list">
            {deadlines.map((g) => {
              const s = goalStatus(g, currentDate());
              return (
                <div className="item" key={g.id}>
                  <div className="t">
                    <span>{g.title}</span>
                    <small>{fmtDate(g.deadline ?? first, 'd MMMM')}</small>
                  </div>
                  <span className={`st ${s}`}>{s === 'late' ? 'En retard' : fmtDate(g.deadline ?? first, 'd MMM')}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="card">
        <div className={styles.cardTitle}>
          <h2>Semaine par semaine</h2>
        </div>
        <div className="list">
          {weeks.map((w, i) => {
            const from = prefix + pad(w.start);
            const to = prefix + pad(w.end);
            const cnt = tasks.filter((t) => t.date >= from && t.date <= to).length;
            const cur = today >= from && today <= to;
            return (
              <div key={i} className={`${styles.wk} ${cur ? styles.cur : ''}`}>
                <div className={styles.l}>
                  <b>Sem. {i + 1}</b>
                  <small>
                    {w.start}–{w.end}
                  </small>
                </div>
                <AutoSaveInput
                  key={`${first}-${i}`}
                  maxLength={80}
                  placeholder="Focus de la semaine"
                  aria-label={`Focus de la semaine ${i + 1}`}
                  value={weekFocus[String(i)] ?? ''}
                  onSave={(v) => {
                    const current = (planQ.data?.extra ?? {}) as { [key: string]: Json | undefined };
                    const prev = (current.weeks ?? {}) as Record<string, string>;
                    savePlan.mutate({ extra: { ...current, weeks: { ...prev, [String(i)]: v.trim() } } }, { onError });
                  }}
                />
                <span className={styles.cnt}>{cnt} act.</span>
              </div>
            );
          })}
        </div>
      </div>

      <HabitTracker first={first} last={last} dim={dim} today={today} />

      {openDay && (
        <DaySheet
          date={openDay}
          tasks={tasks.filter((t) => t.date === openDay)}
          cards={monthCards.filter((c) => c.due_date === openDay)}
          onClose={() => setOpenDay(null)}
        />
      )}
    </>
  );
}

function HabitsStats({ first, last, today, tasks }: { first: string; last: string; today: string; tasks: TaskRow[] }) {
  const habits = useHabits().data ?? [];
  const logs = useHabitLogs(first, last).data ?? [];
  const dim = daysInMonth(first);
  const isCur = today >= first && today <= last;
  const left = isCur ? dim - parseISODate(today).getDate() : today > last ? 0 : dim;
  // Habitudes tenues : jours écoulés seulement (jusqu'à hier, ou tout le mois s'il est passé).
  const until = isCur ? addDaysISO(today, -1) : last;
  let planned = 0;
  let ok = 0;
  if (today > first) {
    for (const h of habits) {
      const done = new Set(logs.filter((l) => l.habit_id === h.id).map((l) => l.date));
      const r = until >= first ? habitRate(done, h.days_of_week, first, until) : null;
      if (r != null) {
        let n = 0;
        for (let d = first; d <= until; d = addDaysISO(d, 1)) if (isPlannedDay(h.days_of_week, d)) n++;
        planned += n;
        ok += Math.round(r * n);
      }
    }
  }
  return (
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
        <b>{planned ? Math.round((ok / planned) * 100) : 0} %</b>
        <small>habitudes tenues</small>
      </div>
    </div>
  );
}

function HabitTracker({ first, last, dim, today }: { first: string; last: string; dim: number; today: string }) {
  const habitsQ = useHabits();
  // Les séries remontent avant le mois affiché : on charge jusqu'à un an en arrière.
  const from = addDaysISO(first < today ? first : today, -365);
  const to = last > today ? last : today;
  const logsQ = useHabitLogs(from, to);
  const { addHabit, archiveHabit, toggleDay } = useHabitMutations();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [days, setDays] = useState<'all' | 'weekdays'>('all');
  const prefix = first.slice(0, 8);
  const habits = habitsQ.data ?? [];
  const logs = logsQ.data ?? [];

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await addHabit.mutateAsync({ title: title.trim(), days_of_week: days === 'all' ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5] });
      setTitle('');
      toast('Habitude ajoutée');
    } catch {
      toast("L'habitude n'a pas pu être ajoutée.");
    }
  }

  return (
    <div className="card">
      <div className={styles.cardTitle}>
        <h2>Suivi des habitudes</h2>
        <small>une case = un jour</small>
      </div>
      {habitsQ.isLoading ? (
        <LoadingState />
      ) : habitsQ.isError ? (
        <ErrorState message="Impossible de charger tes habitudes." onRetry={() => void habitsQ.refetch()} />
      ) : habits.length === 0 ? (
        <p className="empty">Ajoute une habitude à suivre chaque jour, par exemple « Lire 20 pages ».</p>
      ) : (
        <div className="list" style={{ gap: 12 }}>
          {habits.map((h) => {
            const done = new Set(logs.filter((l) => l.habit_id === h.id).map((l) => l.date));
            const streak = habitStreak(done, h.days_of_week, today);
            const monthDone = Array.from({ length: dim }, (_, i) => prefix + pad(i + 1)).filter((d) => done.has(d)).length;
            return (
              <div key={h.id} className={styles.habrow}>
                <div className={styles.habhd}>
                  <span>{h.title}</span>
                  <span className="row" style={{ gap: 4 }}>
                    <small>
                      {monthDone}/{dim} · série {streak} j
                    </small>
                    <button type="button" className="x" aria-label={`Supprimer l'habitude ${h.title}`} onClick={() => void archiveHabit.mutateAsync(h.id).then(() => toast('Habitude supprimée'))}>
                      ✕
                    </button>
                  </span>
                </div>
                <div className={styles.cells}>
                  {Array.from({ length: dim }, (_, i) => {
                    const d = prefix + pad(i + 1);
                    const on = done.has(d);
                    const planned = isPlannedDay(h.days_of_week, d);
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={on}
                        className={`${d === today ? styles.todayCell : ''} ${d > today ? styles.future : ''} ${!planned ? styles.off : ''}`}
                        aria-label={`${h.title}, ${fmtDate(d, 'd MMMM')}`}
                        disabled={d > today}
                        onClick={() => toggleDay.mutate({ habitId: h.id, date: d, done: on }, { onError: () => toast('Non enregistré.') })}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <form className={styles.add} onSubmit={onAdd}>
        <input maxLength={60} placeholder="Nouvelle habitude" aria-label="Nouvelle habitude" value={title} onChange={(e) => setTitle(e.target.value)} />
        <select aria-label="Jours" value={days} onChange={(e) => setDays(e.target.value as 'all' | 'weekdays')}>
          <option value="all">Tous les jours</option>
          <option value="weekdays">Lun. au ven.</option>
        </select>
        <button type="submit" className={styles.plus} aria-label="Ajouter l'habitude" disabled={addHabit.isPending}>
          +
        </button>
      </form>
    </div>
  );
}

/** Panneau d'un jour du mois : ses activités et un ajout rapide. */
function DaySheet({ date, tasks, cards, onClose }: { date: string; tasks: TaskRow[]; cards: MyCard[]; onClose: () => void }) {
  const prompt = useCardDonePrompt();
  const linked = useLinkedCards(tasks.map((t) => t.card_id).filter((x): x is string => !!x)).data;
  const add = useAddTasks();
  const toggle = useToggleTask();
  const del = useDeleteTask();
  const toast = useToast();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('09:00');
  const [category, setCategory] = useState<Category>('autre');
  const [error, setError] = useState('');

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!title.trim()) {
      setError("Écris l'activité à prévoir.");
      return;
    }
    try {
      await add.mutateAsync([
        { date, title: title.trim(), category, start_time: time || null, end_time: time ? toTime(Math.min(toMin(time) + 60, 23 * 60 + 59)) : null },
      ]);
      setTitle('');
      toast('Activité ajoutée');
    } catch {
      setError("L'activité n'a pas pu être ajoutée.");
    }
  }

  return (
    <Sheet title={cap(fmtDate(date, 'EEEE d MMMM'))} onClose={onClose}>
      <div className="list">
        {tasks.length === 0 && cards.length === 0 && <p className="empty">Rien de prévu ce jour-là.</p>}
        {cards.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`${styles.ev} ${c.done_at ? styles.done : ''}`}
            style={{ '--c': c.boardColor, textAlign: 'left', color: 'var(--ink)' } as CSSProperties}
            onClick={() => navigate(`/tableaux/${c.board_id}/carte/${c.id}`)}
          >
            <span className={styles.time} style={{ minWidth: 44 }}>
              {c.due_time ? hhmm(c.due_time) : '—'}
            </span>
            <span className={styles.t}>
              <small>🗂 {c.boardTitle}</small>
              <span>{c.title}</span>
            </span>
          </button>
        ))}
        {tasks.map((t) => (
          <div key={t.id} className={`${styles.ev} ${t.done_at ? styles.done : ''}`} style={{ '--c': CATEGORY_COLOR[t.category] } as CSSProperties}>
            <span className={styles.time} style={{ minWidth: 44 }}>
              {t.start_time ? hhmm(t.start_time) : '—'}
            </span>
            <div className={styles.t}>
              <small>
                {CATEGORY_LABEL[t.category]}
                {t.card_id && linked?.get(t.card_id) ? ` · 🗂 ${linked.get(t.card_id)?.title}` : ''}
              </small>
              <span>{t.title}</span>
            </div>
            <button
              type="button"
              className="check"
              aria-pressed={!!t.done_at}
              aria-label={`Marquer ${t.title} comme faite`}
              onClick={() => {
                void toggle.toggle(t);
                if (!t.done_at && t.card_id) prompt.ask(t);
              }}
            >
              {t.done_at ? '✓' : ''}
            </button>
            <button type="button" className="x" aria-label={`Supprimer ${t.title}`} onClick={() => void del.mutateAsync({ id: t.id }).then(() => toast('Activité supprimée'))}>
              ✕
            </button>
          </div>
        ))}
      </div>
      <form className="list" onSubmit={onAdd} style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }} noValidate>
        <label className="field">
          <span>Nouvelle activité</span>
          <input maxLength={120} placeholder="Ex. Rendez-vous chez le dentiste" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div className="grid2">
          <label className="field">
            <span>Heure</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
          <label className="field">
            <span>Catégorie</span>
            <select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
              {CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="btn primary" type="submit" disabled={add.isPending}>
          Ajouter ce jour-là
        </button>
        <button type="button" className="btn" onClick={() => navigate(`/jour?date=${date}`)}>
          Ouvrir la journée
        </button>
      </form>
      {prompt.element}
    </Sheet>
  );
}
