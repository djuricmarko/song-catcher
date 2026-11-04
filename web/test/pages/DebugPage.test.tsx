import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DebugPage } from '../../src/pages/DebugPage';
import { jsonResponse, mockFetch, renderWithProviders } from '../utils';

function setClipboardWrite(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
}

beforeEach(() => {
  vi.spyOn(toast, 'success');
  vi.spyOn(toast, 'error');
});

describe('DebugPage', () => {
  it('shows debug output and copies it', async () => {
    mockFetch({ 'GET /debug': { debug_msg: 'line 1\nline 2' } });
    const writeText = vi.fn(async () => undefined);
    setClipboardWrite(writeText);
    renderWithProviders(<DebugPage />);

    expect(screen.getByText('loading…')).toBeInTheDocument();
    expect(await screen.findByText(/line 1/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith('line 1\nline 2');
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Copied to clipboard');
    });
  });

  it('reports copy failures', async () => {
    mockFetch({ 'GET /debug': { debug_msg: 'x' } });
    setClipboardWrite(() => Promise.reject(new Error('nope')));
    renderWithProviders(<DebugPage />);
    await screen.findByText('x');
    await userEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Could not copy');
    });
  });

  it('shows a placeholder for empty output and disables copy', async () => {
    mockFetch({ 'GET /debug': { debug_msg: '' } });
    renderWithProviders(<DebugPage />);
    expect(await screen.findByText('no output')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled();
  });

  it('shows load errors', async () => {
    mockFetch({ 'GET /debug': () => jsonResponse({ error: 'No log file' }, { status: 500 }) });
    renderWithProviders(<DebugPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load debug output: No log file');
  });

  it('refetches on refresh', async () => {
    const fetchMock = mockFetch({ 'GET /debug': { debug_msg: 'x' } });
    renderWithProviders(<DebugPage />);
    await screen.findByText('x');
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
