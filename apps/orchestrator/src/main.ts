import { config } from './config.js';
import { query, closePool, log } from '@tallymark/db';
import { getAccountsToPoll, ingestAccount } from '@tallymark/scrobbler';
import {
  runTier1Resolution,
  runFuzzyMatching,
  runWorksGrouping,
  runArtistLinking,
} from '@tallymark/track-matching';
import { computeCharts } from '@tallymark/charts';

/**
 * The Tallymark orchestrator — one always-on process that runs the whole
 * pipeline on a schedule, so the system runs itself with no manual terminal
 * steps.
 *
 * Two loops:
 *   - Pipeline loop (fast, ~60s): capture new tallies from Spotify, then
 *     resolve them into canonical recordings + works, then derive artist
 *     credit. Because charts are computed on read (the live chart) and on the
 *     finalize loop, fresh tallies flow through automatically.
 *   - Finalize loop (slow, ~1h): recompute finalized charts for the global
 *     scope and every user's personal scope. computeCharts self-detects
 *     completed weeks and is idempotent, so running it repeatedly simply picks
 *     up any week that has closed since last time.
 *
 * Each stage is wrapped so a failure in one cycle is logged and the loop
 * continues rather than crashing the process.
 */

let running = true;

async function runPipelineCycle(): Promise<void> {
  // 1. Capture: poll each due Spotify account for new plays.
  const accounts = await getAccountsToPoll(config.capturePollLimit);
  let captured = 0;
  for (const account of accounts) {
    try {
      captured += await ingestAccount(account);
    } catch (error) {
      log.error('Capture failed for account', {
        accountId: account.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // 2. Resolve: ISRC -> fuzzy -> works grouping -> artist linking. Each is
  // idempotent, and artist linking runs last since it depends on works
  // already being assigned.
  const tier1 = await runTier1Resolution();
  const fuzzy = await runFuzzyMatching();
  const works = await runWorksGrouping();
  const artists = await runArtistLinking();

  log.info('Pipeline cycle complete', {
    accountsPolled: accounts.length,
    talliesCaptured: captured,
    tier1Resolved: tier1,
    fuzzyProcessed: fuzzy.processed,
    worksAssigned: works.assigned,
    artistsUpserted: artists.artistsUpserted,
    artistLinksUpserted: artists.linksUpserted,
  });
}

async function runFinalizeCycle(): Promise<void> {
  // Global chart.
  await computeCharts({ kind: 'global' });

  // Personal chart for every user that has tallies.
  const { rows } = await query<{ user_id: string }>(
    `SELECT DISTINCT sa.user_id
       FROM spotify_accounts sa
       JOIN plays p ON p.spotify_account_id = sa.id`,
  );
  for (const { user_id } of rows) {
    await computeCharts({ kind: 'personal', userId: user_id });
  }
  log.info('Finalize cycle complete', { personalUsers: rows.length });
}

/** Run a labeled cycle, catching errors so the loop survives. */
async function safely(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    log.error(`${label} cycle failed`, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** A self-rescheduling timer that waits for each run to finish before the next. */
function everyAfterCompletion(intervalMs: number, label: string, fn: () => Promise<void>): void {
  const tick = async (): Promise<void> => {
    if (!running) return;
    await safely(label, fn);
    if (running) setTimeout(() => void tick(), intervalMs);
  };
  void tick();
}

async function main(): Promise<void> {
  log.info('Orchestrator starting', {
    pipelineIntervalMs: config.pipelineIntervalMs,
    finalizeCheckIntervalMs: config.finalizeCheckIntervalMs,
  });

  everyAfterCompletion(config.pipelineIntervalMs, 'pipeline', runPipelineCycle);
  everyAfterCompletion(config.finalizeCheckIntervalMs, 'finalize', runFinalizeCycle);
}

// Graceful shutdown so the pool closes cleanly.
async function shutdown(signal: string): Promise<void> {
  log.info('Orchestrator shutting down', { signal });
  running = false;
  await closePool();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

main().catch(async (error: unknown) => {
  log.error('Orchestrator failed to start', {
    error: error instanceof Error ? error.message : String(error),
  });
  await closePool();
  process.exit(1);
});
