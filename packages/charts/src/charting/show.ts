import { getChart, type Scope } from './repository.js';
import { query, closePool, log } from '@tallymark/db';

/**
 * Display a computed chart.
 *
 * Usage:
 *   npm run show                       latest global week
 *   npm run show global 2026-06-22     a specific global week
 *   npm run show personal <userId>     latest week for a user
 *
 * Shows rank, title, artist, plays, peak position, and weeks-on-chart.
 */

async function latestWeekFor(scopeLabel: string): Promise<string | null> {
  const { rows } = await query<{ week_start: string }>(
    `SELECT week_start FROM chart_weeks WHERE scope = $1 ORDER BY week_start DESC LIMIT 1`,
    [scopeLabel],
  );
  // pg returns DATE as a Date or string depending on settings; normalize to YYYY-MM-DD.
  const raw = rows[0]?.week_start;
  if (raw === undefined) return null;
  return typeof raw === 'string' ? raw.slice(0, 10) : new Date(raw).toISOString().slice(0, 10);
}

function render(title: string, rows: Awaited<ReturnType<typeof getChart>>): void {
  process.stdout.write(`\n${title}\n${'='.repeat(title.length)}\n\n`);
  if (rows.length === 0) {
    process.stdout.write('  (no entries)\n\n');
    return;
  }
  for (const r of rows) {
    const pos = String(r.rank).padStart(3);
    const plays = `${r.play_count} play${r.play_count === 1 ? '' : 's'}`;
    process.stdout.write(
      `  ${pos}. ${r.title} — ${r.artist_name}  (${plays}; peak #${r.peak_position}, ${r.weeks_on_chart} wk)\n`,
    );
  }
  process.stdout.write('\n');
}

async function main(): Promise<void> {
  const [kind, arg] = process.argv.slice(2);

  let scope: Scope;
  let label: string;
  if (!kind || kind === 'global') {
    scope = { kind: 'global' };
    label = 'global';
  } else if (kind === 'personal') {
    if (!arg) throw new Error('Usage: show personal <userId>');
    scope = { kind: 'personal', userId: arg };
    label = `personal:${arg}`;
  } else {
    throw new Error("First arg must be 'global' or 'personal'");
  }

  // If a global week was passed as the second arg, use it; else latest.
  const explicitWeek = kind === 'global' && arg ? arg : null;
  const week = explicitWeek ?? (await latestWeekFor(label));
  if (week === null) {
    process.stdout.write('No computed charts for that scope yet. Run `npm run chart:dev` first.\n');
    return;
  }

  const rows = await getChart(scope, week);
  render(`${label} chart — week of ${week}`, rows);
}

main()
  .then(() => closePool())
  .then(() => process.exit(0))
  .catch(async (error: unknown) => {
    log.error('Show command failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    await closePool();
    process.exit(1);
  });
