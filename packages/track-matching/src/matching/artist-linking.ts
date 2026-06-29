import { runArtistLinkingQueries, getArtistLinkingStats } from './artists-repository.js';
import { log } from '@tallymark/db';

/**
 * Artist linking.
 *
 * Derives structured, many-to-many artist credit for every work from the raw
 * Spotify payload captured at ingest time. This runs after works grouping, so
 * recording_works is populated and every work has a stable id to link against.
 *
 * Fully recomputable and idempotent: re-running re-derives every link from the
 * current state of recording_works + plays.raw and only adds what's missing.
 * Nothing here mutates earlier layers.
 */
export async function runArtistLinking(): Promise<{ artistsUpserted: number; linksUpserted: number }> {
  const result = await runArtistLinkingQueries();
  const totals = await getArtistLinkingStats();

  log.info('Artist linking complete', {
    artistsUpserted: result.artistsUpserted,
    linksUpserted: result.linksUpserted,
    totalArtists: totals.artists,
    totalLinks: totals.links,
  });

  return result;
}
