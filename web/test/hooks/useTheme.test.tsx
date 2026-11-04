import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { applyTheme, useTheme } from '../../src/hooks/useTheme';
import { setMatchMedia } from '../utils';

const DARK = '(prefers-color-scheme: dark)';
let meta: HTMLMetaElement;

beforeEach(() => {
  meta = document.createElement('meta');
  meta.name = 'theme-color';
  document.head.append(meta);
});

afterEach(() => {
  meta.remove();
});

describe('applyTheme', () => {
  it('applies explicit preferences and the matching theme colour', () => {
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(meta.content).toBe('#0c0b0a');
    applyTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(meta.content).toBe('#e6e1d5');
  });

  it('resolves system from prefers-color-scheme', () => {
    setMatchMedia({ [DARK]: true });
    applyTheme('system');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('defaults to the stored preference and works without a meta tag', () => {
    meta.remove();
    window.localStorage.setItem('dd-theme', 'dark');
    applyTheme();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('ignores invalid stored values', () => {
    window.localStorage.setItem('dd-theme', 'purple');
    applyTheme();
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});

describe('useTheme', () => {
  it('defaults to system and follows OS changes', () => {
    const media = setMatchMedia({ [DARK]: false });
    const { result, unmount } = renderHook(() => useTheme());
    expect(result.current.preference).toBe('system');
    expect(document.documentElement.dataset.theme).toBe('light');

    act(() => {
      media.change(DARK, true);
    });
    expect(document.documentElement.dataset.theme).toBe('dark');

    unmount();
    expect(media.listeners.get(DARK)?.size).toBe(0);
  });

  it('persists a new preference and notifies every subscriber', () => {
    const first = renderHook(() => useTheme());
    const second = renderHook(() => useTheme());

    act(() => {
      first.result.current.setPreference('dark');
    });

    expect(window.localStorage.getItem('dd-theme')).toBe('dark');
    expect(first.result.current.preference).toBe('dark');
    expect(second.result.current.preference).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('falls back to system when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const { result } = renderHook(() => useTheme());
    expect(result.current.preference).toBe('system');
    expect(() => {
      act(() => {
        result.current.setPreference('light');
      });
    }).not.toThrow();
    expect(result.current.preference).toBe('system');
  });
});
