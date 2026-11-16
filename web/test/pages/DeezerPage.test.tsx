import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SearchResultDto } from '@song-catcher/shared';

import { DeezerPage } from '../../src/pages/DeezerPage';
import { jsonResponse, makeResult, mockFetch, renderWithProviders } from '../utils';

const config = (useMpd: boolean) => ({ version: '1', useMpd, urlPrefix: '' });

class FakeAudio {
  static instances: FakeAudio[] = [];
  static failPlay = false;
  /** Number of upcoming play() calls that reject before playback succeeds. */
  static failNext = 0;
  /** Pending play() promises, settled manually by the test when set. */
  static deferred: Array<{ reject: (error: unknown) => void }> | null = null;
  src = '';
  loads = 0;
  paused = true;
  private endedListeners: Array<() => void> = [];
  constructor() {
    FakeAudio.instances.push(this);
  }
  addEventListener(type: string, listener: () => void) {
    if (type === 'ended') {
      this.endedListeners.push(listener);
    }
  }
  play() {
    this.paused = false;
    if (FakeAudio.deferred) {
      const pending = FakeAudio.deferred;
      return new Promise<void>((_resolve, reject) => {
        pending.push({ reject });
      });
    }
    if (FakeAudio.failNext > 0) {
      FakeAudio.failNext--;
      return Promise.reject(new Error('cold'));
    }
    return FakeAudio.failPlay ? Promise.reject(new Error('blocked')) : Promise.resolve();
  }
  load() {
    this.loads++;
  }
  pause() {
    this.paused = true;
  }
  end() {
    this.endedListeners.forEach((listener) => {
      listener();
    });
  }
}

interface SearchBody {
  type: string;
  query: string;
}

/** Routes POST /search by its body; `searches` collects every request body. */
function mockSearch(handler: (body: SearchBody) => SearchResultDto[] | Response | Promise<Response>, useMpd = false) {
  const searches: SearchBody[] = [];
  const downloads: unknown[] = [];
  const fetchMock = mockFetch({
    'GET /config': config(useMpd),
    'POST /search': async (init) => {
      const body = JSON.parse(String(init?.body)) as SearchBody;
      searches.push(body);
      const result = await handler(body);
      return result instanceof Response ? result : jsonResponse(result);
    },
    'POST /download': (init) => {
      downloads.push(JSON.parse(String(init?.body)));
      return jsonResponse({ task_id: 11 });
    },
  });
  return { fetchMock, searches, downloads };
}

async function search(text: string) {
  const input = screen.getByLabelText('Search query');
  await userEvent.clear(input);
  await userEvent.type(input, text);
  await userEvent.click(screen.getByRole('button', { name: 'Search' }));
}

/** Submits the search form directly, as an Enter press would even while a search is running. */
async function submitWhileBusy(text: string) {
  const input = screen.getByLabelText('Search query');
  fireEvent.change(input, { target: { value: text } });
  fireEvent.submit(input.closest('form') as HTMLFormElement);
  await act(async () => {
    await Promise.resolve();
  });
}

async function chooseMode(label: string) {
  await userEvent.click(screen.getByRole('combobox', { name: 'Search type' }));
  await userEvent.click(await screen.findByRole('option', { name: label }));
}

async function findRowButtons(name: string) {
  return screen.findAllByRole('button', { name });
}

async function findRowButton(name: string) {
  const [button] = await findRowButtons(name);
  return button as HTMLElement;
}

beforeEach(() => {
  FakeAudio.instances = [];
  FakeAudio.failPlay = false;
  FakeAudio.failNext = 0;
  FakeAudio.deferred = null;
  vi.stubGlobal('Audio', FakeAudio);
  vi.spyOn(toast, 'success');
  vi.spyOn(toast, 'error');
  vi.spyOn(toast, 'info');
});

describe('DeezerPage searching', () => {
  it('requires a query', async () => {
    const { searches } = mockSearch(() => []);
    renderWithProviders(<DeezerPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(toast.error).toHaveBeenCalledWith('Enter a search query first');
    expect(searches).toHaveLength(0);
  });

  it('searches tracks and shows results', async () => {
    const { searches } = mockSearch(() => [
      makeResult({ id: '1', title: 'One' }),
      makeResult({ id: '2', title: 'Two' }),
    ]);
    renderWithProviders(<DeezerPage />);
    await search('  abba ');
    expect(await screen.findByText('2 found')).toBeInTheDocument();
    expect(screen.getByText('One')).toBeInTheDocument();
    expect(searches).toEqual([{ type: 'track', query: 'abba' }]);
  });

  it('shows the empty state when nothing is found', async () => {
    mockSearch(() => []);
    renderWithProviders(<DeezerPage />);
    await search('zzz');
    expect(await screen.findByText('Nothing on this tape')).toBeInTheDocument();
    expect(toast.info).toHaveBeenCalledWith('No results found');
  });

  it('reports search errors', async () => {
    mockSearch(() => jsonResponse({ error: 'Deezer down' }, { status: 502 }));
    renderWithProviders(<DeezerPage />);
    await search('x');
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Deezer down');
    });
  });

  it('searches by the chosen type and clears earlier results when it changes', async () => {
    const { searches } = mockSearch(() => [makeResult({ id: '1', title: 'One' })]);
    renderWithProviders(<DeezerPage />);
    const input = screen.getByLabelText('Search query');
    expect(input).toHaveAttribute('placeholder', 'Search');
    expect(screen.getByRole('combobox', { name: 'Search type' })).toHaveTextContent('Tracks');

    await search('x');
    expect(await screen.findByText('1 found')).toBeInTheDocument();
    await chooseMode('Artist');
    expect(screen.queryByText('1 found')).not.toBeInTheDocument();

    await search('x');
    await waitFor(() => {
      expect(searches).toEqual([
        { type: 'track', query: 'x' },
        { type: 'artist', query: 'x' },
      ]);
    });
  });

  it('drops responses from superseded searches', async () => {
    let releaseFirst: (response: Response) => void = () => undefined;
    let rejectSecond: (reason: unknown) => void = () => undefined;
    let call = 0;
    mockSearch(() => {
      call += 1;
      if (call === 1) {
        return new Promise<Response>((resolve) => {
          releaseFirst = resolve;
        });
      }
      if (call === 2) {
        return new Promise<Response>((_resolve, reject) => {
          rejectSecond = reject;
        });
      }
      return [makeResult({ id: '3', title: 'Third' })];
    });
    renderWithProviders(<DeezerPage />);
    await search('first');
    await submitWhileBusy('second');
    await submitWhileBusy('third');
    expect(await screen.findByText('Third')).toBeInTheDocument();
    await act(async () => {
      releaseFirst(jsonResponse([makeResult({ id: '1', title: 'First' })]));
      rejectSecond(new Error('stale'));
      await Promise.resolve();
    });
    expect(screen.queryByText('First')).not.toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalledWith('stale');
  });
});

describe('DeezerPage downloads', () => {
  it('queues a track download with options', async () => {
    const { downloads } = mockSearch(() => [makeResult({ id: '42' })], true);
    renderWithProviders(<DeezerPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Add to MPD playlist' }));
    await search('x');
    await userEvent.click(await screen.findByRole('button', { name: /^Get / }));
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Download queued', { description: 'Task #11' });
    });
    expect(downloads).toEqual([
      { type: 'track', music_id: 42, add_to_playlist: true, title: 'Artist - Song', subtitle: 'Album' },
    ]);
  });

  it('rejects results without a valid id', async () => {
    const { downloads } = mockSearch(() => [makeResult({ id: 'abc' })]);
    renderWithProviders(<DeezerPage />);
    await search('x');
    await userEvent.click(await screen.findByRole('button', { name: /^Get / }));
    expect(toast.error).toHaveBeenCalledWith('This result has no valid Deezer id');
    expect(downloads).toHaveLength(0);
  });

  it('reports download errors', async () => {
    mockFetch({
      'GET /config': config(false),
      'POST /search': [makeResult({ id: '1' })],
      'POST /download': () => Promise.reject('offline'),
    });
    renderWithProviders(<DeezerPage />);
    await search('x');
    await userEvent.click(await screen.findByRole('button', { name: /^Get / }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('offline');
    });
  });

  it('downloads an album from its tile, preferring album_id', async () => {
    const { downloads } = mockSearch(() => [
      makeResult({ id_type: 'album', id: '5', album_id: '77', album: 'LP' }),
      makeResult({ id_type: 'album', id: '6', album_id: '', album: 'EP' }),
    ]);
    renderWithProviders(<DeezerPage />);
    await chooseMode('Album');
    await search('x');
    const albumButtons = await screen.findAllByRole('button', { name: /^Get album/ });
    await userEvent.click(albumButtons[0] as HTMLElement);
    await userEvent.click(albumButtons[1] as HTMLElement);
    await waitFor(() => {
      expect(downloads).toHaveLength(2);
    });
    expect(downloads).toEqual([
      { type: 'album', music_id: 77, add_to_playlist: false, title: 'LP', subtitle: 'Artist' },
      { type: 'album', music_id: 6, add_to_playlist: false, title: 'EP', subtitle: 'Artist' },
    ]);
  });
});

describe('DeezerPage album tracks', () => {
  it('shows an album tracklist, downloads it, and goes back', async () => {
    const { searches, downloads } = mockSearch((body) =>
      body.type === 'album_track'
        ? [makeResult({ id: '100', title: 'Intro' }), makeResult({ id: '101', title: 'Outro' })]
        : [makeResult({ id_type: 'album', id: '5', album_id: '77', album: 'LP' })],
    );
    renderWithProviders(<DeezerPage />);
    await chooseMode('Album');
    await search('x');
    await userEvent.click(await findRowButton('Tracks'));

    expect(await screen.findByRole('heading', { name: 'LP' })).toBeInTheDocument();
    expect(screen.getByText('Tracklist · 2 songs')).toBeInTheDocument();
    expect(searches.at(-1)).toEqual({ type: 'album_track', query: '77' });

    await userEvent.click(screen.getByRole('button', { name: /Download album/ }));
    const [firstGet] = screen.getAllByRole('button', { name: /^Get / });
    await userEvent.click(firstGet as HTMLElement);
    await waitFor(() => {
      expect(downloads).toHaveLength(2);
    });
    expect(downloads).toEqual([
      { type: 'album', music_id: 77, add_to_playlist: false, title: 'LP', subtitle: 'Artist' },
      { type: 'track', music_id: 100, add_to_playlist: false, title: 'Artist - Intro', subtitle: 'Album' },
    ]);

    await userEvent.click(screen.getByRole('button', { name: /Back to results/ }));
    expect(screen.getByText('1 found')).toBeInTheDocument();
  });

  it('falls back to the title or id for the album heading', async () => {
    mockSearch((body) =>
      body.type === 'album_track'
        ? []
        : [
            makeResult({ id_type: 'album', id: '5', album_id: '', album: '', title: 'Titled' }),
            makeResult({ id_type: 'album', id: '6', album_id: '', album: '', title: '' }),
          ],
    );
    renderWithProviders(<DeezerPage />);
    await search('x');
    const [first] = await findRowButtons('Tracks');
    await userEvent.click(first as HTMLElement);
    expect(await screen.findByRole('heading', { name: 'Titled' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Back to results/ }));
    const [, second] = await findRowButtons('Tracks');
    await userEvent.click(second as HTMLElement);
    expect(await screen.findByRole('heading', { name: 'Album 6' })).toBeInTheDocument();
  });

  it('rejects albums without a valid id', async () => {
    const { searches } = mockSearch(() => [makeResult({ id_type: 'album', id: 'x', album_id: '' })]);
    renderWithProviders(<DeezerPage />);
    await search('x');
    await userEvent.click(await findRowButton('Tracks'));
    expect(toast.error).toHaveBeenCalledWith('This album has no valid Deezer id');
    expect(searches).toHaveLength(1);
  });

  it('reports tracklist errors and ignores superseded ones', async () => {
    let rejectLate: (reason: unknown) => void = () => undefined;
    let albumCalls = 0;
    mockSearch((body) => {
      if (body.type !== 'album_track') {
        return [makeResult({ id_type: 'album', id: '5', album_id: '5' })];
      }
      albumCalls += 1;
      if (albumCalls === 1) {
        return jsonResponse({ error: 'No album' }, { status: 404 });
      }
      return new Promise<Response>((_resolve, reject) => {
        rejectLate = reject;
      });
    });
    renderWithProviders(<DeezerPage />);
    await search('x');
    await userEvent.click(await findRowButton('Tracks'));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('No album');
    });

    await userEvent.click(await findRowButton('Tracks'));
    await submitWhileBusy('y');
    await act(async () => {
      rejectLate(new Error('late'));
      await Promise.resolve();
    });
    expect(toast.error).not.toHaveBeenCalledWith('late');
  });

  it('drops a superseded tracklist response', async () => {
    let releaseTracks: (response: Response) => void = () => undefined;
    mockSearch((body) => {
      if (body.type === 'album_track') {
        return new Promise<Response>((resolve) => {
          releaseTracks = resolve;
        });
      }
      return [makeResult({ id_type: 'album', id: '5', album_id: '5', album: 'LP' })];
    });
    renderWithProviders(<DeezerPage />);
    await search('x');
    await userEvent.click(await findRowButton('Tracks'));
    await submitWhileBusy('y');
    await act(async () => {
      releaseTracks(jsonResponse([makeResult({ title: 'Late track' })]));
      await Promise.resolve();
    });
    expect(screen.queryByRole('heading', { name: 'LP' })).not.toBeInTheDocument();
  });
});

describe('DeezerPage artists', () => {
  it('loads top tracks and albums for an artist', async () => {
    const { searches } = mockSearch((body) =>
      body.type === 'artist' ? [makeResult({ id_type: 'artist', id: '8', artist: 'Band' })] : [],
    );
    renderWithProviders(<DeezerPage />);
    await chooseMode('Artist');
    await search('band');
    await userEvent.click(await screen.findByRole('button', { name: 'Top tracks' }));
    await waitFor(() => {
      expect(searches.at(-1)).toEqual({ type: 'artist_top', query: '8' });
    });
  });

  it('loads artist albums', async () => {
    const { searches } = mockSearch((body) =>
      body.type === 'track' ? [makeResult({ id_type: 'artist', id: '8', artist: 'Band' })] : [],
    );
    renderWithProviders(<DeezerPage />);
    await search('band');
    await userEvent.click(await findRowButton('Albums'));
    await waitFor(() => {
      expect(searches.at(-1)).toEqual({ type: 'artist_album', query: '8' });
    });
  });
});

describe('DeezerPage previews', () => {
  it('plays, pauses, switches and ends previews', async () => {
    mockSearch(() => [
      makeResult({ id: '1', title: 'One', preview_url: 'https://p/1' }),
      makeResult({ id: '2', title: 'Two', preview_url: 'https://p/2' }),
    ]);
    const { unmount } = renderWithProviders(<DeezerPage />);
    await search('x');

    await userEvent.click(await screen.findByRole('button', { name: 'Play preview of One' }));
    const audio = FakeAudio.instances[0] as FakeAudio;
    expect(audio.src).toBe('https://p/1');
    expect(audio.paused).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'Pause preview of One' }));
    expect(audio.paused).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: 'Play preview of Two' }));
    expect(audio.src).toBe('https://p/2');
    expect(FakeAudio.instances).toHaveLength(1);

    act(() => {
      audio.end();
    });
    expect(screen.getByRole('button', { name: 'Play preview of Two' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Play preview of Two' }));
    unmount();
    expect(audio.paused).toBe(true);
  });

  it('reports playback failures', async () => {
    FakeAudio.failPlay = true;
    mockSearch(() => [makeResult({ title: 'One', preview_url: 'https://p/1' })]);
    renderWithProviders(<DeezerPage />);
    await search('x');
    await userEvent.click(await screen.findByRole('button', { name: 'Play preview of One' }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Could not play the preview');
    });
    expect(screen.getByRole('button', { name: 'Play preview of One' })).toBeInTheDocument();
  });

  it('retries once when the first play attempt fails', async () => {
    FakeAudio.failNext = 1;
    mockSearch(() => [makeResult({ title: 'One', preview_url: 'https://p/1' })]);
    renderWithProviders(<DeezerPage />);
    await search('x');
    await userEvent.click(await screen.findByRole('button', { name: 'Play preview of One' }));
    const audio = FakeAudio.instances[0] as FakeAudio;
    await waitFor(() => {
      expect(audio.loads).toBe(1);
    });
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Pause preview of One' })).toBeInTheDocument();
  });

  it('ignores failures from a preview that was already replaced', async () => {
    const pending: Array<{ reject: (error: unknown) => void }> = [];
    FakeAudio.deferred = pending;
    mockSearch(() => [
      makeResult({ id: '1', title: 'One', preview_url: 'https://p/1' }),
      makeResult({ id: '2', title: 'Two', preview_url: 'https://p/2' }),
    ]);
    renderWithProviders(<DeezerPage />);
    await search('x');
    await userEvent.click(await screen.findByRole('button', { name: 'Play preview of One' }));
    await userEvent.click(screen.getByRole('button', { name: 'Play preview of Two' }));
    await act(async () => {
      pending[0]?.reject(new Error('interrupted'));
      await Promise.resolve();
    });
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Pause preview of Two' })).toBeInTheDocument();
  });

  it('plays previews from an album tracklist', async () => {
    mockSearch((body) =>
      body.type === 'album_track'
        ? [makeResult({ id: '100', title: 'Intro', preview_url: 'https://p/intro' })]
        : [makeResult({ id_type: 'album', id: '5', album_id: '5', album: 'LP' })],
    );
    renderWithProviders(<DeezerPage />);
    await search('x');
    await userEvent.click(await findRowButton('Tracks'));
    await userEvent.click(await screen.findByRole('button', { name: 'Play preview of Intro' }));
    expect(screen.getByRole('button', { name: 'Pause preview of Intro' })).toBeInTheDocument();
  });
});

describe('DeezerPage playlists', () => {
  async function openPlaylistMode() {
    renderWithProviders(<DeezerPage />);
    await chooseMode('Playlist');
    return screen.getByLabelText('Deezer playlist link');
  }

  it('offers artist, album, tracks and playlist', async () => {
    mockSearch(() => []);
    renderWithProviders(<DeezerPage />);
    await userEvent.click(screen.getByRole('combobox', { name: 'Search type' }));
    const options = await screen.findAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['Artist', 'Album', 'Tracks', 'Playlist']);
  });

  it('requires a playlist value', async () => {
    const { searches } = mockSearch(() => []);
    const input = await openPlaylistMode();
    expect(input).toHaveAttribute('placeholder', 'Paste a Deezer playlist link');
    await userEvent.click(screen.getByRole('button', { name: 'Download playlist' }));
    expect(toast.error).toHaveBeenCalledWith('Enter a Deezer playlist link or id');
    expect(searches).toHaveLength(0);
  });

  it('queues a playlist download with the MPD option', async () => {
    let body: unknown;
    mockFetch({
      'GET /config': config(true),
      'POST /playlist/deezer': (init) => {
        body = JSON.parse(String(init?.body));
        return jsonResponse({ task_id: 3 });
      },
    });
    const input = await openPlaylistMode();
    await userEvent.click(await screen.findByRole('button', { name: 'Add to MPD playlist' }));
    await userEvent.type(input, ' 12345 ');
    await userEvent.click(screen.getByRole('button', { name: 'Download playlist' }));
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Playlist download queued', { description: 'Task #3' });
    });
    expect(body).toEqual({ playlist_url: '12345', add_to_playlist: true });
    expect(input).toHaveValue('');
  });

  it('shows playlist errors', async () => {
    mockFetch({
      'GET /config': config(false),
      'POST /playlist/deezer': () => jsonResponse({ error: 'Private playlist' }, { status: 400 }),
    });
    const input = await openPlaylistMode();
    await userEvent.type(input, '1');
    await userEvent.click(screen.getByRole('button', { name: 'Download playlist' }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Private playlist');
    });
  });
});
