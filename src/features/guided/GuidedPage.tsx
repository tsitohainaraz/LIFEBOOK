import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '../../components/Icon';
import { ErrorState, LoadingState } from '../../components/States';
import { ToastProvider, useToast } from '../../components/Toast';
import { useAuth, useProfile } from '../../contexts/AuthContext';
import { useGoals, useGoalSteps } from '../../hooks/useGoals';
import { useHealthContext } from '../../hooks/useHealth';
import { useInsights } from '../../hooks/useInsights';
import { useAddTasks, useDeleteTask, useTasksRange, useUpdateTask } from '../../hooks/useTasks';
import { supabase } from '../../lib/supabase';
import type { Category, Priority, TaskRow } from '../../types/database';
import { addDaysISO, cap, fmtDate, nowMinutes, todayISO } from '../../utils/dates';
import { goalStatus } from '../../utils/goals';
import { mustAskDoctor } from '../../utils/health';
import { sleepFromHours } from '../../utils/freeSlots';
import { proposeDayPlan, type DayPlan, type Energy, type PlacedItem, type ToPlace } from '../../utils/scheduler';
import { currentDate } from '../../lib/serverTime';
import { useMyCards } from '../boards/myCards';
import { callAssistant } from '../assistant/api';
import { useSpeech } from '../assistant/useSpeech';
import { CarryOver } from './CarryOver';
import {
  buildScript,
  fallbackItems,
  freeAnswersForAi,
  guidedPriorities,
  MAX_ADJUSTMENTS,
  mergeItems,
  planningStreak,
  structuredItems,
  type Answers,
  type Question,
} from './script';
import styles from './Guided.module.css';

export function GuidedPage() {
  return (
    <ToastProvider>
      <Guided />
    </ToastProvider>
  );
}

type Stage = 'choice' | 'welcome' | 'questions' | 'building' | 'result' | 'done';

const toTime = (t: string | null) => (t ? t.slice(0, 5) : null);

function Guided() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const profile = useProfile();
  const today = todayISO();
  const isToday = params.get('jour') === 'aujourdhui';
  const date = isToday ? today : addDaysISO(today, 1);

  const tasksQ = useTasksRange(addDaysISO(today, -14), addDaysISO(date, 7));
  const goalsQ = useGoals();
  const stepsQ = useGoalSteps();
  const insightsQ = useInsights();
  const health = useHealthContext();
  const cardsQ = useMyCards(date, date);
  const addTasks = useAddTasks();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const [stage, setStage] = useState<Stage>(isToday ? 'welcome' : 'choice');
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [plan, setPlan] = useState<DayPlan | null>(null);
  const [items, setItems] = useState<ToPlace[]>([]);
  const [explanation, setExplanation] = useState('');
  const [aiOn, setAiOn] = useState(true);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [adjustText, setAdjustText] = useState('');
  const [adjustments, setAdjustments] = useState(0);
  const [adjusting, setAdjusting] = useState(false);
  const [intention, setIntention] = useState('');
  const [saving, setSaving] = useState(false);
  const [streak, setStreak] = useState(0);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [carried, setCarried] = useState<ToPlace[]>([]);

  const all = useMemo(() => tasksQ.data ?? [], [tasksQ.data]);
  const dayTasks = useMemo(() => all.filter((t) => t.date === date), [all, date]);
  const sleep = useMemo(() => sleepFromHours(Number(profile.sleep_hours) || 8), [profile.sleep_hours]);
  const guard = mustAskDoctor(health);
  const dayCards = useMemo(() => (cardsQ.data ?? []).filter((c) => c.due_date === date && !c.done_at), [cardsQ.data, date]);

  const questions: Question[] = useMemo(() => {
    const weekStart = addDaysISO(date, -6);
    const goals = (goalsQ.data ?? []).filter((g) => !g.done_at);
    const steps = (stepsQ.data ?? []).filter((s) => !s.done_at);
    return buildScript({
      isToday,
      known: { sportPlanned: dayTasks.some((t) => t.category === 'sport') },
      defaultWake: sleep.wake,
      mustSuggestions: all.filter((t) => t.date < date && t.date >= addDaysISO(today, -2) && !t.done_at).map((t) => t.title),
      postponed: all.filter((t) => !t.done_at && t.postponed_count >= 3 && t.date >= today).map((t) => ({ id: t.id, title: t.title, count: t.postponed_count })),
      urgentGoals: goals
        .filter((g) => goalStatus(g, currentDate()) === 'urgent')
        .map((g) => ({ id: g.id, title: g.title, hasTaskThisWeek: all.some((t) => t.goal_id === g.id && t.date >= weekStart && t.date <= date) })),
      goalSteps: steps
        .map((s) => ({ goalId: s.goal_id, goalTitle: goals.find((g) => g.id === s.goal_id)?.title ?? '', title: s.title }))
        .filter((s) => s.goalTitle),
      sportWeekMin: insightsQ.data?.sportWeekMin ?? 0,
      healthGuard: guard,
    });
    // Le scénario est figé au début de l'entretien.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasksQ.isSuccess, goalsQ.isSuccess, stepsQ.isSuccess, insightsQ.isSuccess, date]);

  /** Tâches déjà prévues ce jour-là (et cartes à heure fixe) : le planificateur ne les touche pas. */
  function fixedItems(): { date: string; start: string; end: string }[] {
    const blockerId = answers.blocker?.id;
    const timed = dayTasks
      .filter((t) => t.start_time && t.end_time && t.id !== blockerId && !carried.some((c) => c.key === `task:${t.id}`))
      .map((t) => ({ date, start: toTime(t.start_time)!, end: toTime(t.end_time)! }));
    const cards = dayCards.filter((c) => c.due_time).map((c) => {
      const s = toTime(c.due_time)!;
      const [h, m] = s.split(':').map(Number);
      const e = Math.min(24 * 60 - 1, h * 60 + m + 30);
      return { date, start: s, end: `${String(Math.floor(e / 60)).padStart(2, '0')}:${String(e % 60).padStart(2, '0')}` };
    });
    return [...timed, ...cards];
  }

  function runPlanner(list: ToPlace[]): DayPlan {
    const ins = insightsQ.data;
    return proposeDayPlan(
      date,
      list,
      fixedItems(),
      // La question sport a été posée : le planificateur n'ajoute pas de sport de lui-même.
      { bestRanges: ins?.bestRanges ?? [], sportWeekMin: answers.sportMin !== undefined ? 999 : (ins?.sportWeekMin ?? 0) },
      { sleep: { wake: answers.wake ?? sleep.wake, bed: sleep.bed }, startMin: isToday ? nowMinutes() : undefined, healthGuard: guard },
      answers.energy ?? 'normal',
    );
  }

  function localExplanation(p: DayPlan): string {
    const n = p.placed.length;
    const base = n ? `J'ai placé ${n} élément${n > 1 ? 's' : ''} dans tes créneaux libres, les plus importants d'abord.` : "Je n'ai rien pu placer dans tes créneaux libres.";
    return p.nonPlaces.length ? `${base} Sans place : ${p.nonPlaces.map((x) => x.title).join(', ')}.` : base;
  }

  async function build() {
    setStage('building');
    const free = freeAnswersForAi(questions, answers);
    let parsed: ToPlace[] = [];
    let ai = aiOn;
    let conv = conversationId;
    if (free.length && ai) {
      try {
        const res = await callAssistant({ mode: 'guided_parse', date, answers: free, conversation_id: conv });
        if (res.conversation_id) conv = res.conversation_id;
        if (res.ai && res.items) parsed = res.items;
        else ai = false;
      } catch {
        ai = false;
      }
    }
    if (!ai) parsed = fallbackItems({ must: answers.must, fixed: answers.fixed, dreamText: answers.dreamText });
    const list = mergeItems(carried, parsed, structuredItems(answers));
    const p = runPlanner(list);
    let text = localExplanation(p);
    if (ai && p.placed.length) {
      try {
        const res = await callAssistant({
          mode: 'explain_plan',
          date,
          energy: answers.energy,
          conversation_id: conv,
          plan: p.placed.map((x) => ({ title: x.title, start: x.start, end: x.end })),
          non_places: p.nonPlaces.map((x) => x.title),
        });
        if (res.conversation_id) conv = res.conversation_id;
        text = res.reply || text;
        if (!res.ai) ai = false;
      } catch {
        ai = false;
      }
    }
    setConversationId(conv);
    setAiOn(ai);
    setItems(list);
    setPlan(p);
    setExplanation(text);
    setStage('result');
  }

  function replanWith(list: ToPlace[]) {
    setItems(list);
    setPlan(runPlanner(list));
  }

  async function adjust() {
    if (!plan || !adjustText.trim() || adjustments >= MAX_ADJUSTMENTS) return;
    setAdjusting(true);
    try {
      const res = await callAssistant({
        mode: 'adjust_plan',
        date,
        message: adjustText.trim(),
        conversation_id: conversationId,
        plan: plan.placed.map((x) => ({ id: x.key, title: x.title, category: x.category, start: x.start, end: x.end, goal_id: x.goal_id })),
      });
      setAdjustments((n) => n + 1);
      if (!res.ai) {
        setAiOn(false);
        toast(res.reply || "L'assistante n'est plus disponible : ajuste à la main.");
        return;
      }
      if (res.tasks && res.ops?.length) {
        const byId = new Map(res.tasks.map((t) => [t.id, t]));
        const placed: PlacedItem[] = [];
        for (const x of plan.placed) {
          const t = byId.get(x.key);
          if (t && t.start && t.end) placed.push({ ...x, start: t.start, end: t.end });
        }
        for (const t of res.tasks) {
          if (!plan.placed.some((x) => x.key === t.id) && t.start && t.end) {
            placed.push({ key: t.id, title: t.title, category: t.category, date, start: t.start, end: t.end, priority: 'should', goal_id: t.goal_id ?? null, fixed: false, session: null });
          }
        }
        placed.sort((a, b) => a.start.localeCompare(b.start));
        setPlan({ ...plan, placed });
        setAdjustText('');
      }
      if (res.reply) setExplanation(res.reply);
    } catch {
      toast("L'ajustement n'a pas pu être fait. Réessaie.");
    } finally {
      setAdjusting(false);
    }
  }

  async function validate() {
    if (!plan) return;
    setSaving(true);
    try {
      const creates = plan.placed.filter((p) => !p.key.startsWith('task:'));
      const moves = plan.placed.filter((p) => p.key.startsWith('task:'));
      if (creates.length) {
        await addTasks.mutateAsync(
          creates.map((p) => ({
            title: p.session && p.session.total > 1 ? `${p.title} (${p.session.index}/${p.session.total})` : p.title,
            category: p.category as Category,
            date,
            start_time: p.start,
            end_time: p.end,
            goal_id: p.goal_id,
            is_priority: p.priority === 'must',
          })),
        );
      }
      const movedIds = new Set<string>();
      for (const m of moves) {
        const id = m.key.slice(5).split('#')[0];
        if (movedIds.has(id)) continue;
        movedIds.add(id);
        await updateTask.mutateAsync({ id, values: { date, start_time: m.start, end_time: m.end } });
      }
      if (answers.blocker?.choice === 'abandonner') await deleteTask.mutateAsync({ id: answers.blocker.id });
      const priorities: Priority[] = guidedPriorities(items).map((text) => ({ text, done: false }));
      const { error } = await supabase
        .from('plans')
        .upsert(
          { user_id: user?.id, period: 'day', period_start: date, priorities, ...(intention.trim() ? { theme: intention.trim() } : {}) },
          { onConflict: 'user_id,period,period_start' },
        );
      if (error) throw error;
      void qc.invalidateQueries({ queryKey: ['plan', user?.id] });
      const planned = new Set(all.map((t: TaskRow) => t.date));
      planned.add(date);
      setStreak(planningStreak(planned, date, addDaysISO));
      setStage('done');
    } catch {
      toast("Ta journée n'a pas pu être enregistrée. Vérifie ta connexion.");
    } finally {
      setSaving(false);
    }
  }

  function restart() {
    setAnswers({});
    setIndex(0);
    setPlan(null);
    setItems([]);
    setAdjustments(0);
    setStage('welcome');
  }

  const loading = tasksQ.isLoading || goalsQ.isLoading || stepsQ.isLoading;
  const dayLabel = cap(fmtDate(date, 'EEEE d MMMM'));

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <button type="button" className="iconbtn" aria-label="Fermer" onClick={() => navigate(-1)}>
          <Icon name="close" />
        </button>
        <div className={styles.headTitle}>
          <strong>{isToday ? 'Planifier aujourd’hui' : 'Planifier demain'}</strong>
          <span className="small muted">{dayLabel}</span>
        </div>
        {stage === 'questions' && (
          <span className="mono small muted" aria-label={`Question ${index + 1} sur ${questions.length}`}>
            {index + 1}/{questions.length}
          </span>
        )}
      </header>
      {stage === 'questions' && (
        <div className={styles.progress} aria-hidden="true">
          <span style={{ width: `${((index + 1) / questions.length) * 100}%` }} />
        </div>
      )}

      <main className={styles.body}>
        {loading ? (
          <LoadingState label="Je regarde ce qui est déjà prévu…" />
        ) : tasksQ.isError ? (
          <ErrorState message="Impossible de charger ta journée. Vérifie ta connexion." onRetry={() => void tasksQ.refetch()} />
        ) : stage === 'choice' ? (
          <div className={styles.screen} key="choice">
            <h1 className={styles.q}>Comment veux-tu planifier demain ?</h1>
            <button type="button" className={`${styles.bigChoice} ${styles.bigChoiceOn}`} onClick={() => setStage('welcome')}>
              <Icon name="spark" />
              <span>
                <strong>Planifier avec l'assistante</strong>
                <small>Quelques questions, une à la fois. Environ 3 minutes.</small>
              </span>
            </button>
            <button type="button" className={styles.bigChoice} onClick={() => navigate(`/jour?date=${date}`)}>
              <Icon name="pen" />
              <span>
                <strong>Planifier moi-même</strong>
                <small>Ouvre ta journée de demain.</small>
              </span>
            </button>
          </div>
        ) : stage === 'welcome' ? (
          <div className={styles.screen} key="welcome">
            <h1 className={styles.q}>Déjà prévu {isToday ? "aujourd'hui" : 'demain'}</h1>
            {dayTasks.length === 0 && dayCards.length === 0 ? (
              <p className="empty">Rien pour l'instant : on part d'une page blanche.</p>
            ) : (
              <div className={styles.timeline}>
                {dayTasks.map((t) => (
                  <div key={t.id} className={styles.tl}>
                    <span className="mono small">{toTime(t.start_time) ?? '—'}</span>
                    <span className={styles.dot} style={{ background: `var(--cat-${t.category})` }} aria-hidden="true" />
                    <span className={styles.tlTitle}>{t.title}</span>
                  </div>
                ))}
                {dayCards.map((c) => (
                  <div key={c.id} className={styles.tl}>
                    <span className="mono small">{toTime(c.due_time) ?? '—'}</span>
                    <span className={styles.dot} style={{ background: c.boardColor }} aria-hidden="true" />
                    <span className={styles.tlTitle}>
                      {c.title} <span className="small muted">· {c.boardTitle}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
            {!isToday && <CarryOver today={today} tasks={all.filter((t) => t.date === today && !t.done_at)} onKeep={setCarried} />}
            <button type="button" className="btn primary block" onClick={() => setStage('questions')}>
              C'est parti
            </button>
          </div>
        ) : stage === 'questions' ? (
          <QuestionScreen
            key={questions[index]?.id}
            question={questions[index]}
            answers={answers}
            setAnswers={setAnswers}
            canBack={index > 0}
            onBack={() => setIndex((i) => Math.max(0, i - 1))}
            onNext={() => (index + 1 < questions.length ? setIndex(index + 1) : void build())}
            last={index + 1 === questions.length}
          />
        ) : stage === 'building' ? (
          <div className={`${styles.screen} ${styles.center}`} key="building" role="status">
            <div className={styles.spinner} aria-hidden="true" />
            <h1 className={styles.q}>Je prépare ta journée…</h1>
          </div>
        ) : stage === 'result' && plan ? (
          <div className={styles.screen} key="result">
            <p className={styles.explain}>{explanation}</p>
            <div className={styles.timeline}>
              {[
                ...dayTasks
                  .filter((t) => t.start_time && t.id !== answers.blocker?.id && !carried.some((c) => c.key === `task:${t.id}`))
                  .map((t) => ({ key: `old-${t.id}`, start: toTime(t.start_time)!, end: toTime(t.end_time) ?? '', title: t.title, category: t.category, existing: true, session: null as PlacedItem['session'] })),
                ...plan.placed.map((p) => ({ key: p.key, start: p.start, end: p.end, title: p.title, category: p.category, existing: false, session: p.session })),
              ]
                .sort((a, b) => a.start.localeCompare(b.start))
                .map((r) => (
                  <div key={r.key} className={`${styles.tl} ${r.existing ? styles.tlOld : styles.tlNew}`}>
                    <span className="mono small">
                      {r.start}
                      {r.end && <small className={styles.end}>{r.end}</small>}
                    </span>
                    <span className={styles.dot} style={{ background: `var(--cat-${r.category})` }} aria-hidden="true" />
                    <span className={styles.tlTitle}>
                      {r.title}
                      {r.session && r.session.total > 1 && <span className="small muted"> · séance {r.session.index}/{r.session.total}</span>}
                    </span>
                    {!r.existing && (
                      <button type="button" className={styles.edit} aria-label={`Modifier ${r.title}`} onClick={() => setEditKey(editKey === r.key ? null : r.key)}>
                        <Icon name="pen" />
                      </button>
                    )}
                    {editKey === r.key && (
                      <ItemEditor
                        item={items.find((i) => (i.key ?? '') === r.key.split('#')[0]) ?? items.find((i) => i.title === r.title)}
                        onChange={(next) => {
                          setEditKey(null);
                          const target = items.find((i) => (i.key ?? '') === r.key.split('#')[0]) ?? items.find((i) => i.title === r.title);
                          replanWith(next ? items.map((i) => (i === target ? next : i)) : items.filter((i) => i !== target));
                        }}
                      />
                    )}
                  </div>
                ))}
            </div>
            {plan.nonPlaces.length > 0 && (
              <div className={styles.unplaced}>
                <div className="label">Sans place</div>
                {plan.nonPlaces.map((n) => (
                  <span key={n.title} className="chip">
                    {n.title} · {n.duration_min} min
                  </span>
                ))}
              </div>
            )}
            {aiOn && adjustments < MAX_ADJUSTMENTS && (
              <AdjustField value={adjustText} onChange={setAdjustText} onSubmit={() => void adjust()} busy={adjusting} />
            )}
            <label className="field">
              <span>Mon intention du jour</span>
              <input value={intention} onChange={(e) => setIntention(e.target.value)} placeholder="Par exemple : avancer sans me presser" maxLength={200} />
            </label>
            <div className="row">
              <button type="button" className="btn" onClick={restart} disabled={saving}>
                Recommencer
              </button>
              <button type="button" className="btn primary" style={{ flex: 1 }} onClick={() => void validate()} disabled={saving || !plan.placed.length}>
                {saving ? 'Enregistrement…' : 'Valider'}
              </button>
            </div>
          </div>
        ) : stage === 'done' ? (
          <div className={`${styles.screen} ${styles.center}`} key="done">
            <div className={styles.check} aria-hidden="true">
              ✓
            </div>
            <h1 className={styles.q}>Ta journée est prête</h1>
            {streak > 1 && <p className="muted">Série : {streak} jours planifiés d'affilée.</p>}
            <Link to={`/jour?date=${date}`} className="btn primary block">
              Voir ma journée
            </Link>
            <Link to="/" className="btn block">
              Accueil
            </Link>
          </div>
        ) : null}
      </main>
    </div>
  );
}

function QuestionScreen({
  question,
  answers,
  setAnswers,
  canBack,
  onBack,
  onNext,
  last,
}: {
  question: Question | undefined;
  answers: Answers;
  setAnswers: (fn: (a: Answers) => Answers) => void;
  canBack: boolean;
  onBack: () => void;
  onNext: () => void;
  last: boolean;
}) {
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const textKey = question?.id === 'must' ? 'must' : question?.id === 'fixed' ? 'fixed' : question?.id === 'dream' ? 'dreamText' : null;
  const speech = useSpeech((t) => {
    if (!textKey) return;
    setAnswers((a) => ({ ...a, [textKey]: a[textKey] ? `${a[textKey]}, ${t}` : t }));
  });
  if (!question) return null;
  const choose = (fn: (a: Answers) => Answers, auto?: number) => {
    setAnswers(fn);
    if (auto !== undefined) {
      clearTimeout(timer.current);
      timer.current = setTimeout(onNext, auto);
    }
  };
  const selected = (value: string): boolean => {
    switch (question.id) {
      case 'energy':
        return answers.energy === value;
      case 'sport':
        return String(answers.sportMin ?? '') === value;
      case 'blocker':
        return answers.blocker?.choice === value;
      case 'urgent_goal':
        return String(answers.urgentGoal?.minutes ?? '') === value;
      default:
        return false;
    }
  };

  return (
    <div className={styles.screen}>
      <h1 className={styles.q}>{question.title}</h1>
      {question.hint && <p className={styles.hint}>{question.hint}</p>}

      {question.id === 'sport' && !question.hint?.includes('médecin') && <SportGauge hint={question.hint ?? ''} />}

      {(question.kind === 'choice' || question.kind === 'sport') && (
        <div className={styles.choices}>
          {question.options?.map((o) => (
            <button
              key={o.value}
              type="button"
              className="pill"
              aria-pressed={selected(o.value)}
              onClick={() => {
                if (question.id === 'energy') choose((a) => ({ ...a, energy: o.value as Energy }), question.autoAdvanceMs);
                else if (question.id === 'sport') choose((a) => ({ ...a, sportMin: Number(o.value) }));
                else if (question.id === 'blocker' && question.subject) choose((a) => ({ ...a, blocker: { ...question.subject!, choice: o.value } }));
                else if (question.id === 'urgent_goal' && question.subject) choose((a) => ({ ...a, urgentGoal: { ...question.subject!, minutes: Number(o.value) } }));
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      {question.kind === 'steps' && (question.steps?.length ?? 0) > 0 && (
        <div className={styles.steps}>
          {question.steps!.map((s) => {
            const on = !!answers.dreamSteps?.some((d) => d.title === s.title && d.goalId === s.goalId);
            return (
              <button
                key={`${s.goalId}-${s.title}`}
                type="button"
                className={styles.step}
                aria-pressed={on}
                onClick={() =>
                  setAnswers((a) => ({
                    ...a,
                    dreamSteps: on ? (a.dreamSteps ?? []).filter((d) => !(d.title === s.title && d.goalId === s.goalId)) : [...(a.dreamSteps ?? []), { goalId: s.goalId, title: s.title }],
                  }))
                }
              >
                <span className="check">{on ? '✓' : ''}</span>
                <span>
                  {s.title}
                  <small className="muted"> · {s.goalTitle}</small>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {textKey && (
        <div className={styles.textWrap}>
          <textarea
            value={answers[textKey] ?? ''}
            onChange={(e) => setAnswers((a) => ({ ...a, [textKey]: e.target.value }))}
            rows={3}
            maxLength={1500}
            placeholder={question.id === 'dream' ? 'Autre chose ?' : 'Écris ou dicte…'}
            aria-label={question.title}
          />
          {speech.supported && (
            <button type="button" className={`iconbtn ${speech.listening ? styles.listening : ''}`} aria-label={speech.listening ? 'Arrêter la dictée' : 'Dicter'} aria-pressed={speech.listening} onClick={speech.toggle}>
              <Icon name="mic" />
            </button>
          )}
        </div>
      )}
      {question.id === 'must' && (question.suggestions?.length ?? 0) > 0 && (
        <div className={styles.choices}>
          {question.suggestions!.map((s) => (
            <button key={s} type="button" className="chip" onClick={() => setAnswers((a) => ({ ...a, must: a.must ? `${a.must}, ${s}` : s }))}>
              + {s}
            </button>
          ))}
        </div>
      )}

      {question.kind === 'time' && (
        <input
          type="time"
          className={styles.time}
          value={answers.wake ?? question.defaultValue ?? ''}
          onChange={(e) => setAnswers((a) => ({ ...a, wake: e.target.value }))}
          aria-label={question.title}
        />
      )}

      <div className={styles.nav}>
        {canBack && (
          <button type="button" className="btn" onClick={onBack}>
            Retour
          </button>
        )}
        <button type="button" className="btn primary" style={{ flex: 1 }} onClick={onNext}>
          {last ? 'Construire ma journée' : 'Suivant'}
        </button>
      </div>
    </div>
  );
}

function SportGauge({ hint }: { hint: string }) {
  const done = Number(/^(\d+)/.exec(hint)?.[1] ?? 0);
  const pct = Math.min(100, Math.round((done / 150) * 100));
  return (
    <div className="bar" role="img" aria-label={`${done} minutes de sport sur 150 cette semaine`}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

function AdjustField({ value, onChange, onSubmit, busy }: { value: string; onChange: (v: string) => void; onSubmit: () => void; busy: boolean }) {
  const speech = useSpeech((t) => onChange(value ? `${value} ${t}` : t));
  return (
    <form
      className={styles.textWrap}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Ajuster : « décale la banque à 16 h »" aria-label="Ajuster le programme" maxLength={500} />
      {speech.supported && (
        <button type="button" className="iconbtn" aria-label="Dicter" onClick={speech.toggle}>
          <Icon name="mic" />
        </button>
      )}
      <button type="submit" className="iconbtn" aria-label="Ajuster" disabled={busy || !value.trim()}>
        {busy ? '…' : <Icon name="send" />}
      </button>
    </form>
  );
}

const DURATION_LABEL: Record<number, string> = { 30: '30 min', 60: '1 h', 90: '1 h 30', 120: '2 h' };

function ItemEditor({ item, onChange }: { item: ToPlace | undefined; onChange: (next: ToPlace | null) => void }) {
  if (!item) return null;
  return (
    <div className={styles.editor}>
      {[30, 60, 90, 120].map((m) => (
        <button key={m} type="button" className="pill" aria-pressed={item.duration_min === m} onClick={() => onChange({ ...item, duration_min: m })}>
          {DURATION_LABEL[m]}
        </button>
      ))}
      <button type="button" className="btn danger sm" onClick={() => onChange(null)}>
        Retirer
      </button>
    </div>
  );
}
