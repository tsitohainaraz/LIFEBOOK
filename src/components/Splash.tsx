import { Logo } from './Logo';
import styles from './Splash.module.css';

/** Écran de démarrage (maquette 1) : logo animé et barre de chargement. */
export function Splash({ message }: { message?: string }) {
  return (
    <div className={styles.splash} role="status" aria-label="Chargement de LifeBook">
      <div className={styles.mid}>
        <Logo className={styles.icon} size={150} />
      </div>
      <div className={styles.foot}>
        <div className={styles.name}>LifeBook</div>
        <div className={styles.bar}>
          <i />
        </div>
        {message && <p className={styles.message}>{message}</p>}
      </div>
    </div>
  );
}
