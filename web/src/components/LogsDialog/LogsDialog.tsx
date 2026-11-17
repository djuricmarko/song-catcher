import { useQuery } from '@tanstack/react-query';
import { ChartNoAxesColumn, Copy, RefreshCw } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import { toast } from 'sonner';

import { getDebug } from '../../api/client';
import { errorMessage } from '../../lib/errors';
import { Alert } from '../Alert';
import { LargeDialog, LargeDialogHeader } from '../LargeDialog';
import { Button } from '../ui/Button';

import styles from './LogsDialog.module.css';

function Logs({ onClose }: { onClose: () => void }) {
  const outputRef = useRef<HTMLPreElement>(null);
  const debug = useQuery({
    queryKey: ['debug'],
    queryFn: getDebug,
  });
  const output = debug.data?.debug_msg ?? '';

  useLayoutEffect(() => {
    const element = outputRef.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [output]);

  return (
    <>
      <LargeDialogHeader
        title={
          <>
            <ChartNoAxesColumn size={15} strokeWidth={1.75} aria-hidden />
            Logs
          </>
        }
        actions={
          <>
            <Button
              size="sm"
              variant="ghost"
              disabled={debug.isFetching}
              onClick={() => {
                void debug.refetch();
              }}
            >
              <RefreshCw size={13} aria-hidden className={debug.isFetching ? styles.spinning : undefined} />
              Refresh
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!output}
              onClick={() => {
                void navigator.clipboard.writeText(output).then(
                  () => toast.success('Copied to clipboard'),
                  () => toast.error('Could not copy'),
                );
              }}
            >
              <Copy size={13} aria-hidden />
              Copy
            </Button>
          </>
        }
        onClose={onClose}
      />
      {debug.isError ? (
        <Alert className={styles.alert}>Could not load debug output: {errorMessage(debug.error)}</Alert>
      ) : null}
      <pre ref={outputRef} className={styles.output}>
        {debug.isLoading ? 'loading…' : output || 'no output'}
      </pre>
    </>
  );
}

interface LogsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LogsDialog({ open, onOpenChange }: LogsDialogProps) {
  return (
    <LargeDialog open={open} onOpenChange={onOpenChange} label="Logs">
      <Logs
        onClose={() => {
          onOpenChange(false);
        }}
      />
    </LargeDialog>
  );
}
