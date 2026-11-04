import { act, screen } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { COMPACT_LAYOUT_QUERY } from '../src/hooks/useMediaQuery';
import { mockFetch, setMatchMedia } from './utils';

let root: HTMLDivElement | null = null;

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('scrollTo', vi.fn());
  mockFetch({ 'GET /config': { version: '1', useMpd: false, urlPrefix: '' }, 'GET /queue': [] });
});

afterEach(() => {
  root?.remove();
  root = null;
  document.querySelectorAll('section[aria-label^="Notifications"]').forEach((node) => node.remove());
});

async function boot() {
  root = document.createElement('div');
  root.id = 'root';
  document.body.append(root);
  await act(async () => {
    await import('../src/main');
  });
  await act(async () => {
    toast('hello');
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return document.querySelector('[data-sonner-toaster]');
}

describe('main', () => {
  it('throws without a #root element', async () => {
    await expect(import('../src/main')).rejects.toThrow('Missing #root element');
  });

  it('mounts the app with a bottom-right toaster on wide screens', async () => {
    const toaster = await boot();
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Find something worth keeping');
    expect(toaster).toHaveAttribute('data-x-position', 'right');
    expect(toaster).toHaveAttribute('data-y-position', 'bottom');
  });

  it('centres the toaster above the tab bar on compact screens', async () => {
    setMatchMedia({ [COMPACT_LAYOUT_QUERY]: true });
    const toaster = await boot();
    expect(toaster).toHaveAttribute('data-x-position', 'center');
  });
});
