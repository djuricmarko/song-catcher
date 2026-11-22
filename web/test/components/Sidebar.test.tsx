import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { QueueTask } from '@song-catcher/shared';

import { Sidebar } from '../../src/components/Sidebar';
import { MockEventSource, jsonResponse, makeTask, mockFetch, renderWithProviders } from '../utils';

function renderSidebar(tasks: QueueTask[] = []) {
  const onCollapse = vi.fn();
  const onOpenDialog = vi.fn();
  mockFetch({ 'GET /queue': [] });
  renderWithProviders(<Sidebar onCollapse={onCollapse} onOpenDialog={onOpenDialog} />, { withQueue: true });
  act(() => {
    MockEventSource.latest().emit('snapshot', tasks);
  });
  return { onCollapse, onOpenDialog };
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

describe('Sidebar queue', () => {
  it('says so when nothing is downloading', () => {
    renderSidebar();
    expect(screen.getByText('No downloads in progress')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Completed/ })).toHaveTextContent('0');
  });

  it('shows load errors', async () => {
    mockFetch({ 'GET /queue': () => jsonResponse({ error: 'down' }, { status: 500 }) });
    renderWithProviders(<Sidebar onCollapse={vi.fn()} onOpenDialog={vi.fn()} />, { withQueue: true });
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
        speedBps: 7_787_500,
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
    expect(card).toHaveTextContent('62.3 Mbps');
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

  it('fills a progress ring by songs for a collection, by bytes for a single file, and spins otherwise', () => {
    renderSidebar([
      makeTask({ id: 1, kind: 'album', state: 'active', progress: [3, 12], fileProgress: 0.9 }),
      makeTask({ id: 2, state: 'active', progress: [0, 1], fileProgress: 0.4 }),
      makeTask({ id: 3, source: 'youtube', state: 'active', fileProgress: null }),
    ]);
    const arcs = [...document.querySelectorAll('.ring circle:last-child')].map((arc) =>
      arc.getAttribute('stroke-dasharray'),
    );
    expect(arcs.sort()).toEqual(['25 100', '40 100']);
    expect(document.querySelectorAll('.spinner')).toHaveLength(1);
  });
});

describe('Sidebar controls', () => {
  it('collapses on request', async () => {
    const { onCollapse } = renderSidebar();
    await userEvent.click(screen.getByRole('button', { name: 'Hide sidebar' }));
    expect(onCollapse).toHaveBeenCalledOnce();
  });

  it('opens the settings, the logs and the library', async () => {
    const { onOpenDialog } = renderSidebar();
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await userEvent.click(screen.getByRole('button', { name: 'Logs' }));
    await userEvent.click(screen.getByRole('button', { name: 'Library' }));
    expect(onOpenDialog.mock.calls).toEqual([['settings'], ['logs'], ['library']]);
  });
});
