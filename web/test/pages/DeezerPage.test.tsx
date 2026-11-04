import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DeezerPage } from '../../src/pages/DeezerPage';
import { jsonResponse, mockFetch, renderWithProviders } from '../utils';

const config = (useMpd: boolean) => ({ version: '1', useMpd, urlPrefix: '' });

beforeEach(() => {
  vi.spyOn(toast, 'success');
  vi.spyOn(toast, 'error');
});

describe('DeezerPage playlist tab', () => {
  it('requires a playlist value', async () => {
    mockFetch({ 'GET /config': config(false) });
    renderWithProviders(<DeezerPage />);
    await userEvent.click(screen.getByRole('button', { name: /Download/ }));
    expect(toast.error).toHaveBeenCalledWith('Enter a Deezer playlist URL or id');
  });

  it('queues a playlist download with options', async () => {
    let body: unknown;
    mockFetch({
      'GET /config': config(true),
      'POST /playlist/deezer': (init) => {
        body = JSON.parse(String(init?.body));
        return jsonResponse({ task_id: 3 });
      },
    });
    renderWithProviders(<DeezerPage />);
    await userEvent.click(await screen.findByText('Add to MPD playlist'));
    await userEvent.click(screen.getByText('Pack into a zip'));
    const input = screen.getByLabelText('Deezer playlist URL');
    await userEvent.type(input, ' 12345 ');
    await userEvent.click(screen.getByRole('button', { name: /Download/ }));
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Playlist download queued', { description: 'Task #3' });
    });
    expect(body).toEqual({ playlist_url: '12345', add_to_playlist: true, create_zip: true });
    expect(input).toHaveValue('');
  });

  it('shows playlist errors', async () => {
    mockFetch({
      'GET /config': config(false),
      'POST /playlist/deezer': () => jsonResponse({ error: 'Private playlist' }, { status: 400 }),
    });
    renderWithProviders(<DeezerPage />);
    await userEvent.type(screen.getByLabelText('Deezer playlist URL'), '1');
    await userEvent.click(screen.getByRole('button', { name: /Download/ }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Private playlist');
    });
  });
});

describe('DeezerPage favorites tab', () => {
  async function openFavorites() {
    renderWithProviders(<DeezerPage />);
    await userEvent.click(screen.getByRole('tab', { name: /Favorites/ }));
    return screen.getByLabelText('Deezer user id');
  }

  it('requires a numeric user id', async () => {
    mockFetch({ 'GET /config': config(false) });
    const input = await openFavorites();
    await userEvent.type(input, 'abc');
    await userEvent.click(screen.getByRole('button', { name: /Download/ }));
    expect(toast.error).toHaveBeenCalledWith('The Deezer user id must be numeric');
  });

  it('queues a favorites download', async () => {
    let body: unknown;
    mockFetch({
      'GET /config': config(false),
      'POST /favorites/deezer': (init) => {
        body = JSON.parse(String(init?.body));
        return jsonResponse({ task_id: 4 });
      },
    });
    const input = await openFavorites();
    await userEvent.type(input, '42');
    await userEvent.click(screen.getByRole('button', { name: /Download/ }));
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Favorites download queued', { description: 'Task #4' });
    });
    expect(body).toEqual({ user_id: '42', add_to_playlist: false, create_zip: false });
    expect(input).toHaveValue('');
  });

  it('stringifies non-Error failures', async () => {
    mockFetch({ 'GET /config': config(false) });
    const original = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) =>
        init?.method === 'POST' ? Promise.reject('offline') : original(url, init),
      ),
    );
    const input = await openFavorites();
    await userEvent.type(input, '42');
    await userEvent.click(screen.getByRole('button', { name: /Download/ }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('offline');
    });
  });
});
