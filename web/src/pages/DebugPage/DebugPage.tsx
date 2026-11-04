import { useQuery } from '@tanstack/react-query';
import { Copy, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { getDebug } from '../../api/client';
import { Alert } from '../../components/Alert';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';

import styles from './DebugPage.module.css';

export function DebugPage() {
  const debug = useQuery({
    queryKey: ['debug'],
    queryFn: getDebug,
  });
  const output = debug.data?.debug_msg ?? '';

  return (
    <div>
      <PageHeader
        index="05"
        eyebrow="Logs"
        title={
          <>
            Under <em>the hood</em>
          </>
        }
        description="Output of the configured debug command, or the tail of the configured log file."
        actions={
          <Button
            size="sm"
            variant="outline"
            disabled={debug.isFetching}
            onClick={() => {
              void debug.refetch();
            }}
          >
            <RefreshCw size={14} aria-hidden className={debug.isFetching ? styles.spinning : undefined} />
            Refresh
          </Button>
        }
      />

      {debug.isError ? (
        <Alert>
          Could not load debug output: {debug.error instanceof Error ? debug.error.message : 'unknown error'}
        </Alert>
      ) : null}

      <div className={styles.terminal}>
        <div className={styles.terminalBar}>
          <span className={styles.dots} aria-hidden>
            <span />
            <span />
            <span />
          </span>
          <span className={styles.terminalTitle}>debug.log</span>
          <Button
            size="sm"
            variant="quiet"
            disabled={!output}
            onClick={() => {
              void navigator.clipboard.writeText(output).then(
                () => toast.success('Copied to clipboard'),
                () => toast.error('Could not copy'),
              );
            }}
          >
            <Copy size={12} aria-hidden />
            Copy
          </Button>
        </div>
        <pre className={styles.output}>{debug.isLoading ? 'loading…' : output || 'no output'}</pre>
      </div>
    </div>
  );
}
