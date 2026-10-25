import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type MouseEvent } from 'react';
import { useProfile } from '../../contexts/AuthContext';
import { useGoalMutations, useGoals } from '../../hooks/useGoals';
import { useBucketItems, useBucketMutations, useLifePlan, useSaveLifePlan } from '../../hooks/useLifePlan';
import { AutoSaveTextarea } from '../../components/AutoSaveInput';
import { ErrorState, LoadingState } from '../../components/States';
import { useToast } from '../../components/Toast';
import { DOMAINS, DOMAIN_COLOR, DOMAIN_LABEL, VALUES, WHEEL_DOMAINS } from '../../utils/categories';
import { fmtNumber } from '../../utils/dates';
import { deadlineForAge } from '../../utils/goals';
import { ageAt, weeksLivedAndLeft } from '../../utils/life';
import { lifePeriods, periodState, toggleValue, wheelScore, wheelSummary } from '../../utils/lifeplan';
import type { GoalDomain, GoalRow } from '../../types/database';
import styles from './Life.module.css';

const SAVE_DELAY = 800;

export function LifePage() {
  const profile = useProfile();
  const planQ = useLifePlan();
  const goalsQ = useGoals();
  const bucketQ = useBucketItems();
  const save = useSaveLifePlan();
  const toast = useToast();
  const onError = () => toast('Non enregistré : vérifie ta connexion.');
  const birth = profile.birth_date;

  if (!birth) {
    return <ErrorState message="Indique ta date de naissance dans ton compte pour voir ta vie en semaines." />;
  }

  const now = new Date();
  const exp = profile.life_expectancy;
  const age = ageAt(birth, now);
  const W = weeksLivedAndLeft({ birthDate: birth, lifeExpectancy: exp }, now);
  const milestones = (goalsQ.data ?? []).filter((g) => g.level === 'life');
  const bucket = bucketQ.data ?? [];

  return (
    <>
      <section className={styles.hero}>
        <span className={styles.k}>Programme de vie</span>
        <h1>
          Planifier <span>ma vie</span>
        </h1>
        <div className={styles.big}>{fmtNumber(W.left)}</div>
        <div className={styles.sub}>semaines devant toi, jusqu'à {exp} ans</div>
        <div className="bar" aria-hidden="true">
          <i style={{ width: `${(W.lived / W.total) * 100}%` }} />
        </div>
        <div className={styles.row3}>
          <div>
            <b>{Math.max(0, exp - age)}</b>
            <small>années</small>
          </div>
          <div>
            <b>
              {milestones.filter((m) => m.done_at).length}/{milestones.length}
            </b>
            <small>grandes étapes</small>
          </div>
          <div>
            <b>
              {bucket.filter((b) => b.done_at).length}/{bucket.length}
            </b>
            <small>rêves réalisés</small>
          </div>
        </div>
      </section>

      {planQ.isLoading ? (
        <LoadingState label="Chargement de ton plan de vie…" />
      ) : planQ.isError ? (
        <ErrorState message="Impossible de charger ton plan de vie." onRetry={() => void planQ.refetch()} />
      ) : (
        <>
          <label className={styles.mission}>
            <small>Ma mission de vie</small>
            <AutoSaveTextarea
              maxLength={240}
              placeholder="Pourquoi je me lève le matin ?"
              value={planQ.data?.mission ?? ''}
              onSave={(v) => save.mutate({ mission: v.trim() || null }, { onError })}
            />
          </label>
          <ValuesCard values={planQ.data?.values ?? []} onSave={(values) => save.mutate({ values }, { onError })} />
          <WheelCard wheel={planQ.data?.wheel ?? {}} onSave={(wheel) => save.mutate({ wheel }, { onError })} />
        </>
      )}

      <Milestones birth={birth} age={age} exp={exp} milestones={milestones} loading={goalsQ.isLoading} error={goalsQ.isError} />

      <LifeGrid birth={birth} exp={exp} retire={profile.retire_age} milestones={milestones} lived={W.lived} total={W.total} />

      <BucketCard />

      {!planQ.isLoading && !planQ.isError && (
        <div className="card">
          <div className={styles.cardTitle}>
            <h2>Ce que je veux laisser</h2>
          </div>
          <p className={styles.help}>Comment veux-tu que l'on se souvienne de toi ?</p>
          <AutoSaveTextarea
            maxLength={600}
            aria-label="Ce que je veux laisser"
            value={planQ.data?.legacy ?? ''}
            onSave={(v) => save.mutate({ legacy: v.trim() || null }, { onError })}
          />
        </div>
      )}

      <p className={styles.quote}>« Ce n'est pas que nous ayons peu de temps, c'est que nous en perdons beaucoup. » Sénèque</p>
    </>
  );
}

/** Sauvegarde après une pause : garde la valeur locale et appelle onSave plus tard. */
function useDelayedSave<T>(value: T, onSave: (v: T) => void) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const pending = useRef(false);
  const serialized = JSON.stringify(value);
  useEffect(() => {
    if (!pending.current) setLocal(JSON.parse(serialized) as T);
  }, [serialized]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const change = (v: T) => {
    setLocal(v);
    pending.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      pending.current = false;
      onSave(v);
    }, SAVE_DELAY);
  };
  return [local, change] as const;
}

function ValuesCard({ values, onSave }: { values: string[]; onSave: (v: string[]) => void }) {
  const [local, change] = useDelayedSave(values, onSave);
  const toast = useToast();
  return (
    <div className="card">
      <div className={styles.cardTitle}>
        <h2>Mes valeurs</h2>
        <small>{local.length}/5</small>
      </div>
      <p className={styles.help}>Choisis jusqu'à 5 valeurs. Elles guident tes choix quand tu planifies.</p>
      <div className={styles.chips}>
        {VALUES.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={local.includes(v)}
            onClick={() => {
              const next = toggleValue(local, v);
              if (!next) toast('5 valeurs maximum');
              else change(next);
            }}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

function WheelCard({ wheel, onSave }: { wheel: Record<string, number | undefined>; onSave: (w: Record<string, number>) => void }) {
  const [local, change] = useDelayedSave<Record<string, number | undefined>>(wheel, (w) => onSave(w as Record<string, number>));
  const cx = 150;
  const cy = 150;
  const R = 110;
  const n = WHEEL_DOMAINS.length;
  const pt = (i: number, r: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const poly = (r: (i: number) => number) => WHEEL_DOMAINS.map((_, i) => pt(i, r(i)).join(',')).join(' ');
  const s = wheelSummary(local);
  return (
    <div className="card">
      <div className={styles.cardTitle}>
        <h2>La roue de ma vie</h2>
        <small>note de 1 à 10</small>
      </div>
      <div className={styles.wheel}>
        <svg viewBox="0 0 300 300" role="img" aria-label="Roue de ta vie">
          {[2, 4, 6, 8, 10].map((v) => (
            <polygon key={v} points={poly(() => (R * v) / 10)} fill="none" stroke="var(--line)" strokeWidth="1" />
          ))}
          {WHEEL_DOMAINS.map((d, i) => {
            const [x, y] = pt(i, R);
            return <line key={d.key} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--line)" />;
          })}
          <polygon
            points={poly((i) => (R * wheelScore(local, WHEEL_DOMAINS[i].key)) / 10)}
            fill="rgba(198,244,50,.18)"
            stroke="var(--lime)"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          {WHEEL_DOMAINS.map((d, i) => {
            const [x, y] = pt(i, (R * wheelScore(local, d.key)) / 10);
            const [lx, ly] = pt(i, R + 22);
            const anchor = Math.abs(lx - cx) < 8 ? 'middle' : lx < cx ? 'end' : 'start';
            return (
              <g key={d.key}>
                <circle cx={x} cy={y} r="4.5" fill={d.color} />
                <text x={lx} y={ly + 4} textAnchor={anchor} fontSize="11" fontFamily="Sora, sans-serif" fill="var(--muted)">
                  {d.label.split(' ')[0]}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className={styles.sliders}>
        {WHEEL_DOMAINS.map((d) => (
          <label key={d.key} className={styles.sl} style={{ '--c': d.color } as CSSProperties}>
            <span>{d.label}</span>
            <input
              type="range"
              min={1}
              max={10}
              value={wheelScore(local, d.key)}
              aria-label={d.label}
              onChange={(e) => change({ ...local, [d.key]: Number(e.target.value) })}
            />
            <b>{wheelScore(local, d.key)}</b>
          </label>
        ))}
      </div>
      <div className={styles.tip}>
        Équilibre moyen : <b>{s.average.toFixed(1).replace('.', ',')}/10</b>. Le domaine le plus faible est{' '}
        <b>{s.weakest.label}</b> ({s.weakestScore}/10) : ajoute une grande étape ou un rêve pour lui.
      </div>
    </div>
  );
}

function Milestones({
  birth,
  age,
  exp,
  milestones,
  loading,
  error,
}: {
  birth: string;
  age: number;
  exp: number;
  milestones: GoalRow[];
  loading: boolean;
  error: boolean;
}) {
  const { addGoal, updateGoal, deleteGoal } = useGoalMutations();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [domain, setDomain] = useState<GoalDomain>('carriere');
  const [err, setErr] = useState('');
  const birthYear = Number(birth.slice(0, 4));

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setErr('');
    const a = Number(target);
    if (!title.trim()) return setErr('Écris la grande étape.');
    if (!target || a < 0 || a >= exp) return setErr(`Indique un âge entre 0 et ${exp - 1} ans.`);
    try {
      await addGoal.mutateAsync({ title: title.trim(), level: 'life', domain, target_age: a, deadline: deadlineForAge(birth, a) });
      setTitle('');
      setTarget('');
      toast(`Étape ajoutée à ${a} ans`);
    } catch {
      setErr("L'étape n'a pas pu être ajoutée.");
    }
  }

  return (
    <div className="card">
      <div className={styles.cardTitle}>
        <h2>Les grandes étapes de ma vie</h2>
        <small>par âge</small>
      </div>
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message="Impossible de charger tes grandes étapes." />
      ) : (
        <div className={styles.stages}>
          {lifePeriods(exp).map((p) => {
            const st = periodState(p, age);
            const list = milestones
              .filter((m) => (m.target_age ?? -1) >= p.from && (m.target_age ?? -1) <= p.to)
              .sort((a, b) => (a.target_age ?? 0) - (b.target_age ?? 0));
            return (
              <div key={p.name} className={`${styles.stage} ${st === 'now' ? styles.now : st === 'past' ? styles.past : ''}`}>
                <span className={styles.a}>
                  {p.from}–{p.to}
                </span>
                <div className={styles.c}>
                  <b>
                    {p.name}
                    {st === 'now' ? ' · tu es ici' : ''}
                  </b>
                  {list.length === 0 && <small>Aucune étape prévue.</small>}
                  {list.map((m) => (
                    <div key={m.id} className={`${styles.ms} ${m.done_at ? styles.done : ''}`} style={{ '--c': DOMAIN_COLOR[m.domain] } as CSSProperties}>
                      <span className={styles.age}>{m.target_age} ans</span>
                      <div className={styles.t}>
                        <span>{m.title}</span>
                        <small>
                          {DOMAIN_LABEL[m.domain]} · {birthYear + (m.target_age ?? 0)}
                        </small>
                      </div>
                      <button
                        type="button"
                        className="check"
                        aria-pressed={!!m.done_at}
                        aria-label={`Étape ${m.title} réalisée`}
                        onClick={() =>
                          updateGoal.mutate(
                            { id: m.id, values: { done_at: m.done_at ? null : new Date().toISOString() } },
                            { onSuccess: () => !m.done_at && toast('Une grande étape de franchie !') },
                          )
                        }
                      >
                        {m.done_at ? '✓' : ''}
                      </button>
                      <button type="button" className="x" aria-label={`Supprimer ${m.title}`} onClick={() => deleteGoal.mutate(m.id, { onSuccess: () => toast('Étape supprimée') })}>
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <form className={styles.form} onSubmit={onAdd} noValidate>
        <div className={styles.r}>
          <input maxLength={120} placeholder="Ex. Acheter une maison" aria-label="Grande étape" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input type="number" inputMode="numeric" min={0} max={exp - 1} placeholder="Âge" aria-label="À quel âge" value={target} onChange={(e) => setTarget(e.target.value)} />
        </div>
        <select aria-label="Domaine" value={domain} onChange={(e) => setDomain(e.target.value as GoalDomain)}>
          {DOMAINS.map((d) => (
            <option key={d.key} value={d.key}>
              {d.label}
            </option>
          ))}
        </select>
        {err && <p className={styles.err}>{err}</p>}
        <button className="btn primary" type="submit" disabled={addGoal.isPending}>
          Ajouter cette étape
        </button>
      </form>
    </div>
  );
}

function LifeGrid({
  birth,
  exp,
  retire,
  milestones,
  lived,
  total,
}: {
  birth: string;
  exp: number;
  retire: number;
  milestones: GoalRow[];
  lived: number;
  total: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const geo = useRef<{ lab: number; pitch: number } | null>(null);
  const [tip, setTip] = useState("Touche une case pour voir l'âge et l'année.");
  const birthYear = Number(birth.slice(0, 4));
  const marksKey = milestones.map((m) => `${m.id}:${m.target_age}:${m.domain}:${m.done_at ? 1 : 0}`).join('|');

  useEffect(() => {
    const draw = () => {
      const cv = ref.current;
      const ctx = cv?.getContext('2d');
      if (!cv || !ctx) return;
      const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
      const W = cv.clientWidth || 340;
      const lab = 20;
      const pitch = (W - lab) / 52;
      const cell = Math.max(1.5, pitch * 0.78);
      const H = Math.ceil(exp * pitch) + 2;
      const dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      cv.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      geo.current = { lab, pitch };
      const marks = new Map<number, string>();
      for (const m of milestones) {
        if (m.target_age == null) continue;
        for (let k = 0; k < 52; k++) marks.set(m.target_age * 52 + k, m.done_at ? css('--muted') : DOMAIN_COLOR[m.domain]);
      }
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillStyle = css('--muted');
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let a = 0; a <= exp; a += 10) ctx.fillText(String(a), lab - 4, Math.min(H - 5, Math.max(5, a * pitch)));
      for (let i = 0; i < exp * 52; i++) {
        const x = lab + (i % 52) * pitch;
        const y = Math.floor(i / 52) * pitch;
        let c: string;
        if (i === lived) c = css('--lime');
        else if (i < lived) c = css('--lived');
        else c = marks.get(i) ?? (Math.floor(i / 52) >= retire ? '#2b2f2a' : css('--empty'));
        ctx.fillStyle = c;
        ctx.fillRect(x, y, cell, cell);
      }
    };
    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, [exp, retire, lived, marksKey]);

  function onClick(e: MouseEvent<HTMLCanvasElement>) {
    const g = geo.current;
    if (!g || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const col = Math.floor((e.clientX - r.left - g.lab) / g.pitch);
    const row = Math.floor((e.clientY - r.top) / g.pitch);
    if (col < 0 || col > 51 || row < 0 || row >= exp) return;
    const i = row * 52 + col;
    const ms = milestones.filter((m) => m.target_age === row).map((m) => m.title).join(', ');
    setTip(
      `${row} ans, semaine ${col + 1} · vers ${birthYear + row}` +
        (i < lived ? ' · vécue' : i === lived ? ' · cette semaine' : ` · dans ${fmtNumber(i - lived)} semaines`) +
        (ms ? ` · ${ms}` : ''),
    );
  }

  return (
    <div className="card">
      <div className={styles.cardTitle}>
        <h2>Ma vie en semaines</h2>
        <small>
          {fmtNumber(lived)} / {fmtNumber(total)}
        </small>
      </div>
      <canvas ref={ref} className={styles.canvas} role="img" aria-label="Grille des semaines de ta vie avec tes grandes étapes" onClick={onClick} />
      <p className={styles.gtip} aria-live="polite">
        {tip}
      </p>
      <div className={styles.legend}>
        <span>
          <i style={{ background: 'var(--lived)' }} />
          vécues
        </span>
        <span>
          <i style={{ background: 'var(--lime)' }} />
          aujourd'hui
        </span>
        <span>
          <i style={{ background: DOMAIN_COLOR.carriere }} />
          grandes étapes
        </span>
        <span>
          <i style={{ background: '#2b2f2a' }} />
          après la retraite
        </span>
      </div>
    </div>
  );
}

function BucketCard() {
  const q = useBucketItems();
  const { add, toggle, remove } = useBucketMutations();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const items = q.data ?? [];
  return (
    <div className="card">
      <div className={styles.cardTitle}>
        <h2>Avant de mourir, je veux…</h2>
        <small>
          {items.filter((b) => b.done_at).length}/{items.length}
        </small>
      </div>
      {q.isLoading ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState message="Impossible de charger ta liste de rêves." onRetry={() => void q.refetch()} />
      ) : items.length === 0 ? (
        <p className="empty">Écris un premier rêve : un voyage, un projet, une personne à revoir.</p>
      ) : (
        <div className="list">
          {items.map((b) => (
            <div key={b.id} className={`${styles.bk} ${b.done_at ? styles.done : ''}`}>
              <span className={styles.t}>{b.title}</span>
              <button
                type="button"
                className="check"
                aria-pressed={!!b.done_at}
                aria-label={`Rêve ${b.title} réalisé`}
                onClick={() => toggle.mutate(b, { onSuccess: () => !b.done_at && toast('Rêve réalisé, bravo !') })}
              >
                {b.done_at ? '✓' : ''}
              </button>
              <button type="button" className="x" aria-label={`Supprimer ${b.title}`} onClick={() => remove.mutate(b.id)}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      <form
        className={styles.add}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim()) return;
          try {
            await add.mutateAsync(title.trim());
            setTitle('');
            toast('Rêve ajouté');
          } catch {
            toast("Le rêve n'a pas pu être ajouté.");
          }
        }}
      >
        <input maxLength={120} placeholder="Ex. Voir les baleines à Sainte-Marie" aria-label="Nouveau rêve" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button className={styles.plus} type="submit" aria-label="Ajouter le rêve" disabled={add.isPending}>
          +
        </button>
      </form>
    </div>
  );
}
