import { useState } from 'react';

/** Logo LifeBook (public/logo.png) avec un emplacement de remplacement s'il manque. */
export function Logo({ className, size }: { className?: string; size: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        className={className}
        aria-hidden="true"
        style={{
          width: size,
          height: size,
          display: 'grid',
          placeItems: 'center',
          background: 'var(--surface-2)',
          border: '1px solid var(--lime)',
          color: 'var(--lime)',
          fontWeight: 800,
          fontSize: size * 0.4,
        }}
      >
        LB
      </span>
    );
  }
  return <img className={className} src="/logo.png" alt="" width={size} onError={() => setFailed(true)} />;
}
