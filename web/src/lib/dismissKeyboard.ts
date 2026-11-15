export function dismissKeyboard(): void {
  if (!window.matchMedia('(pointer: coarse)').matches) {
    return;
  }
  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    active.blur();
  }
}
