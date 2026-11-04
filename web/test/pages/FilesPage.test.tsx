import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as saveFileModule from '../../src/lib/saveFile';
import { FilesPage } from '../../src/pages/FilesPage';
import { jsonResponse, mockFetch, renderWithProviders } from '../utils';

const entry = (name: string, path: string, isDirectory = false, size = 0) => ({ name, path, isDirectory, size });

function renderFiles(route = '/files') {
  return renderWithProviders(<FilesPage />, { route, path: '/files/*' });
}

beforeEach(() => {
  vi.spyOn(toast, 'success');
  vi.spyOn(toast, 'error');
  vi.spyOn(toast, 'loading');
});

describe('FilesPage', () => {
  it('lists folders and files with sizes and counts', async () => {
    mockFetch({
      'GET /files?path=': {
        path: '',
        entries: [
          entry('Album', 'Album', true),
          entry('song.mp3', 'song.mp3', false, 512),
          entry('mix.zip', 'mix.zip', false, 3 * 1024 * 1024),
          entry('notes.txt', 'notes.txt', false, 0),
          entry('huge.flac', 'huge.flac', false, 2 ** 52),
        ],
      },
    });
    renderFiles();
    expect(await screen.findByText('1 folder · 4 files')).toBeInTheDocument();
    expect(screen.getByText('512 B')).toBeInTheDocument();
    expect(screen.getByText('3.0 MB')).toBeInTheDocument();
    expect(screen.getByText('4096.0 TB')).toBeInTheDocument();
    expect(screen.getByTitle('Download song.mp3')).toHaveAttribute('href', '/downloads/song.mp3');
    expect(screen.getByTitle('Download notes.txt')).toHaveAttribute('download', 'notes.txt');
  });

  it('shows an empty state with plural counts', async () => {
    mockFetch({ 'GET /files?path=': { path: '', entries: [] } });
    renderFiles();
    expect(await screen.findByText('This shelf is empty')).toBeInTheDocument();
    expect(screen.getByText('0 folders · 0 files')).toBeInTheDocument();
  });

  it('shows errors', async () => {
    mockFetch({ 'GET /files?path=': () => jsonResponse({ error: 'Outside root' }, { status: 400 }) });
    renderFiles();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not list files: Outside root');
  });

  it('navigates into folders and renders breadcrumbs', async () => {
    mockFetch({
      'GET /files?path=': { path: '', entries: [entry('My Album', 'Artist/My Album', true)] },
      'GET /files?path=Artist%2FMy%20Album': {
        path: 'Artist/My Album',
        entries: [entry('a.mp3', 'Artist/My Album/a.mp3')],
      },
    });
    renderFiles();
    await userEvent.click(await screen.findByRole('button', { name: 'My Album' }));
    expect(await screen.findByText('a.mp3')).toBeInTheDocument();
    const breadcrumb = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(breadcrumb).toHaveTextContent('downloads/Artist/My Album');
    expect(screen.getByRole('link', { name: 'Artist' })).toHaveAttribute('href', '/files/Artist');
    expect(screen.getByRole('link', { name: 'My Album' })).toHaveAttribute('href', '/files/Artist/My%20Album');
    expect(screen.getByRole('link', { name: 'downloads' })).toHaveAttribute('href', '/files');
  });

  it('refetches on refresh', async () => {
    const fetchMock = mockFetch({ 'GET /files?path=': { path: '', entries: [] } });
    renderFiles();
    await screen.findByText('This shelf is empty');
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('file clicks', () => {
    async function setup() {
      mockFetch({ 'GET /files?path=': { path: '', entries: [entry('a.mp3', 'dir/a.mp3', false, 10)] } });
      renderFiles();
      return screen.findByTitle('Download a.mp3');
    }

    it('saves through saveFile and reports progress', async () => {
      const save = vi.spyOn(saveFileModule, 'saveFile').mockImplementation(async (_url, _name, onStart) => {
        onStart?.();
        return 'saved';
      });
      const link = await setup();
      fireEvent.click(link);
      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('Saved', { id: 'save-dir/a.mp3', description: 'a.mp3' });
      });
      expect(save).toHaveBeenCalledWith('/downloads/dir/a.mp3', 'a.mp3', expect.any(Function));
      expect(toast.loading).toHaveBeenCalledWith('Saving…', { id: 'save-dir/a.mp3', description: 'a.mp3' });
    });

    it('stays quiet when the save is cancelled or falls back', async () => {
      const save = vi.spyOn(saveFileModule, 'saveFile').mockResolvedValue('cancelled');
      const link = await setup();
      fireEvent.click(link);
      await waitFor(() => {
        expect(save).toHaveBeenCalled();
      });
      expect(toast.success).not.toHaveBeenCalled();
    });

    it('reports save errors', async () => {
      vi.spyOn(saveFileModule, 'saveFile').mockRejectedValueOnce(new Error('disk full')).mockRejectedValueOnce('weird');
      const link = await setup();
      fireEvent.click(link);
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('disk full', { id: 'save-dir/a.mp3' });
      });
      fireEvent.click(link);
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('weird', { id: 'save-dir/a.mp3' });
      });
    });

    it.each([
      ['middle button', { button: 1 }],
      ['meta', { metaKey: true }],
      ['ctrl', { ctrlKey: true }],
      ['shift', { shiftKey: true }],
      ['alt', { altKey: true }],
    ])('keeps native behaviour for %s clicks', async (_name, init) => {
      const save = vi.spyOn(saveFileModule, 'saveFile');
      const link = await setup();
      let nativeDefaultPrevented: boolean | undefined;
      // Runs after React's handler; stops jsdom from attempting a real navigation.
      const stopNavigation = (event: Event) => {
        nativeDefaultPrevented = event.defaultPrevented;
        event.preventDefault();
      };
      document.addEventListener('click', stopNavigation);
      fireEvent.click(link, init);
      document.removeEventListener('click', stopNavigation);
      expect(nativeDefaultPrevented).toBe(false);
      expect(save).not.toHaveBeenCalled();
    });
  });
});
