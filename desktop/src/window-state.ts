import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

const windowStateSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  maximized: z.boolean(),
});

export type WindowState = z.infer<typeof windowStateSchema>;

interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Size {
  width: number;
  height: number;
}

// Window managers report edges a pixel past the display for snapped windows.
const EDGE_TOLERANCE = 1;

function fitsWithin(bounds: Rectangle, display: Rectangle): boolean {
  return (
    bounds.x >= display.x - EDGE_TOLERANCE &&
    bounds.y >= display.y - EDGE_TOLERANCE &&
    bounds.x + bounds.width <= display.x + display.width + EDGE_TOLERANCE &&
    bounds.y + bounds.height <= display.y + display.height + EDGE_TOLERANCE
  );
}

/**
 * Returns the saved bounds when they still fit one of the displays, so a window saved on a monitor that
 * has since been unplugged does not open off-screen. Otherwise the window opens centred at its default size.
 */
export function restoreWindowBounds(
  saved: WindowState | undefined,
  displays: readonly Rectangle[],
  fallback: Size,
  minimum: Size,
): Partial<Rectangle> & Size {
  if (
    saved &&
    saved.width >= minimum.width &&
    saved.height >= minimum.height &&
    displays.some((display) => fitsWithin(saved, display))
  ) {
    return { x: saved.x, y: saved.y, width: saved.width, height: saved.height };
  }
  return fallback;
}

export function loadWindowState(file: string): WindowState | undefined {
  try {
    return windowStateSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    return undefined;
  }
}

export function saveWindowState(file: string, state: WindowState): void {
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(state)}\n`);
  } catch {
    // Losing the window position is not worth interrupting the app for.
  }
}
