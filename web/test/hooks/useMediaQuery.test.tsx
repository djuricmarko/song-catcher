import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { COMPACT_LAYOUT_QUERY, useMediaQuery } from '../../src/hooks/useMediaQuery';
import { setMatchMedia } from '../utils';

describe('useMediaQuery', () => {
  it('tracks the media query and unsubscribes on unmount', () => {
    const media = setMatchMedia({ [COMPACT_LAYOUT_QUERY]: false });
    const { result, unmount } = renderHook(() => useMediaQuery(COMPACT_LAYOUT_QUERY));
    expect(result.current).toBe(false);

    act(() => {
      media.change(COMPACT_LAYOUT_QUERY, true);
    });
    expect(result.current).toBe(true);

    unmount();
    expect(media.listeners.get(COMPACT_LAYOUT_QUERY)?.size).toBe(0);
  });
});
