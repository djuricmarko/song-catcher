import { once } from 'node:events';
import { createConnection, type Socket } from 'node:net';

import type { Logger } from 'pino';

export class MpdError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'MpdError';
  }
}

function quoteArgument(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

class LineReader {
  private buffer = '';
  private readonly lines: string[] = [];
  private readonly pending: Array<(line: string | null) => void> = [];
  private ended = false;

  public constructor(socket: Socket) {
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      this.onData(chunk);
    });
    socket.on('close', () => {
      this.end();
    });
    socket.on('error', () => {
      this.end();
    });
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let newlineIndex = this.buffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = this.buffer.slice(0, newlineIndex).replace(/\r$/, '');
      this.buffer = this.buffer.slice(newlineIndex + 1);
      this.push(line);
      newlineIndex = this.buffer.indexOf('\n');
    }
  }

  private push(line: string): void {
    const waiter = this.pending.shift();
    if (waiter) {
      waiter(line);
    } else {
      this.lines.push(line);
    }
  }

  private end(): void {
    if (this.ended) {
      return;
    }
    this.ended = true;
    for (const waiter of this.pending.splice(0)) {
      waiter(null);
    }
  }

  public readLine(): Promise<string | null> {
    const line = this.lines.shift();
    if (line !== undefined) {
      return Promise.resolve(line);
    }
    if (this.ended) {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      this.pending.push(resolve);
    });
  }
}

export class MpdClient {
  private socket: Socket | null = null;
  private reader: LineReader | null = null;

  public constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly logger: Logger,
  ) {}

  public async connect(): Promise<void> {
    const socket = createConnection({ host: this.host, port: this.port });
    this.socket = socket;
    this.reader = new LineReader(socket);

    socket.setTimeout(5_000);
    socket.on('timeout', () => {
      socket.destroy(new Error('MPD connection timed out'));
    });

    try {
      await once(socket, 'connect');
      const greeting = await this.reader.readLine();
      if (!greeting?.startsWith('OK MPD')) {
        throw new MpdError(`Unexpected MPD greeting: ${greeting ?? 'connection closed'}`);
      }
    } catch (error) {
      this.close();
      throw new MpdError(
        `Could not connect to MPD at ${this.host}:${this.port}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  public async command(command: string, ...args: string[]): Promise<string[]> {
    return this.sendLine([command, ...args.map(quoteArgument)].join(' '));
  }

  private async sendLine(line: string): Promise<string[]> {
    if (!this.socket || !this.reader) {
      throw new MpdError('MPD client is not connected');
    }

    this.logger.debug({ command: line }, 'sending MPD command');
    this.socket.write(`${line}\n`);

    const response: string[] = [];
    for (;;) {
      const reply = await this.reader.readLine();
      if (reply === null) {
        throw new MpdError('MPD connection closed unexpectedly');
      }
      if (reply === 'OK') {
        return response;
      }
      if (reply.startsWith('ACK')) {
        throw new MpdError(reply);
      }
      response.push(reply);
    }
  }

  public async update(): Promise<void> {
    await this.command('update');
  }

  public async searchFile(file: string): Promise<boolean> {
    const response = await this.sendLine(`search file ${quoteArgument(file)}`);
    return response.some((line) => line.startsWith('file:'));
  }

  public async waitForFile(file: string, attempts = 10, delayMs = 2_000): Promise<boolean> {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (await this.searchFile(file)) {
        return true;
      }
      this.logger.info({ file, attempt: attempt + 1 }, 'waiting for MPD to index file');
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return false;
  }

  public async add(file: string): Promise<void> {
    await this.command('add', file);
  }

  public close(): void {
    this.socket?.destroy();
    this.socket = null;
    this.reader = null;
  }
}
