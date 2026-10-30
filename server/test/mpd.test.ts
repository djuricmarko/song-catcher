import { once } from 'node:events';
import { createServer, type Socket } from 'node:net';

import pino from 'pino';
import { afterEach, describe, expect, it } from 'vitest';

import { MpdClient, MpdError } from '../src/mpd/client.js';

const logger = pino({ level: 'silent' });

interface FakeMpd {
  server: ReturnType<typeof createServer>;
  port: number;
  commands: string[];
  close: () => Promise<void>;
}

async function startFakeMpd(ackAdd = false): Promise<FakeMpd> {
  const commands: string[] = [];
  const server = createServer((socket: Socket) => {
    socket.write('OK MPD 0.23.5\n');
    let buffer = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        commands.push(line);
        if (line.startsWith('search ')) {
          socket.write('file: deezer/songs/song.mp3\nOK\n');
        } else if (line.startsWith('add ') && ackAdd) {
          socket.write('ACK [2@0] {add} directory not found\n');
        } else {
          socket.write('OK\n');
        }
        newlineIndex = buffer.indexOf('\n');
      }
    });
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Could not determine fake MPD port');
  }

  return {
    server,
    port: address.port,
    commands,
    close: async () => {
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    },
  };
}

const fakeServers: FakeMpd[] = [];

afterEach(async () => {
  await Promise.all(fakeServers.splice(0).map((fake) => fake.close()));
});

describe('MpdClient', () => {
  it('updates, searches and adds quoted files', async () => {
    const fake = await startFakeMpd();
    fakeServers.push(fake);

    const client = new MpdClient('127.0.0.1', fake.port, logger);
    await client.connect();
    await client.update();
    expect(await client.waitForFile('deezer/songs/song.mp3', 1, 0)).toBe(true);
    await client.add('deezer/songs/song.mp3');
    client.close();

    expect(fake.commands).toEqual([
      'update',
      'search file "deezer/songs/song.mp3"',
      'add "deezer/songs/song.mp3"',
    ]);
  });

  it('turns MPD ACK responses into errors', async () => {
    const fake = await startFakeMpd(true);
    fakeServers.push(fake);

    const client = new MpdClient('127.0.0.1', fake.port, logger);
    await client.connect();

    await expect(client.add('missing.mp3')).rejects.toBeInstanceOf(MpdError);
    client.close();
  });
});
