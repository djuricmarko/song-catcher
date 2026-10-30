import { useQuery } from '@tanstack/react-query';
import { ChevronRight, File, FileArchive, FileAudio, Folder, Home } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { downloadUrl, getFiles } from '../api/client';
import { Button } from '../components/ui/Button';

function formatSize(bytes: number): string {
  if (bytes <= 0) {
    return '';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function fileIcon(name: string) {
  const extension = name.split('.').pop()?.toLowerCase();
  if (extension === 'zip') {
    return <FileArchive className="size-4 text-amber-600" aria-hidden />;
  }
  if (extension === 'mp3' || extension === 'flac' || extension === 'm3u8') {
    return <FileAudio className="size-4 text-violet-600" aria-hidden />;
  }
  return <File className="size-4 text-zinc-400" aria-hidden />;
}

function filesRoute(path: string): string {
  if (!path) {
    return '/files';
  }
  return `/files/${path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`;
}

export function FilesPage() {
  const params = useParams();
  const navigate = useNavigate();
  const currentPath = params['*'] ?? '';

  const files = useQuery({
    queryKey: ['files', currentPath],
    queryFn: () => getFiles(currentPath),
  });

  const segments = currentPath.split('/').filter(Boolean);
  const breadcrumbs = segments.map((segment, index) => ({
    name: segment,
    path: segments.slice(0, index + 1).join('/'),
  }));

  return (
    <div className="space-y-4">
      <section>
        <h1 className="text-xl font-semibold text-zinc-900">Downloaded files</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Browse songs, album folders, playlists and zip archives. File links open the download
          directly.
        </p>
      </section>

      <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label="Breadcrumb">
        <Link
          to="/files"
          className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
        >
          <Home className="size-3.5" aria-hidden />
          Downloads
        </Link>
        {breadcrumbs.map((crumb) => (
          <span key={crumb.path} className="inline-flex items-center gap-1">
            <ChevronRight className="size-3.5 text-zinc-400" aria-hidden />
            <Link
              to={filesRoute(crumb.path)}
              className="rounded px-1.5 py-1 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            >
              {crumb.name}
            </Link>
          </span>
        ))}
      </nav>

      {files.isError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          Could not list files:{' '}
          {files.error instanceof Error ? files.error.message : 'unknown error'}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        {files.isLoading ? (
          <p className="px-4 py-10 text-center text-sm text-zinc-500">Loading…</p>
        ) : files.data && files.data.entries.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <Folder className="mx-auto size-8 text-zinc-300" aria-hidden />
            <p className="mt-2 text-sm font-medium text-zinc-700">This folder is empty</p>
            <p className="mt-1 text-sm text-zinc-500">
              Downloads will appear here when they finish.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {files.data?.entries.map((entry) => (
              <li key={`${entry.isDirectory ? 'd' : 'f'}-${entry.path}-${entry.name}`}>
                {entry.isDirectory ? (
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-zinc-50"
                    onClick={() => {
                      navigate(filesRoute(entry.path));
                    }}
                  >
                    <Folder className="size-4 text-amber-600" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-800">
                      {entry.name}
                    </span>
                    <ChevronRight className="size-4 text-zinc-300" aria-hidden />
                  </button>
                ) : (
                  <a
                    href={downloadUrl(entry.path)}
                    className="flex items-center gap-3 px-4 py-3 transition hover:bg-zinc-50"
                  >
                    {fileIcon(entry.name)}
                    <span className="min-w-0 flex-1 truncate text-sm text-zinc-800">
                      {entry.name}
                    </span>
                    <span className="text-xs text-zinc-400">{formatSize(entry.size)}</span>
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Button
        size="sm"
        variant="outline"
        disabled={files.isFetching}
        onClick={() => {
          void files.refetch();
        }}
      >
        Refresh
      </Button>
    </div>
  );
}
