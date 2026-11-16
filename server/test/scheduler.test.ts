import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import pino from 'pino';

import { describe, expect, it } from 'vitest';

import { Scheduler } from '../src/queue/scheduler.js';

const logger = pino({ level: 'silent' });
const label = { source: 'deezer', kind: 'track', title: 'Task' } as const;

async function waitForTask(scheduler: Scheduler, taskId: number) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const task = scheduler.getTasks().find((candidate) => candidate.id === taskId);
    if (task && (task.state === 'mission accomplished' || task.state === 'failed')) {
      return task;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Task ${taskId} did not finish`);
}

describe('Scheduler', () => {
  it('runs a registered handler and stores its result', async () => {
    const scheduler = new Scheduler(1, 10, logger);
    scheduler.register('echo', async (args) => [String(args.value)]);
    scheduler.start();

    const task = scheduler.enqueue('echo', { value: 'hello' }, label);
    expect(task.state).toBe('waiting');

    const finished = await waitForTask(scheduler, task.id);
    expect(finished.state).toBe('mission accomplished');
    expect(finished.result).toEqual(['hello']);
    expect(finished.workerIndex).toBe(0);
    expect(finished.tsStarted).toBeGreaterThan(0);
    expect(finished.tsFinished).toBeGreaterThanOrEqual(finished.tsStarted);

    await scheduler.stop();
  });

  it('never runs a task twice when several are enqueued in the same tick', async () => {
    const scheduler = new Scheduler(3, 10, logger);
    const runs: number[] = [];
    scheduler.register('record', async (args) => {
      runs.push(Number(args.value));
      await new Promise((resolve) => setTimeout(resolve, 20));
      return [];
    });
    scheduler.start();
    // Let every worker park itself waiting for work.
    await new Promise((resolve) => setTimeout(resolve, 5));

    const tasks = [1, 2, 3].map((value) => scheduler.enqueue('record', { value }, label));
    await Promise.all(tasks.map((task) => waitForTask(scheduler, task.id)));

    expect(runs.sort()).toEqual([1, 2, 3]);
    expect(new Set(scheduler.getTasks().map((task) => task.workerIndex)).size).toBe(3);

    await scheduler.stop();
  });

  it('stops within the grace period even if a task never finishes', async () => {
    const scheduler = new Scheduler(1, 10, logger);
    scheduler.register('hang', () => new Promise<string[]>(() => undefined));
    scheduler.start();
    scheduler.enqueue('hang', {}, label);
    await new Promise((resolve) => setTimeout(resolve, 5));

    const started = Date.now();
    await scheduler.stop(50);
    expect(Date.now() - started).toBeLessThan(500);
    expect(() => scheduler.enqueue('hang', {}, label)).toThrowError(/stopping/);
  });

  it('keeps warnings on a successful task', async () => {
    const scheduler = new Scheduler(1, 10, logger);
    scheduler.register('partial', async (_args, context) => {
      context.reportWarning('song 2 failed');
      return ['song1.mp3'];
    });
    scheduler.start();

    const task = scheduler.enqueue('partial', {}, label);
    expect(task.warnings).toEqual([]);
    const finished = await waitForTask(scheduler, task.id);
    expect(finished.state).toBe('mission accomplished');
    expect(finished.warnings).toEqual(['song 2 failed']);

    await scheduler.stop();
  });

  it('notifies subscribers when finished tasks are trimmed from history', async () => {
    const scheduler = new Scheduler(1, 10, logger);
    scheduler.register('noop', async () => []);
    const removed: number[] = [];
    scheduler.subscribe(
      () => undefined,
      (taskId) => {
        removed.push(taskId);
      },
    );
    scheduler.start();

    const tasks = Array.from({ length: 12 }, () => scheduler.enqueue('noop', {}, label));
    await waitForTask(scheduler, tasks.at(-1)!.id);

    expect(removed).toEqual([1, 2]);
    expect(scheduler.getTasks().map((task) => task.id)).toEqual(tasks.slice(2).map((t) => t.id));

    await scheduler.stop();
  });

  it('labels a task and lets the handler refine the label', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'scheduler-test-'));
    const file = path.join(directory, 'song.mp3');
    const scheduler = new Scheduler(1, 10, logger);
    scheduler.register('labelled', async (_args, context) => {
      context.reportMedia({ title: 'Pantera - Walk', date: '2009-10-03' });
      await writeFile(file, 'audio');
      return [file, path.join(directory, 'missing.mp3')];
    });
    scheduler.start();

    const task = scheduler.enqueue(
      'labelled',
      {},
      { source: 'youtube', kind: 'track', title: 'https://example.com/video' },
    );
    expect(task).toMatchObject({
      source: 'youtube',
      kind: 'track',
      title: 'https://example.com/video',
      subtitle: null,
      date: null,
      sizeBytes: 0,
    });

    const finished = await waitForTask(scheduler, task.id);
    expect(finished).toMatchObject({ title: 'Pantera - Walk', subtitle: null, date: '2009-10-03', sizeBytes: 5 });

    await scheduler.stop();
    await rm(directory, { recursive: true, force: true });
  });

  it('reports progress', async () => {
    const scheduler = new Scheduler(1, 10, logger);
    const progressEvents: Array<[number, number]> = [];
    scheduler.register('progress', async (_args, context) => {
      context.reportProgress(1, 3);
      context.reportProgress(2, 3);
      context.reportProgress(3, 3);
      return [];
    });
    scheduler.subscribe((task) => {
      if (task.state === 'active') {
        progressEvents.push([...task.progress]);
      }
    });
    scheduler.start();

    const task = scheduler.enqueue('progress', {}, label);
    const finished = await waitForTask(scheduler, task.id);

    expect(finished.progress).toEqual([3, 3]);
    expect(progressEvents).toContainEqual([1, 3]);
    expect(progressEvents).toContainEqual([2, 3]);
    await scheduler.stop();
  });

  it('marks a task as failed when the handler throws', async () => {
    const scheduler = new Scheduler(1, 10, logger);
    scheduler.register('fail', async () => {
      throw new Error('boom');
    });
    scheduler.start();

    const task = scheduler.enqueue('fail', {}, label);
    const finished = await waitForTask(scheduler, task.id);

    expect(finished.state).toBe('failed');
    expect(finished.exception).toBe('boom');
    expect(finished.result).toBeNull();
    await scheduler.stop();
  });

  it('bounds the task history', async () => {
    const scheduler = new Scheduler(1, 2, logger);
    scheduler.register('quick', async () => []);
    scheduler.start();

    const tasks = [1, 2, 3, 4].map(() => scheduler.enqueue('quick', {}, label));
    await waitForTask(scheduler, tasks[3]?.id ?? 0);

    expect(scheduler.getTasks().length).toBeLessThanOrEqual(2);
    await scheduler.stop();
  });

  it('rejects unknown handlers and enqueues after stopping', async () => {
    const scheduler = new Scheduler(1, 10, logger);
    expect(() => scheduler.enqueue('missing', {}, label)).toThrowError(/Unknown task handler/);

    scheduler.start();
    await scheduler.stop();
    expect(() => scheduler.enqueue('missing', {}, label)).toThrowError(/stopping/);
  });

  it('runs tasks concurrently with multiple workers', async () => {
    const scheduler = new Scheduler(2, 10, logger);
    let active = 0;
    let maximumActive = 0;
    scheduler.register('slow', async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 25));
      active -= 1;
      return [];
    });
    scheduler.start();

    const first = scheduler.enqueue('slow', {}, label);
    const second = scheduler.enqueue('slow', {}, label);
    await Promise.all([waitForTask(scheduler, first.id), waitForTask(scheduler, second.id)]);

    expect(maximumActive).toBe(2);
    await scheduler.stop();
  });
});

describe('Scheduler typing', () => {
  it('ties enqueue arguments to the registered handler at compile time', () => {
    type Tasks = { greet: { name: string } };
    const scheduler = new Scheduler<Tasks>(1, 10, logger);
    scheduler.register('greet', async (args) => [args.name.toUpperCase()]);

    // These lines only need to fail type-checking (`npm run typecheck`).
    const typeChecks = () => {
      // @ts-expect-error unknown handler name
      scheduler.enqueue('gret', { name: 'a' }, label);
      // @ts-expect-error wrong argument type
      scheduler.enqueue('greet', { name: 1 }, label);
    };
    expect(typeChecks).toBeTypeOf('function');
  });
});
