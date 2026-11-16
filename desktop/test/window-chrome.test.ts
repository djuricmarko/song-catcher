import { describe, expect, it } from 'vitest';

import {
  createRendererRecovery,
  isSameOrigin,
  safeExternalUrl,
  TITLEBAR_HEIGHT,
  titleBarOptions,
} from '../src/window-chrome.js';

describe('titleBarOptions', () => {
  it('keeps the traffic lights on macOS and centres them in the title bar', () => {
    expect(titleBarOptions('darwin', true)).toEqual({
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 17 },
    });
  });

  it('overlays the window buttons elsewhere, drawn to stay readable on the theme', () => {
    for (const platform of ['linux', 'win32'] as const) {
      const dark = titleBarOptions(platform, true);
      const light = titleBarOptions(platform, false);
      expect(dark.titleBarStyle).toBe('hidden');
      expect(dark.titleBarOverlay).toMatchObject({ height: TITLEBAR_HEIGHT, symbolColor: '#eeeeee' });
      expect(light.titleBarOverlay).toMatchObject({ height: TITLEBAR_HEIGHT, symbolColor: '#171717' });
    }
  });
});

describe('safeExternalUrl', () => {
  it('passes web links through', () => {
    expect(safeExternalUrl('https://www.deezer.com/track/1')).toBe('https://www.deezer.com/track/1');
    expect(safeExternalUrl('HTTP://example.com')).toBe('http://example.com/');
  });

  it('rejects everything the shell could run or open locally', () => {
    for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'smb://host/share', 'not a url', '']) {
      expect(safeExternalUrl(url)).toBeUndefined();
    }
  });
});

describe('isSameOrigin', () => {
  it('matches only the origin of the embedded server', () => {
    expect(isSameOrigin('http://127.0.0.1:4000/files/a', 'http://127.0.0.1:4000')).toBe(true);
    expect(isSameOrigin('http://127.0.0.1:4001/', 'http://127.0.0.1:4000')).toBe(false);
    expect(isSameOrigin('https://example.com/', 'http://127.0.0.1:4000')).toBe(false);
  });

  it('treats a malformed address or a stopped server as foreign', () => {
    expect(isSameOrigin('nonsense', 'http://127.0.0.1:4000')).toBe(false);
    expect(isSameOrigin('http://127.0.0.1:4000/', undefined)).toBe(false);
  });
});

describe('createRendererRecovery', () => {
  it('reloads shortly after a crash and leaves deliberate exits alone', () => {
    const delay = createRendererRecovery();
    expect(delay('crashed', 0)).toBe(500);
    expect(delay('oom', 10_000)).toBe(500);
    expect(delay('clean-exit', 20_000)).toBeUndefined();
  });

  it('backs off in a crash loop until the oldest attempt is a minute old', () => {
    const delay = createRendererRecovery();
    expect(delay('crashed', 0)).toBe(500);
    expect(delay('crashed', 1_000)).toBe(500);
    expect(delay('crashed', 2_000)).toBe(500);
    expect(delay('crashed', 3_000)).toBe(57_500);
    expect(delay('crashed', 200_000)).toBe(500);
  });
});
