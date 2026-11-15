import { Disc3, FolderOpen, ListMusic, ListTodo, Search, Terminal, Video, type LucideIcon } from 'lucide-react';
import { useEffect } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { ThemeSwitch } from './components/ThemeSwitch';
import { useAppConfig } from './hooks/useAppConfig';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useQueue } from './hooks/useQueue';
import { cn } from './lib/cn';
import { formatIndex } from './lib/format';
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
  /** Match the path exactly, so "/" is not active on every page. */
  end?: boolean;
}

const QUEUE_PATH = '/queue';
const LOGS_PATH = '/debug';

/** In sidebar order, which is also the order of the Ctrl+Shift+<n> shortcuts. */
const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Search', tabLabel: 'Search', icon: Search, end: true },
  { to: '/youtube', label: 'Video links', tabLabel: 'Links', icon: Video },
  { to: '/deezer', label: 'Playlists', tabLabel: 'Playlists', icon: ListMusic },
  { to: '/files', label: 'Library', tabLabel: 'Library', icon: FolderOpen },
  { to: LOGS_PATH, label: 'Logs', icon: Terminal },
  { to: QUEUE_PATH, label: 'Queue', tabLabel: 'Queue', icon: ListTodo },
];

const TAB_ITEMS = NAV_ITEMS.filter((item) => item.tabLabel);
const NAV_PATHS = NAV_ITEMS.map((item) => item.to);
/** The tab badge has room for two digits. */
const MAX_BADGE_COUNT = 99;

/** Logo and app name. With a `version` it becomes the two-line variant used in the sidebar. */
function Brand({ logoSize, version }: { logoSize: number; version?: string }) {
  const appName = (
    <p className={styles.appName}>
      Song<span>catcher</span>
    </p>
  );

  return (
    <div className={styles.brand}>
      <span className={styles.logo} aria-hidden>
        <Disc3 size={logoSize} strokeWidth={1.75} />
      </span>
      {version === undefined ? (
        appName
      ) : (
        <div className={styles.brandText}>
          {appName}
          <p className={styles.version}>{version}</p>
        </div>
      )}
    </div>
  );
}

/** Desktop navigation. */
function Sidebar({ pendingTasks }: { pendingTasks: number }) {
  const config = useAppConfig();

  return (
    <aside className={styles.sidebar}>
      <Brand logoSize={18} version={config.data ? `v${config.data.version}` : '—'} />

      <nav className={styles.nav} aria-label="Main">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }, index) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => cn(styles.navLink, isActive && styles.navLinkActive)}
            title={`${label} (Ctrl+Shift+${index + 1})`}
          >
            <span className={styles.navIndex}>{formatIndex(index + 1)}</span>
            <Icon size={16} strokeWidth={1.75} aria-hidden className={styles.navIcon} />
            <span className={styles.navLabel}>{label}</span>
            {to === QUEUE_PATH && pendingTasks > 0 ? <span className={styles.navCount}>{pendingTasks}</span> : null}
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
  );
}

/** Phone header: the brand plus what has no room in the tab bar. */
function TopBar() {
  return (
    <header className={styles.topbar}>
      <Brand logoSize={16} />
      <div className={styles.topbarActions}>
        <NavLink
          to={LOGS_PATH}
          className={({ isActive }) => cn(styles.topbarLink, isActive && styles.topbarLinkActive)}
          aria-label="Logs"
        >
          <Terminal size={18} strokeWidth={1.75} aria-hidden />
        </NavLink>
        <ThemeSwitch />
      </div>
    </header>
  );
}

/** Phone navigation along the bottom edge. */
function TabBar({ pendingTasks }: { pendingTasks: number }) {
  return (
    <nav className={styles.tabbar} aria-label="Primary">
      {TAB_ITEMS.map(({ to, tabLabel, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => cn(styles.tab, isActive && styles.tabActive)}>
          <span className={styles.tabIcon}>
            <Icon size={20} strokeWidth={1.75} aria-hidden />
            {to === QUEUE_PATH && pendingTasks > 0 ? (
              <span className={styles.tabBadge} aria-label={`${pendingTasks} in progress`}>
                {pendingTasks > MAX_BADGE_COUNT ? `${MAX_BADGE_COUNT}+` : pendingTasks}
              </span>
            ) : null}
          </span>
          <span className={styles.tabLabel}>{tabLabel}</span>
        </NavLink>
      ))}
    </nav>
  );
}

/**
 * The app shell. CSS shows either the sidebar (wide screens) or the top bar
 * and tab bar (phones); all three are always rendered.
 */
export default function App() {
  const { pathname } = useLocation();
  const { tasks } = useQueue();
  const pendingTasks = tasks.filter((task) => task.state === 'active' || task.state === 'waiting').length;

  useKeyboardShortcuts(NAV_PATHS);

  // Each page starts at the top, like switching tabs in a native app.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className={styles.shell}>
      <Sidebar pendingTasks={pendingTasks} />
      <TopBar />

      <main className={styles.main}>
        <div className={styles.content}>
          <Routes>
            <Route path="/" element={<SearchPage />} />
            <Route path="/youtube" element={<YoutubePage />} />
            <Route path="/deezer" element={<DeezerPage />} />
            <Route path="/files/*" element={<FilesPage />} />
            <Route path={LOGS_PATH} element={<DebugPage />} />
            <Route path={QUEUE_PATH} element={<QueuePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>

      <TabBar pendingTasks={pendingTasks} />
    </div>
  );
}
