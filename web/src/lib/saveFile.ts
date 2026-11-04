// Minimal typing for the File System Access API (not in TypeScript's DOM lib).
interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: Array<{ description?: string; accept: Record<string, string[]> }>;
}

interface FileSystemWritableStream extends WritableStream<Uint8Array> {
  close(): Promise<void>;
}

interface SaveFileHandle {
  createWritable(): Promise<FileSystemWritableStream>;
}

type ShowSaveFilePicker = (options?: SaveFilePickerOptions) => Promise<SaveFileHandle>;

const MIME_BY_EXTENSION: Record<string, string> = {
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  m3u8: 'application/vnd.apple.mpegurl',
  zip: 'application/zip',
};

export type SaveResult = 'saved' | 'cancelled' | 'fallback';

function fallbackDownload(url: string, fileName: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
}

/**
 * Asks the user where to save `fileName`, then streams `url` into it.
 *
 * Browsers without the File System Access API (Firefox, Safari) fall back to
 * a regular download; whether they ask for a location then depends on the
 * browser's own "always ask where to save files" setting.
 */
export async function saveFile(url: string, fileName: string, onStart?: () => void): Promise<SaveResult> {
  const picker = (window as { showSaveFilePicker?: ShowSaveFilePicker }).showSaveFilePicker;
  if (!picker) {
    fallbackDownload(url, fileName);
    return 'fallback';
  }

  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  const mime = MIME_BY_EXTENSION[extension];

  let handle: SaveFileHandle;
  try {
    // Must run before any await so it still counts as a user gesture.
    handle = await picker.call(window, {
      suggestedName: fileName,
      ...(mime ? { types: [{ accept: { [mime]: [`.${extension}`] } }] } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return 'cancelled';
    }
    throw error;
  }

  onStart?.();
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }
  const writable = await handle.createWritable();
  // pipeTo closes the writable on success and aborts it on failure.
  await response.body.pipeTo(writable);
  return 'saved';
}
