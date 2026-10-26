import { passwordChecks } from '../utils/password';
import styles from './PasswordRules.module.css';

/** Règles du mot de passe, cochées au fur et à mesure de la saisie. */
export function PasswordRules({ value, id }: { value: string; id?: string }) {
  return (
    <ul className={styles.rules} id={id} aria-label="Règles du mot de passe">
      {passwordChecks(value).map((c) => (
        <li key={c.key} className={c.ok ? styles.ok : undefined}>
          <span aria-hidden="true">{c.ok ? '✓' : '○'}</span>
          {c.label}
          <span className="sr-only">{c.ok ? ' : respecté' : ' : manquant'}</span>
        </li>
      ))}
    </ul>
  );
}
