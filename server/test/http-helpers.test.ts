import { describe, expect, it } from 'vitest';

import { checkBasicAuth } from '../src/http/auth.js';

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
