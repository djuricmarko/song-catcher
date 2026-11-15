import { useState } from 'react';
import { toast } from 'sonner';

import type { TaskAcceptedResponse } from '@song-catcher/shared';

import { errorMessage } from '../lib/errors';

interface EnqueueOptions {
  /** Title of the toast shown once the download is queued. */
  successMessage: string;
  /** Runs after the success toast, typically to clear the form. */
  onQueued?: () => void;
}

/**
 * Sends a "start this download" request and reports the outcome as a toast.
 * `busy` is true while a request is on its way, to disable the submit button.
 */
export function useEnqueue() {
  const [busy, setBusy] = useState(false);

  async function enqueue(start: () => Promise<TaskAcceptedResponse>, options: EnqueueOptions): Promise<void> {
    setBusy(true);
    try {
      const task = await start();
      toast.success(options.successMessage, { description: `Task #${task.task_id}` });
      options.onQueued?.();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return { busy, enqueue };
}
