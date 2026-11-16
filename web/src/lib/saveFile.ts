import { fileExtension } from './paths';

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

export async function saveFile(url: string, fileName: string, onStart?: () => void): Promise<SaveResult> {
  const picker = (window as { showSaveFilePicker?: ShowSaveFilePicker }).showSaveFilePicker;
  if (!picker) {
    fallbackDownload(url, fileName);
    return 'fallback';
  }

  const extension = fileExtension(fileName);
  const mime = new Map([
    ['mp3', 'audio/mpeg'],
    ['flac', 'audio/flac'],
    ['m3u8', 'application/vnd.apple.mpegurl'],
  ]).get(extension);

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
  await response.body.pipeTo(writable);
  return 'saved';
}
