import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

export type ProxyAgent = HttpsProxyAgent<string> | SocksProxyAgent;

export function createProxyAgent(proxyUrl: string): ProxyAgent | undefined {
  const trimmed = proxyUrl.trim();
  if (!trimmed) {
    return undefined;
  }
  const protocol = new URL(trimmed).protocol;
  if (protocol === 'socks5:' || protocol === 'socks5h:') {
    return new SocksProxyAgent(trimmed);
  }
  if (protocol === 'https:') {
    return new HttpsProxyAgent(trimmed);
  }
  throw new Error(`Unsupported proxy protocol: ${protocol}`);
}
