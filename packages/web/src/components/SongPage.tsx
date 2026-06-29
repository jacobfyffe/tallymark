import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiClient, type SongResponse, type SongChartSection, type SongHistoryPoint } from '../lib/api';
import { ArtistLinks } from './ArtistLinks';

type Status = 'loading' | 'ready' | 'not-found' | 'error';

/**
 * A song's page: its credited artists, and its global + personal chart
 * history kept as two separate cards, each with a small trend line so a
 * song's run on the chart reads as a shape, not just a peak number.
 */
export function SongPage({ personalUserId }: { personalUserId: string }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<SongResponse | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setStatus('loading');
    apiClient
      .song(id, personalUserId)
      .then((res) => {
        if (cancelled) return;
        if (!res.work) {
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
        <div className="state">Pulling up its chart history…</div>
      </>
    );
  }
  if (status === 'not-found') {
    return (
      <>
        {backLink}
        <div className="state">
          <div className="big">Song not found</div>
          It may not have charted yet.
        </div>
      </>
    );
  }
  if (status === 'error' || !data || !data.work) {
    return (
      <>
        {backLink}
        <div className="state">
          <div className="big">Couldn't load this song</div>
          Make sure the API server is running, then refresh.
        </div>
      </>
    );
  }

  const hasGlobal = data.global.weeks_on_chart > 0;
  const hasPersonal = data.personal.weeks_on_chart > 0;

  return (
    <>
      {backLink}
      <div className="song-header">
        <SongHeaderArt imageUrl={data.image_url} title={data.work.title} />
        <div>
          <h2 className="song-title">{data.work.title}</h2>
          <div className="song-credit">
            <ArtistLinks artists={data.artists} />
          </div>
        </div>
      </div>

      <SongSection title="Global" accent="teal" section={data.global} />
      <SongSection title="Personal" accent="gold" section={data.personal} />

      {!hasGlobal && !hasPersonal && (
        <div className="state">
          <div className="big">No chart history yet</div>
          This song is waiting on its first charted week.
        </div>
      )}
    </>
  );
}

function SongHeaderArt({ imageUrl, title }: { imageUrl: string | null; title: string }) {
  if (imageUrl) {
    return <img className="cover song-header-cover" src={imageUrl} alt="" />;
  }
  const initial = title.trim().charAt(0).toUpperCase() || '♪';
  return (
    <div className="cover song-header-cover cover-fallback" aria-hidden="true">
      {initial}
    </div>
  );
}

function SongSection({
  title,
  accent,
  section,
}: {
  title: string;
  accent: 'teal' | 'gold';
  section: SongChartSection;
}) {
  if (section.weeks_on_chart === 0) return null;
  return (
    <section className={`artist-section accent-${accent}`}>
      <div className="chart-meta artist-section-title">
        <span className="section-pill">{title}</span>
        <span>
          peak #{section.peak_position} · {section.weeks_on_chart} {section.weeks_on_chart === 1 ? 'week' : 'weeks'} ·{' '}
          {section.total_plays} {section.total_plays === 1 ? 'tally' : 'tallies'}
        </span>
      </div>
      <div className="song-section-body">
        <Sparkline history={section.history} accent={accent} />
        {section.currently_charting ? (
          <span className="current-badge">#{section.current_rank} now</span>
        ) : (
          <span className="fallen">off the chart</span>
        )}
      </div>
    </section>
  );
}

/** A small line graph of weekly rank. Lower rank (better) renders higher up. */
function Sparkline({ history, accent }: { history: SongHistoryPoint[]; accent: 'teal' | 'gold' }) {
  if (history.length < 2) {
    return <div className="sparkline-empty">Not enough weeks yet for a trend line.</div>;
  }
  const width = 320;
  const height = 56;
  const pad = 6;
  const ranks = history.map((h) => h.rank);
  const minRank = Math.min(...ranks);
  const maxRank = Math.max(...ranks);
  const range = Math.max(maxRank - minRank, 1);

  const points = history
    .map((h, i) => {
      const x = pad + (i / (history.length - 1)) * (width - pad * 2);
      const y = pad + ((h.rank - minRank) / range) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      className={`sparkline sparkline-${accent}`}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Rank over time, from #${history[0].rank} to #${history[history.length - 1].rank}`}
    >
      <polyline points={points} fill="none" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
