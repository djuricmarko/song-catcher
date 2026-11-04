import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SearchResultCard } from '../../src/components/SearchResultCard';
import { makeResult } from '../utils';

describe('SearchResultCard track row', () => {
  it('shows track metadata and downloads', async () => {
    const onDownloadTrack = vi.fn();
    const result = makeResult({ img_url: 'https://img', title: 'Hey', artist: 'Band', album: 'LP' });
    const { container } = render(
      <SearchResultCard result={result} index={4} busy={false} onDownloadTrack={onDownloadTrack} />,
    );
    expect(screen.getByText('05')).toBeInTheDocument();
    expect(screen.getByText('Hey')).toBeInTheDocument();
    expect(screen.getByText('Band')).toBeInTheDocument();
    expect(screen.getByText('LP')).toBeInTheDocument();
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://img');
    expect(screen.queryByRole('button', { name: /preview/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Get' }));
    expect(onDownloadTrack).toHaveBeenCalledWith(result);
  });

  it('handles missing title, album and art, and disables while busy', () => {
    render(<SearchResultCard result={makeResult({ title: '', album: '' })} index={0} busy onDownloadTrack={vi.fn()} />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(screen.queryByText('/')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Get' })).toBeDisabled();
  });

  it('toggles previews', async () => {
    const onTogglePreview = vi.fn();
    const result = makeResult({ title: 'Hey', preview_url: 'https://p' });
    const { rerender } = render(
      <SearchResultCard
        result={result}
        index={0}
        busy={false}
        onTogglePreview={onTogglePreview}
        onDownloadTrack={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Play preview of Hey' }));
    expect(onTogglePreview).toHaveBeenCalledWith(result);

    rerender(
      <SearchResultCard
        result={result}
        index={0}
        busy={false}
        playing
        onTogglePreview={onTogglePreview}
        onDownloadTrack={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Pause preview of Hey' })).toBeInTheDocument();
    expect(screen.queryByText('01')).not.toBeInTheDocument();
  });
});

describe('SearchResultCard tiles', () => {
  it('renders an album with its actions', async () => {
    const onShowAlbumTracks = vi.fn();
    const onDownloadAlbum = vi.fn();
    const result = makeResult({ id_type: 'album', album: 'LP', artist: 'Band', img_url: 'https://img' });
    render(
      <SearchResultCard
        result={result}
        index={0}
        busy={false}
        onDownloadTrack={vi.fn()}
        onShowAlbumTracks={onShowAlbumTracks}
        onDownloadAlbum={onDownloadAlbum}
      />,
    );
    expect(screen.getByText('Album', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('LP')).toBeInTheDocument();
    expect(screen.getByText('Band')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tracks' }));
    await userEvent.click(screen.getByRole('button', { name: 'Album' }));
    expect(onShowAlbumTracks).toHaveBeenCalledWith(result);
    expect(onDownloadAlbum).toHaveBeenCalledWith(result);
  });

  it('renders an album without art or artist and tolerates missing handlers', async () => {
    render(
      <SearchResultCard
        result={makeResult({ id_type: 'album', album: '', artist: '' })}
        index={0}
        busy={false}
        onDownloadTrack={vi.fn()}
      />,
    );
    expect(screen.getByText('Unknown')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tracks' }));
    await userEvent.click(screen.getByRole('button', { name: 'Album' }));
  });

  it('renders an artist with its actions', async () => {
    const onArtistTop = vi.fn();
    const onArtistAlbums = vi.fn();
    const result = makeResult({ id_type: 'artist', artist: 'Band' });
    render(
      <SearchResultCard
        result={result}
        index={0}
        busy={false}
        onDownloadTrack={vi.fn()}
        onArtistTop={onArtistTop}
        onArtistAlbums={onArtistAlbums}
      />,
    );
    expect(screen.getByText('Artist')).toBeInTheDocument();
    expect(screen.getByText('Band')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Top tracks' }));
    await userEvent.click(screen.getByRole('button', { name: 'Albums' }));
    expect(onArtistTop).toHaveBeenCalledWith(result);
    expect(onArtistAlbums).toHaveBeenCalledWith(result);
  });

  it('tolerates missing artist handlers', async () => {
    render(
      <SearchResultCard result={makeResult({ id_type: 'artist' })} index={0} busy={false} onDownloadTrack={vi.fn()} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Top tracks' }));
    await userEvent.click(screen.getByRole('button', { name: 'Albums' }));
  });
});
