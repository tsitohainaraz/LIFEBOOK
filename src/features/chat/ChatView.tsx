import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { Avatar } from '../../components/Avatar';
import { Sheet } from '../../components/Sheet';
import { ErrorState, LoadingState } from '../../components/States';
import { useToast } from '../../components/Toast';
import { todayISO } from '../../utils/dates';
import type { AttachmentRow, MessageRow } from '../../types/database';
import { extractMentions, isMissingTableError } from '../boards/boardUtils';
import { MentionTextarea, RichText } from '../boards/MentionTextarea';
import { memberName, type BoardData } from '../boards/useBoards';
import { BoardsUnavailable } from '../boards/BoardsUnavailable';
import { FilePicker, Gallery, UploadQueue } from '../files/FileWidgets';
import { useUploader } from '../files/useFiles';
import { groupByDay, isNearBottom, timeOf } from './chatUtils';
import { markRead, saveMentions, useChatMutations, useChatRealtime, useMessageAttachments, useMessages } from './useChat';
import styles from './Chat.module.css';

const LONG_PRESS_MS = 500;

export function ChatView({ data }: { data: BoardData }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const boardId = data.board.id;
  const canWrite = data.myRole !== 'viewer';
  const q = useMessages(boardId);
  const m = useChatMutations(boardId);
  const up = useUploader();
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const prevHeight = useRef<number | null>(null);
  const [newBelow, setNewBelow] = useState(false);
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [replyTo, setReplyTo] = useState<MessageRow | null>(null);
  const [action, setAction] = useState<MessageRow | null>(null);

  const messages = useMemo(() => (q.data?.pages ?? []).flat().slice().reverse(), [q.data]);
  const byId = useMemo(() => new Map(messages.map((x) => [x.id, x])), [messages]);
  const att = useMessageAttachments(
    boardId,
    messages.map((x) => x.id),
  );
  const attByMsg = useMemo(() => {
    const map = new Map<string, AttachmentRow[]>();
    for (const a of att.data ?? []) if (a.message_id) map.set(a.message_id, [...(map.get(a.message_id) ?? []), a]);
    return map;
  }, [att.data]);
  const members = new Map(data.members.map((x) => [x.user_id, x]));

  const read = () => {
    if (!user) return;
    void markRead(boardId, user.id).then(() => qc.invalidateQueries({ queryKey: ['unread'] }));
  };

  // À l'ouverture : discussion marquée comme lue.
  useEffect(() => {
    if (user) void markRead(boardId, user.id).then(() => qc.invalidateQueries({ queryKey: ['unread'] }));
  }, [boardId, user, qc]);

  useChatRealtime(boardId, (msg) => {
    if (msg.user_id === user?.id) return;
    if (atBottom.current) {
      requestAnimationFrame(() => scrollToBottom());
      read();
    } else setNewBelow(true);
    void qc.invalidateQueries({ queryKey: ['attachments', 'messages', boardId] });
  });

  function scrollToBottom(smooth = false) {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    atBottom.current = true;
    setNewBelow(false);
  }

  // Premier affichage : en bas. Chargement des anciens messages : on garde la position.
  const pages = q.data?.pages.length ?? 0;
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (prevHeight.current != null) {
      el.scrollTop += el.scrollHeight - prevHeight.current;
      prevHeight.current = null;
    } else if (atBottom.current) el.scrollTop = el.scrollHeight;
  }, [pages, messages.length]);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    const bottom = isNearBottom(el);
    if (bottom && !atBottom.current) read();
    atBottom.current = bottom;
    if (bottom) setNewBelow(false);
    if (el.scrollTop < 60 && q.hasNextPage && !q.isFetchingNextPage) {
      prevHeight.current = el.scrollHeight;
      void q.fetchNextPage();
    }
  }

  async function send() {
    const text = body.trim();
    if (!text && !files.length) return;
    try {
      const msg = await m.send.mutateAsync({ body: text, reply_to: replyTo?.id ?? null });
      setBody('');
      setReplyTo(null);
      const toSend = files;
      setFiles([]);
      requestAnimationFrame(() => scrollToBottom(true));
      const mentioned = extractMentions(
        text,
        data.members.filter((x) => x.user_id !== user?.id).map((x) => ({ id: x.user_id, name: x.profile?.first_name ?? '' })),
      );
      void saveMentions({ boardId, userIds: mentioned, messageId: msg.id });
      if (toSend.length) {
        await up.upload(toSend, { boardId, messageId: msg.id });
        void qc.invalidateQueries({ queryKey: ['attachments', 'messages', boardId] });
      }
      read();
    } catch {
      toast("Le message n'a pas pu être envoyé.");
    }
  }

  if (q.isError && isMissingTableError(q.error)) return <BoardsUnavailable />;

  return (
    <div className={styles.chat}>
      <div className={styles.scroller} ref={scroller} onScroll={onScroll} aria-live="polite">
        {q.isFetchingNextPage && <p className="muted small" style={{ textAlign: 'center' }}>Chargement des messages plus anciens…</p>}
        {!q.hasNextPage && messages.length > 0 && <p className={styles.start}>Début de la discussion</p>}
        {q.isLoading ? (
          <LoadingState label="Chargement de la discussion…" />
        ) : q.isError ? (
          <ErrorState message="Impossible de charger la discussion." onRetry={() => void q.refetch()} />
        ) : messages.length === 0 ? (
          <p className="empty">Aucun message. Lance la discussion avec ton équipe !</p>
        ) : (
          groupByDay(messages, todayISO()).map((g) => (
            <div key={g.day} className={styles.day}>
              <div className={styles.dayLabel}>
                <span>{g.label}</span>
              </div>
              {g.items.map((msg, i) => {
                const prev = g.items[i - 1];
                const mine = msg.user_id === user?.id;
                const author = msg.user_id ? members.get(msg.user_id) : undefined;
                const sameAuthor = prev && prev.user_id === msg.user_id && prev.kind === 'text' && msg.kind === 'text';
                if (msg.kind === 'system') {
                  return (
                    <p key={msg.id} className={styles.system}>
                      {msg.body} · {timeOf(msg.created_at)}
                    </p>
                  );
                }
                return (
                  <Bubble
                    key={msg.id}
                    msg={msg}
                    mine={mine}
                    showAuthor={!mine && !sameAuthor}
                    authorName={memberName(author)}
                    authorAvatar={author?.profile?.avatar_url}
                    quoted={msg.reply_to ? (byId.get(msg.reply_to) ?? null) : null}
                    quotedName={msg.reply_to ? memberName(members.get(byId.get(msg.reply_to)?.user_id ?? '')) : ''}
                    attachments={attByMsg.get(msg.id) ?? []}
                    data={data}
                    onReply={canWrite ? () => setReplyTo(msg) : undefined}
                    onLongPress={mine && !msg.deleted_at ? () => setAction(msg) : undefined}
                  />
                );
              })}
            </div>
          ))
        )}
      </div>

      {newBelow && (
        <button type="button" className={styles.newBelow} onClick={() => (scrollToBottom(true), read())}>
          Nouveaux messages ↓
        </button>
      )}

      {canWrite ? (
        <div className={styles.composer}>
          {replyTo && (
            <div className={styles.replyBar}>
              <span>
                Réponse à <b>{memberName(members.get(replyTo.user_id ?? ''))}</b> : {replyTo.deleted_at ? 'Message supprimé' : replyTo.body.slice(0, 80) || '📎 Fichier'}
              </span>
              <button type="button" className="x" aria-label="Annuler la réponse" onClick={() => setReplyTo(null)}>
                ✕
              </button>
            </div>
          )}
          {files.length > 0 && (
            <div className={styles.pending}>
              {files.map((f, i) => (
                <span key={`${f.name}-${i}`} className="chip">
                  {f.name}
                  <button type="button" className={styles.chipX} aria-label={`Retirer ${f.name}`} onClick={() => setFiles((l) => l.filter((_, j) => j !== i))}>
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
          <UploadQueue items={up.items} onCancel={up.cancel} onDismiss={up.dismiss} />
          <div className={styles.row}>
            <FilePicker compact onFiles={(l) => setFiles((x) => [...x, ...l])} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <MentionTextarea value={body} onChange={setBody} members={data.members.filter((x) => x.user_id !== user?.id)} placeholder="Écris un message… (@ pour mentionner)" ariaLabel="Message" onEnter={() => void send()} rows={1} />
            </div>
            <button type="button" className={styles.send} aria-label="Envoyer" onClick={() => void send()} disabled={m.send.isPending || (!body.trim() && !files.length)}>
              ➤
            </button>
          </div>
        </div>
      ) : (
        <p className="muted small" style={{ textAlign: 'center', margin: 0 }}>
          Tu es observateur : tu lis la discussion sans écrire.
        </p>
      )}

      {action && <MessageActions msg={action} boardId={boardId} onClose={() => setAction(null)} />}
    </div>
  );
}

function Bubble({
  msg,
  mine,
  showAuthor,
  authorName,
  authorAvatar,
  quoted,
  quotedName,
  attachments,
  data,
  onReply,
  onLongPress,
}: {
  msg: MessageRow;
  mine: boolean;
  showAuthor: boolean;
  authorName: string;
  authorAvatar: string | null | undefined;
  quoted: MessageRow | null;
  quotedName: string;
  attachments: AttachmentRow[];
  data: BoardData;
  onReply?: () => void;
  onLongPress?: () => void;
}) {
  const { user } = useAuth();
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const start = () => {
    if (!onLongPress) return;
    timer.current = setTimeout(onLongPress, LONG_PRESS_MS);
  };
  const stop = () => clearTimeout(timer.current);
  const deleted = !!msg.deleted_at;

  return (
    <div className={`${styles.line} ${mine ? styles.mine : ''}`}>
      {!mine && <span className={styles.avatarCol}>{showAuthor ? <Avatar name={authorName} avatar={authorAvatar} size={30} /> : null}</span>}
      <div
        className={`${styles.bubble} ${mine ? styles.bubbleMine : ''} ${msg.kind === 'report' ? styles.report : ''} ${deleted ? styles.deleted : ''}`}
        onPointerDown={start}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onContextMenu={(e) => {
          if (onLongPress) {
            e.preventDefault();
            onLongPress();
          }
        }}
      >
        {showAuthor && <b className={styles.author}>{authorName}</b>}
        {quoted && (
          <div className={styles.quote}>
            <b>{quotedName}</b> {quoted.deleted_at ? 'Message supprimé' : quoted.body.slice(0, 120) || '📎 Fichier'}
          </div>
        )}
        {msg.reply_to && !quoted && <div className={styles.quote}>Réponse à un message plus ancien</div>}
        {deleted ? (
          <p className={styles.text}>Message supprimé</p>
        ) : msg.kind === 'report' ? (
          <div className={styles.reportBody}>
            <span className="label">Rapport du jour</span>
            <p className={styles.text}>
              <RichText text={msg.body} members={data.members} />
            </p>
          </div>
        ) : (
          msg.body && (
            <p className={styles.text}>
              <RichText text={msg.body} members={data.members} />
            </p>
          )
        )}
        {!deleted && attachments.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <Gallery items={attachments} canDelete={(a) => a.user_id === user?.id || data.myRole === 'owner'} />
          </div>
        )}
        <span className={styles.meta}>
          {timeOf(msg.created_at)}
          {msg.edited_at && !deleted ? ' · modifié' : ''}
          {onReply && !deleted && (
            <button type="button" className={styles.replyBtn} onClick={onReply} onPointerDown={(e) => e.stopPropagation()}>
              Répondre
            </button>
          )}
        </span>
      </div>
    </div>
  );
}

function MessageActions({ msg, boardId, onClose }: { msg: MessageRow; boardId: string; onClose: () => void }) {
  const m = useChatMutations(boardId);
  const toast = useToast();
  const [text, setText] = useState(msg.body);
  const [editing, setEditing] = useState(false);
  return (
    <Sheet title="Mon message" onClose={onClose}>
      {editing ? (
        <form
          className="list"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!text.trim()) return;
            try {
              await m.edit.mutateAsync({ id: msg.id, body: text.trim() });
              toast('Message modifié');
              onClose();
            } catch {
              toast("La modification n'a pas pu être enregistrée.");
            }
          }}
        >
          <textarea value={text} maxLength={4000} onChange={(e) => setText(e.target.value)} aria-label="Modifier le message" />
          <button className="btn primary" type="submit" disabled={m.edit.isPending}>
            Enregistrer
          </button>
        </form>
      ) : (
        <>
          {msg.kind === 'text' && (
            <button type="button" className="btn" onClick={() => setEditing(true)}>
              Modifier
            </button>
          )}
          <button
            type="button"
            className="btn danger"
            onClick={async () => {
              try {
                await m.remove.mutateAsync(msg.id);
                toast('Message supprimé');
                onClose();
              } catch {
                toast('La suppression a échoué.');
              }
            }}
          >
            Supprimer
          </button>
        </>
      )}
    </Sheet>
  );
}
