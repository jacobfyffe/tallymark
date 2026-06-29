/**
 * Chart-week math.
 *
 * A chart week runs Monday 00:00 through Sunday 23:59:59.999 in a given
 * timezone. Personal charts use the user's local zone; global charts use UTC.
 *
 * The subtle part is computing Monday-aligned boundaries *in a specific
 * timezone* (e.g. Eastern, which shifts with DST). We do it without a date
 * library by using Intl.DateTimeFormat to read the wall-clock parts of an
 * instant in the target zone, then reasoning from those parts. Everything is
 * pure and returns UTC Date instances marking the boundary instants.
 */

export interface ChartWeek {
  /** Inclusive start instant (Monday 00:00 in the zone), as UTC. */
  start: Date;
  /** Exclusive end instant (next Monday 00:00 in the zone), as UTC. */
  end: Date;
  /** ISO date (YYYY-MM-DD) of the week's Monday, in the zone. Stable week id. */
  weekStartDate: string;
}

/** The wall-clock parts of an instant, as seen in a given IANA timezone. */
interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 1 = Monday ... 7 = Sunday
}

const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

/** Read an instant's wall-clock parts in the given timezone. */
function partsInZone(instant: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hour12: false,
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(instant)) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  // 'hour' can come back as '24' at midnight in some environments; normalize.
  let hour = Number(map.hour);
  if (hour === 24) hour = 0;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour,
    minute: Number(map.minute),
    second: Number(map.second),
    weekday: WEEKDAY_INDEX[map.weekday ?? 'Mon'] ?? 1,
  };
}

/**
 * Find the UTC instant corresponding to a given wall-clock time in a timezone.
 *
 * Because of DST, the same wall-clock time maps to different UTC offsets across
 * the year. We solve it iteratively: guess the offset, correct, and re-check.
 * Two passes converge for all real-world zones/dates.
 */
function zonedWallTimeToUtc(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  s: number,
  timeZone: string,
): Date {
  // Initial guess: treat the wall time as if it were UTC.
  let utcGuess = Date.UTC(y, mo - 1, d, h, mi, s);
  for (let i = 0; i < 3; i++) {
    const parts = partsInZone(new Date(utcGuess), timeZone);
    const seenAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const wantedAsUtc = Date.UTC(y, mo - 1, d, h, mi, s);
    const diff = wantedAsUtc - seenAsUtc;
    if (diff === 0) break;
    utcGuess += diff;
  }
  return new Date(utcGuess);
}

/**
 * The chart week (Mon..Sun in `timeZone`) that contains `instant`.
 */
export function weekOf(instant: Date, timeZone: string): ChartWeek {
  const parts = partsInZone(instant, timeZone);
  // Days to step back to reach Monday (weekday 1).
  const daysSinceMonday = parts.weekday - 1;

  // Monday's wall-clock calendar date in the zone.
  const mondayUtcMidnightGuess = Date.UTC(parts.year, parts.month - 1, parts.day) -
    daysSinceMonday * 86_400_000;
  const md = new Date(mondayUtcMidnightGuess);

  const start = zonedWallTimeToUtc(
    md.getUTCFullYear(),
    md.getUTCMonth() + 1,
    md.getUTCDate(),
    0,
    0,
    0,
    timeZone,
  );

  // End = next Monday 00:00. Compute from the next Monday's calendar date so DST
  // transitions within the week are handled correctly.
  const nextMondayGuess = new Date(mondayUtcMidnightGuess + 7 * 86_400_000);
  const end = zonedWallTimeToUtc(
    nextMondayGuess.getUTCFullYear(),
    nextMondayGuess.getUTCMonth() + 1,
    nextMondayGuess.getUTCDate(),
    0,
    0,
    0,
    timeZone,
  );

  const weekStartDate = `${md.getUTCFullYear()}-${pad(md.getUTCMonth() + 1)}-${pad(md.getUTCDate())}`;

  return { start, end, weekStartDate };
}

/**
 * All completed chart weeks between the earliest play and now (exclusive of the
 * current, still-in-progress week), oldest first. A week is "completed" once
 * its end instant is at or before `now`.
 */
export function completedWeeksBetween(earliest: Date, now: Date, timeZone: string): ChartWeek[] {
  const weeks: ChartWeek[] = [];
  let cursor = weekOf(earliest, timeZone);
  for (let i = 0; i < 5_000; i++) {
    // safety bound (~96 years)
    if (cursor.end.getTime() > now.getTime()) break; // not yet completed
    weeks.push(cursor);
    cursor = weekOf(new Date(cursor.end.getTime() + 1), timeZone);
  }
  return weeks;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
