import type { CSSProperties } from 'react';
import { CATEGORIES } from '../../utils/categories';
import { fmtDuration } from '../../utils/dates';
import { minutesByKey } from '../../utils/timeline';
import type { Category } from '../../types/database';
import styles from './Day.module.css';

/** Barre de répartition du temps par catégorie, avec sa légende. */
export function CategorySplit({ items, base }: { items: { key: Category; minutes: number }[]; base?: number }) {
  const { total, by } = minutesByKey(items);
  const ref = Math.max(1, base ?? total);
  const used = CATEGORIES.filter((c) => by[c.key]);
  if (!used.length) return null;
  return (
    <>
      <div className={styles.split} aria-hidden="true">
        {used.map((c) => (
          <i key={c.key} style={{ width: `${((by[c.key] ?? 0) / ref) * 100}%`, background: c.color }} />
        ))}
      </div>
      <div className={styles.legend}>
        {used.map((c) => (
          <span key={c.key} style={{ '--c': c.color } as CSSProperties}>
            {c.label} {fmtDuration(by[c.key] ?? 0)}
          </span>
        ))}
      </div>
    </>
  );
}
