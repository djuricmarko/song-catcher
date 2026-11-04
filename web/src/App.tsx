import { Disc3, FolderOpen, ListMusic, ListTodo, Search, Terminal, Video, type LucideIcon } from 'lucide-react';
import { useEffect } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

import { ThemeSwitch } from './components/ThemeSwitch';
import { useAppConfig } from './hooks/useAppConfig';
import { useQueue } from './hooks/useQueue';
import { cn } from './lib/cn';
import { DebugPage } from './pages/DebugPage';
import { DeezerPage } from './pages/DeezerPage';
import { FilesPage } from './pages/FilesPage';
import { QueuePage } from './pages/QueuePage';
import { SearchPage } from './pages/SearchPage';
import { YoutubePage } from './pages/YoutubePage';

import styles from './App.module.css';

interface NavItem {
  to: string;
  label: string;
  /** Label for the bottom tab bar on phones; omitted items live in the top bar instead. */
  tabLabel?: string;
  icon: LucideIcon;
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Search', tabLabel: 'Search', icon: Search, end: true },
  { to: '/youtube', label: 'Video links', tabLabel: 'Links', icon: Video },
  { to: '/deezer', label: 'Playlists', tabLabel: 'Playlists', icon: ListMusic },
  { to: '/files', label: 'Library', tabLabel: 'Library', icon: FolderOpen },
  { to: '/debug', label: 'Logs', icon: Terminal },
  { to: '/queue', label: 'Queue', tabLabel: 'Queue', icon: ListTodo },
];

const TAB_ITEMS = NAV_ITEMS.filter((item) => item.tabLabel);

export default function App() {
  const config = useAppConfig();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { tasks } = useQueue();
  const pending = tasks.filter((task) => task.state === 'active' || task.state === 'waiting').length;

  // Each page starts at the top, like switching tabs in a native app.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'm') {
        const input = document.querySelector<HTMLInputElement>('input[aria-label="Search query"]');
        if (input) {
          event.preventDefault();
          input.focus();
        }
        return;
      }

      const numberShortcut = /^Digit([1-6])$/.exec(event.code);
      if (event.ctrlKey && event.shiftKey && !event.altKey && numberShortcut?.[1]) {
        const item = NAV_ITEMS[Number(numberShortcut[1]) - 1];
        if (item) {
          event.preventDefault();
          navigate(item.to);
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [navigate]);

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.logo} aria-hidden>
            <Disc3 size={18} strokeWidth={1.75} />
          </span>
          <div className={styles.brandText}>
            <p className={styles.appName}>
              Song<span>catcher</span>
            </p>
            <p className={styles.version}>{config.data ? `v${config.data.version}` : '—'}</p>
          </div>
        </div>

        <nav className={styles.nav} aria-label="Main">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }, index) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => cn(styles.navLink, isActive && styles.navLinkActive)}
              title={`${label} (Ctrl+Shift+${index + 1})`}
            >
              <span className={styles.navIndex}>{String(index + 1).padStart(2, '0')}</span>
              <Icon size={16} strokeWidth={1.75} aria-hidden className={styles.navIcon} />
              <span className={styles.navLabel}>{label}</span>
              {to === '/queue' && pending > 0 ? <span className={styles.navCount}>{pending}</span> : null}
            </NavLink>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          {config.data?.useMpd ? (
            <p className={styles.mpd}>
              <span className={styles.mpdDot} aria-hidden />
              MPD linked
            </p>
          ) : null}
          <ThemeSwitch />
          <p className={styles.shortcutHint}>
            <kbd>Ctrl</kbd>
            <kbd>M</kbd> focus search
          </p>
        </div>
      </aside>

      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.logo} aria-hidden>
            <Disc3 size={16} strokeWidth={1.75} />
          </span>
          <p className={styles.appName}>
            Song<span>catcher</span>
          </p>
        </div>
        <div className={styles.topbarActions}>
          <NavLink
            to="/debug"
            className={({ isActive }) => cn(styles.topbarLink, isActive && styles.topbarLinkActive)}
            aria-label="Logs"
          >
            <Terminal size={18} strokeWidth={1.75} aria-hidden />
          </NavLink>
          <ThemeSwitch />
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.content}>
          <Routes>
            <Route path="/" element={<SearchPage />} />
            <Route path="/youtube" element={<YoutubePage />} />
            <Route path="/deezer" element={<DeezerPage />} />
            <Route path="/files/*" element={<FilesPage />} />
            <Route path="/debug" element={<DebugPage />} />
            <Route path="/queue" element={<QueuePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>

      <nav className={styles.tabbar} aria-label="Primary">
        {TAB_ITEMS.map(({ to, tabLabel, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => cn(styles.tab, isActive && styles.tabActive)}
          >
            <span className={styles.tabIcon}>
              <Icon size={20} strokeWidth={1.75} aria-hidden />
              {to === '/queue' && pending > 0 ? (
                <span className={styles.tabBadge} aria-label={`${pending} in progress`}>
                  {pending > 99 ? '99+' : pending}
                </span>
              ) : null}
            </span>
            <span className={styles.tabLabel}>{tabLabel}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
