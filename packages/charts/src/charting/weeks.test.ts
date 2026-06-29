import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekOf, completedWeeksBetween } from './weeks.js';

test('weekOf: UTC, a Wednesday maps to its Mon..Mon week', () => {
  // 2026-06-24 is a Wednesday.
  const w = weekOf(new Date('2026-06-24T12:00:00Z'), 'UTC');
  assert.equal(w.weekStartDate, '2026-06-22'); // Monday
  assert.equal(w.start.toISOString(), '2026-06-22T00:00:00.000Z');
  assert.equal(w.end.toISOString(), '2026-06-29T00:00:00.000Z'); // next Monday
});

test('weekOf: UTC, Monday 00:00 belongs to its own week (inclusive start)', () => {
  const w = weekOf(new Date('2026-06-22T00:00:00Z'), 'UTC');
  assert.equal(w.weekStartDate, '2026-06-22');
});

test('weekOf: UTC, Sunday 23:59 is still the same week', () => {
  const w = weekOf(new Date('2026-06-28T23:59:59Z'), 'UTC');
  assert.equal(w.weekStartDate, '2026-06-22');
});

test('weekOf: Eastern, a play late Sunday night maps correctly', () => {
  // 2026-06-28 23:30 Eastern = 2026-06-29 03:30 UTC. In Eastern it is still
  // Sunday, so it belongs to the week starting Mon 2026-06-22.
  const w = weekOf(new Date('2026-06-29T03:30:00Z'), 'America/New_York');
  assert.equal(w.weekStartDate, '2026-06-22');
});

test('weekOf: Eastern, just after midnight Monday is the new week', () => {
  // 2026-06-29 00:30 Eastern = 2026-06-29 04:30 UTC -> new week (Mon 06-29).
  const w = weekOf(new Date('2026-06-29T04:30:00Z'), 'America/New_York');
  assert.equal(w.weekStartDate, '2026-06-29');
});

test('weekOf: Eastern week boundaries are real Eastern midnights (EDT offset)', () => {
  // In summer, Eastern is UTC-4. Monday 00:00 EDT = 04:00 UTC.
  const w = weekOf(new Date('2026-06-24T12:00:00Z'), 'America/New_York');
  assert.equal(w.start.toISOString(), '2026-06-22T04:00:00.000Z');
  assert.equal(w.end.toISOString(), '2026-06-29T04:00:00.000Z');
});

test('weekOf: Eastern across a DST boundary keeps Monday-aligned', () => {
  // DST began 2026-03-08. A week spanning it should still start/end on the
  // correct Eastern Mondays, even though the UTC offset changes mid-week.
  const w = weekOf(new Date('2026-03-10T12:00:00Z'), 'America/New_York');
  assert.equal(w.weekStartDate, '2026-03-09'); // Monday after the spring-forward
});

test('completedWeeksBetween: excludes the in-progress current week', () => {
  const earliest = new Date('2026-06-08T00:00:00Z'); // Mon
  // "now" is mid-week of 2026-06-22 week, so that week is NOT complete.
  const now = new Date('2026-06-24T12:00:00Z');
  const weeks = completedWeeksBetween(earliest, now, 'UTC');
  const starts = weeks.map((w) => w.weekStartDate);
  assert.deepEqual(starts, ['2026-06-08', '2026-06-15']); // 06-22 excluded (in progress)
});

test('completedWeeksBetween: includes a week that just ended', () => {
  const earliest = new Date('2026-06-15T00:00:00Z');
  // now == exactly next Monday 00:00 UTC -> the 06-15 week has just completed.
  const now = new Date('2026-06-22T00:00:00Z');
  const weeks = completedWeeksBetween(earliest, now, 'UTC');
  assert.deepEqual(weeks.map((w) => w.weekStartDate), ['2026-06-15']);
});
