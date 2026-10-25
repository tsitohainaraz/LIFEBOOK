import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Avatar } from '../../components/Avatar';
import { mentionQuery } from './boardUtils';
import { memberName, type Member } from './useBoards';
import styles from './Boards.module.css';

/** Zone de texte avec autocomplétion des @mentions parmi les membres du tableau. */
export function MentionTextarea({
  value,
  onChange,
  members,
  placeholder,
  ariaLabel,
  onEnter,
  rows = 2,
}: {
  value: string;
  onChange: (v: string) => void;
  members: Member[];
  placeholder?: string;
  ariaLabel: string;
  /** Appelé avec Ctrl/Cmd + Entrée. */
  onEnter?: () => void;
  rows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const q = mentionQuery(value, caret);
  const suggestions = q
    ? members.filter((m) => (m.profile?.first_name ?? '').toLowerCase().startsWith(q.query.toLowerCase())).slice(0, 5)
    : [];

  function pick(m: Member) {
    if (!q) return;
    const first = m.profile?.first_name ?? memberName(m);
    const next = `${value.slice(0, q.start)}@${first} ${value.slice(caret)}`;
    onChange(next);
    const pos = q.start + first.length + 2;
    setCaret(pos);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(pos, pos);
    });
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && onEnter) {
      e.preventDefault();
      onEnter();
    }
  }

  return (
    <div className="list" style={{ gap: 6 }}>
      {suggestions.length > 0 && (
        <div className={styles.suggest} role="listbox" aria-label="Mentionner">
          {suggestions.map((m) => (
            <button key={m.user_id} type="button" role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(m)}>
              <Avatar name={memberName(m)} avatar={m.profile?.avatar_url} size={24} />
              {memberName(m)}
            </button>
          ))}
        </div>
      )}
      <textarea
        ref={ref}
        rows={rows}
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        maxLength={4000}
        onChange={(e) => {
          onChange(e.target.value);
          setCaret(e.target.selectionStart ?? e.target.value.length);
        }}
        onSelect={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
        onKeyDown={onKeyDown}
        style={{ minHeight: 60 }}
      />
    </div>
  );
}

/** Texte avec les @mentions mises en valeur et les liens cliquables. */
export function RichText({ text, members }: { text: string; members: Member[] }) {
  const names = members.map((m) => m.profile?.first_name).filter((n): n is string => !!n);
  const parts: ReactNode[] = [];
  const re = /(https?:\/\/[^\s<]+)|(@[\p{L}\p{N}_-]+)/gu;
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) parts.push(text.slice(last, i));
    if (m[1]) {
      parts.push(
        <a key={k++} href={m[1]} target="_blank" rel="noopener noreferrer" style={{ overflowWrap: 'anywhere' }}>
          {m[1]}
        </a>,
      );
    } else if (m[2] && names.some((n) => n.toLowerCase() === m[2].slice(1).toLowerCase())) {
      parts.push(
        <span key={k++} className={styles.mention}>
          {m[2]}
        </span>,
      );
    } else parts.push(m[0]);
    last = i + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
