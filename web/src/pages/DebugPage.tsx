import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';

import { getDebug } from '../api/client';
import { Button } from '../components/ui/Button';

export function DebugPage() {
  const debug = useQuery({
    queryKey: ['debug'],
    queryFn: getDebug,
  });

  return (
    <div className="space-y-4">
      <section>
        <h1 className="text-xl font-semibold text-zinc-900">Debug output</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Runs the configured debug command or tails the configured log file.
        </p>
      </section>

      {debug.isError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          Could not load debug output:{' '}
          {debug.error instanceof Error ? debug.error.message : 'unknown error'}
        </div>
      ) : null}

      <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-xs leading-relaxed text-zinc-100">
        {debug.isLoading ? 'Loading…' : (debug.data?.debug_msg ?? 'No output')}
      </pre>

      <Button
        size="sm"
        variant="outline"
        disabled={debug.isFetching}
        onClick={() => {
          void debug.refetch();
        }}
      >
        <RefreshCw className="size-3.5" aria-hidden />
        Refresh
      </Button>
    </div>
  );
}
