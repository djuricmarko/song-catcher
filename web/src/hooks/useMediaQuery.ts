import { useCallback, useSyncExternalStore } from 'react';

/** Live result of a CSS media query. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener('change', onChange);
      return () => {
        media.removeEventListener('change', onChange);
      };
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Matches the breakpoint where the sidebar turns into a top bar + bottom tab bar. */
export const COMPACT_LAYOUT_QUERY = '(max-width: 820px)';
