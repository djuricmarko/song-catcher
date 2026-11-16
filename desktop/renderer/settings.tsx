import { Check, FolderOpen, X } from 'lucide-react';
import { StrictMode, useEffect, useState, type SubmitEvent } from 'react';
import { createRoot } from 'react-dom/client';

import { Alert } from '../../web/src/components/Alert';
import { Button } from '../../web/src/components/ui/Button';
import { Checkbox } from '../../web/src/components/ui/Checkbox';
import { Input } from '../../web/src/components/ui/Input';
import { Panel } from '../../web/src/components/ui/Panel';
import { Segmented } from '../../web/src/components/ui/Segmented';
import '../../web/src/styles/global.css';
import type { DesktopBridge, SettingsState } from '../src/bridge';
import type { Settings } from '../src/settings';

import styles from './settings.module.css';

declare global {
  interface Window {
    songCatcher: DesktopBridge;
  }
}

function followSystemTheme(): void {
  const dark = window.matchMedia('(prefers-color-scheme: dark)');
  const apply = () => {
    document.documentElement.dataset.theme = dark.matches ? 'dark' : 'light';
  };
  dark.addEventListener('change', apply);
  apply();
}

function numberOr(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function SettingsForm({ initial }: { initial: SettingsState }) {
  const [settings, setSettings] = useState(initial.settings);
  const [message, setMessage] = useState(initial.notice);
  const [saving, setSaving] = useState(false);
  const flacAvailable = initial.tools.metaflac;

  function update(patch: Partial<Settings>) {
    setSettings((current) => ({ ...current, ...patch }));
  }

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(undefined);
    void window.songCatcher.save(settings).then((result) => {
      setSaving(false);
      if (!result.ok) {
        setMessage(result.message);
        window.scrollTo(0, 0);
      }
    });
  }

  return (
    <form className={styles.page} onSubmit={onSubmit}>
      <header>
        <h1 className={styles.title}>Settings</h1>
        <p className={styles.lead}>Saving restarts the download service, which stops downloads in progress.</p>
      </header>

      {message ? (
        <Alert>
          <p className={styles.message}>{message}</p>
        </Alert>
      ) : null}

      <Panel as="section" className={styles.section}>
        <h2 className={styles.sectionTitle}>Appearance</h2>
        <div className={styles.field}>
          <span className={styles.label}>Theme</span>
          <Segmented
            aria-label="Theme"
            value={settings.theme}
            onValueChange={(theme) => {
              update({ theme });
              window.songCatcher.setTheme(theme);
            }}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
          <p className={styles.hint}>Applies straight away, without restarting the download service.</p>
        </div>
      </Panel>

      <Panel as="section" className={styles.section}>
        <h2 className={styles.sectionTitle}>Deezer</h2>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="arl">
            ARL cookie
          </label>
          <Input
            id="arl"
            type="password"
            value={settings.arl}
            onChange={(event) => {
              update({ arl: event.target.value });
            }}
            autoComplete="off"
            spellCheck={false}
            autoFocus={!settings.arl}
          />
          <p className={styles.hint}>
            Log in to deezer.com in a browser, open the developer tools and copy the value of the <code>arl</code>{' '}
            cookie. It works like a password
            {initial.secretsEncrypted ? ' and is stored encrypted on this computer.' : '; keep it private.'}
          </p>
        </div>
        <div className={styles.field}>
          <span className={styles.label}>Quality</span>
          <Segmented
            aria-label="Quality"
            value={flacAvailable ? settings.quality : 'mp3'}
            onValueChange={(quality) => {
              update({ quality });
            }}
            options={[
              { value: 'mp3', label: 'MP3' },
              ...(flacAvailable ? [{ value: 'flac', label: 'FLAC' } as const] : []),
            ]}
          />
          <p className={styles.hint}>
            {flacAvailable
              ? 'FLAC needs a lossless Deezer account; other accounts get MP3.'
              : 'FLAC needs the metaflac tool (part of the flac package), which was not found on this computer.'}
          </p>
        </div>
      </Panel>

      <Panel as="section" className={styles.section}>
        <h2 className={styles.sectionTitle}>Downloads</h2>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="download-dir">
            Folder
          </label>
          <div className={styles.row}>
            <Input
              id="download-dir"
              value={settings.downloadDir}
              onChange={(event) => {
                update({ downloadDir: event.target.value });
              }}
              spellCheck={false}
            />
            <Button
              variant="outline"
              onClick={() => {
                void window.songCatcher.chooseDirectory(settings.downloadDir).then((downloadDir) => {
                  if (downloadDir) {
                    update({ downloadDir });
                  }
                });
              }}
            >
              <FolderOpen size={15} aria-hidden />
              Choose…
            </Button>
          </div>
        </div>
        <div className={styles.pair}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="workers">
              Parallel downloads
            </label>
            <Input
              id="workers"
              type="number"
              min={1}
              max={32}
              value={settings.workers}
              onChange={(event) => {
                update({ workers: numberOr(event.target.value, settings.workers) });
              }}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="playlist-max">
              YouTube playlist limit
            </label>
            <Input
              id="playlist-max"
              type="number"
              min={1}
              max={10000}
              value={settings.youtubePlaylistMax}
              onChange={(event) => {
                update({ youtubePlaylistMax: numberOr(event.target.value, settings.youtubePlaylistMax) });
              }}
            />
          </div>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="proxy">
            Proxy
          </label>
          <Input
            id="proxy"
            value={settings.proxyUrl}
            onChange={(event) => {
              update({ proxyUrl: event.target.value });
            }}
            placeholder="socks5://127.0.0.1:1080"
            spellCheck={false}
          />
          <p className={styles.hint}>Optional. https://, socks5:// or socks5h://</p>
        </div>
      </Panel>

      <Panel as="section" className={styles.section}>
        <h2 className={styles.sectionTitle}>MPD</h2>
        <Checkbox
          checked={settings.mpdEnabled}
          onCheckedChange={(mpdEnabled) => {
            update({ mpdEnabled });
          }}
          label="Send downloads to MPD"
          hint="Updates the MPD library and can add downloads to the current playlist"
        />
        {settings.mpdEnabled ? (
          <>
            <div className={styles.pair}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="mpd-host">
                  Host
                </label>
                <Input
                  id="mpd-host"
                  value={settings.mpdHost}
                  onChange={(event) => {
                    update({ mpdHost: event.target.value });
                  }}
                  spellCheck={false}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="mpd-port">
                  Port
                </label>
                <Input
                  id="mpd-port"
                  type="number"
                  min={1}
                  max={65535}
                  value={settings.mpdPort}
                  onChange={(event) => {
                    update({ mpdPort: numberOr(event.target.value, settings.mpdPort) });
                  }}
                />
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="mpd-music-dir">
                MPD music directory
              </label>
              <Input
                id="mpd-music-dir"
                value={settings.mpdMusicDir}
                onChange={(event) => {
                  update({ mpdMusicDir: event.target.value });
                }}
                spellCheck={false}
              />
              <p className={styles.hint}>The download folder must be inside it.</p>
            </div>
          </>
        ) : null}
      </Panel>

      <Panel as="section" className={styles.section}>
        <h2 className={styles.sectionTitle}>Tools</h2>
        <div className={styles.tools}>
          {Object.entries(initial.tools).map(([tool, found]) => (
            <span key={tool} className={styles.tool}>
              {found ? (
                <Check size={13} aria-label="found" className={styles.toolFound} />
              ) : (
                <X size={13} aria-label="missing" className={styles.toolMissing} />
              )}
              {tool}
            </span>
          ))}
        </div>
        <p className={styles.hint}>
          YouTube downloads need yt-dlp and ffmpeg. Use File → Update yt-dlp when YouTube downloads start failing.
        </p>
      </Panel>

      <div className={styles.actions}>
        <Button
          variant="ghost"
          onClick={() => {
            window.songCatcher.close();
          }}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? 'Starting…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}

function SettingsApp() {
  const [state, setState] = useState<SettingsState>();

  useEffect(() => {
    void window.songCatcher.load().then(setState);
  }, []);

  return state ? <SettingsForm initial={state} /> : null;
}

followSystemTheme();

const root = document.getElementById('root');
if (!root) {
  throw new Error('Missing #root element');
}

createRoot(root).render(
  <StrictMode>
    <SettingsApp />
  </StrictMode>,
);
