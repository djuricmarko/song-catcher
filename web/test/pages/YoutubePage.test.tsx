import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { YoutubePage } from '../../src/pages/YoutubePage';
import { jsonResponse, mockFetch, renderWithProviders } from '../utils';

const config = (useMpd: boolean) => ({ version: '1', useMpd, urlPrefix: '' });

beforeEach(() => {
  vi.spyOn(toast, 'success');
  vi.spyOn(toast, 'error');
});

describe('YoutubePage', () => {
  it('rejects non-http input', async () => {
    const fetchMock = mockFetch({ 'GET /config': config(false) });
    renderWithProviders(<YoutubePage />);
    await userEvent.type(screen.getByLabelText('Video URL'), 'ftp://x');
    await userEvent.click(screen.getByRole('button', { name: /Extract/ }));
    expect(toast.error).toHaveBeenCalledWith('Enter an http(s) URL');
    expect(fetchMock).not.toHaveBeenCalledWith('/api/youtubedl', expect.anything());
  });

  it('queues a download with the MPD option', async () => {
    let body: unknown;
    mockFetch({
      'GET /config': config(true),
      'POST /youtubedl': (init) => {
        body = JSON.parse(String(init?.body));
        return jsonResponse({ task_id: 7 });
      },
    });
    renderWithProviders(<YoutubePage />);
    await userEvent.click(await screen.findByText('Add to MPD playlist'));
    const input = screen.getByLabelText('Video URL');
    await userEvent.type(input, '  https://youtu.be/x  ');
    await userEvent.click(screen.getByRole('button', { name: /Extract/ }));
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Download queued', { description: 'Task #7' });
    });
    expect(body).toEqual({ url: 'https://youtu.be/x', add_to_playlist: true });
    expect(input).toHaveValue('');
  });

  it('downloads a playlist link as a playlist', async () => {
    let body: unknown;
    const fetchMock = mockFetch({
      'GET /config': config(true),
      'POST /playlist/youtube': (init) => {
        body = JSON.parse(String(init?.body));
        return jsonResponse({ task_id: 9 });
      },
    });
    renderWithProviders(<YoutubePage />);
    expect(screen.queryByText('Pack into a zip')).not.toBeInTheDocument();

    const input = screen.getByLabelText('Video URL');
    await userEvent.type(input, 'https://www.youtube.com/playlist?list=PL123');
    // A playlist page has no single video, so there is nothing to choose.
    expect(screen.queryByText('Download the entire playlist')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('Pack into a zip'));
    await userEvent.click(await screen.findByText('Add to MPD playlist'));
    await userEvent.click(screen.getByRole('button', { name: /Extract playlist/ }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Playlist queued', { description: 'Task #9' });
    });
    expect(body).toEqual({
      url: 'https://www.youtube.com/playlist?list=PL123',
      add_to_playlist: true,
      create_zip: true,
    });
    expect(fetchMock).not.toHaveBeenCalledWith('/api/youtubedl', expect.anything());
    expect(input).toHaveValue('');
    expect(screen.queryByText('Pack into a zip')).not.toBeInTheDocument();
  });

  it('downloads only the video of a playlist link unless asked for the playlist', async () => {
    const requests: Array<{ path: string; body: unknown }> = [];
    const record = (path: string) => (init?: RequestInit) => {
      requests.push({ path, body: JSON.parse(String(init?.body)) });
      return jsonResponse({ task_id: requests.length });
    };
    mockFetch({
      'GET /config': config(false),
      'POST /youtubedl': record('/youtubedl'),
      'POST /playlist/youtube': record('/playlist/youtube'),
    });
    renderWithProviders(<YoutubePage />);
    const link = 'https://www.youtube.com/watch?v=abc&list=PL123';
    const input = screen.getByLabelText('Video URL');

    await userEvent.type(input, link);
    expect(screen.getByText('Download the entire playlist')).toBeInTheDocument();
    expect(screen.queryByText('Pack into a zip')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Extract' }));
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Download queued', { description: 'Task #1' });
    });

    await userEvent.type(input, link);
    await userEvent.click(screen.getByText('Download the entire playlist'));
    expect(screen.getByText('Pack into a zip')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Extract playlist/ }));
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Playlist queued', { description: 'Task #2' });
    });

    expect(requests).toEqual([
      { path: '/youtubedl', body: { url: link, add_to_playlist: false } },
      { path: '/playlist/youtube', body: { url: link, add_to_playlist: false, create_zip: false } },
    ]);

    // The choice does not carry over to the next link.
    await userEvent.type(input, link);
    expect(screen.getByRole('button', { name: 'Extract' })).toBeInTheDocument();
  });

  it('shows API errors', async () => {
    mockFetch({
      'GET /config': config(false),
      'POST /youtubedl': () => jsonResponse({ error: 'Unsupported' }, { status: 400 }),
    });
    renderWithProviders(<YoutubePage />);
    await userEvent.type(screen.getByLabelText('Video URL'), 'https://x');
    await userEvent.click(screen.getByRole('button', { name: /Extract/ }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Unsupported');
    });
    expect(screen.queryByText('Add to MPD playlist')).not.toBeInTheDocument();
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
    renderWithProviders(<YoutubePage />);
    await userEvent.type(screen.getByLabelText('Video URL'), 'https://x');
    await userEvent.click(screen.getByRole('button', { name: /Extract/ }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('offline');
    });
  });
});
