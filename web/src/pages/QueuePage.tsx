import { ListTodo, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useQueue } from '../hooks/useQueue';
import { TaskStateBadge } from '../components/TaskStateBadge';
import { Button } from '../components/ui/Button';

function basename(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1] || filePath;
}

function formatTime(timestamp: number): string {
  if (!timestamp) {
    return '—';
  }
  return new Date(timestamp).toLocaleTimeString();
}

export function QueuePage() {
  const { tasks, connected, error } = useQueue();

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Download queue</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Live view of waiting, active and finished download tasks.
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
            connected ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
          }`}
        >
          <span
            className={`size-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-amber-500'}`}
            aria-hidden
          />
          {connected ? 'live' : 'reconnecting'}
        </span>
      </section>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          Could not load the queue: {error}
        </div>
      ) : null}

      {tasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-12 text-center">
          <ListTodo className="mx-auto size-8 text-zinc-300" aria-hidden />
          <p className="mt-2 text-sm font-medium text-zinc-700">No downloads yet</p>
          <p className="mt-1 text-sm text-zinc-500">
            Start a download from the{' '}
            <Link to="/" className="text-violet-700 underline">
              Search
            </Link>
            ,{' '}
            <Link to="/youtube" className="text-violet-700 underline">
              YouTube
            </Link>{' '}
            or{' '}
            <Link to="/deezer" className="text-violet-700 underline">
              Deezer
            </Link>{' '}
            page.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Task</th>
                  <th className="px-3 py-2 font-medium">State</th>
                  <th className="px-3 py-2 font-medium">Progress</th>
                  <th className="px-3 py-2 font-medium">Result / error</th>
                  <th className="px-3 py-2 font-medium">Times</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {[...tasks].reverse().map((task) => {
                  const [current, maximum] = task.progress;
                  const percentage =
                    maximum > 0 ? Math.min(100, Math.round((current / maximum) * 100)) : null;

                  return (
                    <tr key={task.id} className="align-top">
                      <td className="px-3 py-3 font-mono text-xs text-zinc-500">{task.id}</td>
                      <td className="px-3 py-3">
                        <p className="font-medium text-zinc-900">{task.description}</p>
                        <p className="mt-0.5 text-xs text-zinc-500">
                          worker {task.workerIndex ?? '—'}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <TaskStateBadge state={task.state} />
                      </td>
                      <td className="w-44 px-3 py-3">
                        <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
                          <div
                            className={`h-full rounded-full transition-all ${
                              task.state === 'failed' ? 'bg-rose-500' : 'bg-violet-500'
                            }`}
                            style={{ width: percentage === null ? '0%' : `${percentage}%` }}
                          />
                        </div>
                        <p className="mt-1 text-xs text-zinc-500">
                          {maximum > 0 ? `${current} / ${maximum}` : 'waiting'}
                        </p>
                      </td>
                      <td className="max-w-md px-3 py-3">
                        {task.exception ? (
                          <p className="break-words text-xs text-rose-700">{task.exception}</p>
                        ) : task.result && task.result.length > 0 ? (
                          <ul className="space-y-0.5">
                            {task.result.map((file) => (
                              <li key={file} className="break-all text-xs text-zinc-600">
                                {basename(file)}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-xs text-zinc-400">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-zinc-500">
                        <p>queued {formatTime(task.tsQueued)}</p>
                        <p>started {formatTime(task.tsStarted)}</p>
                        <p>finished {formatTime(task.tsFinished)}</p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            window.location.reload();
          }}
        >
          <RefreshCw className="size-3.5" aria-hidden />
          Refresh page
        </Button>
        <span className="text-xs text-zinc-500">
          Updates are streamed from the backend. Finished tasks are kept in a bounded history.
        </span>
      </div>
    </div>
  );
}
