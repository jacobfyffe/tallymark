import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiClient, type ArtistResponse, type ArtistChartSong } from '../lib/api';
import { ArtistLinks } from './ArtistLinks';

type Status = 'loading' | 'ready' | 'not-found' | 'error';

/**
 * An artist's page: every song they've ever charted, split into two cards —
 * Global and Personal — that are never merged. Each card carries its own
 * stats (songs charted, best peak, total tallies) scoped to just that side,
 * so the distinction holds all the way down, not just at the section title.
 */
export function ArtistPage({ personalUserId }: { personalUserId: string }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<ArtistResponse | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setStatus('loading');
    apiClient
      .artist(id, personalUserId)
      .then((res) => {
        if (cancelled) return;
        if (!res.artist) {
          setStatus('not-found');
          return;
        }
        setData(res);
        setStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [id, personalUserId]);

  const backLink = (
    <button type="button" className="back-link" onClick={() => navigate(-1)}>
      ← Back to chart
    </button>
  );

  if (status === 'loading') {
    return (
      <>
        {backLink}
        <div className="state">Pulling up their chart history…</div>
      </>
    );
  }
  if (status === 'not-found') {
    return (
      <>
        {backLink}
        <div className="state">
          <div className="big">Artist not found</div>
          Either this artist hasn't charted yet, or they haven't been linked by the pipeline. Give it a cycle.
        </div>
      </>
    );
  }
  if (status === 'error' || !data || !data.artist) {
    return (
      <>
        {backLink}
        <div className="state">
          <div className="big">Couldn't load this artist</div>
          Make sure the API server is running, then refresh.
        </div>
      </>
    );
  }

  const hasGlobal = data.global.songs.length > 0;
  const hasPersonal = data.personal.songs.length > 0;

  return (
    <>
      {backLink}
      <div className="artist-header">
        <div className="artist-avatar" aria-hidden="true">
          {data.artist.name.trim().charAt(0).toUpperCase() || '♪'}
        </div>
        <h2 className="artist-name">{data.artist.name}</h2>
      </div>

      <ArtistSection title="Global" accent="teal" songs={data.global.songs} />
      <ArtistSection title="Personal" accent="gold" songs={data.personal.songs} />

      {!hasGlobal && !hasPersonal && (
        <div className="state">
          <div className="big">No chart history yet</div>
          This page is waiting on its first charted week.
        </div>
      )}
    </>
  );
}

function ArtistSection({
  title,
  accent,
  songs,
}: {
  title: string;
  accent: 'teal' | 'gold';
  songs: ArtistChartSong[];
}) {
  if (songs.length === 0) return null;
  const bestPeak = Math.min(...songs.map((s) => s.peak_position));
  const totalTallies = songs.reduce((sum, s) => sum + s.total_plays, 0);

  return (
    <section className={`artist-section accent-${accent}`}>
      <div className="chart-meta artist-section-title">
        <span className="section-pill">{title}</span>
        <span>
          {songs.length} {songs.length === 1 ? 'song' : 'songs'} · best peak #{bestPeak} · {totalTallies}{' '}
          {totalTallies === 1 ? 'tally' : 'tallies'}
        </span>
      </div>
      {songs.map((song) => (
        <ArtistSongRow key={song.work_id} song={song} />
      ))}
    </section>
  );
}

function ArtistSongRow({ song }: { song: ArtistChartSong }) {
  return (
    <div className="artist-song">
      <div className="peak-badge">
        <span className="peak-num">#{song.peak_position}</span>
        <span className="peak-label">peak</span>
      </div>
      <SongArt song={song} />
      <div className="meta">
        <Link className="title title-link" to={`/song/${song.work_id}`}>
          {song.title}
        </Link>
        {song.collaborators.length > 0 && (
          <div className="artist">
            {song.is_primary_credit ? 'feat. ' : 'with '}
            <ArtistLinks artists={song.collaborators} />
          </div>
        )}
      </div>
      <div className="song-stats">
        {song.currently_charting ? (
          <span className="current-badge">#{song.current_rank} now</span>
        ) : (
          <span className="fallen">off the chart</span>
        )}
        <span className="weeks">{song.weeks_on_chart}w</span>
      </div>
    </div>
  );
}

function SongArt({ song }: { song: ArtistChartSong }) {
  if (song.image_url) {
    return <img className="cover song-cover" src={song.image_url} alt="" loading="lazy" />;
  }
  const initial = song.title.trim().charAt(0).toUpperCase() || '♪';
  return (
    <div className="cover song-cover cover-fallback" aria-hidden="true">
      {initial}
    </div>
  );
}
