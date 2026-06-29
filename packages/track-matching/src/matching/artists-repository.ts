import { query, withTransaction } from '@tallymark/db';

/**
 * Data-access for the artist-linking layer.
 *
 * Derives structured artist credit from plays.raw (Spotify's per-track artists
 * array, which the scrobbler preserves but collapses into one display string).
 * Both writes are set-based upserts rather than per-row loops, since the
 * source data (every resolved play) can be large and the shape of the work is
 * "match everything, insert what's new" rather than per-row branching logic.
 */

export interface ArtistLinkingResult {
  artistsUpserted: number;
  linksUpserted: number;
}

/**
 * Upsert every distinct (spotify_artist_id, name) pair found in the raw
 * payload of resolved plays, then link each work to every artist credited on
 * any of its recordings, preserving each artist's position in Spotify's
 * original credit order (0 = lead artist). Idempotent: re-running adds any
 * new links and refreshes names/positions in place to match the source data.
 */
export async function runArtistLinkingQueries(): Promise<ArtistLinkingResult> {
  return withTransaction(async (client) => {
    const artistsResult = await client.query(
      `INSERT INTO artists (spotify_artist_id, name)
       SELECT DISTINCT
              art ->> 'id'   AS spotify_artist_id,
              art ->> 'name' AS name
         FROM recording_works rw
         JOIN play_resolutions pr ON pr.canonical_recording_id = rw.canonical_recording_id
         JOIN plays p ON p.id = pr.play_id
         CROSS JOIN LATERAL jsonb_array_elements(p.raw -> 'track' -> 'artists') AS art
        WHERE art ->> 'id' IS NOT NULL
       ON CONFLICT (spotify_artist_id) DO UPDATE SET name = EXCLUDED.name`,
    );

    const linksResult = await client.query(
      `INSERT INTO work_artists (work_id, artist_id, position)
       SELECT DISTINCT ON (rw.work_id, a.id)
              rw.work_id, a.id, (ord.ordinality - 1)::smallint AS position
         FROM recording_works rw
         JOIN play_resolutions pr ON pr.canonical_recording_id = rw.canonical_recording_id
         JOIN plays p ON p.id = pr.play_id
         CROSS JOIN LATERAL jsonb_array_elements(p.raw -> 'track' -> 'artists')
           WITH ORDINALITY AS ord(art, ordinality)
         JOIN artists a ON a.spotify_artist_id = ord.art ->> 'id'
        ORDER BY rw.work_id, a.id
       ON CONFLICT (work_id, artist_id) DO UPDATE SET position = EXCLUDED.position`,
    );

    return {
      artistsUpserted: artistsResult.rowCount ?? 0,
      linksUpserted: linksResult.rowCount ?? 0,
    };
  });
}

export interface ArtistLinkingStats {
  artists: number;
  links: number;
}

/** Current totals, for logging after a run. */
export async function getArtistLinkingStats(): Promise<ArtistLinkingStats> {
  const { rows } = await query<{ artists: string; links: string }>(
    `SELECT
       (SELECT COUNT(*) FROM artists)      AS artists,
       (SELECT COUNT(*) FROM work_artists) AS links`,
  );
  const row = rows[0];
  return {
    artists: Number(row?.artists ?? 0),
    links: Number(row?.links ?? 0),
  };
}
