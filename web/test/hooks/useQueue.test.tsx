import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { QueueProvider, useQueue } from '../../src/hooks/useQueue';
import { MockEventSource, jsonResponse, makeTask, mockFetch } from '../utils';

const wrapper = ({ children }: { children: ReactNode }) => <QueueProvider>{children}</QueueProvider>;

describe('useQueue', () => {
  it('throws outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useQueue())).toThrow('useQueue must be used inside <QueueProvider>');
  });

  it('loads the initial queue and opens the event stream', async () => {
    mockFetch({ 'GET /queue': [makeTask({ id: 1 })] });
    const { result } = renderHook(() => useQueue(), { wrapper });
    await waitFor(() => {
      expect(result.current.tasks).toHaveLength(1);
    });
    expect(MockEventSource.latest().url).toBe('/api/queue/events');
    expect(result.current.connected).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('tracks connection state', () => {
    mockFetch({ 'GET /queue': [] });
    const { result } = renderHook(() => useQueue(), { wrapper });
    const source = MockEventSource.latest();
    act(() => {
      source.onopen?.();
    });
    expect(result.current.connected).toBe(true);
    act(() => {
      source.onerror?.();
    });
    expect(result.current.connected).toBe(false);
  });

  it('reports initial load errors', async () => {
    mockFetch({ 'GET /queue': () => jsonResponse({ error: 'Queue down' }, { status: 500 }) });
    const { result } = renderHook(() => useQueue(), { wrapper });
    await waitFor(() => {
      expect(result.current.error).toBe('Queue down');
    });
  });

  it('stringifies non-Error load failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject('offline')),
    );
    const { result } = renderHook(() => useQueue(), { wrapper });
    await waitFor(() => {
      expect(result.current.error).toBe('offline');
    });
  });

  it('applies snapshot, task and removed events', async () => {
    mockFetch({ 'GET /queue': () => jsonResponse({ error: 'boom' }, { status: 500 }) });
    const { result } = renderHook(() => useQueue(), { wrapper });
    await waitFor(() => {
      expect(result.current.error).toBe('boom');
    });
    const source = MockEventSource.latest();

    act(() => {
      source.emit('snapshot', [makeTask({ id: 1 }), makeTask({ id: 2 })]);
    });
    expect(result.current.tasks.map((task) => task.id)).toEqual([1, 2]);
    expect(result.current.error).toBeNull();

    act(() => {
      source.emit('task', makeTask({ id: 2, state: 'active' }));
    });
    expect(result.current.tasks[1]?.state).toBe('active');

    act(() => {
      source.emit('task', makeTask({ id: 3 }));
    });
    expect(result.current.tasks.map((task) => task.id)).toEqual([1, 2, 3]);

    act(() => {
      source.emit('removed', { id: 1 });
    });
    expect(result.current.tasks.map((task) => task.id)).toEqual([2, 3]);
  });

  it('ignores malformed events', () => {
    mockFetch({ 'GET /queue': [] });
    const { result } = renderHook(() => useQueue(), { wrapper });
    const source = MockEventSource.latest();
    act(() => {
      source.emit('snapshot', '[{"id": 1}]');
      source.emit('snapshot', '{bad');
      source.emit('task', '{bad');
      source.emit('removed', '{bad');
    });
    expect(result.current.tasks).toEqual([{ id: 1 }]);
  });

  it('does not let a late initial fetch overwrite streamed data', async () => {
    let resolve: (response: Response) => void = () => undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((done) => {
            resolve = done;
          }),
      ),
    );
    const { result } = renderHook(() => useQueue(), { wrapper });
    act(() => {
      MockEventSource.latest().emit('snapshot', [makeTask({ id: 9 })]);
    });
    await act(async () => {
      resolve(jsonResponse([makeTask({ id: 1 })]));
      await Promise.resolve();
    });
    expect(result.current.tasks.map((task) => task.id)).toEqual([9]);
  });

  it('closes the stream and ignores late results after unmount', async () => {
    let reject: (reason: unknown) => void = () => undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((_done, fail) => {
            reject = fail;
          }),
      ),
    );
    const errorSpy = vi.spyOn(console, 'error');
    const { unmount } = render(
      <QueueProvider>
        <p>child</p>
      </QueueProvider>,
    );
    expect(screen.getByText('child')).toBeInTheDocument();
    const source = MockEventSource.latest();
    unmount();
    expect(source.closed).toBe(true);
    expect(source.listenerCount('snapshot')).toBe(0);
    expect(source.listenerCount('task')).toBe(0);
    expect(source.listenerCount('removed')).toBe(0);
    await act(async () => {
      reject(new Error('late'));
      await Promise.resolve();
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
