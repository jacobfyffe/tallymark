import { query, withTransaction } from '@tallymark/db';

/**
 * Data layer for the charts web API.
 *
 * Reads the chart tables (Phase 3), works tables (Phase 2), and the artist
 * credit layer (work_artists) from the shared database, and writes works
 * admin decisions into Phase 2's work_overrides.
 */

export type ScopeLabel = string; // 'global' | 'personal:<userId>'

export interface ChartEntryArtist {
  /** Internal artist id, or null if this work hasn't been artist-linked yet
   *  (e.g. before the orchestrator's artist-linking step has run on it). A
   *  null id means the frontend should render the name as plain text, not a
   *  link. */
  id: string | null;
  name: string;
}

export interface ChartEntry {
  work_id: string;
  rank: number;
  play_count: number;
  title: string;
  /** Every credited artist on this work. A collaboration has more than one. */
  artists: ChartEntryArtist[];
  peak_position: number;
  weeks_on_chart: number;
  /** Movement vs. the previous charted week. */
  movement: 'new' | 'up' | 'down' | 'steady';
  /** Positions moved (positive = up). Null for new entries. */
  movement_amount: number | null;
  /** Album cover URL (from the captured Spotify payload), if available. */
  image_url: string | null;
}

/** Every charted week for a scope, oldest first — the full navigable timeline. */
async function getAvailableWeeks(scope: ScopeLabel): Promise<string[]> {
  const { rows } = await query<{ week_start: string }>(
    `SELECT week_start FROM chart_weeks WHERE scope = $1 ORDER BY week_start ASC`,
    [scope],
  );
  return rows.map((r) =>
    typeof r.week_start === 'string' ? r.week_start.slice(0, 10) : new Date(r.week_start).toISOString().slice(0, 10),
  );
}

export interface ChartResponse {
  scope: ScopeLabel;
  week_start: string | null;
  /** Every charted week for this scope, oldest first — drives prev/next navigation. */
  available_weeks: string[];
  entries: ChartEntry[];
}

/**
 * A finalized chart for a scope and week (defaults to the most recent week),
 * with movement computed against the chronologically previous charted week
 * and peak/weeks-on-chart derived across all of the scope's history.
 */
export async function getChart(scope: ScopeLabel, requestedWeek?: string): Promise<ChartResponse> {
  const weeks = await getAvailableWeeks(scope);
  if (weeks.length === 0) {
    return { scope, week_start: null, available_weeks: [], entries: [] };
  }
  const thisWeek = requestedWeek && weeks.includes(requestedWeek) ? requestedWeek : weeks[weeks.length - 1];
  const idx = weeks.indexOf(thisWeek);
  const lastWeek = idx > 0 ? weeks[idx - 1] : null;

  const { rows } = await query<{
    work_id: string;
    rank: string;
    play_count: string;
    title: string;
    artist_name: string;
    peak_position: string;
    weeks_on_chart: string;
    last_rank: string | null;
    image_url: string | null;
    artists: ChartEntryArtist[] | null;
  }>(
    `WITH scoped AS (
       SELECT ce.work_id, ce.rank, ce.play_count, cw.week_start
         FROM chart_entries ce
         JOIN chart_weeks cw ON cw.id = ce.chart_week_id
        WHERE cw.scope = $1
     ),
     hist AS (
       SELECT work_id, MIN(rank) AS peak_position, COUNT(*) AS weeks_on_chart
         FROM scoped GROUP BY work_id
     ),
     this_week AS (
       SELECT s.work_id, s.rank, s.play_count
         FROM scoped s WHERE s.week_start = $2
     ),
     last_week AS (
       SELECT s.work_id, s.rank
         FROM scoped s WHERE s.week_start = $3
     ),
     -- A representative album image per work: reach from the work's recordings
     -- back to any play, and pull the largest cover (index 0) out of the raw
     -- Spotify payload that was captured at ingest time.
     art AS (
       SELECT rw.work_id,
              (SELECT p.raw -> 'track' -> 'album' -> 'images' -> 0 ->> 'url'
                 FROM plays p
                 JOIN play_resolutions pr2 ON pr2.play_id = p.id
                 JOIN recording_works rw2 ON rw2.canonical_recording_id = pr2.canonical_recording_id
                WHERE rw2.work_id = rw.work_id
                  AND p.raw -> 'track' -> 'album' -> 'images' -> 0 ->> 'url' IS NOT NULL
                LIMIT 1) AS image_url
         FROM (SELECT DISTINCT work_id FROM this_week) rw
     ),
     -- Every credited artist per work, from the structured artist-linking
     -- layer, in their original credit order (lead artist first). A work with
     -- no links yet (not linked by the pipeline) gets NULL here, and the
     -- application layer falls back to the plain artist_name.
     artists_agg AS (
       SELECT wa.work_id,
              json_agg(json_build_object('id', a.id::text, 'name', a.name) ORDER BY wa.position) AS artists
         FROM work_artists wa
         JOIN artists a ON a.id = wa.artist_id
        WHERE wa.work_id IN (SELECT work_id FROM this_week)
        GROUP BY wa.work_id
     )
     SELECT tw.work_id, tw.rank, tw.play_count,
            w.title, w.artist_name,
            h.peak_position, h.weeks_on_chart,
            lw.rank AS last_rank,
            art.image_url,
            aa.artists
       FROM this_week tw
       JOIN works w ON w.id = tw.work_id
       JOIN hist h ON h.work_id = tw.work_id
       LEFT JOIN last_week lw ON lw.work_id = tw.work_id
       LEFT JOIN art ON art.work_id = tw.work_id
       LEFT JOIN artists_agg aa ON aa.work_id = tw.work_id
      ORDER BY tw.rank`,
    [scope, thisWeek, lastWeek],
  );

  const entries: ChartEntry[] = rows.map((r) => {
    const rank = Number(r.rank);
    const lastRank = r.last_rank === null ? null : Number(r.last_rank);
    let movement: ChartEntry['movement'];
    let movement_amount: number | null;
    if (lastRank === null) {
      movement = 'new';
      movement_amount = null;
    } else if (lastRank === rank) {
      movement = 'steady';
      movement_amount = 0;
    } else if (lastRank > rank) {
      movement = 'up';
      movement_amount = lastRank - rank;
    } else {
      movement = 'down';
      movement_amount = lastRank - rank; // negative
    }
    // Fall back to the plain combined name if this work hasn't been
    // artist-linked yet, so nothing breaks while the pipeline catches up.
    const artists = r.artists && r.artists.length > 0 ? r.artists : [{ id: null, name: r.artist_name }];
    return {
      work_id: r.work_id,
      rank,
      play_count: Number(r.play_count),
      title: r.title,
      artists,
      peak_position: Number(r.peak_position),
      weeks_on_chart: Number(r.weeks_on_chart),
      movement,
      movement_amount,
      image_url: r.image_url,
    };
  });

  return { scope, week_start: thisWeek, available_weeks: weeks, entries };
}

export interface ArtistChartSong {
  work_id: string;
  title: string;
  peak_position: number;
  weeks_on_chart: number;
  total_plays: number;
  currently_charting: boolean;
  current_rank: number | null;
  /** True if this artist is the lead credit on this song, not a feature. */
  is_primary_credit: boolean;
  /** Other artists credited on this song, e.g. for a "feat. X" line. */
  collaborators: ChartEntryArtist[];
  image_url: string | null;
}

export interface ArtistChartSection {
  songs: ArtistChartSong[];
}

export interface ArtistResponse {
  artist: { id: string; name: string } | null;
  global: ArtistChartSection;
  personal: ArtistChartSection;
}

/**
 * Every song this artist has ever charted in one scope, with peak position
 * and weeks-on-chart computed across that scope's full history (not just the
 * current week — a song that's fallen off still shows here).
 */
async function getArtistSection(artistId: string, scope: ScopeLabel): Promise<ArtistChartSong[]> {
  const { rows } = await query<{
    work_id: string;
    title: string;
    peak_position: string;
    weeks_on_chart: string;
    total_plays: string;
    current_rank: string | null;
    viewer_position: string;
  }>(
    `WITH artist_works AS (
       SELECT work_id, position AS viewer_position FROM work_artists WHERE artist_id = $1
     ),
     scoped AS (
       SELECT ce.work_id, ce.rank, ce.play_count, cw.week_start
         FROM chart_entries ce
         JOIN chart_weeks cw ON cw.id = ce.chart_week_id
        WHERE cw.scope = $2
          AND ce.work_id IN (SELECT work_id FROM artist_works)
     ),
     hist AS (
       SELECT work_id,
              MIN(rank) AS peak_position,
              COUNT(*) AS weeks_on_chart,
              SUM(play_count) AS total_plays
         FROM scoped
        GROUP BY work_id
     ),
     latest_week AS (
       SELECT week_start FROM scoped ORDER BY week_start DESC LIMIT 1
     ),
     current AS (
       SELECT s.work_id, s.rank
         FROM scoped s
         JOIN latest_week lw ON lw.week_start = s.week_start
     )
     SELECT h.work_id, w.title,
            h.peak_position, h.weeks_on_chart, h.total_plays,
            c.rank AS current_rank,
            aw.viewer_position
       FROM hist h
       JOIN works w ON w.id = h.work_id
       JOIN artist_works aw ON aw.work_id = h.work_id
       LEFT JOIN current c ON c.work_id = h.work_id
      ORDER BY h.peak_position ASC, h.weeks_on_chart DESC`,
    [artistId, scope],
  );

  if (rows.length === 0) return [];

  const workIds = rows.map((r) => r.work_id);

  // Other artists credited on these same works (collab partners), in their
  // original credit order, in one follow-up query rather than N+1.
  const { rows: collabRows } = await query<{ work_id: string; id: string; name: string }>(
    `SELECT wa.work_id, a.id::text AS id, a.name
       FROM work_artists wa
       JOIN artists a ON a.id = wa.artist_id
      WHERE wa.work_id = ANY($1::bigint[])
        AND wa.artist_id != $2
      ORDER BY wa.work_id, wa.position`,
    [workIds, artistId],
  );
  const collabsByWork = new Map<string, ChartEntryArtist[]>();
  for (const c of collabRows) {
    const list = collabsByWork.get(c.work_id) ?? [];
    list.push({ id: c.id, name: c.name });
    collabsByWork.set(c.work_id, list);
  }

  // A representative album image per song, same technique as the chart's
  // own art lookup: reach from the work's recordings back to any play, and
  // pull the cover out of the raw Spotify payload captured at ingest time.
  const { rows: artRows } = await query<{ work_id: string; image_url: string | null }>(
    `SELECT DISTINCT ON (rw.work_id)
            rw.work_id,
            p.raw -> 'track' -> 'album' -> 'images' -> 0 ->> 'url' AS image_url
       FROM recording_works rw
       JOIN play_resolutions pr ON pr.canonical_recording_id = rw.canonical_recording_id
       JOIN plays p ON p.id = pr.play_id
      WHERE rw.work_id = ANY($1::bigint[])
        AND p.raw -> 'track' -> 'album' -> 'images' -> 0 ->> 'url' IS NOT NULL
      ORDER BY rw.work_id`,
    [workIds],
  );
  const artByWork = new Map<string, string>();
  for (const a of artRows) {
    if (a.image_url) artByWork.set(a.work_id, a.image_url);
  }

  return rows.map((r) => ({
    work_id: r.work_id,
    title: r.title,
    peak_position: Number(r.peak_position),
    weeks_on_chart: Number(r.weeks_on_chart),
    total_plays: Number(r.total_plays),
    currently_charting: r.current_rank !== null,
    current_rank: r.current_rank === null ? null : Number(r.current_rank),
    is_primary_credit: Number(r.viewer_position) === 0,
    collaborators: collabsByWork.get(r.work_id) ?? [],
    image_url: artByWork.get(r.work_id) ?? null,
  }));
}

/**
 * An artist's full chart history: global and personal kept as two separate
 * sections (never merged), each with peak position and weeks-on-chart for
 * every song they've ever charted in that scope.
 */
export async function getArtist(artistId: string, personalUserId: string): Promise<ArtistResponse> {
  const { rows: artistRows } = await query<{ id: string; name: string }>(
    `SELECT id::text AS id, name FROM artists WHERE id = $1`,
    [artistId],
  );
  const artist = artistRows[0] ?? null;
  if (!artist) {
    return { artist: null, global: { songs: [] }, personal: { songs: [] } };
  }

  const [globalSongs, personalSongs] = await Promise.all([
    getArtistSection(artistId, 'global'),
    getArtistSection(artistId, `personal:${personalUserId}`),
  ]);

  return { artist, global: { songs: globalSongs }, personal: { songs: personalSongs } };
}

export interface SongHistoryPoint {
  week_start: string;
  rank: number;
}

export interface SongChartSection {
  peak_position: number | null;
  weeks_on_chart: number;
  total_plays: number;
  currently_charting: boolean;
  current_rank: number | null;
  /** Every charted week for this song in this scope, oldest first — for the trend line. */
  history: SongHistoryPoint[];
}

export interface SongResponse {
  work: { id: string; title: string } | null;
  /** Credited artists in their original order (lead artist first). */
  artists: ChartEntryArtist[];
  image_url: string | null;
  global: SongChartSection;
  personal: SongChartSection;
}

/** One song's full chart history in one scope, plus whether it's currently charting there. */
async function getSongSection(workId: string, scope: ScopeLabel): Promise<SongChartSection> {
  const { rows } = await query<{ week_start: string; rank: string; play_count: string; latest_week: string | null }>(
    `WITH h AS (
       SELECT cw.week_start, ce.rank, ce.play_count
         FROM chart_entries ce
         JOIN chart_weeks cw ON cw.id = ce.chart_week_id
        WHERE cw.scope = $1 AND ce.work_id = $2
     ),
     latest AS (
       SELECT MAX(week_start) AS latest_week FROM chart_weeks WHERE scope = $1
     )
     SELECT h.week_start, h.rank, h.play_count, latest.latest_week
       FROM h, latest
      ORDER BY h.week_start ASC`,
    [scope, workId],
  );

  if (rows.length === 0) {
    return { peak_position: null, weeks_on_chart: 0, total_plays: 0, currently_charting: false, current_rank: null, history: [] };
  }

  const history = rows.map((r) => ({
    week_start: typeof r.week_start === 'string' ? r.week_start.slice(0, 10) : String(r.week_start),
    rank: Number(r.rank),
  }));
  const latestWeek = rows[0].latest_week
    ? typeof rows[0].latest_week === 'string'
      ? rows[0].latest_week.slice(0, 10)
      : String(rows[0].latest_week)
    : null;
  const last = history[history.length - 1];
  const currentlyCharting = latestWeek !== null && last.week_start === latestWeek;

  return {
    peak_position: Math.min(...history.map((h) => h.rank)),
    weeks_on_chart: history.length,
    total_plays: rows.reduce((sum, r) => sum + Number(r.play_count), 0),
    currently_charting: currentlyCharting,
    current_rank: currentlyCharting ? last.rank : null,
    history,
  };
}

/**
 * One song's full chart story: its credited artists, its global chart history,
 * and its personal chart history, kept as two separate sections.
 */
export async function getWork(workId: string, personalUserId: string): Promise<SongResponse> {
  const { rows: workRows } = await query<{ id: string; title: string; artist_name: string }>(
    `SELECT id::text AS id, title, artist_name FROM works WHERE id = $1`,
    [workId],
  );
  const work = workRows[0] ?? null;
  if (!work) {
    return {
      work: null,
      artists: [],
      image_url: null,
      global: { peak_position: null, weeks_on_chart: 0, total_plays: 0, currently_charting: false, current_rank: null, history: [] },
      personal: { peak_position: null, weeks_on_chart: 0, total_plays: 0, currently_charting: false, current_rank: null, history: [] },
    };
  }

  const { rows: artistRows } = await query<{ id: string; name: string }>(
    `SELECT a.id::text AS id, a.name
       FROM work_artists wa
       JOIN artists a ON a.id = wa.artist_id
      WHERE wa.work_id = $1
      ORDER BY wa.position`,
    [workId],
  );
  // Fall back to the plain combined name if this work hasn't been
  // artist-linked yet, so the page still shows something useful.
  const artists = artistRows.length > 0 ? artistRows : [{ id: null, name: work.artist_name }];

  const { rows: artRows } = await query<{ image_url: string | null }>(
    `SELECT p.raw -> 'track' -> 'album' -> 'images' -> 0 ->> 'url' AS image_url
       FROM recording_works rw
       JOIN play_resolutions pr ON pr.canonical_recording_id = rw.canonical_recording_id
       JOIN plays p ON p.id = pr.play_id
      WHERE rw.work_id = $1
        AND p.raw -> 'track' -> 'album' -> 'images' -> 0 ->> 'url' IS NOT NULL
      LIMIT 1`,
    [workId],
  );

  const [global, personal] = await Promise.all([
    getSongSection(workId, 'global'),
    getSongSection(workId, `personal:${personalUserId}`),
  ]);

  return {
    work: { id: work.id, title: work.title },
    artists,
    image_url: artRows[0]?.image_url ?? null,
    global,
    personal,
  };
}

export interface SearchResult {
  artists: { id: string; name: string }[];
  works: { id: string; title: string; artist_name: string }[];
}

/**
 * Search artists and songs that have actually been tallied — not Spotify's
 * whole catalog. Every result here is guaranteed to land on a real page with
 * real chart data, rather than a dead end for something never played.
 */
export async function search(term: string): Promise<SearchResult> {
  const like = `%${term}%`;
  const [artistRows, workRows] = await Promise.all([
    query<{ id: string; name: string }>(
      `SELECT id::text AS id, name FROM artists WHERE name ILIKE $1 ORDER BY name LIMIT 8`,
      [like],
    ),
    query<{ id: string; title: string; artist_name: string }>(
      `SELECT id::text AS id, title, artist_name FROM works
        WHERE title ILIKE $1 OR artist_name ILIKE $1
        ORDER BY title LIMIT 8`,
      [like],
    ),
  ]);
  return { artists: artistRows.rows, works: workRows.rows };
}

export interface WorkSummary {
  id: string;
  title: string;
  artist_name: string;
  recording_count: number;
  total_plays: number;
}

/** Works with their recording counts and total plays, for the admin view. */
export async function listWorks(search: string | null, limit: number): Promise<WorkSummary[]> {
  const like = search ? `%${search}%` : '%';
  const { rows } = await query<{
    id: string;
    title: string;
    artist_name: string;
    recording_count: string;
    total_plays: string;
  }>(
    `SELECT w.id, w.title, w.artist_name,
            COUNT(DISTINCT rw.canonical_recording_id) AS recording_count,
            COUNT(pr.play_id) AS total_plays
       FROM works w
       LEFT JOIN recording_works rw ON rw.work_id = w.id
       LEFT JOIN play_resolutions pr ON pr.canonical_recording_id = rw.canonical_recording_id
      WHERE w.title ILIKE $1
      GROUP BY w.id, w.title, w.artist_name
      ORDER BY total_plays DESC, w.title
      LIMIT $2`,
    [like, limit],
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    artist_name: r.artist_name,
    recording_count: Number(r.recording_count),
    total_plays: Number(r.total_plays),
  }));
}

/**
 * Merge: force the recordings of `sourceWorkId` to share `targetWorkId`'s work
 * key, by writing work_overrides for each of the source's recordings. The next
 * resolver run applies it. We set the override key to the target work's key.
 */
export async function mergeWorks(sourceWorkId: string, targetWorkId: string): Promise<number> {
  return withTransaction(async (client) => {
    const target = await client.query<{ work_key: string }>(
      `SELECT work_key FROM works WHERE id = $1`,
      [targetWorkId],
    );
    const key = target.rows[0]?.work_key;
    if (key === undefined) throw new Error(`Target work ${targetWorkId} not found`);

    const recs = await client.query<{ canonical_recording_id: string }>(
      `SELECT canonical_recording_id FROM recording_works WHERE work_id = $1`,
      [sourceWorkId],
    );
    for (const { canonical_recording_id } of recs.rows) {
      await client.query(
        `INSERT INTO work_overrides (canonical_recording_id, work_key, note)
         VALUES ($1, $2, 'merged via admin UI')
         ON CONFLICT (canonical_recording_id)
           DO UPDATE SET work_key = EXCLUDED.work_key, note = EXCLUDED.note`,
        [canonical_recording_id, key],
      );
    }
    return recs.rows.length;
  });
}

/**
 * Split: force every recording currently in `workId` to its own standalone work
 * by giving each a unique override key. The next resolver run applies it.
 */
export async function splitWork(workId: string): Promise<number> {
  return withTransaction(async (client) => {
    const recs = await client.query<{ canonical_recording_id: string }>(
      `SELECT canonical_recording_id FROM recording_works WHERE work_id = $1`,
      [workId],
    );
    for (const { canonical_recording_id } of recs.rows) {
      await client.query(
        `INSERT INTO work_overrides (canonical_recording_id, work_key, note)
         VALUES ($1, $2, 'split via admin UI')
         ON CONFLICT (canonical_recording_id)
           DO UPDATE SET work_key = EXCLUDED.work_key, note = EXCLUDED.note`,
        [canonical_recording_id, `standalone-recording-${canonical_recording_id}`],
      );
    }
    return recs.rows.length;
  });
}
