# Deezer Downloader 3

A self-hosted web app for downloading music from Deezer and YouTube. The 3.x release is a full
rewrite: a TypeScript/Fastify backend and a React single-page frontend. Spotify support has been
removed.

The Python 2.x implementation is frozen under [`legacy/python/`](legacy/python/) for one release.
It will be removed in 4.0.0.

## Features

- Search Deezer tracks, albums and artists, with album/artist drill-down.
- Download tracks, albums, Deezer playlists and your Deezer favourites.
- Optional FLAC downloads for lossless accounts; otherwise the app falls back to MP3.
- MP3 ID3 tags and embedded cover art; FLAC tags and embedded cover art via `metaflac`.
- Download audio from YouTube with `yt-dlp`.
- Optional ZIP archives containing an `.m3u8` playlist.
- Optional MPD integration: update the library and add downloads to the current playlist.
- Live queue updates over Server-Sent Events (SSE).
- File browser and a debug log view.
- Proxy support (`https://`, `socks5://`, `socks5h://`).
- URL-prefix support for reverse proxies.
- Keyboard shortcuts: `Ctrl+M` focuses search and `Ctrl+Shift+1…6` switches tabs.
- Environment-variable-only configuration. No INI file is read or generated.

## Requirements

- Node.js **22.9 or newer** (Node 24 is recommended).
- pnpm 10 (`corepack enable` is the easiest way to get it).
- `ffmpeg` and `yt-dlp` for YouTube downloads.
- `metaflac` from the `flac` package for FLAC tagging. The app checks for it at startup.

## Quick start

```bash
git clone https://github.com/kmille/deezer-downloader.git
cd deezer-downloader

corepack enable
pnpm install
cp .env.example .env
```

Put your Deezer `arl` cookie in `.env`:

```dotenv
DEEZER_COOKIE_ARL=your_arl_cookie
```

Then build and start the app:

```bash
pnpm build
node --env-file=.env server/dist/cli.js
```

Open <http://127.0.0.1:5000>.

For development, run the backend and Vite dev server together:

```bash
pnpm dev
```

Vite serves the UI on <http://127.0.0.1:5173> and proxies `/api` and `/downloads` to the backend on
port 5000.

## Getting your ARL cookie

1. Log in to Deezer in a browser.
2. Open the browser developer tools.
3. Find the `arl` cookie for `deezer.com` under Storage → Cookies.
4. Copy the value into `DEEZER_COOKIE_ARL`.

The ARL is a password-equivalent credential. Never commit it, log it, or expose the app to the
internet without authentication. `--print-config` redacts it.

## Configuration

Every setting is an environment variable. `.env.example` contains a documented starting point. For
local development, Node's native `--env-file` support loads `.env`; in production, use your process
manager, Docker, or systemd to set real environment variables.

| Variable                    | Default                  | Description                                                                             |
| --------------------------- | ------------------------ | --------------------------------------------------------------------------------------- |
| `DEEZER_COOKIE_ARL`         | **required**             | Deezer ARL cookie.                                                                      |
| `DEEZER_QUALITY`            | `mp3`                    | `mp3` or `flac`. FLAC requires a lossless account; otherwise the app falls back to MP3. |
| `DEEZER_PROXY_URL`          | empty                    | Optional `https://`, `socks5://` or `socks5h://` proxy.                                 |
| `DEEZER_HTTP_HOST`          | `127.0.0.1`              | HTTP listen address. Use `0.0.0.0` in Docker.                                           |
| `DEEZER_HTTP_PORT`          | `5000`                   | HTTP listen port.                                                                       |
| `DEEZER_URL_PREFIX`         | empty                    | Reverse-proxy path prefix, for example `/deezer`.                                       |
| `DEEZER_WORKERS`            | `4`                      | Number of download workers (1–32).                                                      |
| `DEEZER_TASK_HISTORY`       | `500`                    | Maximum number of completed/failed tasks kept in memory.                                |
| `DEEZER_DOWNLOAD_DIR`       | `/tmp/deezer-downloader` | Base download directory.                                                                |
| `DEEZER_SONGS_DIR`          | `${base}/songs`          | Optional track directory override.                                                      |
| `DEEZER_ALBUMS_DIR`         | `${base}/albums`         | Optional album directory override.                                                      |
| `DEEZER_PLAYLISTS_DIR`      | `${base}/playlists`      | Optional playlist directory override.                                                   |
| `DEEZER_ZIPS_DIR`           | `${base}/zips`           | Optional ZIP directory override.                                                        |
| `DEEZER_YOUTUBE_DIR`        | `${base}/youtube-dl`     | Optional yt-dlp directory override.                                                     |
| `DEEZER_MPD_ENABLED`        | `false`                  | Enable MPD integration.                                                                 |
| `DEEZER_MPD_HOST`           | `localhost`              | MPD host.                                                                               |
| `DEEZER_MPD_PORT`           | `6600`                   | MPD port.                                                                               |
| `DEEZER_MPD_MUSIC_DIR_ROOT` | —                        | Required when MPD is enabled. All download directories must be inside it.               |
| `DEEZER_YTDLP_PATH`         | `yt-dlp`                 | yt-dlp executable name or absolute path.                                                |
| `DEEZER_FFMPEG_PATH`        | `ffmpeg`                 | ffmpeg executable name or absolute path.                                                |
| `DEEZER_METAFLAC_PATH`      | `metaflac`               | metaflac executable name or absolute path.                                              |
| `DEEZER_LOG_LEVEL`          | `info`                   | `fatal`, `error`, `warn`, `info`, `debug` or `trace`.                                   |
| `DEEZER_LOG_FILE`           | empty                    | If set, logs are mirrored to this file and `/api/debug` tails it.                       |
| `DEEZER_DEBUG_COMMAND`      | empty                    | Optional shell command used by `/api/debug`; overrides the log-file tail.               |

Relative paths are resolved against the current working directory. The app creates all download
directories at startup and fails early with an actionable error if a configured executable is
missing.

### MPD

When `DEEZER_MPD_ENABLED=true`, `DEEZER_MPD_MUSIC_DIR_ROOT` must be set and every download
directory must be inside it. After a successful download the app updates the MPD database, waits
for the new file to be indexed, and adds it to the current playlist when requested.

## CLI

```bash
deezer-downloader --version
deezer-downloader --print-config
deezer-downloader --check
deezer-downloader
```

- `--version` prints the application version.
- `--print-config` prints the resolved configuration with the ARL redacted.
- `--check` validates configuration, checks external tools, and verifies the Deezer login.
- With no flag, the HTTP server starts.

## Docker

```bash
docker build -t deezer-downloader .

mkdir -p downloads
docker run --rm -p 5000:5000 \
  -v "$(pwd)/downloads:/mnt/deezer-downloader" \
  -e DEEZER_COOKIE_ARL=your_arl_cookie \
  deezer-downloader
```

The image runs as a non-root user, includes `ffmpeg`, `flac` and `yt-dlp`, and stores downloads in
`/mnt/deezer-downloader`. Mount that directory to keep downloads on the host.

## API

All routes are under the configured prefix plus `/api`. The current API is compatible with the
2.x route names:

| Method | Path                    | Purpose                                                                                          |
| ------ | ----------------------- | ------------------------------------------------------------------------------------------------ |
| `GET`  | `/api/health`           | Health and version information.                                                                  |
| `GET`  | `/api/config`           | UI configuration (`useMpd`, version, prefix).                                                    |
| `POST` | `/api/search`           | Search Deezer (`type`: `track`, `album`, `artist`, `album_track`, `artist_album`, `artist_top`). |
| `POST` | `/api/download`         | Queue a track or album download.                                                                 |
| `POST` | `/api/youtubedl`        | Queue a YouTube download.                                                                        |
| `POST` | `/api/playlist/deezer`  | Queue a Deezer playlist download.                                                                |
| `POST` | `/api/favorites/deezer` | Queue a Deezer favourites download.                                                              |
| `GET`  | `/api/queue`            | Current queue and task history.                                                                  |
| `GET`  | `/api/queue/events`     | SSE stream of queue updates.                                                                     |
| `GET`  | `/api/files?path=`      | JSON directory listing.                                                                          |
| `GET`  | `/api/debug`            | Recent log output.                                                                               |

Downloaded files are served under `/downloads/`. The frontend handles ZIP and file downloads from
that path.

## Development

```bash
pnpm install
pnpm dev          # backend + Vite with hot reload
pnpm build        # shared types, backend and frontend production build
pnpm test         # Vitest suites
pnpm typecheck    # strict TypeScript checks
pnpm lint         # ESLint
pnpm format       # Prettier
pnpm format:check # Prettier check for CI
```

Tests use mocked Deezer responses and temporary directories. They do not require a real ARL. Live
Deezer/YouTube/MPD integration is intentionally not part of the default test suite.

Repository layout:

```text
shared/   Shared API types
server/   Fastify backend, Deezer client, queue, download orchestration
web/      React 19 + Vite + Tailwind frontend
legacy/   Frozen Python 2.x app (removed in 4.0.0)
```

## Breaking changes in 3.0.0

- Configuration is environment-variable-only. The INI file and `--config` flag are gone.
- Spotify support is removed.
- The backend is Node.js/TypeScript instead of Python/Flask.
- The frontend is a React SPA instead of jQuery/Bootstrap.
- Queue updates use SSE; the old `/queue` polling endpoint remains available as `/api/queue`.
- The Python app lives under `legacy/python/` and is no longer the default entry point.

### Migrating from the INI file

| Old INI setting             | New environment variable              |
| --------------------------- | ------------------------------------- |
| `[deezer] cookie_arl`       | `DEEZER_COOKIE_ARL`                   |
| `[deezer] quality`          | `DEEZER_QUALITY`                      |
| `[proxy] server`            | `DEEZER_PROXY_URL`                    |
| `[http] host`               | `DEEZER_HTTP_HOST`                    |
| `[http] port`               | `DEEZER_HTTP_PORT`                    |
| `[http] url_prefix`         | `DEEZER_URL_PREFIX`                   |
| `[threadpool] workers`      | `DEEZER_WORKERS`                      |
| `[download_dirs] base`      | `DEEZER_DOWNLOAD_DIR`                 |
| `[download_dirs] songs`     | `DEEZER_SONGS_DIR`                    |
| `[download_dirs] albums`    | `DEEZER_ALBUMS_DIR`                   |
| `[download_dirs] playlists` | `DEEZER_PLAYLISTS_DIR`                |
| `[download_dirs] zips`      | `DEEZER_ZIPS_DIR`                     |
| `[download_dirs] youtubedl` | `DEEZER_YOUTUBE_DIR`                  |
| `[mpd] use_mpd`             | `DEEZER_MPD_ENABLED`                  |
| `[mpd] host` / `[mpd] port` | `DEEZER_MPD_HOST` / `DEEZER_MPD_PORT` |
| `[mpd] music_dir_root`      | `DEEZER_MPD_MUSIC_DIR_ROOT`           |
| `[youtubedl] command`       | `DEEZER_YTDLP_PATH`                   |
| `[debug] command`           | `DEEZER_DEBUG_COMMAND`                |
| `LOG_FILE`                  | `DEEZER_LOG_FILE`                     |

## License

MIT. See [LICENSE](LICENSE).
