import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { ErrorState, LoadingState } from '../../components/States';
import { todayISO } from '../../utils/dates';
import type { NotificationRow } from '../../types/database';
import { isMissingTableError } from '../boards/boardUtils';
import { BoardsUnavailable } from '../boards/BoardsUnavailable';
import { groupByDay, timeOf } from '../chat/chatUtils';
import { useMarkRead, useNotifications } from './useNotifications';
import styles from './Notifications.module.css';

const ICON: Record<string, string> = {
  card_assigned: '🗂',
  card_comment: '💬',
  message: '💬',
  mention: '@',
  member_joined: '👋',
  report_posted: '📝',
  report_reminder: '📝',
  due_tomorrow: '⏰',
  overdue: '⚠️',
};

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

export function NotificationsPage() {
  const q = useNotifications();
  const mark = useMarkRead();
  const navigate = useNavigate();
  const list = q.data ?? [];
  const unread = list.filter((n) => !n.read_at).length;

  function open(n: NotificationRow) {
    if (!n.read_at) mark.mutate([n.id]);
    navigate(n.link || '/');
  }

  return (
    <>
      <div className="pagehead">
        <div className="label">Équipe</div>
        <h1>
          Mes <span>notifications</span>
        </h1>
      </div>
      {q.isError && isMissingTableError(q.error) ? (
        <BoardsUnavailable />
      ) : q.isLoading ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState message="Impossible de charger tes notifications." onRetry={() => void q.refetch()} />
      ) : list.length === 0 ? (
        <p className="empty">Aucune notification. Tu seras prévenu ici quand ton équipe t'assigne une carte, te mentionne ou écrit.</p>
      ) : (
        <>
          {unread > 0 && (
            <button type="button" className="btn sm" onClick={() => mark.mutate('all')} disabled={mark.isPending}>
              Tout marquer comme lu ({unread})
            </button>
          )}
          {groupByDay(list.slice().reverse(), todayISO())
            .reverse()
            .map((g) => (
              <section key={g.day} className="list">
                <div className="label">{g.label}</div>
                {g.items
                  .slice()
                  .reverse()
                  .map((n) => (
                    <button key={n.id} type="button" className={`${styles.item} ${n.read_at ? '' : styles.unread}`} onClick={() => open(n)}>
                      <span className={styles.icon} aria-hidden="true">
                        {ICON[n.type] ?? '•'}
                      </span>
                      <span className={styles.t}>
                        <b>{n.title}</b>
                        {n.body && <small>{n.body}</small>}
                      </span>
                      <span className={styles.time}>{timeOf(n.created_at)}</span>
                    </button>
                  ))}
              </section>
            ))}
        </>
      )}
    </>
  );
}
