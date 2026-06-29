import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { apiClient, type SearchResult } from '../lib/api';

type Status = 'loading' | 'ready' | 'error';

/** Search results for artists and songs that have actually been tallied. */
export function SearchPage() {
  const [params] = useSearchParams();
  const q = params.get('q')?.trim() ?? '';
  const [data, setData] = useState<SearchResult | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    if (!q) {
      setData({ artists: [], works: [] });
      setStatus('ready');
      return;
    }
    let cancelled = false;
    setStatus('loading');
    apiClient
      .search(q)
      .then((res) => {
        if (cancelled) return;
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
  }, [q]);

  if (status === 'loading') {
    return <div className="state">Searching…</div>;
  }
  if (status === 'error' || !data) {
    return (
      <div className="state">
        <div className="big">Couldn't search</div>
        Make sure the API server is running, then try again.
      </div>
    );
  }

  const hasResults = data.artists.length > 0 || data.works.length > 0;
  if (!q || !hasResults) {
    return (
      <div className="state">
        <div className="big">{q ? `No matches for "${q}"` : 'Search for an artist or song'}</div>
        {q && "Try a different spelling, or check back once it's charted — search only covers what's actually been tallied."}
      </div>
    );
  }

  return (
    <>
      {data.artists.length > 0 && (
        <section>
          <div className="chart-meta">
            <span>Artists</span>
          </div>
          {data.artists.map((a) => (
            <Link key={a.id} to={`/artist/${a.id}`} className="search-result">
              <span className="search-result-name">{a.name}</span>
            </Link>
          ))}
        </section>
      )}
      {data.works.length > 0 && (
        <section>
          <div className="chart-meta">
            <span>Songs</span>
          </div>
          {data.works.map((w) => (
            <Link key={w.id} to={`/song/${w.id}`} className="search-result">
              <span className="search-result-name">{w.title}</span>
              <span className="search-result-sub">{w.artist_name}</span>
            </Link>
          ))}
        </section>
      )}
    </>
  );
}
