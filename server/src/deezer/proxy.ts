import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

/**
 * Builds the agent for DEEZER_PROXY_URL (validated by the config loader to be
 * https://, socks5:// or socks5h://). Using the two agents directly instead of
 * `proxy-agent` avoids its PAC/FTP dependency chain, which we never need.
 */
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
