import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import type { QueueTask } from '@song-catcher/shared';

import { API_ROOT, getQueue } from '../api/client';
import { errorMessage } from '../lib/errors';

interface QueueState {
  tasks: QueueTask[];
  connected: boolean;
  error: string | null;
}

const QueueContext = createContext<QueueState | null>(null);

function parseEventData(event: MessageEvent<string>): unknown {
  try {
    return JSON.parse(event.data);
  } catch {
    return undefined;
  }
}

function upsertTask(tasks: QueueTask[], task: QueueTask): QueueTask[] {
  const index = tasks.findIndex((candidate) => candidate.id === task.id);
  if (index === -1) {
    return [...tasks, task];
  }
  const next = [...tasks];
  next[index] = task;
  return next;
}

function useQueueStream(): QueueState {
  const [tasks, setTasks] = useState<QueueTask[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
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

    const onSnapshot = (event: MessageEvent<string>) => {
      streamed = true;
      const snapshot = parseEventData(event) as QueueTask[] | undefined;
      if (snapshot) {
        setTasks(snapshot);
        setError(null);
      }
    };

    const onTask = (event: MessageEvent<string>) => {
      streamed = true;
      const task = parseEventData(event) as QueueTask | undefined;
      if (task) {
        setTasks((previous) => upsertTask(previous, task));
      }
    };

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
