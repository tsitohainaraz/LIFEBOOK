import { useAvatarUrl } from '../hooks/useProfile';

/** Photo ronde d'une personne, ou son initiale. `online` ajoute un point vert. */
export function Avatar({
  name,
  avatar,
  size = 32,
  online,
}: {
  name: string;
  avatar: string | null | undefined;
  size?: number;
  online?: boolean;
}) {
  const url = useAvatarUrl(avatar).data;
  return (
    <span
      title={name}
      aria-label={name}
      role="img"
      style={{
        position: 'relative',
        width: size,
        height: size,
        flex: 'none',
        borderRadius: '50%',
        border: '2px solid var(--surface)',
        background: url ? `var(--surface-2) center / cover no-repeat url("${url}")` : 'var(--surface-2)',
        color: 'var(--lime)',
        fontWeight: 700,
        fontSize: size * 0.42,
        display: 'grid',
        placeItems: 'center',
      }}
    >
      {url ? '' : (name.trim().charAt(0) || '?').toUpperCase()}
      {online && (
        <i
          aria-hidden="true"
          style={{
            position: 'absolute',
            right: -1,
            bottom: -1,
            width: Math.max(8, size * 0.28),
            height: Math.max(8, size * 0.28),
            borderRadius: '50%',
            background: 'var(--lime)',
            border: '2px solid var(--surface)',
          }}
        />
      )}
    </span>
  );
}
