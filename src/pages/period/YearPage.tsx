import { useState, type CSSProperties, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useGoalMutations, useGoalSteps, useGoals } from '../../hooks/useGoals';
import { usePlan, usePlansRange, useSavePlan } from '../../hooks/usePlan';
import { useGoalTasks } from '../../hooks/useTasks';
import { AutoSaveInput } from '../../components/AutoSaveInput';
import { Sheet } from '../../components/Sheet';
import { ErrorState, LoadingState } from '../../components/States';
import { useToast } from '../../components/Toast';
import { DOMAINS, DOMAIN_COLOR, DOMAIN_LABEL } from '../../utils/categories';
import { cap, daysInMonth, fmtDate, pad, parseISODate, weekOfYear } from '../../utils/dates';
import { STATUS_ORDER, goalProgress, goalStatus, goalStatusLabel } from '../../utils/goals';
import type { GoalDomain, GoalRow, GoalStepRow } from '../../types/database';
import styles from './Period.module.css';
import { currentDate, nowISO } from '../../lib/serverTime';

const QUARTER_END = ['03-31', '06-30', '09-30', '12-31'];

export function YearPage() {
  const [params, setParams] = useSearchParams();
  const now = currentDate();
  const Y0 = now.getFullYear();
  const y = Number(params.get('annee')) || Y0;
  const first = `${y}-01-01`;
  const last = `${y}-12-31`;
  const goalsQ = useGoals();
  const stepsQ = useGoalSteps();
  const links = useGoalTasks().data ?? [];
  const planQ = usePlan('year', first);
  const savePlan = useSavePlan('year', first);
  const { addGoal, updateGoal, deleteGoal } = useGoalMutations();
  const toast = useToast();
  const [filter, setFilter] = useState<GoalDomain | 'all'>('all');
  const [quarter, setQuarter] = useState(y === Y0 ? Math.floor(now.getMonth() / 3) : 0);
  const [openMonth, setOpenMonth] = useState<number | null>(null);
  const [gTitle, setGTitle] = useState('');
  const [gDomain, setGDomain] = useState<GoalDomain>('sante');
  const [gQuarter, setGQuarter] = useState(3);
  const [gParent, setGParent] = useState('');
  const onError = () => toast('Non enregistré : vérifie ta connexion.');

  const allGoals = goalsQ.data ?? [];
  const yearGoals = allGoals.filter((g) => g.level === 'year' && (g.deadline ?? '').startsWith(`${y}-`));
  const lifeGoals = allGoals.filter((g) => g.level === 'life' && !g.done_at);
  const goalById = new Map(allGoals.map((g) => [g.id, g]));
  const steps = (stepsQ.data ?? []).filter((s) => s.due_date && s.due_date >= first && s.due_date <= last);

  // Temps restant
  const start = new Date(y, 0, 1);
  const end = new Date(y + 1, 0, 1);
  const frac = Math.min(1, Math.max(0, (now.getTime() - start.getTime()) / (end.getTime() - start.getTime())));
  const daysTot = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  const daysLeft = y < Y0 ? 0 : y > Y0 ? daysTot : Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86_400_000));
  const cw = y === Y0 ? weekOfYear(now) : y < Y0 ? 52 : -1;
  const weeksLeft = y < Y0 ? 0 : y > Y0 ? 52 : Math.max(0, 52 - cw - 1);
  const stepWeeks = new Map<number, string>();
  steps.forEach((s) => {
    const g = goalById.get(s.goal_id);
    stepWeeks.set(weekOfYear(parseISODate(s.due_date as string)), g ? DOMAIN_COLOR[g.domain] : 'var(--muted)');
  });

  const usedDomains = DOMAINS.filter((d) => yearGoals.some((g) => g.domain === d.key));
  const shown = yearGoals
    .filter((g) => filter === 'all' || g.domain === filter)
    .sort((a, b) => STATUS_ORDER[goalStatus(a, now)] - STATUS_ORDER[goalStatus(b, now)] || (a.deadline ?? '').localeCompare(b.deadline ?? ''));

  async function onAddGoal(e: FormEvent) {
    e.preventDefault();
    if (!gTitle.trim()) return;
    try {
      await addGoal.mutateAsync({
        title: gTitle.trim(),
        domain: gDomain,
        level: 'year',
        deadline: `${y}-${QUARTER_END[gQuarter]}`,
        parent_goal_id: gParent || null,
      });
      setGTitle('');
      toast('Objectif ajouté');
    } catch {
      toast("L'objectif n'a pas pu être ajouté.");
    }
  }

  const go = (n: number) => {
    const ny = y + n;
    setParams(ny === Y0 ? {} : { annee: String(ny) }, { replace: true });
    setFilter('all');
    setQuarter(ny === Y0 ? Math.floor(now.getMonth() / 3) : 0);
  };

  return (
    <>
      <div className={styles.head}>
        <div className={styles.title}>
          <span className={styles.k}>Programme</span>
          <h1>
            Mon année <span>{y}</span>
          </h1>
        </div>
        <div className={styles.sel}>
          <button type="button" aria-label="Année précédente" onClick={() => go(-1)}>
            ‹
          </button>
          <span>{y}</span>
          <button type="button" aria-label="Année suivante" onClick={() => go(1)}>
            ›
          </button>
        </div>
      </div>

      <label className={`${styles.theme} ${styles.word}`}>
        <small>Mon mot de l'année</small>
        <AutoSaveInput
          key={first}
          maxLength={30}
          placeholder="Ex. Discipline"
          value={planQ.data?.theme ?? ''}
          onSave={(v) => savePlan.mutate({ theme: v.trim() || null }, { onError })}
        />
      </label>

      <div className="card">
        <div className={styles.cardTitle}>
          <h2>Le temps qu'il reste</h2>
          <small>{y === Y0 ? `semaine ${cw + 1} / 52` : y < Y0 ? 'année terminée' : 'à venir'}</small>
        </div>
        <div className={styles.big}>
          <b>{weeksLeft}</b>
          <span>{y > Y0 ? 'semaines pour cette année' : "semaines avant la fin de l'année"}</span>
        </div>
        <div className="bar" aria-hidden="true">
          <i style={{ width: `${(y < Y0 ? 1 : y > Y0 ? 0 : frac) * 100}%` }} />
        </div>
        <div className="stats3">
          <div>
            <b>{daysLeft}</b>
            <small>jours restants</small>
          </div>
          <div>
            <b>
              {yearGoals.filter((g) => g.done_at).length}/{yearGoals.length}
            </b>
            <small>objectifs atteints</small>
          </div>
          <div>
            <b>{steps.length}</b>
            <small>étapes prévues</small>
          </div>
        </div>
        <div className={styles.weeks52} role="img" aria-label="Les 52 semaines de l'année">
          {Array.from({ length: 52 }, (_, i) => {
            const c = stepWeeks.get(i);
            return (
              <i
                key={i}
                className={`${i < cw ? styles.p : ''} ${i === cw ? styles.n : ''} ${c ? styles.ms : ''}`}
                style={c ? ({ '--c': c } as CSSProperties) : undefined}
              />
            );
          })}
        </div>
        <div className="legend2">
          <span>
            <i style={{ background: 'var(--lived)' }} />
            passées
          </span>
          <span>
            <i style={{ background: 'var(--lime)' }} />
            cette semaine
          </span>
          <span>
            <i style={{ border: '2px solid var(--muted)' }} />
            étape prévue
          </span>
        </div>
      </div>

      <div className="card">
        <div className={styles.cardTitle}>
          <h2>Mes objectifs de l'année</h2>
          <small>
            {yearGoals.filter((g) => g.done_at).length} / {yearGoals.length}
          </small>
        </div>
        {usedDomains.length > 0 && (
          <div className={styles.domains} role="group" aria-label="Filtrer par domaine">
            <button type="button" aria-pressed={filter === 'all'} style={{ '--c': 'var(--lime)' } as CSSProperties} onClick={() => setFilter('all')}>
              <i />
              Tous
            </button>
            {usedDomains.map((d) => (
              <button key={d.key} type="button" aria-pressed={filter === d.key} style={{ '--c': d.color } as CSSProperties} onClick={() => setFilter(d.key)}>
                <i />
                {d.label}
              </button>
            ))}
          </div>
        )}
        {goalsQ.isLoading ? (
          <LoadingState />
        ) : goalsQ.isError ? (
          <ErrorState message="Impossible de charger tes objectifs." onRetry={() => void goalsQ.refetch()} />
        ) : shown.length === 0 ? (
          <p className="empty">Aucun objectif pour l'instant. Écris ton premier ci-dessous.</p>
        ) : (
          <div className="list">
            {shown.map((g) => {
              const gs = (stepsQ.data ?? []).filter((s) => s.goal_id === g.id);
              const p = goalProgress(gs, links.filter((l) => l.goal_id === g.id));
              const s = goalStatus(g, now);
              const parent = g.parent_goal_id ? goalById.get(g.parent_goal_id) : null;
              const q = Math.floor((Number((g.deadline ?? '').slice(5, 7)) - 1) / 3);
              return (
                <div key={g.id} className={`${styles.goal} ${g.done_at ? styles.done : ''}`} style={{ '--c': DOMAIN_COLOR[g.domain] } as CSSProperties}>
                  <div className={styles.t}>
                    <span className={styles.cat}>
                      {DOMAIN_LABEL[g.domain]} · avant fin T{q + 1}
                    </span>
                    <b>{g.title}</b>
                    {p.ratio != null ? (
                      <>
                        <div className={styles.miniC}>
                          <i style={{ width: `${p.ratio * 100}%` }} />
                        </div>
                        <small>
                          {p.done}/{p.total} étapes et tâches faites
                        </small>
                      </>
                    ) : (
                      <small>Ajoute des étapes dans les mois ci-dessous</small>
                    )}
                    {parent && <small>→ {parent.title}</small>}
                    <span className={`st ${s}`} style={{ alignSelf: 'flex-start' }}>
                      {goalStatusLabel(g, now)}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="check"
                    aria-pressed={!!g.done_at}
                    aria-label={`Objectif ${g.title} atteint`}
                    onClick={() =>
                      updateGoal.mutate(
                        { id: g.id, values: { done_at: g.done_at ? null : nowISO() } },
                        { onSuccess: () => !g.done_at && toast('Objectif atteint, bravo !'), onError },
                      )
                    }
                  >
                    {g.done_at ? '✓' : ''}
                  </button>
                  <button type="button" className="x" aria-label={`Supprimer l'objectif ${g.title}`} onClick={() => deleteGoal.mutate(g.id, { onSuccess: () => toast('Objectif supprimé'), onError })}>
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <form className="list" onSubmit={onAddGoal}>
          <div className={styles.add}>
            <input maxLength={120} placeholder="Nouvel objectif" aria-label="Nouvel objectif" value={gTitle} onChange={(e) => setGTitle(e.target.value)} />
            <button type="submit" className={styles.plus} aria-label="Ajouter l'objectif" disabled={addGoal.isPending}>
              +
            </button>
          </div>
          <div className="grid2">
            <select aria-label="Domaine" value={gDomain} onChange={(e) => setGDomain(e.target.value as GoalDomain)}>
              {DOMAINS.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </select>
            <select aria-label="Échéance" value={gQuarter} onChange={(e) => setGQuarter(Number(e.target.value))}>
              {[0, 1, 2, 3].map((q) => (
                <option key={q} value={q}>
                  Avant fin T{q + 1}
                </option>
              ))}
            </select>
          </div>
          {lifeGoals.length > 0 && (
            <select aria-label="Rattacher à un objectif de vie" value={gParent} onChange={(e) => setGParent(e.target.value)}>
              <option value="">Rattacher à une grande étape de vie (facultatif)</option>
              {lifeGoals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          )}
        </form>
      </div>

      <QuarterCard key={`q-${y}`} year={y} quarter={quarter} onQuarter={setQuarter} yearGoals={yearGoals} steps={steps} goalById={goalById} />

      <div className="card">
        <div className={styles.cardTitle}>
          <h2>Mes 12 mois</h2>
          <small>touche un mois</small>
        </div>
        <div className={styles.months}>
          {Array.from({ length: 12 }, (_, i) => {
            const key = `${y}-${pad(i + 1)}`;
            const ms = steps.filter((s) => (s.due_date ?? '').startsWith(key));
            const cur = y === Y0 && i === now.getMonth();
            const past = y < Y0 || (y === Y0 && i < now.getMonth());
            return (
              <button key={i} type="button" className={`${styles.month} ${cur ? styles.cur : ''} ${past ? styles.pastM : ''}`} onClick={() => setOpenMonth(i)}>
                <b>{cap(fmtDate(`${key}-01`, 'MMMM'))}</b>
                <small>{ms.length ? `${ms.filter((m) => m.done_at).length}/${ms.length} étapes` : 'Rien de prévu'}</small>
                <span className={styles.dots}>
                  {ms.slice(0, 8).map((m) => {
                    const g = goalById.get(m.goal_id);
                    return <i key={m.id} style={{ '--c': g ? DOMAIN_COLOR[g.domain] : 'var(--muted)' } as CSSProperties} />;
                  })}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {openMonth != null && (
        <MonthSheet year={y} month={openMonth} goals={yearGoals} steps={steps} goalById={goalById} onClose={() => setOpenMonth(null)} />
      )}
    </>
  );
}

function StepRow({ s, goal }: { s: GoalStepRow; goal: GoalRow | undefined }) {
  const { updateStep, deleteStep } = useGoalMutations();
  const toast = useToast();
  const d = parseISODate(s.due_date as string);
  return (
    <div className={`${styles.ms} ${s.done_at ? styles.done : ''}`} style={{ '--c': goal ? DOMAIN_COLOR[goal.domain] : 'var(--muted)' } as CSSProperties}>
      <span className={styles.date}>
        {pad(d.getDate())} {fmtDate(s.due_date as string, 'MMM')}
      </span>
      <div className={styles.t}>
        <small>{goal ? goal.title : 'Étape'}</small>
        <span>{s.title}</span>
      </div>
      <button
        type="button"
        className="check"
        aria-pressed={!!s.done_at}
        aria-label={`Étape ${s.title} faite`}
        onClick={() => updateStep.mutate({ id: s.id, values: { done_at: s.done_at ? null : nowISO() } })}
      >
        {s.done_at ? '✓' : ''}
      </button>
      <button type="button" className="x" aria-label={`Supprimer l'étape ${s.title}`} onClick={() => deleteStep.mutate(s.id, { onSuccess: () => toast('Étape supprimée') })}>
        ✕
      </button>
    </div>
  );
}

function QuarterCard({
  year,
  quarter,
  onQuarter,
  yearGoals,
  steps,
  goalById,
}: {
  year: number;
  quarter: number;
  onQuarter: (q: number) => void;
  yearGoals: GoalRow[];
  steps: GoalStepRow[];
  goalById: Map<string, GoalRow>;
}) {
  const qStart = `${year}-${pad(quarter * 3 + 1)}-01`;
  const plans = usePlansRange('quarter', `${year}-01-01`, `${year}-12-31`).data ?? [];
  const save = useSavePlan('quarter', qStart);
  const toast = useToast();
  const focus = plans.find((p) => p.period_start === qStart)?.theme ?? '';
  const qSteps = steps
    .filter((s) => Math.floor((Number((s.due_date ?? '').slice(5, 7)) - 1) / 3) === quarter)
    .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''));
  const qGoals = yearGoals.filter((g) => Math.floor((Number((g.deadline ?? '').slice(5, 7)) - 1) / 3) === quarter);
  return (
    <div className="card">
      <div className={styles.cardTitle}>
        <h2>Par trimestre</h2>
      </div>
      <div className={styles.qtabs} role="group" aria-label="Trimestre">
        {[0, 1, 2, 3].map((q) => (
          <button key={q} type="button" aria-pressed={q === quarter} onClick={() => onQuarter(q)}>
            T{q + 1}
          </button>
        ))}
      </div>
      <label className={styles.qfocus}>
        <small>Focus du trimestre</small>
        <AutoSaveInput
          key={qStart}
          maxLength={80}
          placeholder="Ce qui compte ce trimestre"
          value={focus}
          onSave={(v) => save.mutate({ theme: v.trim() || null }, { onError: () => toast('Non enregistré.') })}
        />
      </label>
      {qGoals.length > 0 && (
        <small className="muted" style={{ fontSize: 12 }}>
          Objectifs à atteindre ce trimestre : {qGoals.map((g) => g.title).join(', ')}
        </small>
      )}
      {qSteps.length ? (
        <div className="list">
          {qSteps.map((s) => (
            <StepRow key={s.id} s={s} goal={goalById.get(s.goal_id)} />
          ))}
        </div>
      ) : (
        <p className="empty">Aucune étape ce trimestre. Touche un mois pour en ajouter.</p>
      )}
    </div>
  );
}

function MonthSheet({
  year,
  month,
  goals,
  steps,
  goalById,
  onClose,
}: {
  year: number;
  month: number;
  goals: GoalRow[];
  steps: GoalStepRow[];
  goalById: Map<string, GoalRow>;
  onClose: () => void;
}) {
  const { addStep } = useGoalMutations();
  const toast = useToast();
  const key = `${year}-${pad(month + 1)}`;
  const dim = daysInMonth(`${key}-01`);
  const ms = steps.filter((s) => (s.due_date ?? '').startsWith(key)).sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''));
  const openGoals = goals.filter((g) => !g.done_at);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(`${key}-${pad(Math.min(15, dim))}`);
  const [goalId, setGoalId] = useState(openGoals[0]?.id ?? '');
  const [error, setError] = useState('');
  const name = cap(fmtDate(`${key}-01`, 'MMMM'));

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!title.trim()) return setError("Écris l'étape à prévoir.");
    if (!goalId) return setError("Choisis l'objectif de l'année auquel cette étape appartient.");
    try {
      await addStep.mutateAsync({ goal_id: goalId, title: title.trim(), due_date: date || `${key}-15` });
      setTitle('');
      toast('Étape ajoutée');
    } catch {
      setError("L'étape n'a pas pu être ajoutée.");
    }
  }

  return (
    <Sheet title={`${name} ${year}`} onClose={onClose}>
      <div className="list">
        {ms.length ? ms.map((s) => <StepRow key={s.id} s={s} goal={goalById.get(s.goal_id)} />) : <p className="empty">Rien de prévu ce mois-ci.</p>}
      </div>
      {openGoals.length === 0 ? (
        <p className="muted small" style={{ margin: 0 }}>
          Ajoute d'abord un objectif de l'année : chaque étape appartient à un objectif.
        </p>
      ) : (
        <form className="list" onSubmit={onAdd} noValidate style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          <label className="field">
            <span>Nouvelle étape</span>
            <input maxLength={120} placeholder="Ex. Inscription à la salle de sport" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <div className="grid2">
            <label className="field">
              <span>Date</span>
              <input type="date" min={`${key}-01`} max={`${key}-${pad(dim)}`} value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="field">
              <span>Objectif</span>
              <select value={goalId} onChange={(e) => setGoalId(e.target.value)}>
                {openGoals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="btn primary" type="submit" disabled={addStep.isPending}>
            Ajouter à {name.toLowerCase()}
          </button>
        </form>
      )}
    </Sheet>
  );
}
