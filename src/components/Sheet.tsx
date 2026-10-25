import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './Sheet.module.css';

/** Panneau qui monte du bas de l'écran ; se ferme avec Échap ou un appui sur le fond. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first = panel.current?.querySelector<HTMLElement>('input, select, textarea, button:not([data-close])');
    (first ?? panel.current)?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  return createPortal(
    <div
      className={styles.backdrop}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={panel} className={styles.panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <span className={styles.grab} aria-hidden="true" />
        <div className={styles.head}>
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="iconbtn" data-close onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
