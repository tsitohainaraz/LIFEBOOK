import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { nowISO } from '../../lib/serverTime';
import { useAddTasks } from '../../hooks/useTasks';
import { Avatar } from '../../components/Avatar';
import { AutoSaveInput, AutoSaveTextarea } from '../../components/AutoSaveInput';
import { LoadingState } from '../../components/States';
import { useToast } from '../../components/Toast';
import { addDaysISO, cap, fmtDate, hhmm, nowMinutes, todayISO } from '../../utils/dates';
import { firstFreeSlot } from '../../utils/schedule';
import { cardDueStatus, extractMentions } from './boardUtils';
import { saveMentions } from '../chat/useChat';
import { MentionTextarea, RichText } from './MentionTextarea';
import { memberName, useBoardMutations, useCardDetails, useCardMutations, type BoardData } from './useBoards';
import type { BoardActivityRow, CardRow, ChecklistItemRow } from '../../types/database';
import { FilePicker, Gallery, UploadQueue } from '../files/FileWidgets';
import { useCardAttachments, useUploader } from '../files/useFiles';
import { CardJoin } from './CardJoin';
import styles from './Boards.module.css';

const DAY_START = 6 * 60;
const DAY_END = 22 * 60;

export function CardSheet() {
  const data = useOutletContext<BoardData>();
  const { cardId } = useParams();
  const navigate = useNavigate();
  const card = data.cards.find((c) => c.id === cardId);
  const close = () => navigate(`/tableaux/${data.board.id}${window.location.search}`);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  });

  return (
    <div className={styles.full} role="dialog" aria-modal="true" aria-label={card ? card.title : 'Carte'}>
      <div className={styles.fullInner}>
        <div className={styles.fullTop}>
          <span className="small muted">{data.board.title}</span>
          <button type="button" className="iconbtn" aria-label="Fermer la carte" onClick={close}>
            ✕
          </button>
        </div>
        {card ? <CardDetails key={card.id} card={card} data={data} onClose={close} /> : <p className="empty">Cette carte n'existe plus ou a été archivée.</p>}
      </div>
    </div>
  );
}

function CardDetails({ card, data, onClose }: { card: CardRow; data: BoardData; onClose: () => void }) {
  const canEdit = data.myRole !== 'viewer';
  const m = useBoardMutations(data.board.id);
  const details = useCardDetails(card.id);
  const toast = useToast();
  const onError = () => toast("Modification non enregistrée. Vérifie ta connexion.");
  const doneList = data.lists.find((l) => /^fait$/i.test(l.title.trim()));
  const assigned = new Set(data.cardMembers.filter((x) => x.card_id === card.id).map((x) => x.user_id));
  const labelIds = new Set(data.cardLabels.filter((x) => x.card_id === card.id).map((x) => x.label_id));
  const status = cardDueStatus(card, todayISO());
  const list = data.lists.find((l) => l.id === card.list_id);
  const update = (values: Parameters<typeof m.updateCard.mutate>[0]['values']) => m.updateCard.mutate({ id: card.id, values }, { onError });

  return (
    <>
      {canEdit ? (
        <AutoSaveInput
          className={styles.cardTitleInput}
          aria-label="Titre de la carte"
          maxLength={200}
          delay={600}
          value={card.title}
          onSave={(v) => v.trim() && update({ title: v.trim() })}
        />
      ) : (
        <h1 style={{ fontSize: 20 }}>{card.title}</h1>
      )}
      <p className="muted small" style={{ margin: 0 }}>
        Dans la liste <b>{list?.title}</b>
        {card.done_at ? ' · terminée' : ''}
      </p>

      <section className={styles.section}>
        <h3>Description</h3>
        {canEdit ? (
          <AutoSaveTextarea
            aria-label="Description"
            maxLength={8000}
            delay={600}
            placeholder="Ajoute les détails, les liens utiles…"
            value={card.description ?? ''}
            onSave={(v) => update({ description: v.trim() || null })}
          />
        ) : (
          <p className="small" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
            {card.description ? <RichText text={card.description} members={data.members} /> : 'Pas de description.'}
          </p>
        )}
      </section>

      <section className={styles.section}>
        <h3>Membres assignés</h3>
        <div className={styles.chipRow}>
          {data.members.map((mm) => {
            const on = assigned.has(mm.user_id);
            if (!canEdit && !on) return null;
            return (
              <button
                key={mm.user_id}
                type="button"
                className={styles.memberChip}
                aria-pressed={on}
                disabled={!canEdit}
                onClick={() => m.setCardMember.mutate({ cardId: card.id, userId: mm.user_id, on: !on }, { onError })}
              >
                <Avatar name={memberName(mm)} avatar={mm.profile?.avatar_url} size={30} />
                {memberName(mm)}
              </button>
            );
          })}
          {!canEdit && assigned.size === 0 && <span className="muted small">Personne.</span>}
        </div>
        <CardJoin card={card} data={data} assigned={assigned} />
      </section>

      <section className={styles.section}>
        <h3>Échéance</h3>
        {canEdit ? (
          <div className="grid2">
            <label className="field">
              <span>Date</span>
              <input type="date" value={card.due_date ?? ''} onChange={(e) => update({ due_date: e.target.value || null, ...(e.target.value ? {} : { due_time: null }) })} />
            </label>
            <label className="field">
              <span>Heure (facultatif)</span>
              <input type="time" value={card.due_time ? hhmm(card.due_time) : ''} disabled={!card.due_date} onChange={(e) => update({ due_time: e.target.value || null })} />
            </label>
          </div>
        ) : (
          <p className="small" style={{ margin: 0 }}>
            {card.due_date ? `${cap(fmtDate(card.due_date, 'EEEE d MMMM'))}${card.due_time ? ` à ${hhmm(card.due_time)}` : ''}` : 'Pas d’échéance.'}
          </p>
        )}
        {status === 'late' && <span className={`${styles.due} ${styles.due_late}`} style={{ alignSelf: 'flex-start' }}>En retard</span>}
      </section>

      <section className={styles.section}>
        <h3>Étiquettes</h3>
        <div className={styles.chipRow}>
          {data.labels.length === 0 && <span className="muted small">Aucune étiquette sur ce tableau (menu ⋯ → Étiquettes).</span>}
          {data.labels.map((l) => {
            const on = labelIds.has(l.id);
            if (!canEdit && !on) return null;
            return (
              <button
                key={l.id}
                type="button"
                className={styles.labelChip}
                aria-pressed={on}
                disabled={!canEdit}
                style={{ '--c': l.color } as CSSProperties}
                onClick={() => m.setCardLabel.mutate({ cardId: card.id, labelId: l.id, on: !on }, { onError })}
              >
                <i />
                {l.name || 'Sans nom'}
              </button>
            );
          })}
        </div>
      </section>

      <CardFiles card={card} data={data} />

      {details.isLoading ? (
        <LoadingState />
      ) : details.isError ? (
        <p className="error-text">Impossible de charger la checklist et les commentaires.</p>
      ) : (
        <>
          <Checklist card={card} data={data} items={details.data?.checklist ?? []} />
          <Comments card={card} data={data} comments={details.data?.comments ?? []} />
          <History data={data} activity={details.data?.activity ?? []} />
        </>
      )}

      {canEdit && (
        <>
          <PlanInDay card={card} />
          <div className="grid2">
            <button
              type="button"
              className="btn primary"
              onClick={() =>
                m.updateCard.mutate(
                  {
                    id: card.id,
                    values: card.done_at ? { done_at: null } : { done_at: nowISO(), ...(doneList ? { list_id: doneList.id } : {}) },
                  },
                  { onSuccess: () => toast(card.done_at ? 'Carte remise en cours' : 'Carte terminée, bravo !'), onError },
                )
              }
            >
              {card.done_at ? 'Remettre en cours' : 'Marquer comme fait'}
            </button>
            <button
              type="button"
              className="btn danger"
              onClick={() =>
                m.updateCard.mutate(
                  { id: card.id, values: { archived_at: nowISO() } },
                  {
                    onSuccess: () => {
                      toast('Carte archivée');
                      onClose();
                    },
                    onError,
                  },
                )
              }
            >
              Archiver
            </button>
          </div>
        </>
      )}
    </>
  );
}

function CardFiles({ card, data }: { card: CardRow; data: BoardData }) {
  const { user } = useAuth();
  const canEdit = data.myRole !== 'viewer';
  const files = useCardAttachments(card.id);
  const up = useUploader();
  const items = files.data ?? [];
  if (!canEdit && !items.length) return null;
  return (
    <section className={styles.section}>
      <h3>Fichiers {items.length > 0 && `· ${items.length}`}</h3>
      <Gallery items={items} canDelete={(a) => a.user_id === user?.id || data.myRole === 'owner'} />
      <UploadQueue items={up.items} onCancel={up.cancel} onDismiss={up.dismiss} />
      {canEdit && <FilePicker onFiles={(list) => void up.upload(list, { boardId: data.board.id, cardId: card.id })} />}
    </section>
  );
}

function Checklist({ card, data, items }: { card: CardRow; data: BoardData; items: ChecklistItemRow[] }) {
  const canEdit = data.myRole !== 'viewer';
  const c = useCardMutations(data.board.id, card.id);
  const toast = useToast();
  const [text, setText] = useState('');
  const sorted = items.slice().sort((a, b) => a.position - b.position);
  const done = sorted.filter((i) => i.done_at).length;

  function move(i: number, dir: -1 | 1) {
    const a = sorted[i];
    const b = sorted[i + dir];
    if (!a || !b) return;
    // Échange des positions avec le voisin.
    c.updateItem.mutate({ id: a.id, values: { position: b.position } });
    c.updateItem.mutate({ id: b.id, values: { position: a.position } });
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      await c.addItem.mutateAsync(text.trim());
      setText('');
    } catch {
      toast("L'élément n'a pas pu être ajouté.");
    }
  }

  return (
    <section className={styles.section}>
      <h3>
        Checklist {sorted.length > 0 && `· ${done}/${sorted.length}`}
      </h3>
      {sorted.length > 0 && (
        <div className="prog" aria-hidden="true">
          <i style={{ width: `${(done / sorted.length) * 100}%` }} />
        </div>
      )}
      {sorted.map((it, i) => (
        <div key={it.id} className={`${styles.checkRow} ${it.done_at ? styles.isDone : ''}`}>
          <button type="button" className="check" aria-pressed={!!it.done_at} aria-label={`Cocher ${it.text}`} disabled={!canEdit} onClick={() => c.toggleItem(it)}>
            {it.done_at ? '✓' : ''}
          </button>
          <span>{it.text}</span>
          {canEdit && (
            <>
              <button type="button" className={styles.mini} aria-label="Monter" disabled={i === 0} onClick={() => move(i, -1)}>
                ↑
              </button>
              <button type="button" className={styles.mini} aria-label="Descendre" disabled={i === sorted.length - 1} onClick={() => move(i, 1)}>
                ↓
              </button>
              <button type="button" className={styles.mini} aria-label={`Supprimer ${it.text}`} onClick={() => c.deleteItem.mutate(it.id)}>
                ✕
              </button>
            </>
          )}
        </div>
      ))}
      {canEdit && (
        <form className={styles.addForm} onSubmit={onAdd}>
          <input maxLength={300} placeholder="Ajouter un élément" aria-label="Nouvel élément de checklist" value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn sm" type="submit" disabled={c.addItem.isPending}>
            +
          </button>
        </form>
      )}
    </section>
  );
}

function Comments({ card, data, comments }: { card: CardRow; data: BoardData; comments: { id: string; user_id: string; body: string; created_at: string; edited_at: string | null }[] }) {
  const { user } = useAuth();
  const canEdit = data.myRole !== 'viewer';
  const c = useCardMutations(data.board.id, card.id);
  const toast = useToast();
  const [body, setBody] = useState('');
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const byId = new Map(data.members.map((mm) => [mm.user_id, mm]));

  async function send() {
    if (!body.trim()) return;
    try {
      const row = await c.addComment.mutateAsync(body.trim());
      const mentioned = extractMentions(
        body,
        data.members.filter((mm) => mm.user_id !== user?.id).map((mm) => ({ id: mm.user_id, name: mm.profile?.first_name ?? '' })),
      );
      void saveMentions({ boardId: data.board.id, userIds: mentioned, cardId: card.id, commentId: row.id });
      setBody('');
    } catch {
      toast("Le commentaire n'a pas pu être envoyé.");
    }
  }

  return (
    <section className={styles.section}>
      <h3>Commentaires</h3>
      {comments.length === 0 && <p className="muted small" style={{ margin: 0 }}>Aucun commentaire.</p>}
      {comments.map((cm) => {
        const author = byId.get(cm.user_id);
        const mine = cm.user_id === user?.id;
        return (
          <div key={cm.id} className={styles.comment}>
            <Avatar name={memberName(author)} avatar={author?.profile?.avatar_url} size={30} />
            <div className={styles.commentBody}>
              <small>
                {memberName(author)} · {new Date(cm.created_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                {cm.edited_at ? ' · modifié' : ''}
              </small>
              {editing?.id === cm.id ? (
                <div className="list" style={{ gap: 6, marginTop: 6 }}>
                  <MentionTextarea value={editing.body} onChange={(v) => setEditing({ id: cm.id, body: v })} members={data.members} ariaLabel="Modifier le commentaire" />
                  <div className="row">
                    <button
                      type="button"
                      className="btn sm primary"
                      onClick={() =>
                        editing.body.trim() &&
                        c.editComment.mutate({ id: cm.id, body: editing.body.trim() }, { onSuccess: () => setEditing(null) })
                      }
                    >
                      Enregistrer
                    </button>
                    <button type="button" className="btn sm" onClick={() => setEditing(null)}>
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <p>
                  <RichText text={cm.body} members={data.members} />
                </p>
              )}
              {mine && editing?.id !== cm.id && (
                <div className="row" style={{ gap: 0 }}>
                  <button type="button" className="linkbtn" style={{ fontSize: 12, marginRight: 12 }} onClick={() => setEditing({ id: cm.id, body: cm.body })}>
                    Modifier
                  </button>
                  <button type="button" className="linkbtn" style={{ fontSize: 12, color: 'var(--late)' }} onClick={() => c.deleteComment.mutate(cm.id)}>
                    Supprimer
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
      {canEdit && (
        <>
          <MentionTextarea value={body} onChange={setBody} members={data.members} placeholder="Écris un commentaire, @ pour mentionner" ariaLabel="Nouveau commentaire" onEnter={() => void send()} />
          <button type="button" className="btn sm primary" style={{ alignSelf: 'flex-end' }} onClick={() => void send()} disabled={c.addComment.isPending || !body.trim()}>
            Envoyer
          </button>
        </>
      )}
    </section>
  );
}

function activityText(a: BoardActivityRow, data: BoardData): string {
  const who = memberName(data.members.find((mm) => mm.user_id === a.user_id));
  const p = a.payload as { title?: string; from_title?: string; to_title?: string };
  if (a.action === 'card_created') return `${who} a créé la carte`;
  if (a.action === 'card_moved') return `${who} l'a déplacée de « ${p.from_title ?? '?'} » vers « ${p.to_title ?? '?'} »`;
  if (a.action === 'card_done') return `${who} l'a terminée`;
  return `${who} : ${a.action}`;
}

function History({ data, activity }: { data: BoardData; activity: BoardActivityRow[] }) {
  if (!activity.length) return null;
  return (
    <section className={styles.section}>
      <h3>Historique</h3>
      {activity.map((a) => (
        <div key={a.id} className={styles.activity}>
          <span>{activityText(a, data)}</span>
          <span>{new Date(a.created_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      ))}
    </section>
  );
}

/** « Planifier dans ma journée » : crée une tâche liée à la carte dans le premier créneau libre entre 06:00 et 22:00. */
function PlanInDay({ card }: { card: CardRow }) {
  const add = useAddTasks();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(todayISO());
  const [duration, setDuration] = useState(60);
  const [done, setDone] = useState<{ date: string; start: string } | null>(null);
  const [error, setError] = useState('');

  async function plan() {
    setError('');
    const { data: tasks, error: err } = await supabase.from('tasks').select('date, start_time, end_time').eq('date', day);
    if (err) return setError('Impossible de lire ta journée.');
    const from = day === todayISO() ? Math.max(DAY_START, Math.ceil(nowMinutes())) : DAY_START;
    const slot = firstFreeSlot(tasks ?? [], day, from, duration);
    if (!slot || toMinutes(slot.end_time) > DAY_END) {
      return setError('Pas de créneau libre assez long entre 06:00 et 22:00 ce jour-là. Choisis un autre jour ou une durée plus courte.');
    }
    try {
      await add.mutateAsync([{ ...slot, title: card.title, category: 'travail', card_id: card.id }]);
      setDone({ date: day, start: slot.start_time });
      toast(`Planifié à ${slot.start_time}`);
    } catch {
      setError("La tâche n'a pas pu être créée.");
    }
  }

  if (done) {
    return (
      <div className={styles.planned}>
        <span>
          Planifié {done.date === todayISO() ? "aujourd'hui" : fmtDate(done.date, 'EEEE d MMMM')} à {done.start}
        </span>
        <Link to={`/jour?date=${done.date}`} className="lime" style={{ fontWeight: 600 }}>
          Voir la journée ›
        </Link>
      </div>
    );
  }

  return open ? (
    <section className="card">
      <div className="label">Planifier dans ma journée</div>
      <div className="grid2">
        <label className="field">
          <span>Jour</span>
          <input type="date" value={day} min={todayISO()} max={addDaysISO(todayISO(), 365)} onChange={(e) => setDay(e.target.value || todayISO())} />
        </label>
        <label className="field">
          <span>Durée</span>
          <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
            <option value={30}>30 min</option>
            <option value={60}>1 h</option>
            <option value={120}>2 h</option>
          </select>
        </label>
      </div>
      {error && <p className="error-text">{error}</p>}
      <div className="grid2">
        <button type="button" className="btn" onClick={() => setOpen(false)}>
          Annuler
        </button>
        <button type="button" className="btn primary" onClick={() => void plan()} disabled={add.isPending}>
          Planifier
        </button>
      </div>
    </section>
  ) : (
    <button type="button" className="btn outline" onClick={() => setOpen(true)}>
      Planifier dans ma journée
    </button>
  );
}

const toMinutes = (t: string) => {
  const [h, mm] = t.split(':').map(Number);
  return h * 60 + mm;
};
