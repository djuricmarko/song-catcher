import { afterEach, describe, expect, it, vi } from 'vitest';

import { syncWindowChrome } from '../../src/lib/windowChrome';

const classes = () => [...document.documentElement.classList].sort();

afterEach(() => {
  document.documentElement.className = '';
});

describe('syncWindowChrome', () => {
  it('leaves a browser tab unmarked', () => {
    syncWindowChrome(undefined);
    expect(classes()).toEqual([]);
  });

  it('marks the desktop app, and the traffic lights on macOS', () => {
    syncWindowChrome('linux');
    expect(classes()).toEqual(['desktop']);
    syncWindowChrome('darwin');
    expect(classes()).toEqual(['desktop', 'desktop-mac']);
  });

  it('follows the window controls overlay as it appears and goes', () => {
    const overlay = Object.assign(new EventTarget(), { visible: true });
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { windowControlsOverlay: overlay }));

    syncWindowChrome('linux');
    expect(classes()).toEqual(['desktop', 'wco']);

    overlay.visible = false;
    overlay.dispatchEvent(new Event('geometrychange'));
    expect(classes()).toEqual(['desktop']);
  });
});
