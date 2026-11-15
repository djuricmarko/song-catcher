import type { ServerResponse } from 'node:http';

import type { DownloadScheduler } from '../queue/tasks.js';
import type { ApiFastifyInstance } from './types.js';

/** Keeps proxies and browsers from closing a stream on which nothing happens. */
const HEARTBEAT_INTERVAL_MS = 15_000;

function writeEvent(stream: ServerResponse, event: string, data: unknown): void {
  if (!stream.writableEnded) {
    stream.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }
}

function writeHeartbeat(stream: ServerResponse): void {
  if (!stream.writableEnded) {
    // A line starting with a colon is a comment, which clients ignore.
    stream.write(': heartbeat\n\n');
  }
}

/**
 * Registers the server-sent event stream of the download queue.
 *
 * A client first receives a `snapshot` with every task, then a `task` event
 * whenever one changes and a `removed` event when one drops out of the history.
 */
export function registerQueueEvents(app: ApiFastifyInstance, path: string, scheduler: DownloadScheduler): void {
  // Event streams never become idle, so Fastify's close() would wait on them
  // forever. End them explicitly when the server shuts down.
  const openStreams = new Set<ServerResponse>();
  app.addHook('preClose', async () => {
    for (const stream of openStreams) {
      stream.end();
    }
    openStreams.clear();
  });

  app.get(path, (_request, reply) => {
    // Take the response away from Fastify; it stays open and is written to directly.
    reply.hijack();
    const stream = reply.raw;
    stream.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Tells nginx not to buffer the stream.
      'X-Accel-Buffering': 'no',
    });

    openStreams.add(stream);
    writeEvent(stream, 'snapshot', scheduler.getTasks());
    const unsubscribe = scheduler.subscribe(
      (task) => {
        writeEvent(stream, 'task', task);
      },
      (taskId) => {
        writeEvent(stream, 'removed', { id: taskId });
      },
    );
    const heartbeat = setInterval(() => {
      writeHeartbeat(stream);
    }, HEARTBEAT_INTERVAL_MS);

    stream.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
      openStreams.delete(stream);
    });
  });
}
