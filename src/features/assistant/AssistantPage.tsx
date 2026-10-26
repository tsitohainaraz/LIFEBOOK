import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '../../components/Icon';
import { Sheet } from '../../components/Sheet';
import { ErrorState, LoadingState } from '../../components/States';
import { ToastProvider, useToast } from '../../components/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { helpResources } from '../../config/helpResources';
import type { AiContext, AiFeedbackReason } from '../../types/database';
import type { PlanOp } from '../../utils/planOps';
import { callAssistant, AssistantError, type AssistantResponse } from './api';
import { ActionCard } from './ActionCard';
import type { AssistantNavState } from './AssistantCard';
import { appliedBanner, DISCLAIMER, FEEDBACK_REASONS, isAutoApplicable, remainingLabel, type StoredAction } from './assistantUtils';
import { useActionRunner } from './useActionRunner';
import { useAiQuota, useAiSettings, useConversationMessages, useConversations, useDeleteConversation, useFeedback, useSaveAiSettings, type ChatMessage } from './useAssistant';
import { useSpeech } from './useSpeech';
import styles from './Assistant.module.css';

export function AssistantPage() {
  return (
    <ToastProvider>
      <AssistantChat />
    </ToastProvider>
  );
}

const UNDO_MS = 10_000;

function AssistantChat() {
  const { conversationId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const toast = useToast();
  const nav = (location.state ?? {}) as AssistantNavState;
  const [context] = useState<AiContext>(nav.context ?? 'home');
  const messagesQ = useConversationMessages(conversationId);
  const quotaQ = useAiQuota();
  const settingsQ = useAiSettings();
  const saveSettings = useSaveAiSettings();
  const runner = useActionRunner();
  const feedback = useFeedback();

  const [local, setLocal] = useState<ChatMessage[]>([]);
  const [text, setText] = useState(nav.draft ?? '');
  const [thinking, setThinking] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [busyAction, setBusyAction] = useState(false);
  const [crisisIds, setCrisisIds] = useState<Set<string>>(new Set());
  const [remaining, setRemaining] = useState<number | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [banner, setBanner] = useState<{ count: number; actions: StoredAction[]; inverses: PlanOp[][] } | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout>>();
  const scroller = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const speech = useSpeech((t) => setText((v) => (v ? `${v} ${t}` : t)));

  const server = messagesQ.data ?? [];
  const messages = [...server, ...local.filter((m) => !server.some((s) => s.id === m.id))];
  const left = remaining ?? quotaQ.data?.remaining ?? null;

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, thinking]);

  useEffect(() => () => clearTimeout(bannerTimer.current), []);

  // Premier message transmis depuis l'accueil (ou réorganisation demandée).
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (nav.replan) void send('Réorganise le reste de ma journée.', true);
    else if (nav.send) void send(nav.send);
    if (nav.send || nav.replan) navigate(location.pathname, { replace: true, state: { context } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function statusOf(a: StoredAction): string {
    return (a.id && statuses[a.id]) || a.status || 'proposed';
  }

  async function autoApply(res: AssistantResponse) {
    const auto = res.proposed_actions.filter(isAutoApplicable);
    if (!settingsQ.data?.auto_apply || !auto.length || res.crisis) return;
    const inverses: PlanOp[][] = [];
    const applied: StoredAction[] = [];
    try {
      for (const a of auto) {
        inverses.push(await runner.apply(a, 'auto_applied'));
        applied.push(a);
        if (a.id) setStatuses((s) => ({ ...s, [a.id!]: 'auto_applied' }));
      }
    } catch {
      toast("Un changement n'a pas pu être appliqué.");
    }
    const count = applied.reduce((n, a) => n + (a.type === 'task_ops' ? a.ops.length : 0), 0);
    if (!count) return;
    setBanner({ count, actions: applied, inverses });
    clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setBanner(null), UNDO_MS);
  }

  async function send(message: string, replan = false) {
    const content = message.trim();
    if (!content || thinking) return;
    setText('');
    const tempId = `local-${Date.now()}`;
    setLocal((l) => [...l, { id: tempId, role: 'user', content, actions: [], feedback: null, feedback_reason: null }]);
    setThinking(true);
    try {
      const res = replan
        ? await callAssistant({ mode: 'replan_rest_of_day', conversation_id: conversationId ?? null })
        : await callAssistant({ mode: 'chat', conversation_id: conversationId ?? null, context, message: content });
      if (res.remaining != null) setRemaining(res.remaining);
      if (res.quota_exceeded) setRemaining(0);
      const id = res.message_id ?? `local-a-${Date.now()}`;
      if (res.crisis) setCrisisIds((s) => new Set(s).add(id));
      setLocal((l) => [...l, { id, role: 'assistant', content: res.reply, actions: res.proposed_actions, feedback: null, feedback_reason: null, crisis: res.crisis }]);
      void autoApply(res);
      if (res.conversation_id && res.conversation_id !== conversationId) {
        navigate(`/assistante/${res.conversation_id}`, { replace: true, state: { context } });
      }
      void qc.invalidateQueries({ queryKey: ['ai_conversations', user?.id] });
      void qc.invalidateQueries({ queryKey: ['ai_quota', user?.id] });
    } catch (e) {
      const msg = e instanceof AssistantError ? e.message : "L'assistante est indisponible pour le moment. Réessaie dans un instant.";
      setLocal((l) => [...l, { id: `err-${Date.now()}`, role: 'assistant', content: msg, actions: [], feedback: null, feedback_reason: null }]);
    } finally {
      setThinking(false);
    }
  }

  async function applyOne(a: StoredAction) {
    setBusyAction(true);
    try {
      await runner.apply(a);
      if (a.id) setStatuses((s) => ({ ...s, [a.id!]: 'accepted' }));
      toast('Changement appliqué');
    } catch {
      toast("Impossible d'appliquer ce changement. Vérifie ta connexion.");
    } finally {
      setBusyAction(false);
    }
  }

  async function applyAll(list: StoredAction[]) {
    setBusyAction(true);
    let n = 0;
    try {
      for (const a of list.filter((x) => statusOf(x) === 'proposed')) {
        await runner.apply(a);
        n++;
        if (a.id) setStatuses((s) => ({ ...s, [a.id!]: 'accepted' }));
      }
      toast(`${appliedBanner(n)}`);
    } catch {
      toast("Un changement n'a pas pu être appliqué.");
    } finally {
      setBusyAction(false);
    }
  }

  async function ignoreOne(a: StoredAction) {
    if (a.id) setStatuses((s) => ({ ...s, [a.id!]: 'ignored' }));
    await runner.ignore(a).catch(() => undefined);
  }

  async function undoBanner() {
    if (!banner) return;
    const b = banner;
    setBanner(null);
    clearTimeout(bannerTimer.current);
    try {
      await runner.undo(b.actions, b.inverses);
      setStatuses((s) => ({ ...s, ...Object.fromEntries(b.actions.filter((a) => a.id).map((a) => [a.id!, 'undone'])) }));
      toast('Changements annulés');
    } catch {
      toast("Impossible d'annuler. Vérifie ta connexion.");
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <button type="button" className="iconbtn" aria-label="Retour" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}>
          <Icon name="left" />
        </button>
        <div className={styles.headTitle}>
          <strong>Ton assistante</strong>
          <span className="small muted">{remainingLabel(left)}</span>
        </div>
        <button type="button" className="iconbtn" aria-label="Mes conversations" onClick={() => setListOpen(true)}>
          <Icon name="list" />
        </button>
      </header>

      <div ref={scroller} className={styles.scroller}>
        {conversationId && messagesQ.isLoading ? (
          <LoadingState label="Chargement de la conversation…" />
        ) : messagesQ.isError ? (
          <ErrorState message="Impossible de charger la conversation." onRetry={() => void messagesQ.refetch()} />
        ) : messages.length === 0 && !thinking ? (
          <p className={styles.empty}>
            Dis-moi ce que tu veux planifier : ta journée, une séance de sport, un objectif… Je regarde tes créneaux libres et je te propose des changements que tu valides.
          </p>
        ) : null}

        {messages.map((m) => (
          <div key={m.id} className={m.role === 'user' ? styles.userWrap : styles.botWrap}>
            <div className={m.role === 'user' ? styles.userBubble : styles.botBubble}>{m.content}</div>
            {(m.crisis || crisisIds.has(m.id)) && <CrisisHelp />}
            {m.actions.length > 0 && (
              <div className={styles.actions}>
                {m.actions.map((a, i) => (
                  <ActionCard key={a.id ?? i} action={a} status={statusOf(a)} busy={busyAction} onApply={() => void applyOne(a)} onIgnore={() => void ignoreOne(a)} />
                ))}
                {m.actions.filter((a) => statusOf(a) === 'proposed').length > 1 && (
                  <button type="button" className="btn outline sm" disabled={busyAction} onClick={() => void applyAll(m.actions)}>
                    Tout appliquer
                  </button>
                )}
              </div>
            )}
            {m.role === 'assistant' && !m.id.startsWith('err-') && !m.id.startsWith('local-') && <Feedback message={m} onSend={(f, r) => feedback.mutate({ id: m.id, feedback: f, reason: r })} />}
          </div>
        ))}
        {thinking && (
          <div className={styles.botWrap}>
            <div className={`${styles.botBubble} ${styles.thinking}`} role="status">
              L'assistante réfléchit…
            </div>
          </div>
        )}
      </div>

      {banner && (
        <div className={styles.banner} role="status">
          <span>{appliedBanner(banner.count)}</span>
          <button type="button" className="linkbtn" onClick={() => void undoBanner()}>
            Annuler
          </button>
        </div>
      )}

      <footer className={styles.foot}>
        <label className={styles.autoRow}>
          <input
            type="checkbox"
            checked={!!settingsQ.data?.auto_apply}
            onChange={(e) => saveSettings.mutate({ auto_apply: e.target.checked })}
          />
          <span>Laisser l'assistante modifier mon emploi du temps</span>
        </label>
        <form
          className={styles.inputRow}
          onSubmit={(e) => {
            e.preventDefault();
            void send(text);
          }}
        >
          <textarea
            value={text}
            rows={1}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(text);
              }
            }}
            placeholder="Écris ta demande…"
            aria-label="Message à l'assistante"
            maxLength={4000}
          />
          {speech.supported && (
            <button type="button" className={`iconbtn ${speech.listening ? styles.listening : ''}`} aria-label={speech.listening ? 'Arrêter la dictée' : 'Dicter'} aria-pressed={speech.listening} onClick={speech.toggle}>
              <Icon name="mic" />
            </button>
          )}
          <button type="submit" className={`iconbtn ${styles.sendBtn}`} aria-label="Envoyer" disabled={!text.trim() || thinking}>
            <Icon name="send" />
          </button>
        </form>
        <p className={styles.disclaimer}>{DISCLAIMER}</p>
      </footer>

      {listOpen && <ConversationList currentId={conversationId} onClose={() => setListOpen(false)} />}
    </div>
  );
}

function Feedback({ message, onSend }: { message: ChatMessage; onSend: (f: -1 | 1, reason?: AiFeedbackReason) => void }) {
  const [value, setValue] = useState<-1 | 0 | 1 | null>(message.feedback);
  const [reason, setReason] = useState<AiFeedbackReason | null>(message.feedback_reason);
  return (
    <div className={styles.feedback}>
      <button type="button" className={styles.fbBtn} aria-pressed={value === 1} onClick={() => (setValue(1), setReason(null), onSend(1))}>
        Utile
      </button>
      <button type="button" className={styles.fbBtn} aria-pressed={value === -1} onClick={() => (setValue(-1), onSend(-1))}>
        Pas utile
      </button>
      {value === -1 &&
        FEEDBACK_REASONS.map((r) => (
          <button key={r} type="button" className={styles.fbBtn} aria-pressed={reason === r} onClick={() => (setReason(r), onSend(-1, r))}>
            {r}
          </button>
        ))}
    </div>
  );
}

function CrisisHelp() {
  return (
    <div className={styles.crisis} role="note">
      {helpResources.length ? (
        helpResources.map((h) => (
          <div key={h.name}>
            <strong>{h.name}</strong>
            {h.description ? ` · ${h.description}` : ''}
            {h.phone && (
              <>
                {' '}
                · <a href={`tel:${h.phone.replace(/\s/g, '')}`}>{h.phone}</a>
              </>
            )}
            {h.url && (
              <>
                {' '}
                · <a href={h.url} target="_blank" rel="noreferrer">site</a>
              </>
            )}
          </div>
        ))
      ) : (
        <span>Appelle un proche, un médecin, ou rends-toi aux urgences les plus proches si tu es en danger.</span>
      )}
    </div>
  );
}

function ConversationList({ currentId, onClose }: { currentId?: string; onClose: () => void }) {
  const q = useConversations();
  const del = useDeleteConversation();
  const navigate = useNavigate();
  return (
    <Sheet title="Mes conversations" onClose={onClose}>
      <button
        type="button"
        className="btn primary block"
        onClick={() => {
          onClose();
          navigate('/assistante', { state: {} });
        }}
      >
        Nouvelle conversation
      </button>
      {q.isLoading ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState message="Impossible de charger tes conversations." onRetry={() => void q.refetch()} />
      ) : !q.data?.length ? (
        <p className="empty">Aucune conversation pour l'instant. Pose ta première question à l'assistante.</p>
      ) : (
        <div className={styles.convList}>
          {q.data.map((c) => (
            <div key={c.id} className={`${styles.conv} ${c.id === currentId ? styles.convCur : ''}`}>
              <button
                type="button"
                className={styles.convTitle}
                onClick={() => {
                  onClose();
                  navigate(`/assistante/${c.id}`, { state: { context: c.context } });
                }}
              >
                {c.title}
                <span className="small muted">{new Date(c.updated_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
              </button>
              <button
                type="button"
                className="iconbtn"
                aria-label={`Supprimer « ${c.title} »`}
                onClick={() => {
                  if (window.confirm('Supprimer cette conversation ?')) {
                    del.mutate(c.id);
                    if (c.id === currentId) navigate('/assistante', { replace: true, state: {} });
                  }
                }}
              >
                <Icon name="trash" />
              </button>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}
