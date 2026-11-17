import { Ellipsis, PanelLeft } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

import { LibraryDialog } from './components/LibraryDialog';
import { LogsDialog } from './components/LogsDialog';
import { SettingsDialog } from './components/SettingsDialog';
import { Sidebar, type AppDialog } from './components/Sidebar';
import { SourceLabel } from './components/SourceLogo';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { cn } from './lib/cn';
import { desktopApp } from './lib/desktop';
import { DeezerPage } from './pages/DeezerPage';
import { YoutubePage } from './pages/YoutubePage';

import styles from './App.module.css';

const SIDEBAR_STORAGE_KEY = 'sc-sidebar';

const VIEWS: Array<{ path: string; crumbs: ReactNode[] }> = [
  {
    path: '/youtube',
    crumbs: [<SourceLabel key="source" source="youtube" className={styles.crumb} />, 'New Download'],
  },
  { path: '/deezer', crumbs: [<SourceLabel key="source" source="deezer" className={styles.crumb} />, 'New Download'] },
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
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(readSidebarCollapsed);
  const [dialog, setDialog] = useState<AppDialog | null>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const showMenu = desktopApp()?.showMenu;

  const shortcuts = useMemo(
    () => [
      ...VIEWS.map((view) => () => {
        setDialog(null);
        void navigate(view.path);
      }),
      () => {
        setDialog('library');
      },
      () => {
        setDialog('logs');
      },
    ],
    [navigate],
  );
  useKeyboardShortcuts(shortcuts);

  useEffect(
    () =>
      desktopApp()?.onOpenSettings(() => {
        setDialog('settings');
      }),
    [],
  );

  useEffect(() => {
    window.scrollTo(0, 0);
    if (viewRef.current) {
      viewRef.current.scrollTop = 0;
    }
  }, [pathname]);

  function closeDialogOn(name: AppDialog) {
    return (open: boolean) => {
      setDialog((current) => (open ? name : current === name ? null : current));
    };
  }

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
          onOpenDialog={setDialog}
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
            <Route path="*" element={<Navigate to="/youtube" replace />} />
          </Routes>
        </div>
      </main>

      <SettingsDialog open={dialog === 'settings'} onOpenChange={closeDialogOn('settings')} />
      <LogsDialog open={dialog === 'logs'} onOpenChange={closeDialogOn('logs')} />
      <LibraryDialog open={dialog === 'library'} onOpenChange={closeDialogOn('library')} />
    </div>
  );
}
