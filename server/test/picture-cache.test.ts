import { describe, expect, it, vi } from 'vitest';

import { PictureCache } from '../src/deezer/picture-cache.js';

const picture = (name: string) => Promise.resolve(Buffer.from(name));

describe('PictureCache', () => {
  it('loads a picture once and shares the pending promise', async () => {
    const cache = new PictureCache(2);
    const load = vi.fn(() => picture('a'));

    const first = cache.get('a', load);
    const second = cache.get('a', load);

    expect(second).toBe(first);
    expect(load).toHaveBeenCalledTimes(1);
    expect((await first)?.toString()).toBe('a');
  });

  it('evicts the least recently used picture when full', () => {
    const cache = new PictureCache(2);
    const load = vi.fn((name: string) => () => picture(name));

    void cache.get('a', load('a'));
    void cache.get('b', load('b'));
    // Touch "a" so "b" becomes the oldest.
    void cache.get('a', load('a'));
    void cache.get('c', load('c'));

    const reloadA = vi.fn(() => picture('a'));
    const reloadB = vi.fn(() => picture('b'));
    void cache.get('a', reloadA);
    void cache.get('b', reloadB);

    expect(reloadA).not.toHaveBeenCalled();
    expect(reloadB).toHaveBeenCalledTimes(1);
  });

  it('loads again after an entry was deleted', () => {
    const cache = new PictureCache(2);
    const load = vi.fn(() => picture('a'));

    void cache.get('a', load);
    cache.delete('a');
    void cache.get('a', load);

    expect(load).toHaveBeenCalledTimes(2);
  });
});
