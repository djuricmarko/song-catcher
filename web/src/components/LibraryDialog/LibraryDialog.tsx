import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Download, File, FileAudio, Folder, FolderOpen, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { toast } from 'sonner';

import type { FileEntry } from '@song-catcher/shared';

import { downloadUrl, getFiles } from '../../api/client';
import { errorMessage } from '../../lib/errors';
import { formatFileSize, pluralize } from '../../lib/format';
import { fileExtension } from '../../lib/paths';
import { saveFile } from '../../lib/saveFile';
import { Alert } from '../Alert';
import { EmptyState } from '../EmptyState';
import { LargeDialog, LargeDialogHeader } from '../LargeDialog';
import { Button } from '../ui/Button';

import styles from './LibraryDialog.module.css';

function FileIcon({ name }: { name: string }) {
  const Icon = ['mp3', 'flac', 'm3u8'].includes(fileExtension(name)) ? FileAudio : File;
  return <Icon size={15} strokeWidth={1.75} className={styles.entryIcon} aria-hidden />;
}

async function onFileClick(event: MouseEvent<HTMLAnchorElement>, filePath: string, fileName: string) {
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
      <span className={styles.entryName}>{entry.name}</span>
      <span className={styles.fileSize}>{formatFileSize(entry.size)}</span>
      <Download size={14} className={styles.entryTrail} aria-hidden />
    </a>
  );
}

function Library({ onClose }: { onClose: () => void }) {
  const [path, setPath] = useState('');
  const listingRef = useRef<HTMLDivElement>(null);
  const files = useQuery({
    queryKey: ['files', path],
    queryFn: () => getFiles(path),
  });

  useEffect(() => {
    if (listingRef.current) {
      listingRef.current.scrollTop = 0;
    }
  }, [path]);

  const segments = path.split('/').filter(Boolean);
  const entries = files.data?.entries ?? [];
  const folderCount = entries.filter((entry) => entry.isDirectory).length;

  function renderListing() {
    if (files.isLoading) {
      return (
        <div className={styles.listing}>
          {Array.from({ length: 5 }, (_, index) => (
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
              {entry.isDirectory ? (
                <button
                  type="button"
                  className={styles.entry}
                  onClick={() => {
                    setPath(entry.path);
                  }}
                >
                  <Folder size={15} strokeWidth={1.75} className={styles.entryIcon} aria-hidden />
                  <span className={styles.entryName}>{entry.name}</span>
                  <ChevronRight size={14} className={styles.entryTrail} aria-hidden />
                </button>
              ) : (
                <FileRow entry={entry} />
              )}
            </li>
          ))}
        </ul>
      );
    }
    if (files.data) {
      return <EmptyState title="This shelf is empty">Downloads show up here as soon as they finish.</EmptyState>;
    }
    return null;
  }

  return (
    <>
      <LargeDialogHeader
        title={
          <>
            <FolderOpen size={15} strokeWidth={1.75} aria-hidden />
            Library
          </>
        }
        actions={
          <>
            {files.data ? (
              <p className={styles.counts}>
                {pluralize(folderCount, 'folder')} · {pluralize(entries.length - folderCount, 'file')}
              </p>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              disabled={files.isFetching}
              onClick={() => {
                void files.refetch();
              }}
            >
              <RefreshCw size={13} aria-hidden className={files.isFetching ? styles.spinning : undefined} />
              Refresh
            </Button>
          </>
        }
        onClose={onClose}
      />

      <nav className={styles.breadcrumbs} aria-label="Folder">
        <button
          type="button"
          className={styles.crumb}
          onClick={() => {
            setPath('');
          }}
        >
          downloads
        </button>
        {segments.map((segment, index) => (
          <span key={index} className={styles.crumbGroup}>
            <span className={styles.crumbSeparator} aria-hidden>
              /
            </span>
            <button
              type="button"
              className={styles.crumb}
              onClick={() => {
                setPath(segments.slice(0, index + 1).join('/'));
              }}
            >
              {segment}
            </button>
          </span>
        ))}
      </nav>

      <div ref={listingRef} className={styles.body}>
        {files.isError ? <Alert>Could not list files: {errorMessage(files.error)}</Alert> : null}
        {renderListing()}
      </div>
    </>
  );
}

interface LibraryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LibraryDialog({ open, onOpenChange }: LibraryDialogProps) {
  return (
    <LargeDialog open={open} onOpenChange={onOpenChange} label="Library">
      <Library
        onClose={() => {
          onOpenChange(false);
        }}
      />
    </LargeDialog>
  );
}
