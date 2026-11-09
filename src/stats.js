const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function dayEntry(value) {
  if (typeof value === 'number') return { played: value, won: 0 };
  if (!value) return { played: 0, won: 0 };
  return { played: value.played || 0, won: value.won || 0 };
}

export function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

export function mondayOf(date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() - day + 1);
  return copy;
}

export function lastWeeks(count, days) {
  const buckets = new Map();
  const start = mondayOf(new Date());
  start.setDate(start.getDate() - 7 * (count - 1));

  for (let i = 0; i < count; i++) {
    const monday = new Date(start);
    monday.setDate(start.getDate() + 7 * i);
    buckets.set(todayKey(monday), { played: 0, won: 0, label: monday.getDate() + ' ' + MONTHS[monday.getMonth()] });
  }

  Object.keys(days || {}).forEach((key) => {
    const parts = key.split('-');
    const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const bucket = buckets.get(todayKey(mondayOf(date)));
    if (!bucket) return;
    const entry = dayEntry(days[key]);
    bucket.played += entry.played;
    bucket.won += entry.won;
  });

  return Array.from(buckets.values());
}

export function lastMonths(count, days) {
  const buckets = new Map();
  const now = new Date();

  for (let i = count - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
    buckets.set(key, { played: 0, won: 0, label: MONTHS[date.getMonth()] + " '" + String(date.getFullYear()).slice(2) });
  }

  Object.keys(days || {}).forEach((key) => {
    const bucket = buckets.get(key.slice(0, 7));
    if (!bucket) return;
    const entry = dayEntry(days[key]);
    bucket.played += entry.played;
    bucket.won += entry.won;
  });

  return Array.from(buckets.values());
}

export function lastYears(count, days) {
  const buckets = new Map();
  const now = new Date().getFullYear();

  for (let i = count - 1; i >= 0; i--) {
    const year = now - i;
    buckets.set(String(year), { played: 0, won: 0, label: String(year) });
  }

  Object.keys(days || {}).forEach((key) => {
    const bucket = buckets.get(key.slice(0, 4));
    if (!bucket) return;
    const entry = dayEntry(days[key]);
    bucket.played += entry.played;
    bucket.won += entry.won;
  });

  return Array.from(buckets.values());
}

export function longestStreak(days) {
  const keys = Object.keys(days || {}).sort();
  let best = 0;
  let run = 0;
  let previous = null;

  keys.forEach((key) => {
    const entry = dayEntry(days[key]);
    if (!entry.played) {
      run = 0;
      previous = key;
      return;
    }
    if (previous) {
      const gap = (new Date(key) - new Date(previous)) / 86400000;
      run = gap === 1 ? run + 1 : 1;
    } else {
      run = 1;
    }
    best = Math.max(best, run);
    previous = key;
  });

  return best;
}

export function busiestDay(days) {
  let best = null;
  let bestCount = 0;
  Object.keys(days || {}).forEach((key) => {
    const entry = dayEntry(days[key]);
    if (entry.played > bestCount) {
      bestCount = entry.played;
      best = key;
    }
  });
  return best ? { key: best, count: bestCount } : null;
}
