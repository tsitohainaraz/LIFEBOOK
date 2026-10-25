import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { ErrorState, LoadingState } from '../../components/States';
import { addDaysISO, cap, fmtDate, mondayOf, todayISO } from '../../utils/dates';
import { excerpt, pastDays, pastWeeks, type PastItem } from '../../utils/past';
import styles from './Past.module.css';

type Mode = 'days' | 'weeks';
const PAGE = 20;

/** Une page = 20 jours (ou 20 semaines) avant la précédente. */
async function loadPage(mode: Mode, page: number): Promise<{ items: PastItem[]; from: string }> {
  const today = todayISO();
  let from: string;
  let to: string;
  if (mode === 'days') {
    to = addDaysISO(today, -1 - page * PAGE);
    from = addDaysISO(to, -(PAGE - 1));
  } else {
    const lastMonday = addDaysISO(mondayOf(today), -7);
    const startMonday = addDaysISO(lastMonday, -7 * page * PAGE);
    to = addDaysISO(startMonday, 6);
    from = addDaysISO(startMonday, -7 * (PAGE - 1));
  }
  const [tasksRes, reportsRes] = await Promise.all([
    supabase.from('tasks').select('date, done_at').gte('date', from).lte('date', to),
    supabase
      .from('reports')
      .select('period_start, mood, wellbeing_pct, wins')
      .eq('period', mode === 'days' ? 'day' : 'week')
      .gte('period_start', from)
      .lte('period_start', to),
  ]);
  if (tasksRes.error) throw tasksRes.error;
  if (reportsRes.error) throw reportsRes.error;
  const items = mode === 'days' ? pastDays(tasksRes.data, reportsRes.data) : pastWeeks(tasksRes.data, reportsRes.data);
  return { items, from };
}

export function PastPage() {
  const { user } = useAuth();
  const [mode, setMode] = useState<Mode>('days');
  const q = useInfiniteQuery({
    queryKey: ['past', user?.id, mode],
    enabled: !!user,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => loadPage(mode, pageParam),
    // On s'arrête après 5 ans d'historique.
    getNextPageParam: (_last, all) => (all.length * PAGE < (mode === 'days' ? 1825 : 260) ? all.length : undefined),
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const pages = q.data?.pages ?? [];
  const oldest = pages.length ? pages[pages.length - 1].from : undefined;

  return (
    <>
      <div className="pagehead">
        <div className="label">Programme</div>
        <h1>
          Programme <span>précédent</span>
        </h1>
        <p className="muted small" style={{ margin: 0 }}>
          Ce que tu as prévu, ce que tu as fait, et ce que tu en as retenu.
        </p>
      </div>
      <div className="moods" style={{ gridTemplateColumns: '1fr 1fr' }} role="group" aria-label="Affichage">
        <button type="button" aria-pressed={mode === 'days'} onClick={() => setMode('days')}>
          Journées
        </button>
        <button type="button" aria-pressed={mode === 'weeks'} onClick={() => setMode('weeks')}>
          Semaines
        </button>
      </div>

      {q.isLoading ? (
        <LoadingState label="Chargement de ton historique…" />
      ) : q.isError ? (
        <ErrorState message="Impossible de charger ton historique." onRetry={() => void q.refetch()} />
      ) : (
        <div className="list">
          {items.length === 0 && (
            <p className="empty">
              {mode === 'days'
                ? 'Rien pour l’instant sur cette période. Tes journées passées apparaîtront ici dès demain.'
                : 'Tes semaines passées apparaîtront ici à partir de lundi prochain.'}
            </p>
          )}
          {items.map((it) => (
            <Link key={it.key} className={styles.past} to={mode === 'days' ? `/jour?date=${it.key}` : `/semaine?date=${it.key}`}>
              <span className={styles.ring} style={{ background: `conic-gradient(var(--lime) ${it.pct * 3.6}deg, var(--empty) 0)` }}>
                <span>{it.pct}%</span>
              </span>
              <div className={styles.t}>
                <b>{mode === 'days' ? cap(fmtDate(it.key, 'EEEE d MMMM')) : `Semaine du ${fmtDate(it.key, 'd MMMM')}`}</b>
                <small>
                  {it.done}/{it.total} tâches faites
                  {mode === 'days'
                    ? it.report
                      ? ` · humeur ${it.report.mood ?? '—'}/5${it.report.wellbeing_pct != null ? ` · santé ${it.report.wellbeing_pct} %` : ''}`
                      : ' · pas de rapport'
                    : it.report
                      ? ' · bilan écrit'
                      : ' · pas de bilan'}
                </small>
                {it.report?.wins && <small>« {excerpt(it.report.wins)} »</small>}
              </div>
            </Link>
          ))}
          {q.hasNextPage && (
            <button type="button" className="btn" onClick={() => void q.fetchNextPage()} disabled={q.isFetchingNextPage}>
              {q.isFetchingNextPage ? 'Chargement…' : `Voir avant le ${oldest ? fmtDate(oldest, 'd MMMM yyyy') : ''}`}
            </button>
          )}
        </div>
      )}
    </>
  );
}
