import { randomBytes } from 'node:crypto';
import { createServer, type AddressInfo } from 'node:net';
import path from 'node:path';

import { utilityProcess, type UtilityProcess } from 'electron';

import type { ServerMessage } from './server-process.js';
import { AUTH_USER } from './settings.js';

function freePort(preferred: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', (error: NodeJS.ErrnoException) => {
      if (preferred !== 0 && error.code === 'EADDRINUSE') {
        resolve(freePort(0));
      } else {
        reject(error);
      }
    });
    probe.listen(preferred, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => {
        resolve(port);
      });
    });
  });
}

export interface StartedServer {
  origin: string;
  loggedIn: boolean;
}

export class EmbeddedServer {
  public readonly password = randomBytes(24).toString('base64url');
  public readonly authorization = `Basic ${Buffer.from(`${AUTH_USER}:${this.password}`).toString('base64')}`;
  public origin: string | undefined;
  private child: UtilityProcess | undefined;

  public constructor(private readonly onCrash: () => void) {}

  public get running(): boolean {
    return this.child !== undefined;
  }

  public async start(environment: (port: number) => Record<string, string>): Promise<StartedServer> {
    await this.stop();

    // A stable port keeps the web UI on one origin, so its localStorage (theme) survives restarts.
    const port = await freePort(24816);
    const child = utilityProcess.fork(path.join(import.meta.dirname, 'server-process.mjs'), [], {
      env: environment(port),
      stdio: 'inherit',
      serviceName: 'Song Catcher downloads',
    });
    this.child = child;

    return new Promise((resolve, reject) => {
      let ready = false;

      child.once('message', (message: ServerMessage) => {
        if (message.type === 'failed') {
          reject(new Error(message.message));
          child.kill();
          return;
        }
        ready = true;
        this.origin = `http://127.0.0.1:${port}`;
        resolve({ origin: this.origin, loggedIn: message.loggedIn });
      });

      child.once('exit', (code) => {
        if (this.child !== child) {
          return;
        }
        this.child = undefined;
        this.origin = undefined;
        if (ready) {
          this.onCrash();
        } else {
          reject(new Error(`The download service stopped while starting (exit code ${code}).`));
        }
      });
    });
  }

  public async stop(): Promise<void> {
    const child = this.child;
    if (!child) {
      return;
    }
    this.child = undefined;
    this.origin = undefined;

    await new Promise<void>((resolve) => {
      const forceKill = setTimeout(() => child.kill(), 3_000);
      child.once('exit', () => {
        clearTimeout(forceKill);
        resolve();
      });
      child.postMessage('stop');
    });
  }
}
