import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from '../src/App';
import { MockEventSource, installDesktopApp, makeTask, mockFetch, renderWithProviders } from './utils';

function setup(route = '/') {
  mockFetch({
    'GET /config': { version: '9.9.9', useMpd: false, urlPrefix: '' },
    'GET /queue': [],
    'GET /debug': { debug_msg: 'log' },
    'GET /files?path=': { path: '', entries: [] },
    'GET /files?path=some%2Fdir': { path: 'some/dir', entries: [] },
  });
  renderWithProviders(<App />, { route, withQueue: true });
}

const breadcrumb = () => screen.getByRole('navigation', { name: 'Breadcrumb' });

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

describe('App', () => {
  it('opens on a new YouTube download with the queue beside it', () => {
    setup();
    expect(breadcrumb()).toHaveTextContent('YouTube/New Download');
    expect(screen.getByLabelText('Video URL')).toBeInTheDocument();
    expect(screen.getByText('No downloads in progress')).toBeInTheDocument();
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it.each([
    ['/youtube', 'YouTube/New Download'],
    ['/deezer', 'Deezer/New Download'],
    ['/files', 'YouTube/New Download'],
    ['/nope', 'YouTube/New Download'],
  ])('routes %s', (route, crumbs) => {
    setup(route);
    expect(breadcrumb()).toHaveTextContent(crumbs);
  });

  it('starts a new download for the picked source', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'New download' }));
    const dialog = await screen.findByRole('dialog', { name: 'New download' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Deezer' }));
    expect(breadcrumb()).toHaveTextContent('Deezer/New Download');
    expect(screen.getByLabelText('Search query')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each(['Settings', 'Logs', 'Library'])(
    'opens %s in a dialog from the sidebar footer and closes it',
    async (name) => {
      setup();
      await userEvent.click(screen.getByRole('button', { name }));
      const dialog = await screen.findByRole('dialog', { name });

      await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(breadcrumb()).toHaveTextContent('YouTube/New Download');
    },
  );

  it('switches views and opens the library and logs with Ctrl+Shift+digit', async () => {
    setup();
    fireEvent.keyDown(window, { code: 'Digit2', key: '@', ctrlKey: true, shiftKey: true });
    expect(breadcrumb()).toHaveTextContent('Deezer/New Download');

    fireEvent.keyDown(window, { code: 'Digit3', key: '#', ctrlKey: true, shiftKey: true });
    expect(await screen.findByRole('dialog', { name: 'Library' })).toBeInTheDocument();
    fireEvent.keyDown(window, { code: 'Digit4', key: '$', ctrlKey: true, shiftKey: true });
    expect(await screen.findByRole('dialog', { name: 'Logs' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Library' })).not.toBeInTheDocument();
    });

    fireEvent.keyDown(window, { code: 'Digit7', key: '&', ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(window, { code: 'Digit1', key: '!', ctrlKey: true, shiftKey: true, altKey: true });
    fireEvent.keyDown(window, { code: 'Digit1', key: '1', ctrlKey: true });
    expect(screen.getByRole('dialog', { name: 'Logs' })).toBeInTheDocument();

    fireEvent.keyDown(window, { code: 'Digit1', key: '!', ctrlKey: true, shiftKey: true });
    expect(breadcrumb()).toHaveTextContent('YouTube/New Download');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('focuses the composer with Ctrl+M but not with other modifiers', () => {
    setup('/deezer');
    fireEvent.keyDown(window, { key: 'm', ctrlKey: true, altKey: true });
    expect(document.activeElement).not.toBe(screen.getByLabelText('Search query'));
    fireEvent.keyDown(window, { key: 'M', ctrlKey: true });
    expect(document.activeElement).toBe(screen.getByLabelText('Search query'));
  });

  it('opens the settings when the desktop app asks for them', async () => {
    let openSettings: (() => void) | undefined;
    const unsubscribe = vi.fn();
    installDesktopApp({
      onOpenSettings: (listener) => {
        openSettings = listener;
        return unsubscribe;
      },
    });
    setup();
    act(() => {
      openSettings?.();
    });
    expect(await screen.findByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    expect(await screen.findByLabelText('Search settings')).toBeInTheDocument();
  });

  it('hides the sidebar and remembers it', async () => {
    setup();
    act(() => {
      MockEventSource.latest().emit('snapshot', [makeTask({ id: 1, title: 'Queued song' })]);
    });
    expect(screen.getByText('Queued song')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Hide sidebar' }));
    expect(screen.queryByText('Queued song')).not.toBeInTheDocument();
    expect(window.localStorage.getItem('sc-sidebar')).toBe('collapsed');

    await userEvent.click(screen.getByRole('button', { name: 'Show sidebar' }));
    expect(screen.getByText('Queued song')).toBeInTheDocument();
    expect(window.localStorage.getItem('sc-sidebar')).toBe('open');
  });

  it('starts with the sidebar hidden when it was left that way', () => {
    window.localStorage.setItem('sc-sidebar', 'collapsed');
    setup();
    expect(screen.getByRole('button', { name: 'Show sidebar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New download' })).not.toBeInTheDocument();
  });

  it('offers the application menu where the desktop window has no menu bar', async () => {
    const showMenu = vi.fn();
    installDesktopApp({ showMenu });
    setup();
    const button = screen.getByRole('button', { name: 'Menu' });
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(new DOMRect(900, 11, 26, 26));
    await userEvent.click(button);
    expect(showMenu).toHaveBeenCalledWith(900, 41);
  });

  it('has no menu button in a browser', () => {
    setup();
    expect(screen.queryByRole('button', { name: 'Menu' })).not.toBeInTheDocument();
  });

  it('removes the keyboard listener on unmount', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    mockFetch({ 'GET /config': { version: '1', useMpd: false, urlPrefix: '' }, 'GET /queue': [] });
    const { unmount } = renderWithProviders(<App />, { withQueue: true });
    unmount();
    expect(remove).toHaveBeenCalledWith('keydown', expect.any(Function));
  });
});
