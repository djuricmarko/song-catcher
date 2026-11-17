import { useEffect } from 'react';

export function useKeyboardShortcuts(shortcuts: ReadonlyArray<() => void>): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'm') {
        const input = document.querySelector<HTMLInputElement>('[data-composer-input]');
        if (input) {
          event.preventDefault();
          input.focus();
        }
        return;
      }

      // `code` rather than `key`: with Shift held, `key` is the symbol on that key.
      const digit = /^Digit([1-9])$/.exec(event.code)?.[1];
      if (event.ctrlKey && event.shiftKey && !event.altKey && digit) {
        const shortcut = shortcuts[Number(digit) - 1];
        if (shortcut) {
          event.preventDefault();
          shortcut();
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [shortcuts]);
}
