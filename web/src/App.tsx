import { Disc3, FolderOpen, ListMusic, ListTodo, Search, Terminal, Video, type LucideIcon } from 'lucide-react';
import { useEffect } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { ThemeSwitch } from './components/ThemeSwitch';
import { useAppConfig } from './hooks/useAppConfig';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
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
  tabLabel?: string;
  icon: LucideIcon;
  group: 'download' | 'collection' | 'system';
  end?: boolean;
}

const QUEUE_PATH = '/queue';
const LOGS_PATH = '/debug';

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Search', tabLabel: 'Search', icon: Search, group: 'download', end: true },
  { to: '/youtube', label: 'Video links', tabLabel: 'Links', icon: Video, group: 'download' },
  { to: '/deezer', label: 'Playlists', tabLabel: 'Playlists', icon: ListMusic, group: 'download' },
  { to: '/files', label: 'Library', tabLabel: 'Library', icon: FolderOpen, group: 'collection' },
  { to: LOGS_PATH, label: 'Logs', icon: Terminal, group: 'system' },
  { to: QUEUE_PATH, label: 'Queue', tabLabel: 'Queue', icon: ListTodo, group: 'collection' },
];

const NAV_PATHS = NAV_ITEMS.map((item) => item.to);

function Brand({ version }: { version?: string }) {
  return (
    <div className={styles.brand}>
      <span className={styles.logo} aria-hidden>
        <Disc3 size={14} strokeWidth={2} />
      </span>
      <p className={styles.appName}>Songcatcher</p>
      {version === undefined ? null : <span className={styles.version}>{version}</span>}
    </div>
  );
}

function SidebarLink({ item, pendingTasks }: { item: NavItem; pendingTasks: number }) {
  const { to, label, icon: Icon, end } = item;
  const shortcut = NAV_PATHS.indexOf(to) + 1;

  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => cn(styles.navLink, isActive && styles.navLinkActive)}
      title={`${label} (Ctrl+Shift+${shortcut})`}
    >
      <Icon size={15} strokeWidth={1.75} aria-hidden className={styles.navIcon} />
      <span className={styles.navLabel}>{label}</span>
      {to === QUEUE_PATH && pendingTasks > 0 ? <span className={styles.navCount}>{pendingTasks}</span> : null}
    </NavLink>
  );
}

function Sidebar({ pendingTasks }: { pendingTasks: number }) {
  const config = useAppConfig();
  const groupItems = (group: NavItem['group']) => NAV_ITEMS.filter((item) => item.group === group);

  return (
    <aside className={styles.sidebar}>
      <Brand version={config.data ? `v${config.data.version}` : '—'} />

      <nav className={styles.nav} aria-label="Main">
        {(
          [
            ['download', 'Download'],
            ['collection', 'Collection'],
          ] as const
        ).map(([group, heading]) => (
          <div key={group} className={styles.navGroup}>
            <p className={styles.navHeading}>{heading}</p>
            {groupItems(group).map((item) => (
              <SidebarLink key={item.to} item={item} pendingTasks={pendingTasks} />
            ))}
          </div>
        ))}
        <div className={cn(styles.navGroup, styles.navGroupEnd)}>
          {groupItems('system').map((item) => (
            <SidebarLink key={item.to} item={item} pendingTasks={pendingTasks} />
          ))}
        </div>
      </nav>

      <div className={styles.sidebarFooter}>
        {config.data?.useMpd ? (
          <p className={styles.mpd}>
            <span className={styles.mpdDot} aria-hidden />
            MPD linked
          </p>
        ) : null}
        <div className={styles.footerRow}>
          <ThemeSwitch />
          <p className={styles.shortcutHint}>
            <kbd>Ctrl</kbd>
            <kbd>M</kbd>
            <span>search</span>
          </p>
        </div>
      </div>
    </aside>
  );
}

function Toolbar({ pendingTasks }: { pendingTasks: number }) {
  const { pathname } = useLocation();
  const current = NAV_ITEMS.find(({ to, end }) => (end ? pathname === to : pathname.startsWith(to)));
  const Icon = current?.icon ?? Search;

  return (
    <div className={styles.toolbar}>
      <p className={styles.toolbarTitle}>
        <Icon size={15} strokeWidth={1.75} aria-hidden />
        {current?.label ?? 'Search'}
      </p>
      {pendingTasks > 0 && pathname !== QUEUE_PATH ? (
        <NavLink to={QUEUE_PATH} className={styles.toolbarChip}>
          <span className={styles.toolbarChipDot} aria-hidden />
          {pendingTasks} downloading
        </NavLink>
      ) : null}
    </div>
  );
}

function TopBar() {
  return (
    <header className={styles.topbar}>
      <Brand />
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

function TabBar({ pendingTasks }: { pendingTasks: number }) {
  return (
    <nav className={styles.tabbar} aria-label="Primary">
      {NAV_ITEMS.filter((item) => item.tabLabel).map(({ to, tabLabel, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => cn(styles.tab, isActive && styles.tabActive)}>
          <span className={styles.tabIcon}>
            <Icon size={20} strokeWidth={1.75} aria-hidden />
            {to === QUEUE_PATH && pendingTasks > 0 ? (
              <span className={styles.tabBadge} aria-label={`${pendingTasks} in progress`}>
                {pendingTasks > 99 ? '99+' : pendingTasks}
              </span>
            ) : null}
          </span>
          <span className={styles.tabLabel}>{tabLabel}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export default function App() {
  const { pathname } = useLocation();
  const { tasks } = useQueue();
  const pendingTasks = tasks.filter((task) => task.state === 'active' || task.state === 'waiting').length;

  useKeyboardShortcuts(NAV_PATHS);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className={styles.shell}>
      <Sidebar pendingTasks={pendingTasks} />
      <TopBar />

      <main className={styles.main}>
        <Toolbar pendingTasks={pendingTasks} />
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
