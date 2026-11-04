/**
 * Close the on-screen keyboard after a form submit on touch devices so the
 * results (and the toast) are not hidden behind it. No-op with a mouse.
 */
export function dismissKeyboard(): void {
  if (!window.matchMedia('(pointer: coarse)').matches) {
    return;
  }
  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    active.blur();
  }
}
