import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import type { QueueTask } from '@deezer-downloader/shared';

import { API_ROOT, getQueue } from '../api/client';

interface QueueState {
  tasks: QueueTask[];
  connected: boolean;
  error: string | null;
}

const QueueContext = createContext<QueueState | null>(null);

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
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      });

    const source = new EventSource(`${API_ROOT}/queue/events`);

    const onSnapshot = (event: MessageEvent<string>) => {
      try {
        streamed = true;
        setTasks(JSON.parse(event.data) as QueueTask[]);
        setError(null);
      } catch {
        // Ignore malformed events and wait for the next one.
      }
    };

    const onTask = (event: MessageEvent<string>) => {
      try {
        streamed = true;
        const task = JSON.parse(event.data) as QueueTask;
        setTasks((previous) => {
          const index = previous.findIndex((candidate) => candidate.id === task.id);
          if (index === -1) {
            return [...previous, task];
          }
          const next = [...previous];
          next[index] = task;
          return next;
        });
      } catch {
        // Ignore malformed events and wait for the next one.
      }
    };

    const onRemoved = (event: MessageEvent<string>) => {
      try {
        const { id } = JSON.parse(event.data) as { id: number };
        setTasks((previous) => previous.filter((task) => task.id !== id));
      } catch {
        // Ignore malformed events and wait for the next one.
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
