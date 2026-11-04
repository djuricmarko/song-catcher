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
