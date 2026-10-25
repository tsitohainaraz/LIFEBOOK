import { useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useProfile } from '../contexts/AuthContext';
import { useAvatarUrl } from '../hooks/useProfile';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { AccountSheet } from './AccountSheet';
import { BottomTabs } from './BottomTabs';
import { Icon } from './Icon';
import { SummarySheet } from './SummarySheet';
import { ToastProvider } from './Toast';
import styles from './AppShell.module.css';

export function AppShell() {
  const profile = useProfile();
  const navigate = useNavigate();
  const avatar = useAvatarUrl(profile.avatar_url).data;
  const online = useOnlineStatus();
  const [sheet, setSheet] = useState<'summary' | 'account' | null>(null);
  const initial = (profile.first_name ?? '?').charAt(0).toUpperCase();

  return (
    <ToastProvider>
      <div className={styles.app}>
        <header className={styles.top}>
          <Link to="/" className={styles.logo}>
            Life<span>Book</span>
          </Link>
          <div className="row">
            {!online && (
              <span className={styles.offline} role="status">
                Hors ligne
              </span>
            )}
            <Link to="/tableaux" className={`iconbtn ${styles.sumbtn}`} aria-label="Tableaux">
              <Icon name="board" strokeWidth={2} />
            </Link>
            <button
              type="button"
              className={`iconbtn ${styles.sumbtn}`}
              aria-label="Mon résumé"
              onClick={() => setSheet('summary')}
            >
              <Icon name="chart" strokeWidth={2} />
            </button>
            <button
              type="button"
              className={styles.avatar}
              aria-label="Mon compte"
              onClick={() => setSheet('account')}
              style={avatar ? { backgroundImage: `url("${avatar}")` } : undefined}
            >
              {avatar ? '' : initial}
            </button>
          </div>
        </header>
        <main className={styles.main}>
          <Outlet />
        </main>
        <BottomTabs />
        {sheet === 'summary' && (
          <SummarySheet
            onClose={() => setSheet(null)}
            onHealthLog={() => {
              setSheet(null);
              navigate('/sante');
            }}
          />
        )}
        {sheet === 'account' && <AccountSheet onClose={() => setSheet(null)} />}
      </div>
    </ToastProvider>
  );
}
