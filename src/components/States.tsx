import type { ReactNode } from 'react';

/** Les trois états communs à chaque écran : chargement, vide, erreur. */

export function LoadingState({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="card" role="status" aria-live="polite" style={{ alignItems: 'center' }}>
      <span className="loader" aria-hidden="true" />
      <p className="muted small" style={{ margin: 0 }}>
        {label}
      </p>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="card" role="alert" style={{ borderColor: 'var(--late)' }}>
      <p className="error-text">{message ?? 'Une erreur est survenue. Vérifie ta connexion et réessaie.'}</p>
      {onRetry && (
        <button type="button" className="btn sm" onClick={onRetry}>
          Réessayer
        </button>
      )}
    </div>
  );
}
