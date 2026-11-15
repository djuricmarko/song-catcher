import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import type { QueueTask } from '@song-catcher/shared';

import { API_ROOT, getQueue } from '../api/client';
import { errorMessage } from '../lib/errors';

interface QueueState {
  /** Every task the server knows about, oldest first. */
  tasks: QueueTask[];
  /** False while the event stream is (re)connecting; `tasks` may then be stale. */
  connected: boolean;
  /** Why the initial load failed, if it did and the stream has not delivered since. */
  error: string | null;
}

const QueueContext = createContext<QueueState | null>(null);

/** The payload of a server-sent event, or undefined when it is malformed. */
function parseEventData(event: MessageEvent<string>): unknown {
  try {
    return JSON.parse(event.data);
  } catch {
    // Ignore malformed events and wait for the next one.
    return undefined;
  }
}

/** Replaces the task with the same id, or appends it when it is new. */
function upsertTask(tasks: QueueTask[], task: QueueTask): QueueTask[] {
  const index = tasks.findIndex((candidate) => candidate.id === task.id);
  if (index === -1) {
    return [...tasks, task];
  }
  const next = [...tasks];
  next[index] = task;
  return next;
}

/** Keeps a live copy of the server's queue: one fetch to start with, then the event stream. */
function useQueueStream(): QueueState {
  const [tasks, setTasks] = useState<QueueTask[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    // The SSE snapshot is authoritative; the initial fetch is only a fallback
    // for when the stream is slow to connect and must not overwrite newer data.
    let streamed = false;

    void getQueue()
      .then((initial) => {
        if (active && !streamed) {
          setTasks(initial);
          setError(null);
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(errorMessage(loadError));
        }
      });

    const source = new EventSource(`${API_ROOT}/queue/events`);

    // The whole queue, sent once when the stream (re)connects.
    const onSnapshot = (event: MessageEvent<string>) => {
      streamed = true;
      const snapshot = parseEventData(event) as QueueTask[] | undefined;
      if (snapshot) {
        setTasks(snapshot);
        setError(null);
      }
    };

    // One task that was added or changed.
    const onTask = (event: MessageEvent<string>) => {
      streamed = true;
      const task = parseEventData(event) as QueueTask | undefined;
      if (task) {
        setTasks((previous) => upsertTask(previous, task));
      }
    };

    // A finished task that dropped out of the server's bounded history.
    const onRemoved = (event: MessageEvent<string>) => {
      const removed = parseEventData(event) as { id: number } | undefined;
      if (removed) {
        setTasks((previous) => previous.filter((task) => task.id !== removed.id));
      }
    };

    source.addEventListener('snapshot', onSnapshot as EventListener);
    source.addEventListener('task', onTask as EventListener);
    source.addEventListener('removed', onRemoved as EventListener);
    source.onopen = () => {
      setConnected(true);
    };
    source.onerror = () => {
      setConnected(false);
    };

    return () => {
      active = false;
      source.removeEventListener('snapshot', onSnapshot as EventListener);
      source.removeEventListener('task', onTask as EventListener);
      source.removeEventListener('removed', onRemoved as EventListener);
      source.close();
    };
  }, []);

  return { tasks, connected, error };
}

/**
 * Holds one queue event stream for the whole app, so the navigation badge
 * and the queue page share it and switching pages never reconnects.
 */
export function QueueProvider({ children }: { children: ReactNode }) {
  const state = useQueueStream();
  return <QueueContext.Provider value={state}>{children}</QueueContext.Provider>;
}

export function useQueue(): QueueState {
  const state = useContext(QueueContext);
  if (!state) {
    throw new Error('useQueue must be used inside <QueueProvider>');
  }
  return state;
}
