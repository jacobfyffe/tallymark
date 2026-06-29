import { query, withTransaction } from '@tallymark/db';

/**
 * Data-access for charting. The ranking query is the heart of it.
 *
 * A "scope" is either 'global' (all users) or 'personal:<userId>'. We translate
 * that into a WHERE clause over the play -> account -> user chain.
 */

export type Scope = { kind: 'global' } | { kind: 'personal'; userId: string };

export function scopeLabel(scope: Scope): string {
  return scope.kind === 'global' ? 'global' : `personal:${scope.userId}`;
}

export interface RankedWork {
  work_id: string;
  play_count: number;
  rank: number;
}

/**
 * Rank works by play count within [start, end) for a scope.
 *
 * The join chain: plays -> play_resolutions (to canonical recording) ->
 * recording_works (to work). We count plays per work in the window. Tie-break
 * is earliest first-play: among equal counts, the work whose earliest play
 * (ever, not just this week) is older ranks higher.
 *
 * Personal scope filters to one user's plays via spotify_accounts.user_id.
 */
export async function rankWorks(
  scope: Scope,
  start: Date,
  end: Date,
  limit: number,
): Promise<RankedWork[]> {
  const personalFilter = scope.kind === 'personal' ? 'AND sa.user_id = $4' : '';
  const params: unknown[] =
    scope.kind === 'personal' ? [start, end, limit, scope.userId] : [start, end, limit];

  const { rows } = await query<{ work_id: string; play_count: string; rank: string }>(
    `WITH windowed AS (
       SELECT rw.work_id,
              COUNT(*) AS play_count,
              MIN(first_play.first_at) AS earliest_first_play
         FROM plays p
         JOIN spotify_accounts sa ON sa.id = p.spotify_account_id
         JOIN play_resolutions pr ON pr.play_id = p.id
         JOIN recording_works rw ON rw.canonical_recording_id = pr.canonical_recording_id
         JOIN LATERAL (
           SELECT MIN(p2.played_at) AS first_at
             FROM plays p2
             JOIN play_resolutions pr2 ON pr2.play_id = p2.id
             JOIN recording_works rw2 ON rw2.canonical_recording_id = pr2.canonical_recording_id
            WHERE rw2.work_id = rw.work_id
         ) first_play ON true
        WHERE p.played_at >= $1 AND p.played_at < $2
          ${personalFilter}
        GROUP BY rw.work_id
     )
     SELECT work_id,
            play_count,
            RANK() OVER (ORDER BY play_count DESC, earliest_first_play ASC) AS rank
       FROM windowed
       ORDER BY rank
       LIMIT $3`,
    params,
  );

  return rows.map((r) => ({
    work_id: r.work_id,
    play_count: Number(r.play_count),
    rank: Number(r.rank),
  }));
}

/** The earliest played_at across all plays (start of chart history). */
export async function getEarliestPlay(): Promise<Date | null> {
  const { rows } = await query<{ min: Date | null }>(`SELECT MIN(played_at) AS min FROM plays`);
  return rows[0]?.min ?? null;
}

/**
 * Persist one week's ranked entries for a scope. Idempotent: re-computing a week
 * replaces its entries (upsert the week, delete old entries, insert fresh).
 */
export async function saveChartWeek(
  scope: Scope,
  weekStart: string,
  ranked: RankedWork[],
): Promise<void> {
  const label = scopeLabel(scope);
  await withTransaction(async (client) => {
    const week = await client.query<{ id: string }>(
      `INSERT INTO chart_weeks (scope, week_start)
       VALUES ($1, $2)
       ON CONFLICT (scope, week_start) DO UPDATE SET computed_at = now()
       RETURNING id`,
      [label, weekStart],
    );
    const weekId = week.rows[0]?.id;
    if (weekId === undefined) throw new Error(`Failed to upsert chart_week ${label} ${weekStart}`);

    await client.query(`DELETE FROM chart_entries WHERE chart_week_id = $1`, [weekId]);

    for (const entry of ranked) {
      await client.query(
        `INSERT INTO chart_entries (chart_week_id, work_id, rank, play_count)
         VALUES ($1, $2, $3, $4)`,
        [weekId, entry.work_id, entry.rank, entry.play_count],
      );
    }
  });
}

export interface LiveChartRow {
  rank: number;
  play_count: number;
  title: string;
  artist_name: string;
}

/**
 * Rank works for a scope within [start, end), joined to work titles, WITHOUT
 * persisting anything. Used by the live (in-progress week) view. Same ranking
 * and tie-break as the official charts, just not saved.
 */
export async function rankWorksWithTitles(
  scope: Scope,
  start: Date,
  end: Date,
  limit: number,
): Promise<LiveChartRow[]> {
  const personalFilter = scope.kind === 'personal' ? 'AND sa.user_id = $4' : '';
  const params: unknown[] =
    scope.kind === 'personal' ? [start, end, limit, scope.userId] : [start, end, limit];

  const { rows } = await query<{
    play_count: string;
    rank: string;
    title: string;
    artist_name: string;
  }>(
    `WITH windowed AS (
       SELECT rw.work_id,
              COUNT(*) AS play_count,
              MIN(first_play.first_at) AS earliest_first_play
         FROM plays p
         JOIN spotify_accounts sa ON sa.id = p.spotify_account_id
         JOIN play_resolutions pr ON pr.play_id = p.id
         JOIN recording_works rw ON rw.canonical_recording_id = pr.canonical_recording_id
         JOIN LATERAL (
           SELECT MIN(p2.played_at) AS first_at
             FROM plays p2
             JOIN play_resolutions pr2 ON pr2.play_id = p2.id
             JOIN recording_works rw2 ON rw2.canonical_recording_id = pr2.canonical_recording_id
            WHERE rw2.work_id = rw.work_id
         ) first_play ON true
        WHERE p.played_at >= $1 AND p.played_at < $2
          ${personalFilter}
        GROUP BY rw.work_id
     )
     SELECT w.title, w.artist_name, wd.play_count,
            RANK() OVER (ORDER BY wd.play_count DESC, wd.earliest_first_play ASC) AS rank
       FROM windowed wd
       JOIN works w ON w.id = wd.work_id
       ORDER BY rank
       LIMIT $3`,
    params,
  );

  return rows.map((r) => ({
    rank: Number(r.rank),
    play_count: Number(r.play_count),
    title: r.title,
    artist_name: r.artist_name,
  }));
}

export interface ChartRow {
  rank: number;
  play_count: number;
  title: string;
  artist_name: string;
  peak_position: number;
  weeks_on_chart: number;
}

/**
 * The chart for a given scope + week, joined to work metadata, with peak
 * position and weeks-on-chart derived across all of that scope's weeks.
 */
export async function getChart(scope: Scope, weekStart: string): Promise<ChartRow[]> {
  const label = scopeLabel(scope);
  const { rows } = await query<{
    rank: string;
    play_count: string;
    title: string;
    artist_name: string;
    peak_position: string;
    weeks_on_chart: string;
  }>(
    `WITH scoped_entries AS (
       SELECT ce.work_id, ce.rank, ce.play_count, cw.week_start
         FROM chart_entries ce
         JOIN chart_weeks cw ON cw.id = ce.chart_week_id
        WHERE cw.scope = $1
     ),
     history AS (
       SELECT work_id,
              MIN(rank) AS peak_position,
              COUNT(*) AS weeks_on_chart
         FROM scoped_entries
        GROUP BY work_id
     )
     SELECT se.rank, se.play_count, w.title, w.artist_name,
            h.peak_position, h.weeks_on_chart
       FROM scoped_entries se
       JOIN chart_weeks cw ON cw.scope = $1 AND cw.week_start = se.week_start
       JOIN works w ON w.id = se.work_id
       JOIN history h ON h.work_id = se.work_id
      WHERE se.week_start = $2
      ORDER BY se.rank`,
    [label, weekStart],
  );

  return rows.map((r) => ({
    rank: Number(r.rank),
    play_count: Number(r.play_count),
    title: r.title,
    artist_name: r.artist_name,
    peak_position: Number(r.peak_position),
    weeks_on_chart: Number(r.weeks_on_chart),
  }));
}
