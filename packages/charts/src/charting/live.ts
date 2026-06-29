import { rankWorksWithTitles, type Scope } from './repository.js';
import { weekOf } from './weeks.js';
import { config } from '../config/index.js';
import { closePool, log } from '@tallymark/db';

/**
 * Live Chart — the current, in-progress week, computed on demand.
 *
 * Unlike the official charts (which only cover completed weeks and are saved),
 * this is provisional: it ranks plays in the current week's window so far and
 * displays them without persisting. There's no peak position or weeks-on-chart,
 * because the week isn't finished. It's the "what's hot right now" view.
 *
 * Usage:
 *   npm run live                 global live chart
 *   npm run live personal 1      live chart for user #1
 */

function render(title: string, rows: Awaited<ReturnType<typeof rankWorksWithTitles>>): void {
  process.stdout.write(`\n${title}\n${'='.repeat(title.length)}\n\n`);
  if (rows.length === 0) {
    process.stdout.write('  (no plays yet this week)\n\n');
    return;
  }
  for (const r of rows) {
    const pos = String(r.rank).padStart(3);
    const plays = `${r.play_count} play${r.play_count === 1 ? '' : 's'}`;
    process.stdout.write(`  ${pos}. ${r.title} — ${r.artist_name}  (${plays})\n`);
  }
  process.stdout.write('\n');
}

async function main(): Promise<void> {
  const [kind, arg] = process.argv.slice(2);

  let scope: Scope;
  let label: string;
  let timeZone: string;
  if (!kind || kind === 'global') {
    scope = { kind: 'global' };
    label = 'Global';
    timeZone = 'UTC';
  } else if (kind === 'personal') {
    if (!arg) throw new Error('Usage: live personal <userId>');
    scope = { kind: 'personal', userId: arg };
    label = `Personal (user ${arg})`;
    timeZone = config.charts.personalTimezone;
  } else {
    throw new Error("First arg must be 'global' or 'personal'");
  }

  const week = weekOf(new Date(), timeZone);
  const rows = await rankWorksWithTitles(scope, week.start, new Date(), config.charts.size);
  render(`${label} Live Chart — week of ${week.weekStartDate} (in progress)`, rows);
}

main()
  .then(() => closePool())
  .then(() => process.exit(0))
  .catch(async (error: unknown) => {
    log.error('Live chart failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    await closePool();
    process.exit(1);
  });
