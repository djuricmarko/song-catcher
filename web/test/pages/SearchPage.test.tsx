import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SearchResultDto } from '@song-catcher/shared';

import { SearchPage } from '../../src/pages/SearchPage';
import { jsonResponse, makeResult, mockFetch, renderWithProviders } from '../utils';

const config = (useMpd: boolean) => ({ version: '1', useMpd, urlPrefix: '' });

class FakeAudio {
  static instances: FakeAudio[] = [];
  static failPlay = false;
  src = '';
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
    return FakeAudio.failPlay ? Promise.reject(new Error('blocked')) : Promise.resolve();
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
  const input = screen.getByRole('searchbox', { name: 'Search query' });
  await userEvent.clear(input);
  await userEvent.type(input, text);
  await userEvent.click(screen.getByRole('button', { name: /^Search/ }));
}

/** Submits the search form directly, as an Enter press would even while a search is running. */
async function submitWhileBusy(text: string) {
  const input = screen.getByRole('searchbox', { name: 'Search query' });
  fireEvent.change(input, { target: { value: text } });
  fireEvent.submit(input.closest('form') as HTMLFormElement);
  await act(async () => {
    await Promise.resolve();
  });
}

/** Result-tile buttons, excluding the search-mode toggles that share labels. */
async function findTileButtons(name: string) {
  await waitFor(() => {
    expect(tileButtons(name).length).toBeGreaterThan(0);
  });
  return tileButtons(name);
}

function tileButtons(name: string) {
  return screen.getAllByRole('button', { name }).filter((button) => !button.hasAttribute('aria-pressed'));
}

async function findTileButton(name: string) {
  const [button] = await findTileButtons(name);
  return button as HTMLElement;
}

beforeEach(() => {
  FakeAudio.instances = [];
  FakeAudio.failPlay = false;
  vi.stubGlobal('Audio', FakeAudio);
  vi.spyOn(toast, 'success');
  vi.spyOn(toast, 'error');
  vi.spyOn(toast, 'info');
});

describe('SearchPage searching', () => {
  it('requires a query', async () => {
    const { searches } = mockSearch(() => []);
    renderWithProviders(<SearchPage />);
    await userEvent.click(screen.getByRole('button', { name: /^Search/ }));
    expect(toast.error).toHaveBeenCalledWith('Enter a search query first');
    expect(searches).toHaveLength(0);
  });

  it('searches tracks and shows results', async () => {
    const { searches } = mockSearch(() => [
      makeResult({ id: '1', title: 'One' }),
      makeResult({ id: '2', title: 'Two' }),
    ]);
    renderWithProviders(<SearchPage />);
    await search('  abba ');
    expect(await screen.findByText('2 found')).toBeInTheDocument();
    expect(screen.getByText('One')).toBeInTheDocument();
    expect(searches).toEqual([{ type: 'track', query: 'abba' }]);
  });

  it('shows the empty state when nothing is found', async () => {
    mockSearch(() => []);
    renderWithProviders(<SearchPage />);
    await search('zzz');
    expect(await screen.findByText('Nothing on this tape')).toBeInTheDocument();
    expect(toast.info).toHaveBeenCalledWith('No results found');
  });

  it('reports search errors', async () => {
    mockSearch(() => jsonResponse({ error: 'Deezer down' }, { status: 502 }));
    renderWithProviders(<SearchPage />);
    await search('x');
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Deezer down');
    });
  });

  it('changes the placeholder and type per mode', async () => {
    const { searches } = mockSearch(() => []);
    renderWithProviders(<SearchPage />);
    const input = screen.getByRole('searchbox', { name: 'Search query' });
    expect(input).toHaveAttribute('placeholder', 'Search for a track…');
    await userEvent.click(screen.getByRole('button', { name: 'Albums' }));
    expect(input).toHaveAttribute('placeholder', 'Search for an album…');
    await userEvent.click(screen.getByRole('button', { name: 'Artists' }));
    expect(input).toHaveAttribute('placeholder', 'Search for an artist…');
    await search('x');
    await waitFor(() => {
      expect(searches).toEqual([{ type: 'artist', query: 'x' }]);
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
    renderWithProviders(<SearchPage />);
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

describe('SearchPage downloads', () => {
  it('queues a track download with options', async () => {
    const { downloads } = mockSearch(() => [makeResult({ id: '42' })], true);
    renderWithProviders(<SearchPage />);
    await userEvent.click(await screen.findByText('Add to MPD playlist'));
    await userEvent.click(screen.getByText('Zip albums'));
    await search('x');
    await userEvent.click(await screen.findByRole('button', { name: 'Get' }));
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Download queued', { description: 'Task #11' });
    });
    expect(downloads).toEqual([{ type: 'track', music_id: 42, add_to_playlist: true, create_zip: true }]);
  });

  it('rejects results without a valid id', async () => {
    const { downloads } = mockSearch(() => [makeResult({ id: 'abc' })]);
    renderWithProviders(<SearchPage />);
    await search('x');
    await userEvent.click(await screen.findByRole('button', { name: 'Get' }));
    expect(toast.error).toHaveBeenCalledWith('This result has no valid Deezer id');
    expect(downloads).toHaveLength(0);
  });

  it('reports download errors', async () => {
    mockFetch({
      'GET /config': config(false),
      'POST /search': [makeResult({ id: '1' })],
      'POST /download': () => Promise.reject('offline'),
    });
    renderWithProviders(<SearchPage />);
    await search('x');
    await userEvent.click(await screen.findByRole('button', { name: 'Get' }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('offline');
    });
  });

  it('downloads an album from its tile, preferring album_id', async () => {
    const { downloads } = mockSearch(() => [
      makeResult({ id_type: 'album', id: '5', album_id: '77', album: 'LP' }),
      makeResult({ id_type: 'album', id: '6', album_id: '', album: 'EP' }),
    ]);
    renderWithProviders(<SearchPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Albums' }));
    await search('x');
    const albumButtons = await screen.findAllByRole('button', { name: 'Album' });
    await userEvent.click(albumButtons[0] as HTMLElement);
    await userEvent.click(albumButtons[1] as HTMLElement);
    await waitFor(() => {
      expect(downloads).toHaveLength(2);
    });
    expect(downloads).toEqual([
      { type: 'album', music_id: 77, add_to_playlist: false, create_zip: false },
      { type: 'album', music_id: 6, add_to_playlist: false, create_zip: false },
    ]);
  });
});

describe('SearchPage album tracks', () => {
  it('shows an album tracklist, downloads it, and goes back', async () => {
    const { searches, downloads } = mockSearch((body) =>
      body.type === 'album_track'
        ? [makeResult({ id: '100', title: 'Intro' }), makeResult({ id: '101', title: 'Outro' })]
        : [makeResult({ id_type: 'album', id: '5', album_id: '77', album: 'LP' })],
    );
    renderWithProviders(<SearchPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Albums' }));
    await search('x');
    await userEvent.click(await findTileButton('Tracks'));

    expect(await screen.findByRole('heading', { name: 'LP' })).toBeInTheDocument();
    expect(screen.getByText('Tracklist · 2 songs')).toBeInTheDocument();
    expect(searches.at(-1)).toEqual({ type: 'album_track', query: '77' });

    await userEvent.click(screen.getByRole('button', { name: /Download album/ }));
    const [firstGet] = screen.getAllByRole('button', { name: 'Get' });
    await userEvent.click(firstGet as HTMLElement);
    await waitFor(() => {
      expect(downloads).toHaveLength(2);
    });
    expect(downloads).toEqual([
      { type: 'album', music_id: 77, add_to_playlist: false, create_zip: false },
      { type: 'track', music_id: 100, add_to_playlist: false, create_zip: false },
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
    renderWithProviders(<SearchPage />);
    await search('x');
    const [first] = await findTileButtons('Tracks');
    await userEvent.click(first as HTMLElement);
    expect(await screen.findByRole('heading', { name: 'Titled' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Back to results/ }));
    const [, second] = await findTileButtons('Tracks');
    await userEvent.click(second as HTMLElement);
    expect(await screen.findByRole('heading', { name: 'Album 6' })).toBeInTheDocument();
  });

  it('rejects albums without a valid id', async () => {
    const { searches } = mockSearch(() => [makeResult({ id_type: 'album', id: 'x', album_id: '' })]);
    renderWithProviders(<SearchPage />);
    await search('x');
    await userEvent.click(await findTileButton('Tracks'));
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
    renderWithProviders(<SearchPage />);
    await search('x');
    await userEvent.click(await findTileButton('Tracks'));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('No album');
    });

    await userEvent.click(await findTileButton('Tracks'));
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
    renderWithProviders(<SearchPage />);
    await search('x');
    await userEvent.click(await findTileButton('Tracks'));
    await submitWhileBusy('y');
    await act(async () => {
      releaseTracks(jsonResponse([makeResult({ title: 'Late track' })]));
      await Promise.resolve();
    });
    expect(screen.queryByRole('heading', { name: 'LP' })).not.toBeInTheDocument();
  });
});

describe('SearchPage artists', () => {
  it('loads top tracks and albums for an artist', async () => {
    const { searches } = mockSearch((body) =>
      body.type === 'artist' ? [makeResult({ id_type: 'artist', id: '8', artist: 'Band' })] : [],
    );
    renderWithProviders(<SearchPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Artists' }));
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
    renderWithProviders(<SearchPage />);
    await search('band');
    await userEvent.click(await findTileButton('Albums'));
    await waitFor(() => {
      expect(searches.at(-1)).toEqual({ type: 'artist_album', query: '8' });
    });
  });
});

describe('SearchPage previews', () => {
  it('plays, pauses, switches and ends previews', async () => {
    mockSearch(() => [
      makeResult({ id: '1', title: 'One', preview_url: 'https://p/1' }),
      makeResult({ id: '2', title: 'Two', preview_url: 'https://p/2' }),
    ]);
    const { unmount } = renderWithProviders(<SearchPage />);
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
    renderWithProviders(<SearchPage />);
    await search('x');
    await userEvent.click(await screen.findByRole('button', { name: 'Play preview of One' }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Could not play the preview');
    });
    expect(screen.getByRole('button', { name: 'Play preview of One' })).toBeInTheDocument();
  });

  it('plays previews from an album tracklist', async () => {
    mockSearch((body) =>
      body.type === 'album_track'
        ? [makeResult({ id: '100', title: 'Intro', preview_url: 'https://p/intro' })]
        : [makeResult({ id_type: 'album', id: '5', album_id: '5', album: 'LP' })],
    );
    renderWithProviders(<SearchPage />);
    await search('x');
    await userEvent.click(await findTileButton('Tracks'));
    await userEvent.click(await screen.findByRole('button', { name: 'Play preview of Intro' }));
    expect(screen.getByRole('button', { name: 'Pause preview of Intro' })).toBeInTheDocument();
  });
});
