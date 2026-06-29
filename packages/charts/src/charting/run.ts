import { computeCharts } from './engine.js';
import { closePool, query, log } from '@tallymark/db';

/**
 * Compute charts on demand.
 *
 * By default computes the global chart plus a personal chart for every user
 * that has plays. (With one user, global and personal are identical, but both
 * are produced so the structure is exercised.)
 */
async function main(): Promise<void> {
  log.info('Starting chart computation');

  await computeCharts({ kind: 'global' });

  const { rows } = await query<{ user_id: string }>(
    `SELECT DISTINCT sa.user_id
       FROM spotify_accounts sa
       JOIN plays p ON p.spotify_account_id = sa.id`,
  );
  for (const { user_id } of rows) {
    await computeCharts({ kind: 'personal', userId: user_id });
  }

  log.info('All charts computed', { personalUsers: rows.length });
}

main()
  .then(() => closePool())
  .then(() => process.exit(0))
  .catch(async (error: unknown) => {
    log.error('Chart run failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    await closePool();
    process.exit(1);
  });
