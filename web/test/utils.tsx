import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';

import type { DesktopSettingsState, QueueTask, SearchResultDto } from '@song-catcher/shared';

import { QueueProvider } from '../src/hooks/useQueue';
import type { DesktopApp } from '../src/lib/desktop';

type MediaListener = (event: MediaQueryListEvent) => void;

/** Controllable window.matchMedia: `matches` maps a query to its result. */
export function setMatchMedia(matches: Record<string, boolean>) {
  const listeners = new Map<string, Set<MediaListener>>();
  const state = { ...matches };
  window.matchMedia = vi.fn((query: string) => {
    const set = listeners.get(query) ?? new Set<MediaListener>();
    listeners.set(query, set);
    return {
      get matches() {
        return state[query] ?? false;
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: MediaListener) => set.add(listener),
      removeEventListener: (_type: string, listener: MediaListener) => set.delete(listener),
      addListener: (listener: MediaListener) => set.add(listener),
      removeListener: (listener: MediaListener) => set.delete(listener),
      dispatchEvent: () => true,
    } as unknown as MediaQueryList;
  });
  return {
    listeners,
    change(query: string, value: boolean) {
      state[query] = value;
      listeners.get(query)?.forEach((listener) => {
        listener({ matches: value, media: query } as MediaQueryListEvent);
      });
    },
  };
}

export class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  closed = false;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private listeners = new Map<string, Set<(event: MessageEvent<string>) => void>>();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void) {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: (event: MessageEvent<string>) => void) {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string, data: unknown) {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    this.listeners.get(type)?.forEach((listener) => {
      listener(new MessageEvent(type, { data: payload }));
    });
  }

  listenerCount(type: string) {
    return this.listeners.get(type)?.size ?? 0;
  }

  close() {
    this.closed = true;
  }

  static latest(): MockEventSource {
    const source = MockEventSource.instances.at(-1);
    if (!source) {
      throw new Error('No EventSource was created');
    }
    return source;
  }
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

/** Routes fetch calls by `METHOD path` (path relative to /api, query included). */
type RouteHandler = (init?: RequestInit) => Response | Promise<Response>;
type FetchRoute = RouteHandler | Record<string, unknown> | unknown[];

export function mockFetch(routes: Record<string, FetchRoute>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const path = url.startsWith('/api') ? url.slice(4) : url;
    const key = `${init?.method ?? 'GET'} ${path}`;
    if (!(key in routes)) {
      return jsonResponse({ error: `Unmocked ${key}` }, { status: 404, statusText: 'Not Found' });
    }
    const route = routes[key];
    return typeof route === 'function' ? route(init) : jsonResponse(route);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
  });
}

interface RenderOptions {
  route?: string;
  path?: string;
  withQueue?: boolean;
  queryClient?: QueryClient;
}

export function renderWithProviders(ui: ReactElement, options: RenderOptions = {}) {
  const { route = '/', path, withQueue = false, queryClient = createQueryClient() } = options;
  const content = path ? (
    <Routes>
      <Route path={path} element={ui} />
      <Route path="*" element={<p>other route</p>} />
    </Routes>
  ) : (
    ui
  );
  const wrap = (children: ReactNode) => (withQueue ? <QueueProvider>{children}</QueueProvider> : children);
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>{wrap(content)}</MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

export function makeTask(overrides: Partial<QueueTask> = {}): QueueTask {
  return {
    id: 1,
    source: 'deezer',
    kind: 'track',
    title: 'Artist - Song',
    subtitle: null,
    date: null,
    sizeBytes: 0,
    args: {},
    state: 'waiting',
    result: null,
    exception: null,
    warnings: [],
    progress: [0, 0],
    workerIndex: null,
    tsQueued: 0,
    tsStarted: 0,
    tsFinished: 0,
    ...overrides,
  };
}

export function makeResult(overrides: Partial<SearchResultDto> = {}): SearchResultDto {
  return {
    id: '1',
    id_type: 'track',
    title: 'Song',
    img_url: '',
    album: 'Album',
    album_id: '10',
    artist: 'Artist',
    preview_url: '',
    ...overrides,
  };
}

export function makeSettingsState(overrides: Partial<DesktopSettingsState> = {}): DesktopSettingsState {
  const defaults: DesktopSettingsState['defaults'] = {
    arl: '',
    quality: 'mp3',
    downloadDir: '/music/Song Catcher',
    proxyUrl: '',
    workers: 4,
    youtubePlaylistMax: 500,
    mpdEnabled: false,
    mpdHost: 'localhost',
    mpdPort: 6600,
    mpdMusicDir: '',
    theme: 'system',
  };
  return {
    settings: { ...defaults, arl: 'old-arl' },
    defaults,
    notice: undefined,
    tools: { 'yt-dlp': true, ffmpeg: true, metaflac: true },
    secretsEncrypted: true,
    version: '3.1.0',
    ...overrides,
  };
}

/** Installs the bridge the desktop app's preload exposes to the page; the test setup removes it again. */
export function installDesktopApp(overrides: Partial<DesktopApp> = {}): DesktopApp {
  const app: DesktopApp = {
    platform: 'linux',
    settings: {
      load: vi.fn(async () => makeSettingsState()),
      save: vi.fn(async () => ({ ok: true as const })),
      chooseDirectory: vi.fn(async () => undefined),
      setTheme: vi.fn(),
    },
    onOpenSettings: vi.fn(() => () => undefined),
    ...overrides,
  };
  window.songCatcherApp = app;
  return app;
}
