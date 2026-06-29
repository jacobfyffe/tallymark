import { Link } from 'react-router-dom';
import type { ChartEntryArtist } from '../lib/api';

/**
 * Renders a comma-separated list of artist names. Each artist with a known id
 * links to their artist page; an artist without one (a work that hasn't been
 * artist-linked yet) renders as plain text so nothing is ever a dead link.
 */
export function ArtistLinks({ artists }: { artists: ChartEntryArtist[] }) {
  return (
    <>
      {artists.map((a, i) => (
        <span key={a.id ?? `${a.name}-${i}`}>
          {i > 0 && ', '}
          {a.id ? (
            <Link className="artist-link" to={`/artist/${a.id}`}>
              {a.name}
            </Link>
          ) : (
            a.name
          )}
        </span>
      ))}
    </>
  );
}
