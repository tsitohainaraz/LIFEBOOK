import { Link, Outlet } from 'react-router-dom';
import { BottomTabs } from './BottomTabs';
import styles from './AppShell.module.css';

export function AppShell() {
  return (
    <div className={styles.app}>
      <header className={styles.top}>
        <Link to="/" className={styles.logo}>
          Life<span>Book</span>
        </Link>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
      <BottomTabs />
    </div>
  );
}
