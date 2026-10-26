import { useEffect, useState, useId } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { nowISO, toZoned } from '../../lib/serverTime';
import { Avatar } from '../../components/Avatar';
import { Sheet } from '../../components/Sheet';
import { ErrorState, LoadingState } from '../../components/States';
import { useToast } from '../../components/Toast';
import { addDaysISO, cap, fmtDate, toISODate, todayISO } from '../../utils/dates';
import type { AttachmentRow, DailyReportRow, Json } from '../../types/database';
import { isMissingTableError } from '../boards/boardUtils';
import { BoardsUnavailable } from '../boards/BoardsUnavailable';
import { memberName, type BoardData } from '../boards/useBoards';
import { upsertMessage } from '../chat/useChat';
import { FilePicker, Gallery, UploadQueue } from '../files/FileWidgets';
import { useUploader } from '../files/useFiles';
import { buildAutoSummary, defaultDoneText, reportMessage, teamProgress, type AutoSummary } from './reportUtils';
import styles from './Team.module.css';

const localDay = (iso: string) => toISODate(toZoned(Date.parse(iso)));
const doneListIds = (data: BoardData) => data.lists.filter((l) => /^fait$/i.test(l.title.trim())).map((l) => l.id);

function useTeamReports(boardId: string, date: string) {
  const qc = useQueryClient();
  const instance = useId();
  // Temps réel : un rapport envoyé apparaît tout de suite pour l'équipe.
  useEffect(() => {
    const ch = supabase
      .channel(`reports:${boardId}:${instance}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_reports', filter: `board_id=eq.${boardId}` }, () => {
        void qc.invalidateQueries({ queryKey: ['team-reports', boardId] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [boardId, qc, instance]);
  return useQuery({
    queryKey: ['team-reports', boardId, date],
    queryFn: async () => {
      const { data, error } = await supabase.from('daily_reports').select('*').eq('board_id', boardId).eq('date', date);
      if (error) throw error;
      const ids = data.map((r) => r.id);
      const att = ids.length ? await supabase.from('attachments').select('*').in('report_id', ids) : { data: [] as AttachmentRow[], error: null };
      if (att.error) throw att.error;
      return { reports: data as DailyReportRow[], attachments: (att.data ?? []) as AttachmentRow[] };
    },
  });
}

/** Onglet « Équipe du jour » : une carte par membre, avec son rapport ou « Pas encore envoyé ». */
export function TeamView({ data, openReport }: { data: BoardData; openReport: boolean }) {
  const [date, setDate] = useState(todayISO());
  const [sheet, setSheet] = useState(openReport);
  const q = useTeamReports(data.board.id, date);
  const canWrite = data.myRole !== 'viewer';
  if (q.isError && isMissingTableError(q.error)) return <BoardsUnavailable />;
  const reports = q.data?.reports ?? [];
  const progress = teamProgress(reports);
  const members = data.members.filter((m) => m.role !== 'viewer');

  return (
    <>
      {canWrite && (
        <button type="button" className="btn primary" onClick={() => setSheet(true)}>
          Mon rapport du jour
        </button>
      )}
      <div className="navdate">
        <button className="iconbtn" type="button" aria-label="Jour précédent" onClick={() => setDate(addDaysISO(date, -1))}>
          ‹
        </button>
        <h2>
          {cap(fmtDate(date, 'EEEE d MMMM'))}
          {date === todayISO() && (
            <div className="small lime" style={{ fontWeight: 500 }}>
              Aujourd'hui
            </div>
          )}
        </h2>
        <button className="iconbtn" type="button" aria-label="Jour suivant" disabled={date >= todayISO()} onClick={() => setDate(addDaysISO(date, 1))}>
          ›
        </button>
      </div>
      <div className="stats3">
        <div className="lime">
          <b>{progress != null ? `${progress} %` : '—'}</b>
          <small>avancement moyen</small>
        </div>
        <div>
          <b>
            {reports.filter((r) => r.posted_at).length}/{members.length}
          </b>
          <small>rapports envoyés</small>
        </div>
        <div>
          <b>{reports.reduce((a, r) => a + ((r.auto_summary?.checked as unknown[] | undefined)?.length ?? 0), 0)}</b>
          <small>éléments cochés</small>
        </div>
      </div>
      {q.isLoading ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState message="Impossible de charger les rapports." onRetry={() => void q.refetch()} />
      ) : (
        <div className="list">
          {members.map((m) => {
            const r = reports.find((x) => x.user_id === m.user_id && x.posted_at);
            const files = r ? (q.data?.attachments ?? []).filter((a) => a.report_id === r.id) : [];
            return (
              <article key={m.user_id} className={`card ${styles.member}`}>
                <div className="row">
                  <Avatar name={memberName(m)} avatar={m.profile?.avatar_url} size={34} />
                  <b style={{ flex: 1 }}>{memberName(m)}</b>
                  {r ? <span className="st ok">{r.progress_pct ?? 0} %</span> : <span className="st done">Pas encore envoyé</span>}
                </div>
                {r && (
                  <>
                    {r.done_text && <Block title="Fait aujourd'hui" text={r.done_text} />}
                    {r.blockers_text && <Block title="Bloqué par" text={r.blockers_text} warn />}
                    {r.tomorrow_text && <Block title="Demain" text={r.tomorrow_text} />}
                    <Gallery items={files} />
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}
      {sheet && <ReportSheet data={data} onClose={() => setSheet(false)} />}
    </>
  );
}

function Block({ title, text, warn }: { title: string; text: string; warn?: boolean }) {
  return (
    <div className={styles.block}>
      <span className="label" style={warn ? { color: 'var(--urgent)' } : undefined}>
        {title}
      </span>
      <p>{text}</p>
    </div>
  );
}

/** « Mon rapport du jour » : résumé automatique, formulaire, photos, envoi dans la discussion. */
function ReportSheet({ data, onClose }: { data: BoardData; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const up = useUploader();
  const day = todayISO();
  const boardId = data.board.id;
  const cardIds = data.cards.map((c) => c.id);
  const [done, setDone] = useState<string | null>(null);
  const [blockers, setBlockers] = useState('');
  const [tomorrow, setTomorrow] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);

  const summaryQ = useQuery({
    queryKey: ['team-summary', boardId, day, cardIds.length],
    queryFn: async (): Promise<{ summary: AutoSummary; existing: DailyReportRow | null }> => {
      const since = `${addDaysISO(day, -2)}T00:00:00Z`;
      const [items, act, mine] = await Promise.all([
        cardIds.length
          ? supabase.from('checklist_items').select('id, card_id, text, done_at, done_by').in('card_id', cardIds)
          : Promise.resolve({ data: [], error: null }),
        supabase.from('board_activity').select('payload, created_at').eq('board_id', boardId).eq('action', 'card_done').eq('user_id', user?.id ?? '').gte('created_at', since),
        supabase.from('daily_reports').select('*').eq('board_id', boardId).eq('user_id', user?.id ?? '').eq('date', day).maybeSingle(),
      ]);
      for (const r of [items, act, mine]) if (r.error) throw r.error;
      const summary = buildAutoSummary({
        me: user?.id ?? '',
        day,
        dayOf: localDay,
        cards: data.cards,
        doneListIds: doneListIds(data),
        assignedToMe: data.cardMembers.filter((m) => m.user_id === user?.id).map((m) => m.card_id),
        checklist: (items.data ?? []) as { id: string; card_id: string; text: string; done_at: string | null; done_by: string | null }[],
        doneByMe: (act.data ?? []).map((a) => ({ card_id: String((a.payload as { card_id?: string }).card_id ?? ''), created_at: a.created_at })),
      });
      return { summary, existing: (mine.data as DailyReportRow | null) ?? null };
    },
  });

  useEffect(() => {
    const d = summaryQ.data;
    if (!d || done !== null) return;
    setDone(d.existing?.done_text ?? defaultDoneText(d.summary));
    setBlockers(d.existing?.blockers_text ?? '');
    setTomorrow(d.existing?.tomorrow_text ?? '');
  }, [summaryQ.data, done]);

  async function send() {
    const s = summaryQ.data?.summary;
    if (!s || !user) return;
    setSending(true);
    try {
      const { data: report, error } = await supabase
        .from('daily_reports')
        .upsert(
          {
            board_id: boardId,
            user_id: user.id,
            date: day,
            auto_summary: s as { [key: string]: Json | undefined },
            progress_pct: s.progressPct,
            done_text: (done ?? '').trim() || null,
            blockers_text: blockers.trim() || null,
            tomorrow_text: tomorrow.trim() || null,
            posted_at: nowISO(),
          },
          { onConflict: 'board_id,user_id,date' },
        )
        .select('*')
        .single();
      if (error) throw error;
      if (files.length) await up.upload(files, { boardId, reportId: report.id });
      const { data: msg, error: msgErr } = await supabase
        .from('messages')
        .insert({
          board_id: boardId,
          kind: 'report',
          report_id: report.id,
          body: reportMessage({ progressPct: s.progressPct, done: done ?? '', blockers, tomorrow }),
        })
        .select('*')
        .single();
      if (msgErr) throw msgErr;
      upsertMessage(qc, boardId, msg);
      void qc.invalidateQueries({ queryKey: ['team-reports', boardId] });
      toast('Rapport envoyé à l’équipe');
      onClose();
    } catch {
      toast("Le rapport n'a pas pu être envoyé. Réessaie.");
    } finally {
      setSending(false);
    }
  }

  const s = summaryQ.data?.summary;
  return (
    <Sheet title="Mon rapport du jour" onClose={onClose}>
      {summaryQ.isLoading || !s ? (
        summaryQ.isError ? <p className="error-text">Impossible de préparer le résumé.</p> : <LoadingState label="Préparation du résumé…" />
      ) : (
        <>
          <div className={styles.summary}>
            <div className="between">
              <span className="label">Avancement du tableau</span>
              <b className="mono lime">{s.progressPct} %</b>
            </div>
            <div className="bar">
              <i style={{ width: `${s.progressPct}%` }} />
            </div>
            <SummaryList title="Cochés aujourd'hui" items={s.checked} empty="Aucun élément coché aujourd'hui." />
            <SummaryList title="Cartes terminées" items={s.doneCards} empty="Aucune carte terminée aujourd'hui." />
            <SummaryList title="En cours pour toi" items={s.inProgress} empty="Aucune carte en cours qui t'est assignée." />
          </div>
          {summaryQ.data?.existing?.posted_at && <p className="muted small" style={{ margin: 0 }}>Tu as déjà envoyé un rapport aujourd'hui : un nouvel envoi le met à jour.</p>}
          <label className="field">
            <span>Fait aujourd'hui</span>
            <textarea value={done ?? ''} maxLength={3000} onChange={(e) => setDone(e.target.value)} />
          </label>
          <label className="field">
            <span>Bloqué par</span>
            <textarea value={blockers} maxLength={2000} onChange={(e) => setBlockers(e.target.value)} />
          </label>
          <label className="field">
            <span>Demain</span>
            <textarea value={tomorrow} maxLength={2000} onChange={(e) => setTomorrow(e.target.value)} />
          </label>
          <div className="field">
            <span>Photos</span>
            {files.length > 0 && <p className="small" style={{ margin: 0 }}>{files.map((f) => f.name).join(', ')}</p>}
            <FilePicker onFiles={(l) => setFiles((x) => [...x, ...l])} />
          </div>
          <UploadQueue items={up.items} onCancel={up.cancel} onDismiss={up.dismiss} />
          <button type="button" className="btn primary" onClick={() => void send()} disabled={sending}>
            {sending ? 'Envoi…' : 'Envoyer'}
          </button>
        </>
      )}
    </Sheet>
  );
}

function SummaryList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div>
      <span className="label">{title}</span>
      {items.length ? (
        <ul className={styles.ul}>
          {items.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      ) : (
        <p className="muted small" style={{ margin: '2px 0 0' }}>
          {empty}
        </p>
      )}
    </div>
  );
}
