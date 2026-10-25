import { NavLink } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import styles from './BottomTabs.module.css';

const TABS: { to: string; icon: IconName; label: string }[] = [
  { to: '/', icon: 'home', label: 'Accueil' },
  { to: '/jour', icon: 'day', label: 'Journée' },
  { to: '/semaine', icon: 'week', label: 'Semaine' },
  { to: '/mois', icon: 'month', label: 'Mois' },
  { to: '/annee', icon: 'year', label: 'Année' },
  { to: '/vie', icon: 'life', label: 'Ma vie' },
];

export function BottomTabs() {
  return (
    <nav className={styles.tabs} aria-label="Navigation principale">
      <div className={styles.inner}>
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.to === '/'} className={styles.tab}>
            <Icon name={t.icon} />
            <span>{t.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
