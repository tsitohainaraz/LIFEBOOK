import { useEffect, useRef, useState } from 'react';
import { threePriorities } from '../hooks/usePlan';
import type { Priority } from '../types/database';
import styles from './Priorities.module.css';

interface Props {
  title: string;
  value: Priority[] | null | undefined;
  onSave: (list: Priority[]) => void;
  placeholder?: (i: number) => string;
}

/** 3 priorités à cocher ; le texte est enregistré après une courte pause dans la saisie. */
export function Priorities({ title, value, onSave, placeholder = (i) => `Priorité ${i + 1}` }: Props) {
  const [list, setList] = useState<Priority[]>(() => threePriorities(value));
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const dirty = useRef(false);
  const serialized = JSON.stringify(value ?? []);

  // Données rechargées (autre jour, autre appareil) : on remplace, sauf pendant la saisie.
  useEffect(() => {
    if (!dirty.current) setList(threePriorities(JSON.parse(serialized) as Priority[]));
  }, [serialized]);

  useEffect(() => () => clearTimeout(timer.current), []);

  function saveLater(next: Priority[]) {
    dirty.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      dirty.current = false;
      onSave(next);
    }, 700);
  }

  const filled = list.filter((p) => p.text.trim());
  return (
    <div className="card">
      <div className="between">
        <h2 style={{ fontSize: 15 }}>{title}</h2>
        <small className="mono muted">
          {filled.filter((p) => p.done).length}/{filled.length}
        </small>
      </div>
      <div className="list">
        {list.map((p, i) => (
          <div key={i} className={`${styles.prio} ${p.done ? styles.done : ''}`}>
            <span className={styles.n}>{i + 1}</span>
            <input
              type="text"
              maxLength={100}
              value={p.text}
              placeholder={placeholder(i)}
              aria-label={placeholder(i)}
              onChange={(e) => {
                const next = list.map((x, j) => (j === i ? { ...x, text: e.target.value } : x));
                setList(next);
                saveLater(next);
              }}
            />
            <button
              type="button"
              className="check"
              aria-pressed={p.done}
              aria-label={`${placeholder(i)} faite`}
              onClick={(e) => {
                if (!p.text.trim()) {
                  (e.currentTarget.previousElementSibling as HTMLInputElement | null)?.focus();
                  return;
                }
                const next = list.map((x, j) => (j === i ? { ...x, done: !x.done } : x));
                setList(next);
                clearTimeout(timer.current);
                dirty.current = false;
                onSave(next);
              }}
            >
              {p.done ? '✓' : ''}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
