import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export function useKeyboardShortcuts(paths: readonly string[]): void {
  const navigate = useNavigate();

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
        const path = paths[Number(digit) - 1];
        if (path) {
          event.preventDefault();
          void navigate(path);
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [navigate, paths]);
}
