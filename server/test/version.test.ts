import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('VERSION', () => {
  it('reads the version from package.json', async () => {
    vi.stubEnv('SONG_CATCHER_VERSION', undefined);
    vi.resetModules();
    const { VERSION } = await import('../src/version.js');

    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('prefers the version a host application passes in', async () => {
    vi.stubEnv('SONG_CATCHER_VERSION', '9.9.9');
    vi.resetModules();
    const { VERSION } = await import('../src/version.js');

    expect(VERSION).toBe('9.9.9');
  });
});
