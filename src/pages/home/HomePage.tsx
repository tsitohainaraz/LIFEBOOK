import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useProfile } from '../../contexts/AuthContext';
import { useClock } from '../../hooks/useClock';
import { useHealthContext } from '../../hooks/useHealth';
import { useGoals } from '../../hooks/useGoals';
import { useAddTasks, useTasksRange, useToggleTask, useUpdateTask } from '../../hooks/useTasks';
import { Icon } from '../../components/Icon';
import { LaterSheet } from '../../components/LaterSheet';
import { NowRing } from '../../components/NowRing';
import { Particles } from '../../components/Particles';
import { Sheet } from '../../components/Sheet';
import { ErrorState, LoadingState } from '../../components/States';
import { useToast } from '../../components/Toast';
import { cap, fmtDate, fmtDuration, fmtNumber, hhmm, nowMinutes, pad, todayISO, addDaysISO } from '../../utils/dates';
import { STATUS_ORDER, goalStatus, goalStatusLabel } from '../../utils/goals';
import { REASONS, WHO_WEEKLY_MINUTES, healthReasons, mustAskDoctor, suggestedSportMinutes } from '../../utils/health';
import { daysUsedAndLeft, lifeCountdown, lifeSummary } from '../../utils/life';
import { collectPlannedItems, freeMinutesBeforeNext, pickNow, taskEnd, type NowResult, type PlannedItem } from '../../utils/now';
import { Upcoming } from './Upcoming';
import { firstFreeSlot } from '../../utils/schedule';
import type { Category, ProfileRow, TaskRow } from '../../types/database';
import styles from './Home.module.css';
import { currentDate, nowISO } from '../../lib/serverTime';

export function HomePage() {
  const profile = useProfile();
  const navigate = useNavigate();
  const today = todayISO();
  // Aujourd'hui et demain : demain sert au bloc « À suivre ».
  const tasksQ = useTasksRange(today, addDaysISO(today, 1));
  const goalsQ = useGoals();
  const toggle = useToggleTask();
  const update = useUpdateTask();
  const toast = useToast();
  const [laterTask, setLaterTask] = useState<TaskRow | null>(null);
  const [recoOpen, setRecoOpen] = useState(false);
  // L'état « Maintenant » est recalculé toutes les 15 s et à chaque changement de tâche.
  const tick15 = useClock(15_000);
  const allTasks = useMemo(() => tasksQ.data ?? [], [tasksQ.data]);
  const tasks = useMemo(() => allTasks.filter((t) => t.date === today), [allTasks, today]);
  const planned = useMemo(() => collectPlannedItems({ tasks: allTasks }), [allTasks]);
  const now = useMemo(() => pickNow(tasks, currentDate()), [tasks, tick15]);

  const birth = profile.birth_date;
  const urgentGoals = (goalsQ.data ?? [])
    .map((g) => ({ g, s: goalStatus(g, currentDate()) }))
    .filter((o) => o.s === 'late' || o.s === 'urgent' || o.s === 'soon')
    .sort((a, b) => STATUS_ORDER[a.s] - STATUS_ORDER[b.s] || (a.g.deadline ?? '').localeCompare(b.g.deadline ?? ''))
    .slice(0, 3);

  const doneCount = tasks.filter((t) => t.done_at).length;
  const nm = nowMinutes();

  async function finish(task: TaskRow) {
    try {
      await update.mutateAsync({ id: task.id, values: { done_at: nowISO() } });
      toast('Bravo, tâche terminée !');
    } catch {
      toast("Impossible d'enregistrer. Vérifie ta connexion.");
    }
  }

  return (
    <>
      <section className={styles.hero}>
        <Particles className={styles.canvas} />
        <div className={styles.hello}>
          Bonjour {profile.first_name ?? ''} · {cap(fmtDate(today))}
        </div>
        {birth ? <LifeHeader profile={profile} birth={birth} /> : null}
        <Reco now={now} onOpen={() => setRecoOpen(true)} />
      </section>

      {tasksQ.isLoading ? (
        <LoadingState label="Chargement de ta journée…" />
      ) : tasksQ.isError ? (
        <ErrorState message="Impossible de charger ta journée. Vérifie ta connexion." onRetry={() => void tasksQ.refetch()} />
      ) : (
        <LiveNow
          result={now}
          busy={update.isPending}
          onFinish={(t) => void finish(t)}
          onLater={setLaterTask}
          onPlan={() => navigate('/jour')}
          onReport={() => navigate('/rapport')}
          planned={planned}
        />
      )}

      <div className="card">
        <div className="between">
          <div className="label">Programme du jour</div>
          <span className="small mono muted">
            {doneCount}/{tasks.length} faites
          </span>
        </div>
        <div className={styles.plan}>
          {tasks.length === 0 && !tasksQ.isLoading && (
            <p className="empty">Rien de prévu aujourd'hui. Touche « Planifier ma journée » pour commencer.</p>
          )}
          {tasks.map((t) => {
            const cur = !!t.start_time && !t.done_at && toMinSafe(t.start_time) <= nm && nm < taskEnd(t);
            return (
              <div key={t.id} className={`item ${t.done_at ? 'done' : ''} ${cur ? styles.cur : ''}`}>
                <button
                  type="button"
                  className="check"
                  aria-pressed={!!t.done_at}
                  aria-label={`Marquer ${t.title} comme faite`}
                  onClick={() => void toggle.toggle(t)}
                >
                  {t.done_at ? '✓' : ''}
                </button>
                <span className="time">
                  {t.start_time ? hhmm(t.start_time) : '—'}
                  {t.end_time && <span className={styles.endTime}>{hhmm(t.end_time)}</span>}
                </span>
                <div className="t">
                  <span>{t.title}</span>
                  {cur && <small style={{ color: 'var(--lime)' }}>en cours</small>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="grid2">
          <Link className="btn primary sm" to="/jour">
            Planifier ma journée
          </Link>
          <Link className="btn outline sm" to="/rapport">
            <Icon name="pen" /> Mon rapport
          </Link>
        </div>
      </div>

      <Link to="/precedent" className="linkcard">
        <Icon name="past" />
        <div className="t">
          <b>Programme précédent</b>
          <small>Tes journées et semaines passées, avec tes rapports</small>
        </div>
        <span className="mono lime">›</span>
      </Link>

      {urgentGoals.length > 0 && (
        <div className="card">
          <div className="label">Objectifs urgents</div>
          <div className="list">
            {urgentGoals.map(({ g, s }) => (
              <div className="item" key={g.id}>
                <div className="t">
                  <span>{g.title}</span>
                  {g.deadline && <small>{fmtDate(g.deadline, 'd MMMM yyyy')}</small>}
                </div>
                <span className={`st ${s}`}>{goalStatusLabel(g, currentDate())}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {laterTask && <LaterSheet task={laterTask} onClose={() => setLaterTask(null)} />}
      {recoOpen && <RecoSheet now={now} tasks={tasks} onClose={() => setRecoOpen(false)} />}
    </>
  );
}

const toMinSafe = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

/** Compte à rebours, semaines restantes et frise : rafraîchis chaque seconde. */
function LifeHeader({ profile, birth }: { profile: ProfileRow; birth: string }) {
  const now = useClock(1000);
  const params = { birthDate: birth, lifeExpectancy: profile.life_expectancy };
  const cd = lifeCountdown(params, now);
  const L = lifeSummary(
    { ...params, sleepHours: Number(profile.sleep_hours), workHours: Number(profile.work_hours), retireAge: profile.retire_age },
    now,
  );
  const d = daysUsedAndLeft(params, now);
  const pu = (d.used / d.total) * 100;
  return (
    <>
      <div className={styles.cd} role="timer" aria-label="Compte à rebours de ta vie">
        <b>{cd.days}</b>
        <i>:</i>
        <b>{pad(cd.hours)}</b>
        <i>:</i>
        <b>{pad(cd.minutes)}</b>
        <i>:</i>
        <b>{pad(cd.seconds)}</b>
        <span>jours</span>
        <span />
        <span>heures</span>
        <span />
        <span>min</span>
        <span />
        <span>sec</span>
      </div>
      <div className={styles.left}>
        Il te reste <b>{fmtNumber(L.leftWeeks)}</b> semaines
      </div>
      <div
        className={styles.tline}
        role="img"
        aria-label={`Tu as épuisé ${fmtNumber(d.used)} jours, il te reste ${fmtNumber(d.left)} jours`}
      >
        <div className={styles.tlTop}>
          <span>
            Épuisé <b>{fmtNumber(d.used)} j</b>
          </span>
          <span>
            Il te reste <b className={styles.lime}>{fmtNumber(d.left)} j</b>
          </span>
        </div>
        <div className={styles.tlBar}>
          <i className={styles.u} style={{ width: `${pu}%` }} />
          <i className={styles.l} />
          <span className={styles.mk} style={{ left: `${pu}%` }} />
        </div>
        <div className={styles.tlAx}>
          <span>naissance</span>
          <span>aujourd’hui · {L.age} ans</span>
          <span>{profile.life_expectancy} ans</span>
        </div>
      </div>
    </>
  );
}

/** Le cercle « Maintenant » avec son propre rafraîchissement à la seconde. */
function LiveNow({
  result,
  busy,
  onFinish,
  onLater,
  onPlan,
  onReport,
  planned,
}: {
  result: NowResult<TaskRow>;
  planned: PlannedItem[];
  busy: boolean;
  onFinish: (t: TaskRow) => void;
  onLater: (t: TaskRow) => void;
  onPlan: () => void;
  onReport: () => void;
}) {
  const now = useClock(1000);
  return (
    <NowRing
      result={result}
      nowMin={nowMinutes(now)}
      busy={busy}
      onFinish={() => result.task && onFinish(result.task)}
      onLater={() => result.task && onLater(result.task)}
      onPlan={onPlan}
      onReport={onReport}
      footer={<Upcoming items={planned} now={result} />}
    />
  );
}

function recoInfo(now: NowResult): { dur: number; when: string } {
  if (now.mode === 'now') return { dur: 30, when: 'après ta tâche en cours' };
  if (now.mode === 'next') return { dur: suggestedSportMinutes(freeMinutesBeforeNext(now)), when: 'avant ta tâche suivante' };
  return { dur: 60, when: 'maintenant' };
}

const durText = (m: number) => (m >= 60 ? 'd’1 h' : `de ${m} min`);

/** Recommandation santé : cadre orange qui pulse, raison qui change toutes les 6 s. */
function Reco({ now, onOpen }: { now: NowResult; onOpen: () => void }) {
  const health = useHealthContext();
  const reasons = healthReasons(health);
  const doctor = mustAskDoctor(health);
  const [i, setI] = useState(0);
  const [fade, setFade] = useState(false);
  const key = reasons.join(',');

  useEffect(() => {
    setI(0);
    let t: ReturnType<typeof setTimeout>;
    const id = setInterval(() => {
      setFade(true);
      t = setTimeout(() => {
        setI((x) => x + 1);
        setFade(false);
      }, 400);
    }, 6000);
    return () => {
      clearInterval(id);
      clearTimeout(t);
    };
  }, [key]);

  const r = recoInfo(now);
  const why = REASONS[reasons[i % reasons.length]];
  return (
    <button type="button" className={styles.reco} onClick={onOpen}>
      <Icon name="heart" strokeWidth={2} />
      <span className={styles.t}>
        {doctor ? (
          <>
            Bouge en douceur <em>{durText(Math.min(30, r.dur))}</em> {r.when}.{' '}
            <span>Demande à ton médecin quels efforts te conviennent.</span>
          </>
        ) : (
          <>
            Faisons un petit sport <em>{durText(r.dur)}</em> {r.when}{' '}
            <span className={`${styles.why} ${fade ? styles.fade : ''}`}>{why}</span>
          </>
        )}
        <small>Réf. OMS : au moins {WHO_WEEKLY_MINUTES} min d’activité physique par semaine</small>
      </span>
      <span className={styles.go}>›</span>
    </button>
  );
}

interface Suggestion {
  title: string;
  minutes: number;
  note: string;
  category: Category;
}

function RecoSheet({ now, tasks, onClose }: { now: NowResult; tasks: TaskRow[]; onClose: () => void }) {
  const health = useHealthContext();
  const doctor = mustAskDoctor(health);
  const reason = REASONS[healthReasons(health)[0]];
  const add = useAddTasks();
  const toast = useToast();
  const r = recoInfo(now);
  const gentle: Suggestion[] = [
    { title: 'Marcher', minutes: Math.min(30, r.dur), note: 'Le plus simple pour le cœur et la tension', category: 'sport' },
    { title: 'Faire des étirements', minutes: 15, note: 'Dos, nuque et jambes', category: 'sante' },
    { title: 'Méditer et respirer calmement', minutes: 10, note: 'Pour baisser le stress', category: 'sante' },
    { title: 'Boire un grand verre d’eau', minutes: 5, note: 'L’hydratation compte aussi', category: 'sante' },
  ];
  const list: Suggestion[] = doctor
    ? gentle
    : [
        { title: 'Faire du sport', minutes: r.dur, note: `Recommandé ${r.when}, ${reason}`, category: 'sport' },
        gentle[0],
        { title: 'Faire des pompes et des abdos', minutes: 15, note: 'Renforcement sans matériel', category: 'sport' },
        ...gentle.slice(1),
      ];

  async function addSuggestion(s: Suggestion) {
    const today = todayISO();
    const from = now.mode === 'now' ? now.end : nowMinutes() + 1;
    let slot = firstFreeSlot(tasks, today, from, s.minutes);
    if (!slot) {
      slot = { date: addDaysISO(today, 1), start_time: '07:00', end_time: `${pad(7 + Math.floor(s.minutes / 60))}:${pad(s.minutes % 60)}` };
    }
    const title = s.title === 'Faire du sport' || s.title === 'Marcher' ? `${s.title} ${fmtDuration(s.minutes)}` : s.title;
    try {
      await add.mutateAsync([{ ...slot, title, category: s.category, is_priority: true }]);
      onClose();
      toast(`Ajouté à ${slot.start_time}${slot.date !== today ? ' demain' : ''}`);
    } catch {
      toast("L'activité n'a pas pu être ajoutée.");
    }
  }

  return (
    <Sheet title="Améliorer ma santé" onClose={onClose}>
      <p className="muted small" style={{ margin: 0 }}>
        Choisis une activité : elle s’ajoute à ton programme dans le premier créneau libre et apparaît dans le cercle
        « Maintenant ».
      </p>
      {doctor && (
        <p className="medical" role="note">
          Ton profil de santé demande de la prudence : pas de sport intense. Demande à ton médecin quels efforts te
          conviennent.
        </p>
      )}
      <div className="list">
        {list.map((s, i) => (
          <div key={s.title} className={`${styles.sug} ${i === 0 && !doctor ? styles.first : ''}`}>
            <div className={styles.t}>
              <b>
                {s.title} · {fmtDuration(s.minutes)}
              </b>
              <small>{s.note}</small>
            </div>
            <button className="btn primary sm" type="button" onClick={() => void addSuggestion(s)} disabled={add.isPending}>
              Ajouter
            </button>
          </div>
        ))}
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        L’OMS recommande au moins 150 minutes d’activité physique modérée par semaine. LifeBook ne remplace pas l’avis
        d’un médecin.
      </p>
    </Sheet>
  );
}
