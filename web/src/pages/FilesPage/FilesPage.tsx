import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Download, File, FileArchive, FileAudio, Folder, RefreshCw } from 'lucide-react';
import type { MouseEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import type { FileEntry } from '@song-catcher/shared';

import { downloadUrl, getFiles } from '../../api/client';
import { Alert } from '../../components/Alert';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { errorMessage } from '../../lib/errors';
import { formatFileSize, pluralize } from '../../lib/format';
import { encodePath, fileExtension } from '../../lib/paths';
import { saveFile } from '../../lib/saveFile';

import styles from './FilesPage.module.css';

const AUDIO_EXTENSIONS = new Set(['mp3', 'flac', 'm3u8']);
const SKELETON_ROWS = 5;

function FileIcon({ name }: { name: string }) {
  const extension = fileExtension(name);
  if (extension === 'zip') {
    return <FileArchive size={18} strokeWidth={1.5} className={styles.iconArchive} aria-hidden />;
  }
  if (AUDIO_EXTENSIONS.has(extension)) {
    return <FileAudio size={18} strokeWidth={1.5} className={styles.iconAudio} aria-hidden />;
  }
  return <File size={18} strokeWidth={1.5} className={styles.iconFile} aria-hidden />;
}

/** Saves a file through the "save as" dialog where the browser has one, reporting progress as a toast. */
async function onFileClick(event: MouseEvent<HTMLAnchorElement>, filePath: string, fileName: string) {
  // Let modified clicks (new tab, etc.) keep their normal link behaviour.
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }
  event.preventDefault();

  const toastId = `save-${filePath}`;
  try {
    const result = await saveFile(downloadUrl(filePath), fileName, () => {
      toast.loading('Saving…', { id: toastId, description: fileName });
    });
    if (result === 'saved') {
      toast.success('Saved', { id: toastId, description: fileName });
    }
  } catch (error) {
    toast.error(errorMessage(error), { id: toastId });
  }
}

/** The route that shows the directory at `path`, which is relative to the download folder. */
function filesRoute(path: string): string {
  return path ? `/files/${encodePath(path)}` : '/files';
}

function DirectoryRow({ entry }: { entry: FileEntry }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className={styles.entry}
      onClick={() => {
        void navigate(filesRoute(entry.path));
      }}
    >
      <Folder size={18} strokeWidth={1.5} className={styles.iconFolder} aria-hidden />
      <span className={styles.directoryName}>{entry.name}</span>
      <ChevronRight size={16} className={styles.entryTrail} aria-hidden />
    </button>
  );
}

function FileRow({ entry }: { entry: FileEntry }) {
  return (
    <a
      href={downloadUrl(entry.path)}
      download={entry.name}
      className={styles.entry}
      title={`Download ${entry.name}`}
      onClick={(event) => {
        void onFileClick(event, entry.path, entry.name);
      }}
    >
      <FileIcon name={entry.name} />
      <span className={styles.fileName}>{entry.name}</span>
      <span className={styles.fileSize}>{formatFileSize(entry.size)}</span>
      <Download size={15} className={styles.entryTrail} aria-hidden />
    </a>
  );
}

export function FilesPage() {
  const params = useParams();
  // The part of the URL after /files/ is the directory being shown.
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

  function renderListing() {
    if (files.isLoading) {
      return (
        <div className={styles.listing}>
          {Array.from({ length: SKELETON_ROWS }, (_, index) => (
            <div key={index} className={styles.skeleton} />
          ))}
        </div>
      );
    }
    if (entries.length > 0) {
      return (
        <ul className={styles.listing}>
          {entries.map((entry) => (
            <li key={`${entry.isDirectory ? 'd' : 'f'}-${entry.path}-${entry.name}`}>
              {entry.isDirectory ? <DirectoryRow entry={entry} /> : <FileRow entry={entry} />}
            </li>
          ))}
        </ul>
      );
    }
    if (files.data) {
      return <EmptyState title="This shelf is empty">Downloads show up here as soon as they finish.</EmptyState>;
    }
    // Loading failed; the alert above says why.
    return null;
  }

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
            {pluralize(folderCount, 'folder')} · {pluralize(fileCount, 'file')}
          </p>
        ) : null}
      </div>

      {files.isError ? (
        <Alert>Could not list files: {files.error instanceof Error ? files.error.message : 'unknown error'}</Alert>
      ) : null}

      {renderListing()}
    </div>
  );
}
