interface WindowControlsOverlay extends EventTarget {
  readonly visible: boolean;
}

/**
 * Marks the document for the desktop app's custom title bar: `desktop` when the page draws the title bar
 * itself, `desktop-mac` when the traffic lights sit in its left corner, and `wco` while native window
 * buttons overlay the page and report their geometry through the titlebar-area CSS variables.
 */
export function syncWindowChrome(platform: string | undefined): void {
  const root = document.documentElement;
  root.classList.toggle('desktop', platform !== undefined);
  root.classList.toggle('desktop-mac', platform === 'darwin');

  const overlay = (navigator as Navigator & { windowControlsOverlay?: WindowControlsOverlay }).windowControlsOverlay;
  if (!overlay) {
    return;
  }
  const update = () => {
    root.classList.toggle('wco', overlay.visible);
  };
  overlay.addEventListener('geometrychange', update);
  update();
}
