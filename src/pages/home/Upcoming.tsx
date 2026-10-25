import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClock } from '../../hooks/useClock';
import { CATEGORY_COLOR } from '../../utils/categories';
import { addDaysISO, pad, toISODate, todayISO } from '../../utils/dates';
import { formatRelative, getUpcoming, phraseUpcomingParts, type NowResult, type PlannedItem } from '../../utils/now';
import styles from './Upcoming.module.css';

const SOON_MIN = 15;
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/**
 * Bloc « À suivre » sous les boutons du cercle Maintenant.
 * En état « next », le cercle montre déjà le prochain élément : on commence au suivant.
 */
export function Upcoming({ items, now }: { items: PlannedItem[]; now: NowResult }) {
  const clock = useClock(30_000);
  const navigate = useNavigate();
  const skip = now.mode === 'next' && now.task ? now.task.id : null;
  const list = getUpcoming(
    items.filter((i) => i.id !== skip),
    clock,
    3,
  );

  const open = (i: PlannedItem) => {
    if (i.source === 'card' && i.boardId && i.cardId) navigate(`/tableaux/${i.boardId}/carte/${i.cardId}`);
    else navigate(`/jour?date=${toISODate(i.start)}`);
  };

  if (!list.length) {
    return (
      <div className={styles.box}>
        <div className={styles.label}>À suivre</div>
        <p className={styles.empty}>
          Rien de prévu pour l'instant.{' '}
          <button type="button" className={styles.link} onClick={() => navigate(`/jour?date=${addDaysISO(todayISO(), 1)}`)}>
            Planifier demain
          </button>
        </p>
      </div>
    );
  }

  const [first, ...rest] = list;
  const minutes = (first.start.getTime() - clock.getTime()) / 60_000;
  const soon = minutes <= SOON_MIN;
  const p = phraseUpcomingParts(first.title, formatRelative(minutes, first.start));

  return (
    <div className={styles.box}>
      <div className={styles.label}>À suivre</div>
      <button
        type="button"
        className={`${styles.main} ${soon ? styles.soon : ''}`}
        style={{ '--c': CATEGORY_COLOR[first.category] } as CSSProperties}
        onClick={() => open(first)}
      >
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.t}>
          <span className={styles.say}>
            {p.before}
            <em>{p.em}</em>
            {p.after}
          </span>
          <small>
            {hm(first.start)} – {hm(first.end)}
            {first.boardName ? ` · ${first.boardName}` : ''}
          </small>
        </span>
        {soon && <i className={styles.blink} aria-label="Bientôt" />}
      </button>
      {rest.slice(0, 2).map((i) => (
        <button key={i.id} type="button" className={styles.small} onClick={() => open(i)}>
          {formatRelative((i.start.getTime() - clock.getTime()) / 60_000, i.start)} · {i.title}
          {i.boardName ? ` · ${i.boardName}` : ''}
        </button>
      ))}
    </div>
  );
}
