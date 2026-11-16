import { ChartNoAxesColumn, Ellipsis, FolderOpen, PanelLeft } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { Sidebar } from './components/Sidebar';
import { SourceLabel } from './components/SourceLogo';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { cn } from './lib/cn';
import { desktopApp } from './lib/desktop';
import { DebugPage } from './pages/DebugPage';
import { DeezerPage } from './pages/DeezerPage';
import { FilesPage } from './pages/FilesPage';
import { YoutubePage } from './pages/YoutubePage';

import styles from './App.module.css';

const SIDEBAR_STORAGE_KEY = 'sc-sidebar';

const VIEWS: Array<{ path: string; crumbs: ReactNode[] }> = [
  {
    path: '/youtube',
    crumbs: [<SourceLabel key="source" source="youtube" className={styles.crumb} />, 'New Download'],
  },
  { path: '/deezer', crumbs: [<SourceLabel key="source" source="deezer" className={styles.crumb} />, 'New Download'] },
  {
    path: '/files',
    crumbs: [
      <span key="library" className={styles.crumb}>
        <FolderOpen size={14} strokeWidth={1.75} aria-hidden />
        Library
      </span>,
    ],
  },
  {
    path: '/debug',
    crumbs: [
      <span key="logs" className={styles.crumb}>
        <ChartNoAxesColumn size={14} strokeWidth={1.75} aria-hidden />
        Logs
      </span>,
    ],
  },
];

function readSidebarCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'collapsed';
  } catch {
    return false;
  }
}

function Breadcrumb() {
  const { pathname } = useLocation();
  const crumbs = VIEWS.find((view) => pathname.startsWith(view.path))?.crumbs ?? [];

  return (
    <nav className={styles.breadcrumb} aria-label="Breadcrumb">
      {crumbs.map((crumb, index) => (
        <span key={index} className={cn(styles.crumb, index === crumbs.length - 1 && styles.crumbCurrent)}>
          {index > 0 ? <span aria-hidden>/</span> : null}
          {crumb}
        </span>
      ))}
    </nav>
  );
}

export default function App() {
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(readSidebarCollapsed);
  const viewRef = useRef<HTMLDivElement>(null);
  const showMenu = desktopApp()?.showMenu;

  useKeyboardShortcuts(VIEWS.map((view) => view.path));

  useEffect(() => {
    window.scrollTo(0, 0);
    if (viewRef.current) {
      viewRef.current.scrollTop = 0;
    }
  }, [pathname]);

  function collapse(next: boolean) {
    setCollapsed(next);
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? 'collapsed' : 'open');
    } catch {}
  }

  return (
    <div className={cn(styles.shell, collapsed && styles.shellCollapsed)}>
      {collapsed ? null : (
        <Sidebar
          onCollapse={() => {
            collapse(true);
          }}
        />
      )}

      <main className={styles.main}>
        <header className={cn(styles.header, 'drag-region')}>
          {collapsed ? (
            <button
              type="button"
              className={cn(styles.headerButton, styles.expand)}
              aria-label="Show sidebar"
              title="Show sidebar"
              onClick={() => {
                collapse(false);
              }}
            >
              <PanelLeft size={14} strokeWidth={1.75} aria-hidden />
            </button>
          ) : null}
          <Breadcrumb />
          {showMenu ? (
            <button
              type="button"
              className={cn(styles.headerButton, styles.appMenu)}
              aria-label="Menu"
              title="Menu"
              onClick={(event) => {
                const { left, bottom } = event.currentTarget.getBoundingClientRect();
                showMenu(left, bottom + 4);
              }}
            >
              <Ellipsis size={14} strokeWidth={1.75} aria-hidden />
            </button>
          ) : null}
        </header>
        <div ref={viewRef} className={styles.view}>
          <Routes>
            <Route path="/youtube" element={<YoutubePage />} />
            <Route path="/deezer" element={<DeezerPage />} />
            <Route path="/files/*" element={<FilesPage />} />
            <Route path="/debug" element={<DebugPage />} />
            <Route path="*" element={<Navigate to="/youtube" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
