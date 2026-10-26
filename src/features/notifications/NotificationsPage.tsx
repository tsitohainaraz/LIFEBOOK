import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Sheet } from '../../components/Sheet';
import { ErrorState, LoadingState } from '../../components/States';
import { useToast } from '../../components/Toast';
import { todayISO } from '../../utils/dates';
import type { NotificationRow } from '../../types/database';
import { isMissingTableError } from '../boards/boardUtils';
import { BoardsUnavailable } from '../boards/BoardsUnavailable';
import { groupByDay, timeOf } from '../chat/chatUtils';
import { counts, filterNotifications, iconOf, pendingJoinRequestId, toggleMuted, typesByGroup, type NotifFilter } from './notifUtils';
import { useAnswerJoin, useMarkRead, useMarkUnread, useNotificationPrefs, useNotifications, useSaveNotificationPrefs } from './useNotifications';
import styles from './Notifications.module.css';

/** Cloche de l'en-tête avec le nombre de notifications non lues. */
export function Bell() {
  const q = useNotifications();
  const unread = (q.data ?? []).filter((n) => !n.read_at).length;
  return (
    <Link to="/notifications" className={`iconbtn ${styles.bell}`} aria-label={unread ? `Notifications, ${unread} non lues` : 'Notifications'}>
      <Icon name="bell" strokeWidth={2} />
      {unread > 0 && <span className={styles.badge}>{unread > 99 ? '99+' : unread}</span>}
    </Link>
  );
}

const FILTERS: { value: NotifFilter; label: string }[] = [
  { value: 'all', label: 'Toutes' },
  { value: 'unread', label: 'Non lues' },
  { value: 'read', label: 'Lues' },
];

const EMPTY: Record<NotifFilter, string> = {
  all: "Aucune notification. Tu seras prévenu ici quand ton équipe t'assigne une carte, la déplace, te mentionne ou écrit.",
  unread: 'Tout est lu. Bravo !',
  read: 'Aucune notification lue pour l’instant.',
};

export function NotificationsPage() {
  const q = useNotifications();
  const mark = useMarkRead();
  const unmark = useMarkUnread();
  const answer = useAnswerJoin();
  const toast = useToast();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<NotifFilter>('all');
  const [settings, setSettings] = useState(false);
  const all = q.data ?? [];
  const c = counts(all);
  const list = filterNotifications(all, filter);

  function open(n: NotificationRow) {
    if (!n.read_at) mark.mutate([n.id]);
    navigate(n.link || '/');
  }

  function reply(n: NotificationRow, requestId: string, accept: boolean) {
    answer.mutate(
      { requestId, accept },
      {
        onSuccess: () => toast(accept ? 'Demande acceptée : la personne est assignée' : 'Demande refusée'),
        onError: () => toast("La réponse n'a pas pu être enregistrée."),
      },
    );
    if (!n.read_at) mark.mutate([n.id]);
  }

  return (
    <>
      <div className={`pagehead ${styles.head}`}>
        <div>
          <div className="label">Équipe</div>
          <h1>
            Mes <span>notifications</span>
          </h1>
        </div>
        <button type="button" className="iconbtn" aria-label="Réglages des notifications" onClick={() => setSettings(true)}>
          ⚙
        </button>
      </div>
      {q.isError && isMissingTableError(q.error) ? (
        <BoardsUnavailable />
      ) : q.isLoading ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState message="Impossible de charger tes notifications." onRetry={() => void q.refetch()} />
      ) : (
        <>
          <div className={styles.toolbar}>
            <div className="pills" role="group" aria-label="Filtrer">
              {FILTERS.map((f) => (
                <button key={f.value} type="button" className="pill" aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>
                  {f.label} <span className="mono">{c[f.value]}</span>
                </button>
              ))}
            </div>
            <button type="button" className="btn sm" onClick={() => mark.mutate('all')} disabled={mark.isPending || c.unread === 0}>
              <Icon name="check" /> Tout marquer comme lu
            </button>
          </div>

          {list.length === 0 ? (
            <p className="empty">{EMPTY[filter]}</p>
          ) : (
            groupByDay(list.slice().reverse(), todayISO())
              .reverse()
              .map((g) => (
                <section key={g.day} className="list">
                  <div className="label">{g.label}</div>
                  {g.items
                    .slice()
                    .reverse()
                    .map((n) => {
                      const requestId = pendingJoinRequestId(n);
                      return (
                        <div key={n.id} className={`${styles.item} ${n.read_at ? '' : styles.unread}`}>
                          <button type="button" className={styles.main} onClick={() => open(n)}>
                            <span className={styles.icon} aria-hidden="true">
                              {iconOf(n.type)}
                            </span>
                            <span className={styles.t}>
                              <b>{n.title}</b>
                              {n.body && <small>{n.body}</small>}
                            </span>
                            <span className={styles.time}>{timeOf(n.created_at)}</span>
                          </button>
                          <div className={styles.actions}>
                            {requestId && (
                              <>
                                <button type="button" className="btn primary sm" disabled={answer.isPending} onClick={() => reply(n, requestId, true)}>
                                  Accepter
                                </button>
                                <button type="button" className="btn sm" disabled={answer.isPending} onClick={() => reply(n, requestId, false)}>
                                  Refuser
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              className={styles.readBtn}
                              onClick={() => (n.read_at ? unmark.mutate(n.id) : mark.mutate([n.id]))}
                              aria-label={n.read_at ? `Marquer « ${n.title} » comme non lue` : `Marquer « ${n.title} » comme lue`}
                            >
                              {n.read_at ? 'Marquer non lu' : 'Marquer lu'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </section>
              ))
          )}
        </>
      )}
      {settings && <NotificationSettings onClose={() => setSettings(false)} />}
    </>
  );
}

function NotificationSettings({ onClose }: { onClose: () => void }) {
  const prefs = useNotificationPrefs();
  const save = useSaveNotificationPrefs();
  const toast = useToast();
  const muted = prefs.data ?? [];
  return (
    <Sheet title="Réglages des notifications" onClose={onClose}>
      <p className="muted small" style={{ margin: 0 }}>
        Décoche ce que tu ne veux plus recevoir. Ça s'applique à tous tes tableaux.
      </p>
      {prefs.isLoading ? (
        <LoadingState />
      ) : prefs.isError ? (
        <ErrorState message="Impossible de charger tes réglages." onRetry={() => void prefs.refetch()} />
      ) : (
        typesByGroup().map((g) => (
          <section key={g.group} className="list">
            <div className="label">{g.group}</div>
            {g.types.map((t) => {
              const on = !muted.includes(t.type);
              return (
                <label key={t.type} className={styles.pref}>
                  <span aria-hidden="true" className={styles.icon}>
                    {t.icon}
                  </span>
                  <span className={styles.t}>{t.label}</span>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => save.mutate(toggleMuted(muted, t.type, e.target.checked), { onError: () => toast('Réglage non enregistré.') })}
                  />
                </label>
              );
            })}
          </section>
        ))
      )}
    </Sheet>
  );
}
