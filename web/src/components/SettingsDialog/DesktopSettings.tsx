import { AlertDialog } from '@base-ui/react/alert-dialog';
import {
  AudioLines,
  CircleCheck,
  FolderOpen,
  Info,
  ListMusic,
  RotateCcw,
  SlidersHorizontal,
  TriangleAlert,
  Wrench,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import type { DesktopSettings, DesktopSettingsState, DesktopTool, SettingsBridge } from '@song-catcher/shared';

import { cn } from '../../lib/cn';
import { pluralize } from '../../lib/format';
import { Alert } from '../Alert';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Switch } from '../ui/Switch';
import { SettingsLayout, SettingValue, THEME_OPTIONS, type SettingsRow } from './SettingsLayout';

import styles from './DesktopSettings.module.css';

const TOOL_PURPOSES: Record<DesktopTool, string> = {
  'yt-dlp': 'Downloads YouTube audio. Use Update yt-dlp in the app menu when YouTube downloads start failing.',
  ffmpeg: 'Extracts the audio track from YouTube videos.',
  metaflac: 'Writes tags into FLAC downloads. Part of the flac package.',
};

function numberOr(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function changedSettings(saved: DesktopSettings, draft: DesktopSettings): Array<keyof DesktopSettings> {
  return (Object.keys(draft) as Array<keyof DesktopSettings>).filter(
    (key) => key !== 'theme' && draft[key] !== saved[key],
  );
}

interface DesktopSettingsProps {
  bridge: SettingsBridge;
  mode: 'dialog' | 'window';
  onClose: () => void;
  activeDownloads?: number;
}

function SettingsForm({
  bridge,
  mode,
  onClose,
  activeDownloads = 0,
  state,
}: DesktopSettingsProps & { state: DesktopSettingsState }) {
  const [draft, setDraft] = useState(state.settings);
  const [message, setMessage] = useState(state.notice);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const inDialog = mode === 'dialog';
  const flacAvailable = state.tools.metaflac;
  const changed = changedSettings(state.settings, draft);
  const restored = { ...state.defaults, arl: draft.arl };

  function update(patch: Partial<DesktopSettings>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function changeTheme(theme: DesktopSettings['theme']) {
    update({ theme });
    bridge.setTheme(theme);
  }

  function save() {
    setConfirming(false);
    setSaving(true);
    setMessage(undefined);
    void bridge.save(draft).then((result) => {
      if (result.ok) {
        onClose();
        return;
      }
      setSaving(false);
      setMessage(result.message);
    });
  }

  const mpdRows: SettingsRow[] = draft.mpdEnabled
    ? [
        {
          title: 'Host',
          controlId: 'mpd-host',
          control: (
            <Input
              id="mpd-host"
              className={styles.wide}
              value={draft.mpdHost}
              onChange={(event) => {
                update({ mpdHost: event.target.value });
              }}
              spellCheck={false}
            />
          ),
        },
        {
          title: 'Port',
          controlId: 'mpd-port',
          control: (
            <Input
              id="mpd-port"
              type="number"
              min={1}
              max={65535}
              className={styles.number}
              value={draft.mpdPort}
              onChange={(event) => {
                update({ mpdPort: numberOr(event.target.value, draft.mpdPort) });
              }}
            />
          ),
        },
        {
          title: 'Music directory',
          description: 'The music folder MPD reads. The download folder must be inside it.',
          controlId: 'mpd-music-dir',
          control: (
            <Input
              id="mpd-music-dir"
              className={styles.wide}
              value={draft.mpdMusicDir}
              onChange={(event) => {
                update({ mpdMusicDir: event.target.value });
              }}
              spellCheck={false}
            />
          ),
        },
      ]
    : [];

  return (
    <>
      <SettingsLayout
        windowed={!inDialog}
        initialPage={state.notice || !state.settings.arl ? 'deezer' : 'general'}
        onClose={inDialog ? onClose : undefined}
        notice={
          message ? (
            <Alert>
              <p className={styles.message}>{message}</p>
            </Alert>
          ) : null
        }
        actions={
          <Button
            size="sm"
            variant="ghost"
            disabled={(Object.keys(restored) as Array<keyof DesktopSettings>).every(
              (key) => draft[key] === restored[key],
            )}
            onClick={() => {
              setDraft(restored);
              if (draft.theme !== restored.theme) {
                bridge.setTheme(restored.theme);
              }
            }}
          >
            <RotateCcw size={13} aria-hidden />
            Restore defaults
          </Button>
        }
        footer={
          <footer className={styles.footer}>
            <p className={styles.footerHint}>
              {inDialog
                ? changed.length > 0
                  ? pluralize(changed.length, 'unsaved change')
                  : ''
                : 'Saving starts the download service.'}
            </p>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={saving || (inDialog && changed.length === 0)}
              onClick={() => {
                if (inDialog) {
                  setConfirming(true);
                } else {
                  save();
                }
              }}
            >
              {saving ? (inDialog ? 'Reloading…' : 'Starting…') : 'Save'}
            </Button>
          </footer>
        }
        pages={[
          {
            id: 'general',
            label: 'General',
            icon: SlidersHorizontal,
            groups: [
              {
                title: 'Appearance',
                rows: [
                  {
                    title: 'Theme',
                    description: 'Follow the system or keep Song Catcher light or dark. Applies straight away.',
                    control: (
                      <Select
                        variant="field"
                        aria-label="Theme"
                        value={draft.theme}
                        onValueChange={changeTheme}
                        options={THEME_OPTIONS}
                      />
                    ),
                  },
                ],
              },
              {
                title: 'Downloads',
                rows: [
                  {
                    title: 'Download folder',
                    description: 'Where Song Catcher saves music. The library lists this folder.',
                    controlId: 'download-dir',
                    control: (
                      <>
                        <Input
                          id="download-dir"
                          className={styles.wide}
                          value={draft.downloadDir}
                          onChange={(event) => {
                            update({ downloadDir: event.target.value });
                          }}
                          spellCheck={false}
                        />
                        <Button
                          variant="outline"
                          onClick={() => {
                            void bridge.chooseDirectory(draft.downloadDir).then((downloadDir) => {
                              if (downloadDir) {
                                update({ downloadDir });
                              }
                            });
                          }}
                        >
                          <FolderOpen size={14} aria-hidden />
                          Choose…
                        </Button>
                      </>
                    ),
                  },
                  {
                    title: 'Parallel downloads',
                    description: 'How many downloads run at the same time, from 1 to 32.',
                    controlId: 'workers',
                    control: (
                      <Input
                        id="workers"
                        type="number"
                        min={1}
                        max={32}
                        className={styles.number}
                        value={draft.workers}
                        onChange={(event) => {
                          update({ workers: numberOr(event.target.value, draft.workers) });
                        }}
                      />
                    ),
                  },
                  {
                    title: 'YouTube playlist limit',
                    description: 'The most videos taken from one YouTube playlist.',
                    controlId: 'playlist-max',
                    control: (
                      <Input
                        id="playlist-max"
                        type="number"
                        min={1}
                        max={10000}
                        className={styles.number}
                        value={draft.youtubePlaylistMax}
                        onChange={(event) => {
                          update({ youtubePlaylistMax: numberOr(event.target.value, draft.youtubePlaylistMax) });
                        }}
                      />
                    ),
                  },
                ],
              },
            ],
          },
          {
            id: 'deezer',
            label: 'Deezer',
            icon: AudioLines,
            groups: [
              {
                title: 'Account',
                rows: [
                  {
                    title: 'ARL cookie',
                    description: `Log in to deezer.com in a browser, open the developer tools and copy the value of the arl cookie. It works like a password${state.secretsEncrypted ? ' and is stored encrypted on this computer.' : '; keep it private.'}`,
                    controlId: 'arl',
                    control: (
                      <Input
                        id="arl"
                        type="password"
                        className={styles.wide}
                        value={draft.arl}
                        onChange={(event) => {
                          update({ arl: event.target.value });
                        }}
                        autoComplete="off"
                        spellCheck={false}
                        autoFocus={!draft.arl}
                      />
                    ),
                  },
                ],
              },
              {
                title: 'Audio',
                rows: [
                  {
                    title: 'Quality',
                    description: flacAvailable
                      ? 'FLAC needs a lossless Deezer account; other accounts get MP3.'
                      : 'FLAC needs the metaflac tool (part of the flac package), which was not found on this computer.',
                    control: (
                      <Select
                        variant="field"
                        aria-label="Quality"
                        value={flacAvailable ? draft.quality : 'mp3'}
                        onValueChange={(quality) => {
                          update({ quality });
                        }}
                        options={[
                          { value: 'mp3', label: 'MP3' },
                          ...(flacAvailable ? [{ value: 'flac', label: 'FLAC' } as const] : []),
                        ]}
                      />
                    ),
                  },
                ],
              },
              {
                title: 'Network',
                rows: [
                  {
                    title: 'Proxy',
                    description: 'Optional. Sends Deezer traffic through an https://, socks5:// or socks5h:// proxy.',
                    controlId: 'proxy',
                    control: (
                      <Input
                        id="proxy"
                        className={styles.wide}
                        value={draft.proxyUrl}
                        onChange={(event) => {
                          update({ proxyUrl: event.target.value });
                        }}
                        placeholder="socks5://127.0.0.1:1080"
                        spellCheck={false}
                      />
                    ),
                  },
                ],
              },
            ],
          },
          {
            id: 'mpd',
            label: 'MPD',
            icon: ListMusic,
            groups: [
              {
                title: 'Music Player Daemon',
                rows: [
                  {
                    title: 'Send downloads to MPD',
                    description: 'Updates the MPD library and can add downloads to the current playlist.',
                    control: (
                      <Switch
                        aria-label="Send downloads to MPD"
                        checked={draft.mpdEnabled}
                        onCheckedChange={(mpdEnabled) => {
                          update({ mpdEnabled });
                        }}
                      />
                    ),
                  },
                  ...mpdRows,
                ],
              },
            ],
          },
          {
            id: 'tools',
            label: 'Tools',
            icon: Wrench,
            groups: [
              {
                title: 'Helpers',
                rows: (Object.keys(TOOL_PURPOSES) as DesktopTool[]).map((tool) => {
                  const found = state.tools[tool];
                  const Icon = found ? CircleCheck : TriangleAlert;
                  return {
                    title: tool,
                    description: TOOL_PURPOSES[tool],
                    control: (
                      <span className={cn(styles.status, found ? styles.found : styles.missing)}>
                        <Icon size={13} aria-hidden />
                        {found ? 'Found' : 'Missing'}
                      </span>
                    ),
                  };
                }),
              },
            ],
          },
          {
            id: 'about',
            label: 'About',
            icon: Info,
            bottom: true,
            groups: [
              {
                title: 'Song Catcher',
                rows: [
                  { title: 'Version', control: <SettingValue>v{state.version}</SettingValue> },
                  {
                    title: 'ARL storage',
                    description: state.secretsEncrypted
                      ? 'Encrypted with the system keyring.'
                      : 'No system keyring was found, so the cookie is stored unencrypted in the settings file.',
                  },
                ],
              },
            ],
          },
        ]}
      />

      <AlertDialog.Root open={confirming} onOpenChange={setConfirming}>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className={styles.confirmBackdrop} />
          <AlertDialog.Popup className={styles.confirm}>
            <AlertDialog.Title className={styles.confirmTitle}>Reload Song Catcher?</AlertDialog.Title>
            <AlertDialog.Description className={styles.confirmText}>
              {changed.includes('arl')
                ? 'Song Catcher signs in to Deezer with the new ARL cookie once the download service restarts and the app reloads.'
                : 'The new settings take effect once the download service restarts and the app reloads.'}
              {activeDownloads > 0 ? ` ${pluralize(activeDownloads, 'download')} in progress will stop.` : ''}
            </AlertDialog.Description>
            <div className={styles.confirmActions}>
              <AlertDialog.Close render={<Button variant="ghost" />}>Cancel</AlertDialog.Close>
              <Button onClick={save}>Reload</Button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}

export function DesktopSettings(props: DesktopSettingsProps) {
  const [state, setState] = useState<DesktopSettingsState>();
  const { bridge } = props;

  useEffect(() => {
    void bridge.load().then(setState);
  }, [bridge]);

  return state ? <SettingsForm {...props} state={state} /> : null;
}
