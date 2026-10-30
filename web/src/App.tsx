import {
  Bug,
  FolderOpen,
  ListMusic,
  ListTodo,
  Music2,
  Search,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { useEffect } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';

import { useAppConfig, useHealth } from './hooks/useAppConfig';
import { API_ROOT } from './api/client';
import { DebugPage } from './pages/DebugPage';
import { DeezerPage } from './pages/DeezerPage';
import { FilesPage } from './pages/FilesPage';
import { QueuePage } from './pages/QueuePage';
import { SearchPage } from './pages/SearchPage';
import { YoutubePage } from './pages/YoutubePage';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Search', icon: Search, end: true },
  { to: '/youtube', label: 'YouTube', icon: Video },
  { to: '/deezer', label: 'Deezer', icon: ListMusic },
  { to: '/files', label: 'Files', icon: FolderOpen },
  { to: '/debug', label: 'Debug', icon: Bug },
  { to: '/queue', label: 'Queue', icon: ListTodo },
];

function StatusBadge({ online }: { online: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        online ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
      }`}
    >
      <span
        className={`size-1.5 rounded-full ${online ? 'bg-emerald-500' : 'bg-rose-500'}`}
        aria-hidden
      />
      {online ? 'backend online' : 'backend offline'}
    </span>
  );
}

export default function App() {
  const config = useAppConfig();
  const health = useHealth();
  const navigate = useNavigate();

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
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-violet-600 text-white">
              <Music2 className="size-4" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold leading-tight text-zinc-900">Deezer Downloader</p>
              <p className="text-xs leading-tight text-zinc-500">
                {config.data ? `v${config.data.version}` : 'loading version…'}
              </p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {config.data?.useMpd ? (
              <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-800">
                MPD enabled
              </span>
            ) : null}
            <StatusBadge online={Boolean(health.data) && !health.isError} />
          </div>
        </div>

        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-violet-600 text-violet-700'
                    : 'border-transparent text-zinc-600 hover:border-zinc-300 hover:text-zinc-900'
                }`
              }
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {health.isError ? (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            Cannot reach the backend at <code className="font-mono text-xs">{API_ROOT}</code>. Is
            the server running?
          </div>
        ) : null}

        <Routes>
          <Route path="/" element={<SearchPage />} />
          <Route path="/youtube" element={<YoutubePage />} />
          <Route path="/deezer" element={<DeezerPage />} />
          <Route path="/files/*" element={<FilesPage />} />
          <Route path="/debug" element={<DebugPage />} />
          <Route path="/queue" element={<QueuePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
