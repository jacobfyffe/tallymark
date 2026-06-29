import {
  rankWorks,
  saveChartWeek,
  getEarliestPlay,
  scopeLabel,
  type Scope,
} from './repository.js';
import { completedWeeksBetween } from './weeks.js';
import { config } from '../config/index.js';
import { log } from '@tallymark/db';

/**
 * Compute and persist charts for all completed weeks of a scope.
 *
 * Global charts use UTC week boundaries; personal charts use the configured
 * local timezone (per the project's locked decision). Each completed week is
 * ranked and saved; re-running recomputes idempotently.
 */
export async function computeCharts(scope: Scope): Promise<number> {
  const earliest = await getEarliestPlay();
  if (earliest === null) {
    log.info('No plays to chart', { scope: scopeLabel(scope) });
    return 0;
  }

  const timeZone = scope.kind === 'global' ? 'UTC' : config.charts.personalTimezone;
  const weeks = completedWeeksBetween(earliest, new Date(), timeZone);

  let computed = 0;
  for (const week of weeks) {
    const ranked = await rankWorks(scope, week.start, week.end, config.charts.size);
    if (ranked.length === 0) continue; // no plays that week for this scope
    await saveChartWeek(scope, week.weekStartDate, ranked);
    computed++;
  }

  log.info('Charts computed', {
    scope: scopeLabel(scope),
    timeZone,
    weeksComputed: computed,
    weeksConsidered: weeks.length,
  });
  return computed;
}
