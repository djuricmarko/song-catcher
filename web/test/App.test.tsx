import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from '../src/App';
import { MockEventSource, makeTask, mockFetch, renderWithProviders } from './utils';

function setup(route = '/', useMpd = false) {
  mockFetch({
    'GET /config': { version: '9.9.9', useMpd, urlPrefix: '' },
    'GET /queue': [],
    'GET /debug': { debug_msg: 'log' },
    'GET /files?path=': { path: '', entries: [] },
  });
  renderWithProviders(<App />, { route, withQueue: true });
}

const heading = () => screen.getByRole('heading', { level: 1 });

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

describe('App', () => {
  it('renders the shell with version and search page', async () => {
    setup();
    expect(await screen.findByText('v9.9.9')).toBeInTheDocument();
    expect(heading()).toHaveTextContent('Find something worth keeping');
    expect(screen.queryByText('MPD linked')).not.toBeInTheDocument();
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('shows a placeholder version until config loads, and MPD status', async () => {
    setup('/', true);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(await screen.findByText('MPD linked')).toBeInTheDocument();
  });

  it('navigates with sidebar and tab bar links', async () => {
    setup();
    const main = screen.getByRole('navigation', { name: 'Main' });
    await userEvent.click(within(main).getByRole('link', { name: /Video links/ }));
    expect(heading()).toHaveTextContent('Rip the audio from anywhere');

    const tabs = screen.getByRole('navigation', { name: 'Primary' });
    await userEvent.click(within(tabs).getByRole('link', { name: /Playlists/ }));
    expect(heading()).toHaveTextContent('Bring the whole crate');

    await userEvent.click(screen.getByRole('link', { name: 'Logs' }));
    expect(heading()).toHaveTextContent('Under the hood');
  });

  it.each([
    ['/files', 'Everything on the shelf'],
    ['/files/some/dir', 'Everything on the shelf'],
    ['/queue', 'On the turntable'],
    ['/nope', 'Find something worth keeping'],
  ])('routes %s', (route, title) => {
    setup(route);
    expect(heading()).toHaveTextContent(title);
  });

  it('switches pages with Ctrl+Shift+digit', () => {
    setup();
    fireEvent.keyDown(window, { code: 'Digit6', key: '^', ctrlKey: true, shiftKey: true });
    expect(heading()).toHaveTextContent('On the turntable');
    fireEvent.keyDown(window, { code: 'Digit4', key: '$', ctrlKey: true, shiftKey: true });
    expect(heading()).toHaveTextContent('Everything on the shelf');
    fireEvent.keyDown(window, { code: 'Digit7', key: '&', ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(window, { code: 'Digit1', key: '!', ctrlKey: true, shiftKey: true, altKey: true });
    fireEvent.keyDown(window, { code: 'Digit1', key: '1', ctrlKey: true });
    expect(heading()).toHaveTextContent('Everything on the shelf');
  });

  it('focuses the search box with Ctrl+M when present', () => {
    setup();
    const input = screen.getByRole('searchbox', { name: 'Search query' });
    fireEvent.keyDown(window, { key: 'M', ctrlKey: true });
    expect(document.activeElement).toBe(input);
  });

  it('ignores Ctrl+M off the search page and with modifiers', () => {
    setup('/queue');
    const event = new KeyboardEvent('keydown', { key: 'm', ctrlKey: true, cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    fireEvent.keyDown(window, { key: 'm', ctrlKey: true, altKey: true });
    expect(heading()).toHaveTextContent('On the turntable');
  });

  it('shows pending task counts in the nav and tab badge', async () => {
    setup();
    const source = MockEventSource.latest();
    act(() => {
      source.emit('snapshot', [
        makeTask({ id: 1, state: 'active' }),
        makeTask({ id: 2, state: 'waiting' }),
        makeTask({ id: 3, state: 'failed' }),
      ]);
    });
    expect(screen.getByLabelText('2 in progress')).toHaveTextContent('2');
    const main = screen.getByRole('navigation', { name: 'Main' });
    expect(within(main).getByRole('link', { name: /Queue/ })).toHaveTextContent('2');

    act(() => {
      source.emit(
        'snapshot',
        Array.from({ length: 120 }, (_, index) => makeTask({ id: index, state: 'waiting' })),
      );
    });
    await waitFor(() => {
      expect(screen.getByLabelText('120 in progress')).toHaveTextContent('99+');
    });
  });

  it('removes the keyboard listener on unmount', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    mockFetch({ 'GET /config': { version: '1', useMpd: false, urlPrefix: '' }, 'GET /queue': [] });
    const { unmount } = renderWithProviders(<App />, { withQueue: true });
    unmount();
    expect(remove).toHaveBeenCalledWith('keydown', expect.any(Function));
  });
});
