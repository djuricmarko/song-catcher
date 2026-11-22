import type { QueueTask, TaskKind, TaskMedia, TaskSource } from '@song-catcher/shared';
import type { Logger } from 'pino';

import { errorMessage } from '../lib/errors.js';
import { totalFileSize } from '../lib/files.js';
import type { TransferReporter } from '../lib/transfer.js';

export interface TaskContext {
  reportProgress: (current: number, maximum: number) => void;
  reportTransfer: TransferReporter;
  reportWarning: (message: string) => void;
  reportMedia: (media: Partial<TaskMedia>) => void;
}

export interface TaskLabel {
  source: TaskSource;
  kind: TaskKind;
  title: string;
  subtitle?: string | undefined;
}

export type TaskArgs = Record<string, unknown>;

export type TaskArgsMap = Record<string, TaskArgs>;

export type TaskHandler<Args extends TaskArgs = TaskArgs> = (args: Args, context: TaskContext) => Promise<string[]>;

export type TaskListener = (task: QueueTask) => void;
export type TaskRemovedListener = (taskId: number) => void;

interface InternalTask extends QueueTask {
  handlerName: string;
}

export class Scheduler<Tasks extends TaskArgsMap = TaskArgsMap> {
  private readonly tasks: InternalTask[] = [];
  private readonly handlers = new Map<string, TaskHandler>();
  private readonly listeners = new Set<TaskListener>();
  private readonly removedListeners = new Set<TaskRemovedListener>();
  private readonly waiters: Array<() => void> = [];
  private workers: Array<Promise<void>> = [];
  private nextTaskId = 1;
  private stopRequested = false;

  public constructor(
    private readonly workerCount: number,
    private readonly historyLimit: number,
    private readonly logger: Logger,
  ) {}

  public register<Name extends keyof Tasks & string>(handlerName: Name, handler: TaskHandler<Tasks[Name]>): void {
    if (this.handlers.has(handlerName)) {
      throw new Error(`Task handler already registered: ${handlerName}`);
    }
    this.handlers.set(handlerName, handler as TaskHandler);
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

  public async stop(graceMs = Number.POSITIVE_INFINITY): Promise<void> {
    if (!this.stopRequested) {
      this.stopRequested = true;
      for (const wake of this.waiters.splice(0)) {
        wake();
      }
    }

    const workers = Promise.allSettled(this.workers).then(() => true);
    let timer: NodeJS.Timeout | undefined;
    const finished = Number.isFinite(graceMs)
      ? await Promise.race([
          workers,
          new Promise<false>((resolve) => {
            timer = setTimeout(() => {
              resolve(false);
            }, graceMs);
          }),
        ])
      : await workers;
    clearTimeout(timer);

    if (!finished) {
      const active = this.tasks.filter((task) => task.state === 'active').map((task) => task.id);
      this.logger.warn(
        { graceMs, activeTaskIds: active },
        'download workers did not finish in time; abandoning running tasks',
      );
      return;
    }
    this.workers = [];
    this.logger.info('download workers stopped');
  }

  public enqueue<Name extends keyof Tasks & string>(handlerName: Name, args: Tasks[Name], label: TaskLabel): QueueTask {
    if (this.stopRequested) {
      throw new Error('The scheduler is stopping; cannot enqueue new tasks');
    }
    if (!this.handlers.has(handlerName)) {
      throw new Error(`Unknown task handler: ${handlerName}`);
    }

    const task: InternalTask = {
      id: this.nextTaskId,
      source: label.source,
      kind: label.kind,
      title: label.title,
      subtitle: label.subtitle ?? null,
      date: null,
      sizeBytes: 0,
      speedBps: null,
      fileProgress: null,
      handlerName,
      args: { ...args },
      state: 'waiting',
      result: null,
      exception: null,
      warnings: [],
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

  public subscribe(listener: TaskListener, onRemoved?: TaskRemovedListener): () => void {
    this.listeners.add(listener);
    if (onRemoved) {
      this.removedListeners.add(onRemoved);
    }
    return () => {
      this.listeners.delete(listener);
      if (onRemoved) {
        this.removedListeners.delete(onRemoved);
      }
    };
  }

  private wakeWorker(): void {
    const wake = this.waiters.shift();
    wake?.();
  }

  /**
   * Finds the next waiting task and claims it synchronously. Claiming must
   * happen before any `await`, otherwise two workers woken in the same tick
   * can both pick the same task.
   */
  private async nextTask(workerIndex: number): Promise<InternalTask | undefined> {
    while (!this.stopRequested) {
      const task = this.tasks.find((candidate) => candidate.state === 'waiting');
      if (task) {
        task.state = 'active';
        task.workerIndex = workerIndex;
        task.tsStarted = Date.now();
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
      const task = await this.nextTask(workerIndex);
      if (!task) {
        return;
      }

      this.notify(task);

      const transferred = { bytes: 0, ms: 0 };
      const recent = { bytes: 0, ms: 0 };
      let unnotifiedMs = 0;
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
          reportTransfer: ({ bytes, elapsedMs, fraction }) => {
            transferred.bytes += bytes;
            transferred.ms += elapsedMs;
            recent.bytes += bytes;
            recent.ms += elapsedMs;
            unnotifiedMs += elapsedMs;
            if (recent.ms >= 500) {
              task.speedBps = (recent.bytes * 1000) / recent.ms;
              recent.bytes = 0;
              recent.ms = 0;
            }
            const phaseChanged =
              (fraction === null) !== (task.fileProgress === null) || (fraction === 1 && task.fileProgress !== 1);
            task.fileProgress = fraction;
            if (phaseChanged || unnotifiedMs >= 250) {
              unnotifiedMs = 0;
              this.notify(task);
            }
          },
          reportWarning: (message) => {
            task.warnings.push(message);
            this.notify(task);
          },
          reportMedia: (media) => {
            Object.assign(task, media);
            this.notify(task);
          },
        });
        task.sizeBytes = await totalFileSize(task.result);
        task.state = 'mission accomplished';
      } catch (error) {
        task.state = 'failed';
        task.exception = errorMessage(error);
        this.logger.error({ err: error, taskId: task.id, handler: task.handlerName }, 'download task failed');
      } finally {
        task.speedBps =
          transferred.bytes > 0 && transferred.ms > 0 ? (transferred.bytes * 1000) / transferred.ms : null;
        task.tsFinished = Date.now();
        this.notify(task);
        this.trimHistory();
      }
    }
  }

  private trimHistory(): void {
    while (this.tasks.length > this.historyLimit) {
      const index = this.tasks.findIndex((task) => task.state === 'mission accomplished' || task.state === 'failed');
      if (index === -1) {
        return;
      }
      const [removed] = this.tasks.splice(index, 1);
      if (removed) {
        this.emit(this.removedListeners, removed.id);
      }
    }
  }

  private notify(task: InternalTask): void {
    this.emit(this.listeners, this.snapshot(task));
  }

  private emit<Payload>(listeners: ReadonlySet<(payload: Payload) => void>, payload: Payload): void {
    for (const listener of listeners) {
      try {
        listener(payload);
      } catch (error) {
        this.logger.warn({ err: error }, 'queue listener failed');
      }
    }
  }

  private snapshot(task: InternalTask): QueueTask {
    return {
      id: task.id,
      source: task.source,
      kind: task.kind,
      title: task.title,
      subtitle: task.subtitle,
      date: task.date,
      sizeBytes: task.sizeBytes,
      speedBps: task.speedBps,
      fileProgress: task.fileProgress,
      args: { ...task.args },
      state: task.state,
      result: task.result ? [...task.result] : null,
      exception: task.exception,
      warnings: [...task.warnings],
      progress: [...task.progress],
      workerIndex: task.workerIndex,
      tsQueued: task.tsQueued,
      tsStarted: task.tsStarted,
      tsFinished: task.tsFinished,
    };
  }
}
