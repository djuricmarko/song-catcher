import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PasteButton } from '../../src/components/PasteButton';

function setClipboard(readText: (() => Promise<string>) | undefined, secure = true) {
  Object.defineProperty(window, 'isSecureContext', { value: secure, configurable: true });
  Object.defineProperty(navigator, 'clipboard', {
    value: readText ? { readText } : undefined,
    configurable: true,
  });
}

beforeEach(() => {
  vi.spyOn(toast, 'info');
  vi.spyOn(toast, 'error');
});

afterEach(() => {
  setClipboard(undefined, false);
});

describe('PasteButton', () => {
  it('renders nothing outside secure contexts', () => {
    setClipboard(async () => 'x', false);
    const { container } = render(<PasteButton onPaste={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing without the clipboard API', () => {
    setClipboard(undefined, true);
    const { container } = render(<PasteButton onPaste={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('pastes trimmed clipboard text', async () => {
    setClipboard(async () => '  https://x  ');
    const onPaste = vi.fn();
    render(<PasteButton onPaste={onPaste} />);
    await userEvent.click(screen.getByRole('button', { name: 'Paste from clipboard' }));
    await waitFor(() => {
      expect(onPaste).toHaveBeenCalledWith('https://x');
    });
  });

  it('reports an empty clipboard', async () => {
    setClipboard(async () => '   ');
    const onPaste = vi.fn();
    render(<PasteButton onPaste={onPaste} label="Paste link" />);
    await userEvent.click(screen.getByRole('button', { name: 'Paste link' }));
    await waitFor(() => {
      expect(toast.info).toHaveBeenCalledWith('Clipboard is empty');
    });
    expect(onPaste).not.toHaveBeenCalled();
  });

  it('reports blocked clipboard access', async () => {
    setClipboard(() => Promise.reject(new Error('denied')));
    render(<PasteButton onPaste={vi.fn()} />);
    await userEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Clipboard access was blocked');
    });
  });
});
