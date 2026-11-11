import {
  PILE,
  analyzePosition,
  applyDealRow,
  applyMove,
  applyFlip,
  applyRecycle,
  autoCompleteRun,
  autoFinish,
  allCardsFaceUp,
  createGame,
  deserialize,
  findAutoFoundationMove,
  findEmptyColumnTarget,
  findHint,
  legalMoves,
  legalTargets,
  serialize,
  undo,
} from './engine.js';
import { getSpec, normalizeOptions, VARIANT_LIST } from './variants.js';
import { computeLayout, computePositions, hitTest } from './layout.js';
import { Renderer } from './render.js';
import { InputController } from './input.js';
import { saveGame, loadGame, loadStats, recordDeal, recordResult, clearStats } from './persist.js';
import { HOW_TO_PLAY, RULES } from './rules.js';
import { DIFFICULTY } from './variants.js';
import { lastWeeks, lastMonths, lastYears, longestStreak, busiestDay } from './stats.js';
import { dailySeed, dealCode, decodeDeal } from './deals.js';
const tableEl = document.getElementById('table');
const hudTimer = document.getElementById('timer');
const hudMoves = document.getElementById('moves');
const hudVariant = document.getElementById('variant-name');
const hudBanner = document.getElementById('banner');
const overlay = document.getElementById('overlay');
const overlayBody = document.getElementById('overlay-body');
const panel = document.getElementById('panel');
const statsBody = document.getElementById('stats-body');
const variantTabs = document.getElementById('variant-tabs');
const optionTabs = document.getElementById('option-tabs');
const splash = document.getElementById('splash');
const dealBody = document.getElementById('deal-body');
const shareField = document.getElementById('share-field');
const winCards = document.getElementById('win-cards');
const howtoBody = document.getElementById('howto-body');
const rulesBody = document.getElementById('rules-body');
const toast = document.getElementById('toast');
const confirmDialog = document.getElementById('confirm');
const confirmDetail = document.getElementById('confirm-detail');
const giveUpButton = document.getElementById('btn-giveup');
const splashVersion = document.getElementById('splash-version');
const buildInfo = document.getElementById('build-info');

const renderer = new Renderer(tableEl);

let state = null;
let selection = null;
let hint = null;
let layout = null;
let positions = null;
let elapsedBase = 0;
let sessionStart = Date.now();
let timerId = null;
let stats = null;
let finished = false;
let saveTimer = null;
let hintTimer = null;
let dealAnimation = false;
let toastTimer = null;
let position = { dead: false, certain: false, moves: 0, short: '', reason: '' };

function spec() {
  return getSpec(state.variantId, state.options);
}


function dealUrl(state) {
  const base = location.href.split('#')[0];
  return base + '#d=' + dealCode(state);
}

function statsKey() {
  const settings = state.options || {};
  if (state.variantId === 'klondike') {
    return settings.drawCount === 3 ? 'klondike:draw3' : 'klondike:draw1';
  }
  if (state.variantId === 'spider') {
    return 'spider:' + settings.suits;
  }
  if (state.variantId === 'freecell') {
    return 'freecell:' + settings.suits + ':' + settings.cells;
  }
  return state.variantId;
}

function optionGroups() {
  if (state.variantId === 'klondike') {
    return [
      {
        choices: [
          { value: 1, label: 'Draw 1', options: { drawCount: 1 } },
          { value: 3, label: 'Draw 3', options: { drawCount: 3 } },
        ],
      },
    ];
  }
  if (state.variantId === 'spider') {
    return [
      {
        choices: [
          { value: 1, label: '1 suit', options: { suits: 1 } },
          { value: 2, label: '2 suits', options: { suits: 2 } },
          { value: 4, label: '4 suits', options: { suits: 4 } },
        ],
      },
    ];
  }
  if (state.variantId === 'spiderette' || state.variantId === 'fortyThieves' || state.variantId === 'yukon') {
    return [];
  }
  return [
    {
      choices: [
        { value: 4, label: '4 suits', options: { suits: 4 } },
        { value: 2, label: '2 suits', options: { suits: 2 } },
        { value: 1, label: '1 suit', options: { suits: 1 } },
      ],
    },
    {
      choices: [
        { value: 4, label: '4 cells', options: { cells: 4 } },
        { value: 6, label: '6 cells', options: { cells: 6 } },
      ],
    },
  ];
}

function currentElapsed() {
  if (finished) return elapsedBase;
  return elapsedBase + (Date.now() - sessionStart);
}

function measure() {
  const rect = tableEl.parentElement.getBoundingClientRect();
  return {
    width: Math.max(320, Math.floor(rect.width)),
    height: Math.max(320, Math.floor(rect.height)),
  };
}

function refreshLayout() {
  const size = measure();
  layout = computeLayout(spec(), size.width, size.height);
  tableEl.style.setProperty('--cw', layout.cardW + 'px');
  tableEl.style.setProperty('--ch', layout.cardH + 'px');
}

function render() {
  if (!state) return;
  refreshPosition();
  refreshLayout();
  positions = computePositions(layout, state);
  renderer.render(state, layout, {
    selection,
    hint,
    positions,
    targets: selection ? legalTargets(state, selection) : [],
    dealAnimation,
    spec: spec(),
  });
  dealAnimation = false;
  updateVariantTabs();
  updateOptionTabs();
  updateHud();
}

function updateHud() {
  const seconds = Math.floor(currentElapsed() / 1000);
  const minutes = Math.floor(seconds / 60);
  hudTimer.textContent = minutes + ':' + String(seconds % 60).padStart(2, '0');
  hudMoves.textContent = state.moves + (state.moves === 1 ? ' move' : ' moves');
  hudVariant.textContent = spec().name;

  const message = position.dead
    ? position.short || position.reason
    : !finished && !state.won && position.moves === 0
      ? spec().dealRows && state.piles.stock.length
        ? 'No legal moves - tap the stock to deal'
        : 'No legal moves left'
      : '';
  hudBanner.textContent = message;
  hudBanner.classList.toggle('visible', Boolean(message));
  hudBanner.classList.toggle('dead', position.dead);
  hudBanner.title = position.dead ? position.reason : '';
  giveUpButton.classList.toggle('alert', position.dead);
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveGame(snapshot());
  }, 400);
}

function snapshot() {
  if (!state) return null;
  return {
    variantId: state.variantId,
    options: state.options,
    piles: state.piles,
    history: state.history,
    moves: state.moves,
    redeals: state.redeals,
    startedAt: Date.now(),
    elapsedMs: currentElapsed(),
    won: state.won,
  };
}

function refreshPosition() {
  if (!state || finished || state.won) {
    position = { dead: false, certain: false, moves: 0, short: '', reason: '' };
    return;
  }
  position = analyzePosition(state);
}

function onStateChanged() {
  if (state.won && !finished) {
    const elapsed = currentElapsed();
    finished = true;
    elapsedBase = elapsed;
    state.elapsedMs = elapsed;
    stopTimer();
    recordResult(statsKey(), true, elapsedBase).then((next) => {
      stats = next;
      renderStats();
    });
    showWin();
  }
  render();
  scheduleSave();
}

function syncElapsed() {
  if (!state) return;
  state.elapsedMs = currentElapsed();
}

function tryMove(from, to) {
  if (!state || !from || !to) return false;
  syncElapsed();
  const next = applyMove(state, from, to);
  if (!next) return false;
  state = next;
  selection = null;
  hint = null;
  onStateChanged();
  maybeAutoFinish();
  maybeCompleteRun();
  return true;
}

function maybeCompleteRun() {
  if (finished || state.won) return;
  const completed = autoCompleteRun(state);
  if (completed) {
    state = completed;
    onStateChanged();
  }
}

function maybeAutoFinish() {
  if (finished || state.won) return;
  if (!allCardsFaceUp(state)) return;
  const completed = autoFinish(state);
  if (completed) {
    state = completed;
    onStateChanged();
  }
}

function onStockTap() {
  if (spec().dealRows) {
    syncElapsed();
    const dealt = applyDealRow(state);
    if (dealt) {
      state = dealt;
      selection = null;
      hint = null;
      onStateChanged();
      maybeCompleteRun();
    }
    return;
  }
  if (state.piles.stock.length) {
    tryMove({ pile: PILE.STOCK, index: 0 }, { pile: PILE.WASTE, index: 0 });
    return;
  }
  const next = applyRecycle(state);
  if (next) {
    state = next;
    selection = null;
    hint = null;
    onStateChanged();
  }
}

function onFlip(columnIndex) {
  syncElapsed();
  const next = applyFlip(state, columnIndex);
  if (!next) return;
  state = next;
  selection = null;
  onStateChanged();
}

function autoMove(from) {
  const foundation = findAutoFoundationMove(state, from);
  if (foundation) return tryMove(from, foundation);
  const emptyColumn = findEmptyColumnTarget(state, from);
  if (emptyColumn) return tryMove(from, emptyColumn);
  return false;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('visible');
    toastTimer = null;
  }, 2600);
}

function showHint() {
  const found = findHint(state);
  if (!found) {
    hint = null;
    render();
    showToast('No legal moves available');
    return;
  }
  hint = found;
  render();
  showToast(found.reason);
  if (hintTimer) clearTimeout(hintTimer);
  hintTimer = setTimeout(() => {
    hint = null;
    hintTimer = null;
    render();
  }, 2400);
}

function doUndo() {
  syncElapsed();
  const next = undo(state);
  if (!next) return;
  state = next;
  selection = null;
  hint = null;
  finished = state.won;
  elapsedBase = state.elapsedMs;
  sessionStart = Date.now();
  if (finished) stopTimer();
  render();
  scheduleSave();
}

async function newGame(variantId, options) {
  const id = variantId || state.variantId;
  const seed = options && options.seed != null ? options.seed : null;
  const settings = normalizeOptions(id, options || state.options);
  state = createGame(id, seed == null ? settings : Object.assign({}, settings, { seed }));
  selection = null;
  hint = null;
  finished = false;
  elapsedBase = 0;
  sessionStart = Date.now();

  refreshLayout();
  renderer.setVariant(spec(), layout);
  dealAnimation = true;
  render();

  await recordDeal(statsKey());
  stats = await loadStats();
  renderStats();

  renderDeal();
  renderHowTo();
  renderRules();
  scheduleSave();
  startTimer();
}

function renderDeal() {
  const seed = state.seed >>> 0;
  const isDaily = seed === dailySeed();
  dealBody.innerHTML =
    '<p><strong>' + spec().name + '</strong> deal ' + seed.toString(36) + '</p>' +
    '<p>' + (isDaily
      ? 'This is the daily deal, the same for everyone playing today.'
      : 'Every game has a code, so you can play this exact deal again or send it to someone.') + '</p>';
  shareField.hidden = true;
  shareField.value = '';
}

async function copyDealLink() {
  const url = dealUrl(state);
  shareField.value = url;
  shareField.hidden = false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(url);
      showToast('Link copied');
      return;
    }
  } catch (error) {
    void error;
  }
  shareField.focus();
  shareField.select();
  showToast('Copy the link above');
}

function showWin() {
  winCards.textContent = '';
  const suits = ['\u2660', '\u2665', '\u2666', '\u2663'];
  for (let i = 0; i < 9; i++) {
    const card = document.createElement('div');
    card.className = 'win-card' + (i % 3 === 1 ? ' red' : '');
    card.textContent = suits[i % 4];
    card.style.setProperty('--drift', (i - 4) * 46 + 'px');
    card.style.setProperty('--spin', (i % 2 ? 1 : -1) * (120 + i * 25) + 'deg');
    card.style.animationDelay = i * 130 + 'ms';
    winCards.appendChild(card);
  }

  const seconds = Math.floor(elapsedBase / 1000);
  const minutes = Math.floor(seconds / 60);
  overlayBody.innerHTML =
    '<p class="overlay-time">' + minutes + ':' + String(seconds % 60).padStart(2, '0') + '</p>' +
    '<p class="overlay-detail">' + state.moves + ' moves</p>';
  overlay.classList.add('visible');
}

function hideOverlay() {
  overlay.classList.remove('visible');
}

function formatMs(ms) {
  if (ms == null) return '—';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  return minutes + ':' + String(seconds % 60).padStart(2, '0');
}

const VARIANT_NAMES = {
  klondike: 'Klondike',
  freecell: 'FreeCell',
  spider: 'Spider',
  spiderette: 'Spiderette',
  fortyThieves: 'Forty Thieves',
  yukon: 'Yukon',
};

function statsLabel(key) {
  const parts = key.split(':');
  const base = VARIANT_NAMES[parts[0]] || parts[0];
  if (parts.length === 1) return base;
  if (parts[0] === 'klondike') {
    return base + ' · Draw ' + (parts[1] === 'draw3' ? '3' : '1');
  }
  if (parts[0] === 'spider') {
    return base + ' · ' + parts[1] + (parts[1] === '1' ? ' suit' : ' suits');
  }
  const suits = parts[1] === '1' ? '1 suit' : parts[1] + ' suits';
  return base + ' · ' + suits + ' · ' + parts[2] + ' cells';
}

function chartBlock(title, data) {
  const max = Math.max(1, ...data.map((item) => item.played));
  const bars = data
    .map((item) => {
      const total = Math.max(2, Math.round((item.played / max) * 66));
      const won = Math.min(total, Math.round((item.won / max) * 66));
      const played = total - won;
      return (
        '<div class="chart-col" title="' + item.label + ': ' + item.played + ' played, ' + item.won + ' won">' +
        '<div class="chart-bar" style="height:' + Math.max(1, played) + 'px"></div>' +
        '<div class="chart-bar won" style="height:' + Math.max(0, won) + 'px"></div>' +
        '<span class="chart-label">' + item.label + '</span></div>'
      );
    })
    .join('');
  return '<h4>' + title + '</h4><div class="chart">' + bars + '</div>';
}

function statTile(value, label) {
  return '<div class="stat-tile"><div class="stat-tile-value">' + value + '</div><div class="stat-tile-label">' + label + '</div></div>';
}

function renderStats() {
  if (!stats) return;
  const current = stats[statsKey()] || {};
  const days = current.days || {};
  const winRate = current.played ? Math.round((current.won / current.played) * 100) + '%' : '—';
  const busiest = busiestDay(days);

  const tiles = [
    statTile(current.played || 0, 'Games played'),
    statTile(current.won || 0, 'Games won'),
    statTile(winRate, 'Win rate'),
    statTile(current.streak || 0, 'Current streak'),
    statTile(current.bestStreak || 0, 'Best streak'),
    statTile(formatMs(current.fastestWinMs), 'Fastest win'),
    statTile(longestStreak(days), 'Longest run of days'),
    statTile(busiest ? busiest.count : 0, 'Busiest day'),
  ].join('');

  const others = Object.keys(stats)
    .filter((key) => key !== statsKey())
    .map((key) => {
      const entry = stats[key];
      const rate = entry.played ? Math.round((entry.won / entry.played) * 100) + '%' : '—';
      return (
        '<div class="stat-row"><div class="stat-name">' + statsLabel(key) + '</div>' +
        '<div class="stat-value">' + (entry.won || 0) + ' / ' + (entry.played || 0) + ' won · ' + rate + '</div></div>'
      );
    })
    .join('');

  statsBody.innerHTML =
    '<div class="stat-name">' + spec().name + '</div>' +
    '<div class="stat-grid">' + tiles + '</div>' +
    chartBlock('Games per week', lastWeeks(12, days)) +
    chartBlock('Games per month', lastMonths(12, days)) +
    chartBlock('Games per year', lastYears(5, days)) +
    (others ? '<h4>Other games</h4>' + others : '');
}

function renderHowTo() {
  howtoBody.innerHTML = HOW_TO_PLAY.map((item) => '<h4>' + item.title + '</h4><p>' + item.text + '</p>').join('');
}

function difficultyNotes() {
  const settings = state.options || {};
  const notes = [];
  if (state.variantId === 'klondike') {
    notes.push('Drawing one card at a time is harder and more traditional, drawing three makes the game noticeably easier.');
  }
  if (state.variantId === 'freecell') {
    notes.push(DIFFICULTY.freecell.suits[settings.suits]);
    notes.push(DIFFICULTY.freecell.cells[settings.cells]);
  }
  if (state.variantId === 'spider') {
    notes.push(DIFFICULTY.spider[settings.suits]);
  }
  if (state.variantId === 'spiderette') {
    notes.push('A single deck and no stock, so there is far less to juggle than full Spider.');
  }
  if (state.variantId === 'fortyThieves') {
    notes.push('Everything starts face up, so this is the most open of the Spider family.');
  }
  if (state.variantId === 'yukon') {
    notes.push('Groups move in any order, which makes it far more forgiving than Klondike.');
  }
  return notes;
}

function renderRules() {
  const rules = RULES[state.variantId];
  if (!rules) {
    rulesBody.innerHTML = '';
    return;
  }
  const notes = difficultyNotes();
  rulesBody.innerHTML =
    '<p><strong>' + spec().name + '</strong> — ' + rules.summary + '</p>' +
    '<ul>' + rules.points.map((point) => '<li>' + point + '</li>').join('') + '</ul>' +
    '<h4>Difficulty</h4>' +
    notes.map((note) => '<p>' + note + '</p>').join('');
}

let pendingUpdateMessage = '';

function versionDetails() {
  const meta = document.querySelector('meta[name="app-version"]');
  const dateMeta = document.querySelector('meta[name="app-build-date"]');
  const value = meta ? meta.getAttribute('content') : '';
  const [release, build] = value.split('+');
  const date = dateMeta ? dateMeta.getAttribute('content') : '';
  return { release, build, date };
}

function showBuildInfo() {
  if (!buildInfo) return;
  const details = versionDetails();
  if (!details.release || details.release === 'dev') {
    buildInfo.textContent = 'Development build';
    return;
  }
  const parts = ['Version ' + details.release];
  if (details.build) parts.push('build ' + details.build);
  if (details.date && details.date !== 'unknown') parts.push('built ' + details.date);
  buildInfo.textContent = parts.join(' \u00b7 ');
}

function showVersion() {
  const meta = document.querySelector('meta[name="app-version"]');
  const value = meta ? meta.getAttribute('content') : '';

  if (!value || value === 'dev') {
    if (splashVersion) splashVersion.textContent = 'development build';
    return;
  }

  const [release, build] = value.split('+');
  if (splashVersion) {
    splashVersion.textContent = build ? 'Version ' + release + ' (' + build + ')' : 'Version ' + release;
  }

  try {
    const previous = localStorage.getItem('solitaire.version');
    if (previous && previous !== value) {
      const previousRelease = previous.split('+')[0];
      pendingUpdateMessage = previousRelease === release
        ? 'Repaired and updated to version ' + release
        : 'Updated to version ' + release;
    }
    localStorage.setItem('solitaire.version', value);
  } catch (error) {
    void error;
  }
}

function dismissSplash() {
  if (splash.classList.contains('hidden')) return;
  splash.classList.add('played');
  splash.classList.add('hidden');
  if (pendingUpdateMessage) {
    const message = pendingUpdateMessage;
    pendingUpdateMessage = '';
    showToast(message);
  }
}

function startTimer() {
  stopTimer();
  sessionStart = Date.now();
  timerId = setInterval(() => {
    updateHud();
  }, 500);
}

function stopTimer() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}

const input = new InputController(tableEl, {
  state: () => state,
  layout: () => layout,
  positions: () => positions,
  selection: () => selection,
  select: (value) => {
    selection = value;
  },
  renderer,
  render,
  tryMove,
  autoMove,
  onStockTap,
  onFlip,
  slotAt: (x, y) => hitTest(layout, positions, x, y),
});

function resetViewportZoom() {
  const meta = document.querySelector('meta[name="viewport"]');
  if (!meta) return;
  meta.setAttribute('content', meta.getAttribute('content'));
}

function bindButton(id, handler) {
  const element = document.getElementById(id);
  if (!element) return;
  element.addEventListener('click', (event) => {
    resetViewportZoom();
    handler(event);
  });
}

bindButton('btn-undo', doUndo);
bindButton('btn-hint', showHint);
bindButton('btn-new', () => newGame(state.variantId));
bindButton('btn-new-overlay', () => {
  hideOverlay();
  newGame(state.variantId);
});
bindButton('btn-close-overlay', hideOverlay);
bindButton('btn-stats', () => {
  const opening = !panel.classList.contains('visible');
  panel.classList.toggle('visible');
  if (opening) {
    renderDeal();
    renderHowTo();
    renderRules();
    renderStats();
    showBuildInfo();
  }
});
bindButton('btn-stats-close', () => panel.classList.remove('visible'));
bindButton('btn-again', () => {
  newGame(state.variantId, Object.assign({}, state.options, { seed: state.seed }));
});
bindButton('btn-daily', () => {
  newGame(state.variantId, Object.assign({}, state.options, { seed: dailySeed() }));
});
bindButton('btn-share', copyDealLink);

bindButton('btn-giveup', () => {
  if (!state || finished) return;
  confirmDetail.textContent = position.dead
    ? position.reason + ' The game will be counted as played, but not as a win.'
    : 'It counts as a game played, but not as a win.';
  confirmDialog.classList.add('visible');
});

bindButton('btn-cancel-giveup', () => {
  confirmDialog.classList.remove('visible');
});

bindButton('btn-confirm-giveup', async () => {
  confirmDialog.classList.remove('visible');
  if (!state || finished) return;
  const key = statsKey();
  const elapsed = currentElapsed();
  finished = true;
  stopTimer();
  position = { dead: false, certain: false, moves: 0, short: '', reason: '' };
  await recordResult(key, false, elapsed);
  stats = await loadStats();
  renderStats();
  newGame(state.variantId);
  showToast('Game given up. A new deal has been dealt.');
});
splash.addEventListener('click', dismissSplash);
bindButton('btn-reset-stats', async () => {
  stats = await clearStats();
  renderStats();
});

VARIANT_LIST.forEach((entry) => {
  const button = document.createElement('button');
  button.className = 'tab';
  button.textContent = entry.name;
  button.dataset.variant = entry.id;
  button.addEventListener('click', () => {
    if (state.variantId === entry.id) return;
    hideOverlay();
    location.hash = entry.id;
    newGame(entry.id);
  });
  variantTabs.appendChild(button);
});

function updateVariantTabs() {
  Array.from(variantTabs.children).forEach((button) => {
    button.classList.toggle('active', button.dataset.variant === state.variantId);
  });
}

function updateOptionTabs() {
  optionTabs.textContent = '';
  const groups = optionGroups();
  optionTabs.hidden = groups.length === 0;
  if (!groups.length) return;
  const settings = state.options || {};

  groups.forEach((group) => {
    const tabs = document.createElement('div');
    tabs.className = 'tabs';
    group.choices.forEach((choice) => {
      const button = document.createElement('button');
      button.className = 'tab';
      button.textContent = choice.label;
      const current = choice.options.suits !== undefined
        ? settings.suits
        : choice.options.cells !== undefined
          ? settings.cells
          : settings.drawCount;
      button.classList.toggle('active', choice.value === current);
      button.addEventListener('click', () => {
        if (choice.value === current) return;
        hideOverlay();
        newGame(state.variantId, Object.assign({}, settings, choice.options));
      });
      tabs.appendChild(button);
    });
    optionTabs.appendChild(tabs);
  });
}

const originalRender = render;
window.addEventListener('resize', () => {
  originalRender();
});

window.addEventListener('orientationchange', () => {
  setTimeout(() => originalRender(), 120);
});
document.addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if (key === 'u') doUndo();
  else if (key === 'h') showHint();
  else if (key === 'n') newGame(state.variantId);
  else if (key === 'escape') {
    hideOverlay();
    panel.classList.remove('visible');
    dismissSplash();
  }
});

let lastTouchEnd = 0;
document.addEventListener(
  'touchend',
  (event) => {
    const now = Date.now();
    if (now - lastTouchEnd < 320) {
      if (event.cancelable) event.preventDefault();
    }
    lastTouchEnd = now;
  },
  { passive: false }
);

document.addEventListener('dblclick', (event) => {
  if (event.cancelable) event.preventDefault();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    elapsedBase = currentElapsed();
    saveGame(snapshot());
  } else {
    sessionStart = Date.now();
  }
});

window.addEventListener('pagehide', () => {
  saveGame(snapshot());
});

async function boot() {
  showVersion();
  showBuildInfo();
  const requested = location.hash.replace('#', '').toLowerCase();
  let startVariant = 'klondike';
  let startOptions = null;
  let startSeed = null;

  if (requested.startsWith('d=')) {
    const decoded = decodeDeal(requested.slice(2));
    if (decoded && VARIANT_LIST.some((entry) => entry.id === decoded.variantId)) {
      startVariant = decoded.variantId;
      startOptions = decoded.options;
      startSeed = decoded.seed;
    }
  } else if (VARIANT_LIST.some((entry) => entry.id === requested)) {
    startVariant = requested;
  }

  const bootOptions = normalizeOptions(startVariant, startOptions);
  state = createGame(startVariant, startSeed == null ? bootOptions : Object.assign({}, bootOptions, { seed: startSeed }));
  elapsedBase = 0;
  sessionStart = Date.now();

  refreshLayout();
  renderer.setVariant(spec(), layout);
  render();
  updateVariantTabs();
  startTimer();

  stats = await loadStats();
  renderStats();

  const saved = await loadGame();
  const restored = saved ? deserialize(saved) : null;

  if (restored && !restored.won) {
    state = restored;
    elapsedBase = restored.elapsedMs || 0;
    sessionStart = Date.now();
    render();
  } else {
    recordDeal(statsKey()).then((next) => {
      stats = next;
      renderStats();
    });
  }

  if (!window.__SOLITAIRE_INLINE__ && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot();

window.__solitaire = {
  state: () => state,
  layout: () => layout,
  selection: () => selection,
  legal: () => legalMoves(state),
  tryMove,
  render,
  select: (value) => {
    selection = value;
    render();
  },
  newGame,
  load: (raw) => {
    const restored = deserialize(raw);
    if (!restored) return false;
    state = restored;
    elapsedBase = restored.elapsedMs || 0;
    sessionStart = Date.now();
    finished = false;
    selection = null;
    render();
    return true;
  },
};

export { serialize };
