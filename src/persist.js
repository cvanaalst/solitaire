const DB_NAME = 'solitaire';
const DB_VERSION = 1;
const STORE_SAVE = 'save';
const STORE_STATS = 'stats';
const LS_SAVE = 'solitaire.save';
const LS_STATS = 'solitaire.stats';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_SAVE)) db.createObjectStore(STORE_SAVE);
      if (!db.objectStoreNames.contains(STORE_STATS)) db.createObjectStore(STORE_STATS);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function withStore(storeName, mode, action) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    let result;
    try {
      result = action(store);
    } catch (error) {
      reject(error);
      return;
    }
    transaction.oncomplete = () => resolve(result && result.result !== undefined ? result.result : result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('storage timeout')), ms)),
  ]);
}

function localGet(key) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    void error;
    return null;
  }
}

function localSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    void error;
    return false;
  }
}

function localRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    void error;
  }
}

export async function saveGame(state) {
  const payload = JSON.stringify(state);
  try {
    await withTimeout(withStore(STORE_SAVE, 'readwrite', (store) => store.put(payload, 'current')), 2000);
    return true;
  } catch (error) {
    void error;
    return localSet(LS_SAVE, payload);
  }
}

export async function loadGame() {
  try {
    const value = await withTimeout(
      withStore(STORE_SAVE, 'readonly', (store) => store.get('current')),
      2000
    );
    if (value) return value;
  } catch (error) {
    void error;
  }
  return localGet(LS_SAVE);
}

export async function clearGame() {
  try {
    await withStore(STORE_SAVE, 'readwrite', (store) => store.delete('current'));
  } catch (error) {
    void error;
  }
  localRemove(LS_SAVE);
}

function emptyStats() {
  return {};
}

function newVariantStats() {
  return {
    played: 0,
    won: 0,
    streak: 0,
    bestStreak: 0,
    fastestWinMs: null,
    lastPlayedAt: null,
    days: {},
  };
}

function migrateKey(key) {
  if (key === 'klondike') return 'klondike:draw1';
  if (key === 'freecell') return 'freecell:4:4';
  if (key === 'spider') return 'spider:1';
  if (key === 'freecell:1') return 'freecell:1:4';
  if (key === 'freecell:2') return 'freecell:2:4';
  if (key === 'freecell:4') return 'freecell:4:4';
  return key;
}

export async function loadStats() {
  let stats = null;
  try {
    stats = await withTimeout(withStore(STORE_STATS, 'readonly', (store) => store.get('all')), 2000);
  } catch (error) {
    void error;
  }
  if (!stats) stats = localGet(LS_STATS);
  if (!stats) return emptyStats();

  const merged = emptyStats();
  Object.keys(stats).forEach((key) => {
    const target = migrateKey(key);
    if (merged[target]) {
      const existing = merged[target];
      const incoming = stats[key];
      existing.played += incoming.played || 0;
      existing.won += incoming.won || 0;
      existing.bestStreak = Math.max(existing.bestStreak, incoming.bestStreak || 0);
      if (existing.fastestWinMs == null || (incoming.fastestWinMs != null && incoming.fastestWinMs < existing.fastestWinMs)) {
        existing.fastestWinMs = incoming.fastestWinMs == null ? existing.fastestWinMs : incoming.fastestWinMs;
      }
      Object.keys(incoming.days || {}).forEach((day) => {
        const current = existing.days[day] || { played: 0, won: 0 };
        const added = incoming.days[day];
        const played = typeof added === 'number' ? added : added.played || 0;
        const won = typeof added === 'number' ? 0 : added.won || 0;
        existing.days[day] = { played: current.played + played, won: current.won + won };
      });
      return;
    }
    merged[target] = Object.assign(newVariantStats(), stats[key]);
  });
  return merged;
}

async function persistStats(stats) {
  try {
    await withTimeout(withStore(STORE_STATS, 'readwrite', (store) => store.put(stats, 'all')), 2000);
    return;
  } catch (error) {
    void error;
  }
  localSet(LS_STATS, stats);
}

export async function recordDeal(key) {
  const stats = await loadStats();
  const entry = stats[key] || (stats[key] = newVariantStats());
  entry.played += 1;
  entry.lastPlayedAt = Date.now();
  const day = todayKey();
  const bucket = entry.days[day] || { played: 0, won: 0 };
  bucket.played += 1;
  entry.days[day] = bucket;
  await persistStats(stats);
  return stats;
}

export async function recordResult(key, won, elapsedMs) {
  const stats = await loadStats();
  const entry = stats[key] || (stats[key] = newVariantStats());
  if (won) {
    entry.won += 1;
    entry.streak += 1;
    entry.bestStreak = Math.max(entry.bestStreak, entry.streak);
    if (entry.fastestWinMs == null || elapsedMs < entry.fastestWinMs) entry.fastestWinMs = elapsedMs;
    const day = todayKey();
    const bucket = entry.days[day] || { played: 0, won: 0 };
    bucket.won += 1;
    entry.days[day] = bucket;
  } else {
    entry.streak = 0;
  }
  await persistStats(stats);
  return stats;
}

export async function clearStats() {
  const stats = emptyStats();
  await persistStats(stats);
  return stats;
}

export function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}
