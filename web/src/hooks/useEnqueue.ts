import { useState } from 'react';
import { toast } from 'sonner';

import type { TaskAcceptedResponse } from '@song-catcher/shared';

import { errorMessage } from '../lib/errors';

interface EnqueueOptions {
  successMessage: string;
  onQueued?: () => void;
}

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
