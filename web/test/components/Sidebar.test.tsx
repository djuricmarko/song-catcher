import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { QueueTask } from '@song-catcher/shared';

import { Sidebar } from '../../src/components/Sidebar';
import { MockEventSource, jsonResponse, makeTask, mockFetch, renderWithProviders } from '../utils';

function renderSidebar(tasks: QueueTask[] = [], onCollapse = vi.fn()) {
  mockFetch({ 'GET /queue': [], 'GET /config': { version: '9.9.9', useMpd: true, urlPrefix: '' } });
  renderWithProviders(<Sidebar onCollapse={onCollapse} />, { withQueue: true });
  act(() => {
    MockEventSource.latest().emit('snapshot', tasks);
  });
  return onCollapse;
}

function titles(listName: string): Array<string | null> {
  return within(screen.getByRole('list', { name: listName }))
    .getAllByRole('listitem')
    .map((item) => item.querySelector('.title')?.textContent ?? null);
}

const QUEUE = [
  makeTask({ id: 1, title: 'Old song', state: 'mission accomplished' }),
  makeTask({ id: 2, title: 'Broken list', kind: 'playlist', state: 'failed', exception: 'boom' }),
  makeTask({ id: 3, title: 'Waiting song', source: 'youtube', state: 'waiting' }),
  makeTask({ id: 4, title: 'Running album', kind: 'album', subtitle: 'Band', state: 'active', progress: [3, 12] }),
  makeTask({ id: 5, title: 'New song', state: 'mission accomplished' }),
];

afterEach(() => {
  delete window.songCatcherApp;
});

describe('Sidebar queue', () => {
  it('says so when nothing is downloading', () => {
    renderSidebar();
    expect(screen.getByText('No downloads in progress')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Completed/ })).toHaveTextContent('0');
  });

  it('shows load errors', async () => {
    mockFetch({ 'GET /queue': () => jsonResponse({ error: 'down' }, { status: 500 }) });
    renderWithProviders(<Sidebar onCollapse={vi.fn()} />, { withQueue: true });
    expect(await screen.findByText('Could not load the queue: down')).toBeInTheDocument();
  });

  it('lists running downloads first, then waiting and failed ones, and counts the completed', () => {
    renderSidebar(QUEUE);
    expect(titles('Downloads')).toEqual(['Running album', 'Waiting song', 'Broken list']);
    expect(screen.getByRole('button', { name: /Completed/ })).toHaveTextContent('2');
    expect(screen.queryByRole('list', { name: 'Completed downloads' })).not.toBeInTheDocument();

    const downloads = screen.getByRole('list', { name: 'Downloads' });
    expect(within(downloads).getByText('Downloading')).toBeInTheDocument();
    expect(within(downloads).getByText('Waiting')).toBeInTheDocument();
    expect(within(downloads).getByText('Failed')).toBeInTheDocument();
    expect(within(downloads).getByText('Band')).toBeInTheDocument();
    expect(within(downloads).getByText('YouTube')).toBeInTheDocument();
  });

  it('expands the completed downloads, newest first', async () => {
    renderSidebar(QUEUE);
    const toggle = screen.getByRole('button', { name: /Completed/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(titles('Completed downloads')).toEqual(['New song', 'Old song']);
    expect(within(screen.getByRole('list', { name: 'Completed downloads' })).getAllByText('Done')).toHaveLength(2);

    await userEvent.click(toggle);
    expect(screen.queryByRole('list', { name: 'Completed downloads' })).not.toBeInTheDocument();
  });

  it('says so when nothing has completed yet', async () => {
    renderSidebar([makeTask({ state: 'waiting' })]);
    await userEvent.click(screen.getByRole('button', { name: /Completed/ }));
    expect(screen.getByText('Nothing completed yet')).toBeInTheDocument();
  });

  it('filters by text and by source', async () => {
    renderSidebar(QUEUE);
    await userEvent.click(screen.getByRole('button', { name: /Completed/ }));

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search downloads' }), ' SONG ');
    expect(titles('Downloads')).toEqual(['Waiting song']);
    expect(titles('Completed downloads')).toEqual(['New song', 'Old song']);

    await userEvent.click(screen.getByRole('button', { name: 'Filter downloads' }));
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Deezer' }));
    expect(screen.queryByRole('list', { name: 'Downloads' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Nothing matches')).toHaveLength(1);
    expect(titles('Completed downloads')).toEqual(['New song', 'Old song']);

    await userEvent.clear(screen.getByRole('searchbox', { name: 'Search downloads' }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search downloads' }), 'band');
    expect(titles('Downloads')).toEqual(['Running album']);
    expect(screen.getByText('Nothing matches')).toBeInTheDocument();
  });

  it('shows the details of a download on hover', async () => {
    renderSidebar([
      makeTask({
        id: 7,
        source: 'youtube',
        title: 'Pantera - Walk (Official Music Video)',
        date: '2009-10-03',
        state: 'mission accomplished',
        result: ['/music/youtube-dl/Pantera - Walk.mp3'],
        sizeBytes: 49 * 1024 * 1024,
      }),
    ]);
    await userEvent.click(screen.getByRole('button', { name: /Completed/ }));
    const item = within(screen.getByRole('list', { name: 'Completed downloads' })).getByRole('listitem');
    expect(within(item).getByText('Oct 3, 2009')).toBeInTheDocument();

    await userEvent.hover(item.firstElementChild as HTMLElement);
    const card = await waitFor(() => {
      const popup = document.querySelector<HTMLElement>('.card');
      expect(popup).not.toBeNull();
      return popup as HTMLElement;
    });
    expect(card).toHaveTextContent('Pantera - Walk (Official Music Video)');
    expect(card).toHaveTextContent('Oct 3, 2009');
    expect(card).toHaveTextContent('yt-dlp');
    expect(card).toHaveTextContent('.mp3');
    expect(card).toHaveTextContent('49.0 MB');
  });

  it('shows progress, skipped songs and the failure of a collection', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 16, 18, 20, 0));
    renderSidebar([
      makeTask({
        kind: 'playlist',
        title: 'Road Trip',
        state: 'failed',
        tsQueued: Date.now(),
        progress: [4, 12],
        warnings: ['one failed'],
        exception: 'Deezer said no',
        result: ['/music/a.mp3', '/music/b.flac', '/music/00 Road Trip.m3u8'],
      }),
    ]);
    vi.useRealTimers();
    const item = within(screen.getByRole('list', { name: 'Downloads' })).getByRole('listitem');
    expect(within(item).getByText(/^Queued /)).toBeInTheDocument();

    await userEvent.hover(item.firstElementChild as HTMLElement);
    const card = await waitFor(() => {
      const popup = document.querySelector<HTMLElement>('.card');
      expect(popup).not.toBeNull();
      return popup as HTMLElement;
    });
    expect(card).toHaveTextContent('Nov 16, 2026');
    expect(card).toHaveTextContent('Deezer');
    expect(card).toHaveTextContent('.mp3, .flac');
    expect(card).toHaveTextContent('4 of 12 songs');
    expect(card).toHaveTextContent('1 song skipped');
    expect(card).toHaveTextContent('Deezer said no');
  });

  it('draws a progress bar for a running collection only', () => {
    renderSidebar([
      makeTask({ id: 1, kind: 'album', state: 'active', progress: [3, 12] }),
      makeTask({ id: 2, state: 'active', progress: [0, 1] }),
    ]);
    const bars = document.querySelectorAll<HTMLElement>('.progress > span');
    expect(bars).toHaveLength(1);
    expect(bars[0]?.style.inlineSize).toBe('25%');
  });
});

describe('Sidebar controls', () => {
  it('collapses on request', async () => {
    const onCollapse = renderSidebar();
    await userEvent.click(screen.getByRole('button', { name: 'Hide sidebar' }));
    expect(onCollapse).toHaveBeenCalledOnce();
  });

  it('links to the logs and the library next to the settings', () => {
    renderSidebar();
    expect(screen.getByRole('link', { name: 'Logs' })).toHaveAttribute('href', '/debug');
    expect(screen.getByRole('link', { name: 'Library' })).toHaveAttribute('href', '/files');
  });

  it('opens the theme and version settings in the browser', async () => {
    renderSidebar();
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const dialog = await screen.findByRole('dialog', { name: 'Settings' });
    expect(await within(dialog).findByText('v9.9.9')).toBeInTheDocument();
    expect(within(dialog).getByText('Linked')).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Dark theme' }));
    expect(document.documentElement.dataset.theme).toBe('dark');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Close settings' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the desktop settings window in the desktop app', async () => {
    const openSettings = vi.fn();
    window.songCatcherApp = { openSettings };
    renderSidebar();
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(openSettings).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
