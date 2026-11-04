import { useCallback, useEffect, useSyncExternalStore } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'dd-theme';
const listeners = new Set<() => void>();

function readPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch {
    // Storage may be unavailable (private mode); fall back to system.
  }
  return 'system';
}

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function applyTheme(preference: ThemePreference = readPreference()): void {
  const resolved = preference === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : preference;
  document.documentElement.dataset.theme = resolved;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useTheme() {
  const preference = useSyncExternalStore(subscribe, readPreference, () => 'system' as const);

  useEffect(() => {
    applyTheme(preference);
    if (preference !== 'system') {
      return undefined;
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      applyTheme('system');
    };
    media.addEventListener('change', onChange);
    return () => {
      media.removeEventListener('change', onChange);
    };
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore; the choice just won't persist.
    }
    listeners.forEach((listener) => {
      listener();
    });
  }, []);

  return { preference, setPreference };
}
