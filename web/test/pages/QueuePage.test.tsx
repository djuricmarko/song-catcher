import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { QueuePage } from '../../src/pages/QueuePage';
import { MockEventSource, jsonResponse, makeTask, mockFetch, renderWithProviders } from '../utils';

function renderQueue() {
  renderWithProviders(<QueuePage />, { withQueue: true });
  return MockEventSource.latest();
}

afterEach(() => {
  vi.useRealTimers();
});

describe('QueuePage', () => {
  it('shows the empty state and reconnecting badge', () => {
    mockFetch({ 'GET /queue': [] });
    renderQueue();
    expect(screen.getByText('Nothing spinning yet')).toBeInTheDocument();
    expect(screen.getByText('Reconnecting')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Search' })).toHaveAttribute('href', '/');
  });

  it('shows load errors', async () => {
    mockFetch({ 'GET /queue': () => jsonResponse({ error: 'down' }, { status: 500 }) });
    renderQueue();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the queue: down');
  });

  it('renders tasks newest first with a summary', () => {
    mockFetch({ 'GET /queue': [] });
    const source = renderQueue();
    act(() => {
      source.onopen?.();
      source.emit('snapshot', [
        makeTask({ id: 1, description: 'first', state: 'mission accomplished' }),
        makeTask({ id: 2, description: 'second', state: 'active' }),
        makeTask({ id: 3, description: 'third', state: 'active' }),
      ]);
    });
    expect(screen.getByText('Live')).toBeInTheDocument();
    const items = screen.getAllByRole('listitem').filter((item) => item.textContent?.includes('#00'));
    expect(items.map((item) => within(item).getByText(/^#/).textContent)).toEqual(['#003', '#002', '#001']);

    const summary = screen.getByText('Running').closest('dl');
    expect(summary).not.toBeNull();
    const values = within(summary as HTMLElement)
      .getAllByRole('definition')
      .map((node) => node.textContent);
    expect(values).toEqual(['2', '0', '1', '0']);
  });

  it('shows timing, worker, progress and results of a finished task', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 0));
    mockFetch({ 'GET /queue': [] });
    const source = renderQueue();
    const start = new Date(2026, 0, 1, 11, 0, 0).getTime();
    act(() => {
      source.emit('snapshot', [
        makeTask({
          id: 5,
          state: 'mission accomplished',
          tsQueued: start - 1000,
          tsStarted: start,
          tsFinished: start + 125_000,
          workerIndex: 0,
          progress: [3, 3],
          result: ['/music/a/one.mp3', 'C:\\music\\two.mp3', 'trailing/'],
          warnings: ['skipped song'],
        }),
      ]);
    });
    expect(screen.getByText('2m 05s')).toBeInTheDocument();
    expect(screen.getByText('worker 0')).toBeInTheDocument();
    expect(screen.getByText('3/3')).toBeInTheDocument();
    expect(screen.getByText(/^start /)).toBeInTheDocument();
    expect(screen.getByText(/^end /)).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Progress of task 5' })).toHaveAttribute('aria-valuenow', '100');

    vi.useRealTimers();
    await userEvent.click(screen.getByRole('button', { name: /1 song skipped/ }));
    expect(screen.getByText('skipped song')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /3 files written/ }));
    expect(screen.getByText('one.mp3')).toBeInTheDocument();
    expect(screen.getByText('two.mp3')).toBeInTheDocument();
    expect(screen.getByText('trailing/')).toBeInTheDocument();
  });

  it('shows a running task duration in seconds', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(10_000);
    mockFetch({ 'GET /queue': [] });
    const source = renderQueue();
    act(() => {
      source.emit('snapshot', [makeTask({ id: 1, state: 'active', tsQueued: 1, tsStarted: 5_000, progress: [1, 4] })]);
    });
    expect(screen.getByText('5s')).toBeInTheDocument();
    expect(screen.getByText('1/4')).toBeInTheDocument();
    expect(screen.queryByText(/^end /)).not.toBeInTheDocument();
  });

  it('labels idle and failed tasks', () => {
    mockFetch({ 'GET /queue': [] });
    const source = renderQueue();
    act(() => {
      source.emit('snapshot', [
        makeTask({ id: 1, state: 'waiting' }),
        makeTask({
          id: 2,
          state: 'failed',
          exception: 'Boom',
          result: ['/x.mp3'],
          warnings: ['a', 'b'],
        }),
        makeTask({ id: 3, state: 'mission accomplished', result: ['/only.mp3'] }),
      ]);
    });
    expect(screen.getByText('idle')).toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(2);
    expect(screen.getByText('Boom')).toBeInTheDocument();
    expect(screen.getByText(/2 songs skipped/)).toBeInTheDocument();
    expect(screen.getByText(/1 file written/)).toBeInTheDocument();
    expect(screen.getAllByText('in --:--')).toHaveLength(3);
  });
});
