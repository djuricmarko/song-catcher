import type { QueueTask, TaskState } from '@song-catcher/shared';
import type { Logger } from 'pino';

import { errorMessage } from '../lib/errors.js';

/** What a running task can tell the queue about itself. */
export interface TaskContext {
  reportProgress(current: number, maximum: number): void;
  /** Records a non-fatal problem; the task can still succeed. */
  reportWarning(message: string): void;
}

export type TaskArgs = Record<string, unknown>;

/** Maps handler names to the argument shape each handler receives. */
export type TaskArgsMap = Record<string, TaskArgs>;

/** Carries out one kind of task and resolves to the files it produced. */
export type TaskHandler<Args extends TaskArgs = TaskArgs> = (args: Args, context: TaskContext) => Promise<string[]>;

export type TaskListener = (task: QueueTask) => void;
export type TaskRemovedListener = (taskId: number) => void;

/** A task as the scheduler keeps it; clients only ever see copies without the handler name. */
interface InternalTask extends QueueTask {
  handlerName: string;
}

const FINISHED_STATES: readonly TaskState[] = ['mission accomplished', 'failed'];

/**
 * In-memory worker pool with a bounded history of processed tasks. It mirrors
 * the semantics of the old Python ThreadpoolScheduler while using async tasks.
 *
 * Tasks run in the order they were enqueued, at most `workerCount` at a time.
 * `Tasks` ties each handler name to its argument type, so `register` and
 * `enqueue` are checked against each other at compile time.
 */
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

  /** Declares how tasks named `handlerName` are carried out. Each name can be registered once. */
  public register<Name extends keyof Tasks & string>(handlerName: Name, handler: TaskHandler<Tasks[Name]>): void {
    if (this.handlers.has(handlerName)) {
      throw new Error(`Task handler already registered: ${handlerName}`);
    }
    // Safe: enqueue() only accepts Tasks[Name] for this name.
    this.handlers.set(handlerName, handler as TaskHandler);
  }

  /** Starts the workers. Calling it again has no effect. */
  public start(): void {
    if (this.workers.length > 0) {
      return;
    }
    for (let index = 0; index < this.workerCount; index += 1) {
      this.workers.push(this.workerLoop(index));
    }
    this.logger.info({ workers: this.workerCount }, 'download workers started');
  }

  /**
   * Stops accepting work and waits for running tasks. With `graceMs`, gives
   * up waiting after that long so shutdown cannot hang on a stuck download;
   * abandoned tasks are logged and simply die with the process.
   */
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
            timer = setTimeout(() => resolve(false), graceMs);
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

  /** Adds a task to the end of the queue and returns a snapshot of it. */
  public enqueue<Name extends keyof Tasks & string>(
    description: string,
    handlerName: Name,
    args: Tasks[Name],
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

  /** Snapshots of every task that is waiting, running or still in the history, oldest first. */
  public getTasks(): QueueTask[] {
    return this.tasks.map((task) => this.snapshot(task));
  }

  /**
   * Subscribes to task updates and, optionally, to tasks being dropped from
   * the bounded history so clients can prune their copy.
   */
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
          reportWarning: (message) => {
            task.warnings.push(message);
            this.notify(task);
          },
        });
        task.state = 'mission accomplished';
      } catch (error) {
        task.state = 'failed';
        task.exception = errorMessage(error);
        this.logger.error({ err: error, taskId: task.id, handler: task.handlerName }, 'download task failed');
      } finally {
        task.tsFinished = Date.now();
        this.notify(task);
        this.trimHistory();
      }
    }
  }

  /** Drops the oldest finished tasks until the list fits the history limit. Unfinished tasks always stay. */
  private trimHistory(): void {
    while (this.tasks.length > this.historyLimit) {
      const index = this.tasks.findIndex((task) => FINISHED_STATES.includes(task.state));
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

  /** Calls every listener; one that throws must not stop the others or the worker. */
  private emit<Payload>(listeners: ReadonlySet<(payload: Payload) => void>, payload: Payload): void {
    for (const listener of listeners) {
      try {
        listener(payload);
      } catch (error) {
        this.logger.warn({ err: error }, 'queue listener failed');
      }
    }
  }

  /** A copy that is safe to hand out: later changes to the task do not show through. */
  private snapshot(task: InternalTask): QueueTask {
    return {
      id: task.id,
      description: task.description,
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
