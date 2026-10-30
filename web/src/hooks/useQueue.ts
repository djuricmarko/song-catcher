import { useEffect, useState } from 'react';

import type { QueueTask } from '@deezer-downloader/shared';

import { API_ROOT, getQueue } from '../api/client';

export function useQueue() {
  const [tasks, setTasks] = useState<QueueTask[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void getQueue()
      .then((initial) => {
        if (active) {
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
        setTasks(JSON.parse(event.data) as QueueTask[]);
        setError(null);
      } catch {
        // Ignore malformed events and wait for the next one.
      }
    };

    const onTask = (event: MessageEvent<string>) => {
      try {
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

    source.addEventListener('snapshot', onSnapshot as EventListener);
    source.addEventListener('task', onTask as EventListener);
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
      source.close();
    };
  }, []);

  return { tasks, connected, error };
}
