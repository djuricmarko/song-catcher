import { createServer as createHttpServer } from 'node:http';
import { createConnection, createServer as createTcpServer, type AddressInfo, type Server } from 'node:net';

import got from 'got';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { describe, expect, it } from 'vitest';

import { createProxyAgent } from '../src/deezer/proxy.js';

describe('createProxyAgent', () => {
  it('returns no agent when no proxy is configured', () => {
    expect(createProxyAgent('')).toBeUndefined();
    expect(createProxyAgent('   ')).toBeUndefined();
  });

  it.each(['socks5://127.0.0.1:9050', 'socks5h://127.0.0.1:9050'])('uses a SOCKS agent for %s', (url) => {
    expect(createProxyAgent(url)).toBeInstanceOf(SocksProxyAgent);
  });

  it('uses a CONNECT agent for https proxies', () => {
    expect(createProxyAgent('https://user:pass@proxy.example:3128')).toBeInstanceOf(HttpsProxyAgent);
  });

  it('rejects protocols the config loader would not allow', () => {
    expect(() => createProxyAgent('ftp://proxy.example')).toThrowError(/Unsupported proxy protocol/);
  });
});

/** Minimal SOCKS5 server: no auth, CONNECT only, IPv4/domain addresses. */
function startSocksServer(): Promise<{ server: Server; port: number; connections: string[] }> {
  const connections: string[] = [];
  const server = createTcpServer((client) => {
    client.once('data', () => {
      client.write(Buffer.from([0x05, 0x00]));
      client.once('data', (request) => {
        const addressType = request[3];
        let host: string;
        let offset: number;
        if (addressType === 0x01) {
          host = Array.from(request.subarray(4, 8)).join('.');
          offset = 8;
        } else {
          const length = request[4] ?? 0;
          host = request.subarray(5, 5 + length).toString();
          offset = 5 + length;
        }
        const port = request.readUInt16BE(offset);
        connections.push(`${host}:${port}`);
        const upstream = createConnection({ host, port }, () => {
          client.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
          client.pipe(upstream).pipe(client);
        });
        upstream.on('error', () => client.destroy());
      });
    });
    client.on('error', () => undefined);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: (server.address() as AddressInfo).port, connections });
    });
  });
}

describe('SOCKS proxy with got', () => {
  it('routes requests through the proxy', async () => {
    const target = createHttpServer((_request, response) => {
      response.end('via proxy');
    });
    await new Promise<void>((resolve) => target.listen(0, '127.0.0.1', resolve));
    const targetPort = (target.address() as AddressInfo).port;
    const socks = await startSocksServer();

    try {
      const agent = createProxyAgent(`socks5h://127.0.0.1:${socks.port}`)!;
      const body = await got(`http://localhost:${targetPort}/`, {
        agent: { http: agent, https: agent },
        retry: { limit: 0 },
      }).text();

      expect(body).toBe('via proxy');
      // socks5h resolves the hostname on the proxy side.
      expect(socks.connections).toEqual([`localhost:${targetPort}`]);
    } finally {
      target.close();
      socks.server.close();
    }
  });
});
