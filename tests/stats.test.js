import test from 'node:test';
import assert from 'node:assert/strict';

import { busiestDay, dayEntry, lastMonths, lastWeeks, lastYears, longestStreak } from '../src/stats.js';

const DAYS = {
  '2026-11-02': { played: 3, won: 1 },
  '2026-11-03': { played: 1, won: 1 },
  '2026-11-04': { played: 5, won: 4 },
  '2026-10-20': { played: 2, won: 0 },
};

test('a day entry reads both the new object format and the old count', () => {
  assert.deepEqual(dayEntry({ played: 2, won: 1 }), { played: 2, won: 1 });
  assert.deepEqual(dayEntry(4), { played: 4, won: 0 });
  assert.deepEqual(dayEntry(undefined), { played: 0, won: 0 });
});

test('weeks are bucketed into monday to sunday runs', () => {
  const weeks = lastWeeks(4, DAYS);
  assert.equal(weeks.length, 4);

  const totals = weeks.map((week) => week.played);
  assert.equal(totals.reduce((sum, value) => sum + value, 0), 11);

  const busiest = weeks.reduce((best, week) => (week.played > best.played ? week : best));
  assert.equal(busiest.played, 9);
  assert.equal(busiest.won, 6);
});

test('months are bucketed across the last twelve months', () => {
  const months = lastMonths(12, DAYS);
  assert.equal(months.length, 12);
  assert.equal(months[months.length - 1].label, "Nov '26");
  assert.equal(months[months.length - 1].played, 9);
  assert.equal(months[months.length - 2].played, 2);
});

test('years are bucketed across the last five years', () => {
  const years = lastYears(5, DAYS);
  assert.equal(years.length, 5);
  assert.equal(years[years.length - 1].label, String(new Date().getFullYear()));
  assert.equal(years[years.length - 1].played, 11);
  assert.equal(years[0].played, 0);
});

test('the longest run of days counts consecutive play days', () => {
  assert.equal(longestStreak(DAYS), 3);
  assert.equal(longestStreak({}), 0);
  assert.equal(longestStreak({ '2026-01-01': { played: 1 }, '2026-01-03': { played: 1 } }), 1);
});

test('the busiest day is the one with the most games', () => {
  const busiest = busiestDay(DAYS);
  assert.equal(busiest.key, '2026-11-04');
  assert.equal(busiest.count, 5);
  assert.equal(busiestDay({}), null);
});
