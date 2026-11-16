import type { BrowserWindowConstructorOptions } from 'electron';

// Matches --header-height in web/src/styles/global.css, so the native buttons centre on the page header.
export const TITLEBAR_HEIGHT = 48;
const MAC_WINDOW_BUTTON_RADIUS = 7;
// A fully transparent overlay (#00000000) is not honoured on Linux.
const TITLEBAR_COLOR = '#01000000';
const LIGHT_SYMBOL_COLOR = '#171717';
const DARK_SYMBOL_COLOR = '#eeeeee';

export type TitleBarOptions = Pick<
  BrowserWindowConstructorOptions,
  'titleBarStyle' | 'titleBarOverlay' | 'trafficLightPosition'
>;

export function windowBackground(dark: boolean): string {
  return dark ? '#000000' : '#ffffff';
}

/**
 * Hides the native title bar and keeps only the native window buttons, which the page lays out around:
 * traffic lights on macOS, a window controls overlay on Windows and Linux.
 */
export function titleBarOptions(platform: NodeJS.Platform, dark: boolean): TitleBarOptions {
  if (platform === 'darwin') {
    return {
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: TITLEBAR_HEIGHT / 2 - MAC_WINDOW_BUTTON_RADIUS },
    };
  }
  return {
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: TITLEBAR_COLOR,
      height: TITLEBAR_HEIGHT,
      symbolColor: dark ? DARK_SYMBOL_COLOR : LIGHT_SYMBOL_COLOR,
    },
  };
}

export function safeExternalUrl(raw: string): string | undefined {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function isSameOrigin(raw: string, origin: string | undefined): boolean {
  try {
    return origin !== undefined && new URL(raw).origin === origin;
  } catch {
    return false;
  }
}

/** The page loads its own scripts and talks only to the embedded server; covers and previews come from CDNs. */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https: http:",
  "media-src 'self' blob: https: http:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const RECOVERABLE_EXIT_REASONS = new Set(['crashed', 'oom', 'killed', 'abnormal-exit']);
const RECOVERY_WINDOW_MS = 60_000;
const RECOVERY_MAX_ATTEMPTS = 3;
const RECOVERY_RELOAD_DELAY_MS = 500;

/**
 * Tracks the reloads of a renderer that died and returns how long to wait before the next one, or
 * undefined when the exit should not be recovered. A crash loop backs off until the oldest attempt
 * leaves the window, so the page is never left blank for good.
 */
export function createRendererRecovery(): (reason: string, now: number) => number | undefined {
  let attempts: number[] = [];
  return (reason, now) => {
    if (!RECOVERABLE_EXIT_REASONS.has(reason)) {
      return undefined;
    }
    attempts = attempts.filter((timestamp) => now - timestamp < RECOVERY_WINDOW_MS);
    const oldest = attempts.at(-RECOVERY_MAX_ATTEMPTS);
    const delay =
      oldest === undefined
        ? RECOVERY_RELOAD_DELAY_MS
        : Math.max(RECOVERY_RELOAD_DELAY_MS, oldest + RECOVERY_WINDOW_MS - now);
    attempts.push(now + delay);
    return delay;
  };
}
