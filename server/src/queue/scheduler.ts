import type { QueueTask, TaskState } from '@deezer-downloader/shared';
import type { Logger } from 'pino';

export interface TaskContext {
  reportProgress(current: number, maximum: number): void;
}

export type TaskHandler = (
  args: Record<string, unknown>,
  context: TaskContext,
) => Promise<string[]>;

export type TaskListener = (task: QueueTask) => void;

interface InternalTask {
  id: number;
  description: string;
  handlerName: string;
  args: Record<string, unknown>;
  state: TaskState;
  result: string[] | null;
  exception: string | null;
  progress: [number, number];
  workerIndex: number | null;
  tsQueued: number;
  tsStarted: number;
  tsFinished: number;
}

/**
 * In-memory worker pool with a bounded history of processed tasks. It mirrors
 * the semantics of the old Python ThreadpoolScheduler while using async tasks.
 */
export class Scheduler {
  private readonly tasks: InternalTask[] = [];
  private readonly handlers = new Map<string, TaskHandler>();
  private readonly listeners = new Set<TaskListener>();
  private readonly waiters: Array<() => void> = [];
  private workers: Array<Promise<void>> = [];
  private nextTaskId = 1;
  private stopRequested = false;

  public constructor(
    private readonly workerCount: number,
    private readonly historyLimit: number,
    private readonly logger: Logger,
  ) {}

  public register(handlerName: string, handler: TaskHandler): void {
    if (this.handlers.has(handlerName)) {
      throw new Error(`Task handler already registered: ${handlerName}`);
    }
    this.handlers.set(handlerName, handler);
  }

  public start(): void {
    if (this.workers.length > 0) {
      return;
    }
    for (let index = 0; index < this.workerCount; index += 1) {
      this.workers.push(this.workerLoop(index));
    }
    this.logger.info({ workers: this.workerCount }, 'download workers started');
  }

  public async stop(): Promise<void> {
    if (this.stopRequested) {
      await Promise.allSettled(this.workers);
      return;
    }
    this.stopRequested = true;
    for (const wake of this.waiters.splice(0)) {
      wake();
    }
    await Promise.allSettled(this.workers);
    this.workers = [];
    this.logger.info('download workers stopped');
  }

  public enqueue(
    description: string,
    handlerName: string,
    args: Record<string, unknown>,
  ): QueueTask {
    if (this.stopRequested) {
      throw new Error('The scheduler is stopping; cannot enqueue new tasks');
    }
    if (!this.handlers.has(handlerName)) {
      throw new Error(`Unknown task handler: ${handlerName}`);
    }

    const task: InternalTask = {
      id: this.nextTaskId,
      description,
      handlerName,
      args: { ...args },
      state: 'waiting',
      result: null,
      exception: null,
      progress: [0, 0],
      workerIndex: null,
      tsQueued: Date.now(),
      tsStarted: 0,
      tsFinished: 0,
    };
    this.nextTaskId += 1;
    this.tasks.push(task);
    this.notify(task);
    this.wakeWorker();
    return this.snapshot(task);
  }

  public getTasks(): QueueTask[] {
    return this.tasks.map((task) => this.snapshot(task));
  }

  public subscribe(listener: TaskListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private wakeWorker(): void {
    const wake = this.waiters.shift();
    wake?.();
  }

  private async nextTask(): Promise<InternalTask | undefined> {
    while (!this.stopRequested) {
      const task = this.tasks.find((candidate) => candidate.state === 'waiting');
      if (task) {
        return task;
      }
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
      });
    }
    return undefined;
  }

  private async workerLoop(workerIndex: number): Promise<void> {
    while (!this.stopRequested) {
      const task = await this.nextTask();
      if (!task) {
        return;
      }

      task.state = 'active';
      task.workerIndex = workerIndex;
      task.tsStarted = Date.now();
      this.notify(task);

      const handler = this.handlers.get(task.handlerName);
      try {
        if (!handler) {
          throw new Error(`Unknown task handler: ${task.handlerName}`);
        }
        task.result = await handler(task.args, {
          reportProgress: (current, maximum) => {
            task.progress = [current, maximum];
            this.notify(task);
          },
        });
        task.state = 'mission accomplished';
      } catch (error) {
        task.state = 'failed';
        task.exception = error instanceof Error ? error.message : String(error);
        this.logger.error(
          { err: error, taskId: task.id, handler: task.handlerName },
          'download task failed',
        );
      } finally {
        task.tsFinished = Date.now();
        this.notify(task);
        this.trimHistory();
      }
    }
  }

  private trimHistory(): void {
    while (this.tasks.length > this.historyLimit) {
      const index = this.tasks.findIndex(
        (task) => task.state === 'mission accomplished' || task.state === 'failed',
      );
      if (index === -1) {
        return;
      }
      this.tasks.splice(index, 1);
    }
  }

  private notify(task: InternalTask): void {
    const snapshot = this.snapshot(task);
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (error) {
        this.logger.warn({ err: error }, 'queue listener failed');
      }
    }
  }

  private snapshot(task: InternalTask): QueueTask {
    return {
      id: task.id,
      description: task.description,
      args: { ...task.args },
      state: task.state,
      result: task.result ? [...task.result] : null,
      exception: task.exception,
      progress: [...task.progress],
      workerIndex: task.workerIndex,
      tsQueued: task.tsQueued,
      tsStarted: task.tsStarted,
      tsFinished: task.tsFinished,
    };
  }
}
