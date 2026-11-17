import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { DesktopSettingsState, SettingsBridge } from '@song-catcher/shared';

import { SettingsDialog } from '../../src/components/SettingsDialog';
import { DesktopSettings } from '../../src/components/SettingsDialog/DesktopSettings';
import {
  MockEventSource,
  installDesktopApp,
  makeSettingsState,
  makeTask,
  mockFetch,
  renderWithProviders,
} from '../utils';

function renderDialog() {
  const onOpenChange = vi.fn();
  mockFetch({ 'GET /config': { version: '9.9.9', useMpd: true, urlPrefix: '' }, 'GET /queue': [] });
  renderWithProviders(<SettingsDialog open onOpenChange={onOpenChange} />, { withQueue: true });
  return onOpenChange;
}

async function renderDesktopDialog(state: DesktopSettingsState = makeSettingsState()) {
  const app = installDesktopApp();
  vi.mocked(app.settings.load).mockResolvedValue(state);
  const onOpenChange = renderDialog();
  const dialog = await screen.findByRole('dialog', { name: 'Settings' });
  await within(dialog).findByLabelText('Search settings');
  return { bridge: app.settings, onOpenChange, dialog };
}

const header = (dialog: HTMLElement) => within(dialog).getByRole('heading', { level: 2 });

async function openPage(dialog: HTMLElement, label: string) {
  await userEvent.click(
    within(within(dialog).getByRole('navigation', { name: 'Settings sections' })).getByRole('button', { name: label }),
  );
}

async function choose(dialog: HTMLElement, select: string, option: string) {
  await userEvent.click(within(dialog).getByRole('combobox', { name: select }));
  await userEvent.click(await screen.findByRole('option', { name: option }));
}

describe('SettingsDialog in a browser', () => {
  it('shows the theme and what the server reports', async () => {
    renderDialog();
    const dialog = await screen.findByRole('dialog', { name: 'Settings' });
    expect(header(dialog)).toHaveTextContent('Settings/General');

    await choose(dialog, 'Theme', 'Dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(window.localStorage.getItem('dd-theme')).toBe('dark');

    await openPage(dialog, 'About');
    expect(header(dialog)).toHaveTextContent('Settings/About');
    expect(await within(dialog).findByText('v9.9.9')).toBeInTheDocument();
    expect(within(dialog).getByText('Linked')).toBeInTheDocument();
  });

  it('searches every page', async () => {
    renderDialog();
    const dialog = await screen.findByRole('dialog', { name: 'Settings' });
    const search = within(dialog).getByRole('searchbox', { name: 'Search settings' });

    fireEvent.keyDown(within(dialog).getByRole('combobox', { name: 'Theme' }), { key: '/' });
    expect(search).toHaveFocus();

    await userEvent.type(search, 'music player');
    expect(header(dialog)).toHaveTextContent('Settings/Search');
    expect(within(dialog).getByText('MPD')).toBeInTheDocument();
    expect(within(dialog).queryByText('Theme')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { level: 3 })).toHaveTextContent('About / Song Catcher');

    await userEvent.clear(search);
    await userEvent.type(search, 'appearance');
    expect(within(dialog).getByText('Theme')).toBeInTheDocument();

    await userEvent.clear(search);
    await userEvent.type(search, 'zzz');
    expect(within(dialog).getByText('No settings match “zzz”')).toBeInTheDocument();
  });

  it('leaves the search when a page is picked', async () => {
    renderDialog();
    const dialog = await screen.findByRole('dialog', { name: 'Settings' });
    await userEvent.type(within(dialog).getByRole('searchbox', { name: 'Search settings' }), 'version');
    await openPage(dialog, 'About');
    expect(header(dialog)).toHaveTextContent('Settings/About');
    expect(within(dialog).getByRole('searchbox', { name: 'Search settings' })).toHaveValue('');
  });

  it('closes from its header', async () => {
    const onOpenChange = renderDialog();
    const dialog = await screen.findByRole('dialog', { name: 'Settings' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('SettingsDialog in the desktop app', () => {
  it('only saves once something changed, and the theme applies straight away', async () => {
    const { bridge, dialog } = await renderDesktopDialog();
    const save = within(dialog).getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();

    await choose(dialog, 'Theme', 'Light');
    expect(bridge.setTheme).toHaveBeenCalledWith('light');
    expect(save).toBeDisabled();

    await userEvent.clear(within(dialog).getByLabelText('Parallel downloads'));
    await userEvent.type(within(dialog).getByLabelText('Parallel downloads'), '8');
    expect(within(dialog).getByText('1 unsaved change')).toBeInTheDocument();
    expect(save).toBeEnabled();
  });

  it('asks to reload before using a new ARL and closes once saved', async () => {
    const { bridge, onOpenChange, dialog } = await renderDesktopDialog();
    act(() => {
      MockEventSource.latest().emit('snapshot', [makeTask({ state: 'active' })]);
    });
    await openPage(dialog, 'Deezer');
    await userEvent.clear(within(dialog).getByLabelText('ARL cookie'));
    await userEvent.type(within(dialog).getByLabelText('ARL cookie'), 'new-arl');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    const prompt = await screen.findByRole('alertdialog', { name: 'Reload Song Catcher?' });
    expect(prompt).toHaveTextContent('new ARL cookie');
    expect(prompt).toHaveTextContent('1 download in progress will stop.');
    expect(bridge.save).not.toHaveBeenCalled();

    await userEvent.click(within(prompt).getByRole('button', { name: 'Reload' }));
    expect(bridge.save).toHaveBeenCalledWith(expect.objectContaining({ arl: 'new-arl' }));
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('keeps editing when the reload is turned down', async () => {
    const { bridge, onOpenChange, dialog } = await renderDesktopDialog();
    await userEvent.type(within(dialog).getByLabelText('Download folder'), '/more');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    const prompt = await screen.findByRole('alertdialog', { name: 'Reload Song Catcher?' });
    expect(prompt).toHaveTextContent('The new settings take effect');
    expect(prompt).not.toHaveTextContent('in progress');
    await userEvent.click(within(prompt).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
    expect(bridge.save).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('shows why a save failed and stays open', async () => {
    const { bridge, onOpenChange, dialog } = await renderDesktopDialog();
    vi.mocked(bridge.save).mockResolvedValue({ ok: false, message: 'The proxy must start with https://' });
    await openPage(dialog, 'Deezer');
    await userEvent.type(within(dialog).getByLabelText('Proxy'), 'ftp://x');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Reload' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('The proxy must start with https://');
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('opens on the Deezer page with the notice from the app', async () => {
    const { dialog } = await renderDesktopDialog(
      makeSettingsState({ notice: 'Deezer did not accept the ARL cookie.', secretsEncrypted: false }),
    );
    expect(header(dialog)).toHaveTextContent('Settings/Deezer');
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Deezer did not accept the ARL cookie.');
    expect(within(dialog).getByText(/keep it private/)).toBeInTheDocument();
  });

  it('restores the defaults but keeps the ARL', async () => {
    const state = makeSettingsState();
    state.settings = { ...state.settings, workers: 9, theme: 'dark' };
    const { bridge, dialog } = await renderDesktopDialog(state);
    const restore = within(dialog).getByRole('button', { name: 'Restore defaults' });

    await userEvent.click(restore);
    expect(within(dialog).getByLabelText('Parallel downloads')).toHaveValue(4);
    expect(bridge.setTheme).toHaveBeenCalledWith('system');
    expect(restore).toBeDisabled();

    await openPage(dialog, 'Deezer');
    expect(within(dialog).getByLabelText('ARL cookie')).toHaveValue('old-arl');
  });

  it('picks the download folder with the system dialog', async () => {
    const { bridge, dialog } = await renderDesktopDialog();
    vi.mocked(bridge.chooseDirectory).mockResolvedValueOnce('/srv/music').mockResolvedValueOnce(undefined);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Choose…' }));
    await waitFor(() => {
      expect(within(dialog).getByLabelText('Download folder')).toHaveValue('/srv/music');
    });
    expect(bridge.chooseDirectory).toHaveBeenCalledWith('/music/Song Catcher');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Choose…' }));
    expect(within(dialog).getByLabelText('Download folder')).toHaveValue('/srv/music');
  });

  it('asks for the MPD connection once MPD is switched on', async () => {
    const { dialog } = await renderDesktopDialog();
    await openPage(dialog, 'MPD');
    expect(within(dialog).queryByLabelText('Host')).not.toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('switch', { name: 'Send downloads to MPD' }));
    expect(within(dialog).getByLabelText('Host')).toHaveValue('localhost');
    await userEvent.clear(within(dialog).getByLabelText('Port'));
    await userEvent.type(within(dialog).getByLabelText('Port'), '6601');
    await userEvent.type(within(dialog).getByLabelText('Music directory'), '/music');
    await userEvent.clear(within(dialog).getByLabelText('Host'));
    await userEvent.type(within(dialog).getByLabelText('Host'), 'nas');
    expect(within(dialog).getByText('4 unsaved changes')).toBeInTheDocument();
  });

  it('offers FLAC only with metaflac and lists the tools it found', async () => {
    const { dialog } = await renderDesktopDialog(
      makeSettingsState({ tools: { 'yt-dlp': true, ffmpeg: false, metaflac: false } }),
    );
    await openPage(dialog, 'Deezer');
    expect(within(dialog).getByText(/metaflac tool/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Quality' }));
    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual(['MP3']);
    await userEvent.keyboard('{Escape}');

    await openPage(dialog, 'Tools');
    expect(within(dialog).getAllByText('Found')).toHaveLength(1);
    expect(within(dialog).getAllByText('Missing')).toHaveLength(2);

    await openPage(dialog, 'About');
    expect(within(dialog).getByText('v3.1.0')).toBeInTheDocument();
  });

  it('switches the quality to FLAC when it can', async () => {
    const { dialog } = await renderDesktopDialog();
    await openPage(dialog, 'Deezer');
    await choose(dialog, 'Quality', 'FLAC');
    expect(within(dialog).getByRole('combobox', { name: 'Quality' })).toHaveTextContent('FLAC');
    expect(within(dialog).getByText('1 unsaved change')).toBeInTheDocument();
  });
});

describe('DesktopSettings in its own window', () => {
  function renderWindow(bridge: SettingsBridge) {
    const onClose = vi.fn();
    renderWithProviders(<DesktopSettings bridge={bridge} mode="window" onClose={onClose} />);
    return onClose;
  }

  it('starts the download service without asking and closes', async () => {
    const { settings: bridge } = installDesktopApp();
    vi.mocked(bridge.load).mockResolvedValue(
      makeSettingsState({ notice: 'Enter your Deezer ARL cookie to get started.' }),
    );
    const onClose = renderWindow(bridge);

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter your Deezer ARL cookie');
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    expect(screen.getByText('Saving starts the download service.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(bridge.save).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it('says it is starting while the service comes up', async () => {
    const { settings: bridge } = installDesktopApp();
    vi.mocked(bridge.save).mockReturnValue(new Promise(() => undefined));
    renderWindow(bridge);
    await userEvent.click(await screen.findByRole('button', { name: 'Save' }));
    expect(screen.getByRole('button', { name: 'Starting…' })).toBeDisabled();
  });

  it('closes on cancel', async () => {
    const { settings: bridge } = installDesktopApp();
    const onClose = renderWindow(bridge);
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
