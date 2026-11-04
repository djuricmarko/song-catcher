import { afterEach, describe, expect, it, vi } from 'vitest';

import { saveFile } from '../../src/lib/saveFile';

type PickerWindow = Window & { showSaveFilePicker?: unknown };

function installPicker(impl: (...args: unknown[]) => unknown) {
  const picker = vi.fn(impl);
  (window as PickerWindow).showSaveFilePicker = picker;
  return picker;
}

function makeHandle() {
  const chunks: Uint8Array[] = [];
  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      chunks.push(chunk);
    },
  });
  return { chunks, handle: { createWritable: vi.fn(async () => writable) } };
}

afterEach(() => {
  delete (window as PickerWindow).showSaveFilePicker;
});

describe('saveFile', () => {
  it('falls back to an anchor download without the File System Access API', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const result = await saveFile('/downloads/a.mp3', 'a.mp3');
    expect(result).toBe('fallback');
    expect(click).toHaveBeenCalledOnce();
    const anchor = click.mock.contexts[0] as HTMLAnchorElement;
    expect(anchor.download).toBe('a.mp3');
    expect(anchor.getAttribute('href')).toBe('/downloads/a.mp3');
    expect(anchor.rel).toBe('noopener');
    expect(anchor.isConnected).toBe(false);
  });

  it('streams the response into the picked file', async () => {
    const { chunks, handle } = makeHandle();
    const picker = installPicker(async () => handle);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('audio-bytes')),
    );
    const onStart = vi.fn();

    const result = await saveFile('/downloads/a.flac', 'Song.FLAC', onStart);

    expect(result).toBe('saved');
    expect(picker).toHaveBeenCalledWith({
      suggestedName: 'Song.FLAC',
      types: [{ accept: { 'audio/flac': ['.flac'] } }],
    });
    expect(onStart).toHaveBeenCalledOnce();
    expect(new TextDecoder().decode(chunks[0])).toBe('audio-bytes');
  });

  it('omits file types for unknown extensions', async () => {
    const { handle } = makeHandle();
    const picker = installPicker(async () => handle);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('x')),
    );
    await saveFile('/downloads/notes', 'notes', undefined);
    expect(picker).toHaveBeenCalledWith({ suggestedName: 'notes' });
  });

  it('reports cancellation when the picker is dismissed', async () => {
    installPicker(async () => {
      throw new DOMException('dismissed', 'AbortError');
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(saveFile('/x.zip', 'x.zip')).resolves.toBe('cancelled');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rethrows other picker errors', async () => {
    installPicker(async () => {
      throw new DOMException('nope', 'SecurityError');
    });
    await expect(saveFile('/x.zip', 'x.zip')).rejects.toThrow('nope');
  });

  it('throws when the download fails', async () => {
    const { handle } = makeHandle();
    installPicker(async () => handle);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 500, statusText: 'Server Error' })),
    );
    await expect(saveFile('/x.mp3', 'x.mp3')).rejects.toThrow('Download failed: 500 Server Error');
    expect(handle.createWritable).not.toHaveBeenCalled();
  });
});
