import { describe, expect, it } from 'vitest';

import { dismissKeyboard } from '../../src/lib/dismissKeyboard';
import { setMatchMedia } from '../utils';

function focusInput() {
  const input = document.createElement('input');
  document.body.append(input);
  input.focus();
  return input;
}

describe('dismissKeyboard', () => {
  it('blurs the focused element on coarse pointers', () => {
    setMatchMedia({ '(pointer: coarse)': true });
    const input = focusInput();
    expect(document.activeElement).toBe(input);
    dismissKeyboard();
    expect(document.activeElement).not.toBe(input);
    input.remove();
  });

  it('does nothing with a fine pointer', () => {
    setMatchMedia({ '(pointer: coarse)': false });
    const input = focusInput();
    dismissKeyboard();
    expect(document.activeElement).toBe(input);
    input.remove();
  });
});
