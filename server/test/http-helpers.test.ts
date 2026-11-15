import { describe, expect, it } from 'vitest';

import { checkBasicAuth } from '../src/http/auth.js';
import { contentDisposition } from '../src/http/static.js';

const credentials = { user: 'me', password: 'pa:ss word' };

function basic(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
}

describe('checkBasicAuth', () => {
  it('accepts the configured credentials, including a password with a colon', () => {
    expect(checkBasicAuth(basic('me', 'pa:ss word'), credentials)).toBe(true);
    expect(checkBasicAuth(basic('me', 'pa:ss word').replace('Basic', 'basic'), credentials)).toBe(true);
  });

  it('rejects wrong, partial and malformed credentials', () => {
    expect(checkBasicAuth(basic('me', 'wrong'), credentials)).toBe(false);
    expect(checkBasicAuth(basic('you', 'pa:ss word'), credentials)).toBe(false);
    expect(checkBasicAuth(basic('me', 'pa:ss word!'), credentials)).toBe(false);
    expect(checkBasicAuth(`Basic ${Buffer.from('no-separator').toString('base64')}`, credentials)).toBe(false);
    expect(checkBasicAuth('Bearer token', credentials)).toBe(false);
    expect(checkBasicAuth('', credentials)).toBe(false);
    expect(checkBasicAuth(undefined, credentials)).toBe(false);
  });
});

describe('contentDisposition', () => {
  it('keeps plain ASCII names readable', () => {
    expect(contentDisposition('Album.zip')).toBe(`attachment; filename="Album.zip"; filename*=UTF-8''Album.zip`);
  });

  it('offers an ASCII fallback and an encoded name for everything else', () => {
    expect(contentDisposition('Björk "Best" (1).zip')).toBe(
      `attachment; filename="Bj_rk _Best_ (1).zip"; filename*=UTF-8''Bj%C3%B6rk%20%22Best%22%20%281%29.zip`,
    );
  });
});
