import { act, renderHook } from '@testing-library/react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TaskAcceptedResponse } from '@song-catcher/shared';

import { useEnqueue } from '../../src/hooks/useEnqueue';

beforeEach(() => {
  vi.spyOn(toast, 'success');
  vi.spyOn(toast, 'error');
});

describe('useEnqueue', () => {
  it('is busy while the request runs, then announces the task', async () => {
    let resolve: (task: TaskAcceptedResponse) => void = () => undefined;
    const start = () =>
      new Promise<TaskAcceptedResponse>((done) => {
        resolve = done;
      });
    const onQueued = vi.fn();
    const { result } = renderHook(() => useEnqueue());
    expect(result.current.busy).toBe(false);

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.enqueue(start, { successMessage: 'Download queued', onQueued });
    });
    expect(result.current.busy).toBe(true);
    expect(onQueued).not.toHaveBeenCalled();

    await act(async () => {
      resolve({ task_id: 7 });
      await pending;
    });

    expect(result.current.busy).toBe(false);
    expect(toast.success).toHaveBeenCalledWith('Download queued', { description: 'Task #7' });
    expect(onQueued).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('reports a failed request and does not run onQueued', async () => {
    const onQueued = vi.fn();
    const { result } = renderHook(() => useEnqueue());

    await act(async () => {
      await result.current.enqueue(() => Promise.reject(new Error('Queue is full')), {
        successMessage: 'Download queued',
        onQueued,
      });
    });

    expect(toast.error).toHaveBeenCalledWith('Queue is full');
    expect(toast.success).not.toHaveBeenCalled();
    expect(onQueued).not.toHaveBeenCalled();
    expect(result.current.busy).toBe(false);
  });

  it('stringifies failures that are not errors', async () => {
    const { result } = renderHook(() => useEnqueue());

    await act(async () => {
      await result.current.enqueue(() => Promise.reject('offline'), { successMessage: 'Download queued' });
    });

    expect(toast.error).toHaveBeenCalledWith('offline');
  });
});
