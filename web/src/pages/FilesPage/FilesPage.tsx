import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Download, File, FileArchive, FileAudio, Folder, RefreshCw } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { downloadUrl, getFiles } from '../../api/client';
import { Alert } from '../../components/Alert';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';

import styles from './FilesPage.module.css';

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
    return <FileArchive size={18} strokeWidth={1.5} className={styles.iconArchive} aria-hidden />;
  }
  if (extension === 'mp3' || extension === 'flac' || extension === 'm3u8') {
    return <FileAudio size={18} strokeWidth={1.5} className={styles.iconAudio} aria-hidden />;
  }
  return <File size={18} strokeWidth={1.5} className={styles.iconFile} aria-hidden />;
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

  const entries = files.data?.entries ?? [];
  const folderCount = entries.filter((entry) => entry.isDirectory).length;
  const fileCount = entries.length - folderCount;

  return (
    <div>
      <PageHeader
        index="04"
        eyebrow="Library"
        title={
          <>
            Everything <em>on the shelf</em>
          </>
        }
        description="Browse finished songs, album folders, playlists and zip archives. Click a file to download it."
        actions={
          <Button
            size="sm"
            variant="outline"
            disabled={files.isFetching}
            onClick={() => {
              void files.refetch();
            }}
          >
            <RefreshCw size={14} aria-hidden className={files.isFetching ? styles.spinning : undefined} />
            Refresh
          </Button>
        }
      />

      <div className={styles.toolbar}>
        <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
          <Link to="/files" className={styles.crumbLink}>
            downloads
          </Link>
          {breadcrumbs.map((crumb) => (
            <span key={crumb.path} className={styles.crumb}>
              <span className={styles.crumbSeparator} aria-hidden>
                /
              </span>
              <Link to={filesRoute(crumb.path)} className={styles.crumbLink}>
                {crumb.name}
              </Link>
            </span>
          ))}
        </nav>
        {files.data ? (
          <p className={styles.counts}>
            {folderCount} {folderCount === 1 ? 'folder' : 'folders'} · {fileCount} {fileCount === 1 ? 'file' : 'files'}
          </p>
        ) : null}
      </div>

      {files.isError ? (
        <Alert>Could not list files: {files.error instanceof Error ? files.error.message : 'unknown error'}</Alert>
      ) : null}

      {files.isLoading ? (
        <div className={styles.listing}>
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className={styles.skeleton} />
          ))}
        </div>
      ) : files.data && entries.length === 0 ? (
        <EmptyState title="This shelf is empty">Downloads show up here as soon as they finish.</EmptyState>
      ) : entries.length > 0 ? (
        <ul className={styles.listing}>
          {entries.map((entry) => (
            <li key={`${entry.isDirectory ? 'd' : 'f'}-${entry.path}-${entry.name}`}>
              {entry.isDirectory ? (
                <button
                  type="button"
                  className={styles.entry}
                  onClick={() => {
                    navigate(filesRoute(entry.path));
                  }}
                >
                  <Folder size={18} strokeWidth={1.5} className={styles.iconFolder} aria-hidden />
                  <span className={styles.directoryName}>{entry.name}</span>
                  <ChevronRight size={16} className={styles.entryTrail} aria-hidden />
                </button>
              ) : (
                <a href={downloadUrl(entry.path)} className={styles.entry}>
                  {fileIcon(entry.name)}
                  <span className={styles.fileName}>{entry.name}</span>
                  <span className={styles.fileSize}>{formatSize(entry.size)}</span>
                  <Download size={15} className={styles.entryTrail} aria-hidden />
                </a>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
