import { query, withTransaction } from '@tallymark/db';

/**
 * Data layer for the charts web API.
 *
 * Reads the chart tables (Phase 3) and works tables (Phase 2) from the shared
 * database, and writes works admin decisions into Phase 2's work_overrides.
 */

export type ScopeLabel = string; // 'global' | 'personal:<userId>'

export interface ChartEntry {
  rank: number;
  play_count: number;
  title: string;
  artist_name: string;
  peak_position: number;
  weeks_on_chart: number;
  /** Movement vs. the previous charted week. */
  movement: 'new' | 'up' | 'down' | 'steady';
  /** Positions moved (positive = up). Null for new entries. */
  movement_amount: number | null;
  /** Album cover URL (from the captured Spotify payload), if available. */
  image_url: string | null;
}

/** The two most recent charted weeks for a scope (this week + last, for movement). */
async function recentWeeks(scope: ScopeLabel): Promise<string[]> {
  const { rows } = await query<{ week_start: string }>(
    `SELECT week_start FROM chart_weeks WHERE scope = $1 ORDER BY week_start DESC LIMIT 2`,
    [scope],
  );
  return rows.map((r) =>
    typeof r.week_start === 'string' ? r.week_start.slice(0, 10) : new Date(r.week_start).toISOString().slice(0, 10),
  );
}

export interface ChartResponse {
  scope: ScopeLabel;
  week_start: string | null;
  entries: ChartEntry[];
}

/**
 * The latest finalized chart for a scope, with movement computed against the
 * previous week and peak/weeks-on-chart derived across all the scope's weeks.
 */
export async function getLatestChart(scope: ScopeLabel): Promise<ChartResponse> {
  const weeks = await recentWeeks(scope);
  const thisWeek = weeks[0];
  const lastWeek = weeks[1] ?? null;
  if (thisWeek === undefined) {
    return { scope, week_start: null, entries: [] };
  }

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
     )
     SELECT tw.work_id, tw.rank, tw.play_count,
            w.title, w.artist_name,
            h.peak_position, h.weeks_on_chart,
            lw.rank AS last_rank,
            art.image_url
       FROM this_week tw
       JOIN works w ON w.id = tw.work_id
       JOIN hist h ON h.work_id = tw.work_id
       LEFT JOIN last_week lw ON lw.work_id = tw.work_id
       LEFT JOIN art ON art.work_id = tw.work_id
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
    return {
      rank,
      play_count: Number(r.play_count),
      title: r.title,
      artist_name: r.artist_name,
      peak_position: Number(r.peak_position),
      weeks_on_chart: Number(r.weeks_on_chart),
      movement,
      movement_amount,
      image_url: r.image_url,
    };
  });

  return { scope, week_start: thisWeek, entries };
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
