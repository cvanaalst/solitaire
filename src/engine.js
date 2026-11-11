import { makeDeck, makeSeededRandomInt, shuffle, isRed } from './cards.js';
import { getSpec, normalizeOptions } from './variants.js';

export const PILE = {
  STOCK: 'stock',
  WASTE: 'waste',
  TABLEAU: 'tableau',
  FOUNDATION: 'foundation',
  FREECELL: 'freecell',
};

export const HISTORY_LIMIT = 60;

export function specFor(state) {
  return getSpec(state.variantId, state.options);
}

export function topOf(pile) {
  return pile && pile.length ? pile[pile.length - 1] : null;
}

export function clonePiles(piles) {
  return {
    stock: piles.stock.map((c) => ({ ...c })),
    waste: piles.waste.map((c) => ({ ...c })),
    freeCells: piles.freeCells.map((col) => col.map((c) => ({ ...c }))),
    foundations: piles.foundations.map((col) => col.map((c) => ({ ...c }))),
    tableau: piles.tableau.map((col) => col.map((c) => ({ ...c }))),
  };
}

export function createGame(variantId, options = {}) {
  const settings = normalizeOptions(variantId, options);
  const spec = getSpec(variantId, settings);
  const seed = options.seed != null ? options.seed >>> 0 : randomSeed();
  const randomInt = options.randomInt || makeSeededRandomInt(seed);
  const deck = shuffle(makeDeck(spec.suits, spec.copies, { maxRank: spec.maxRank }), randomInt);
  const piles = {
    stock: [],
    waste: [],
    freeCells: Array.from({ length: spec.freeCells }, () => []),
    foundations: Array.from({ length: spec.foundations }, () => []),
    tableau: [],
  };

  let cursor = 0;
  spec.tableauRows.forEach((count, column) => {
    const cards = deck.slice(cursor, cursor + count);
    cursor += count;
    const faceUp = Math.min(spec.faceUpTop, cards.length);
    cards.forEach((card, index) => {
      card.faceUp = index >= cards.length - faceUp;
    });
    piles.tableau.push(cards);
  });

  if (spec.stock) piles.stock = deck.slice(cursor);

  return {
    variantId,
    options: settings,
    seed,
    piles,
    history: [],
    moves: 0,
    redeals: 0,
    startedAt: Date.now(),
    elapsedMs: 0,
    won: false,
  };
}

export function oppositeColor(a, b) {
  return isRed(a.suit) !== isRed(b.suit);
}

export function canStackOnTableau(card, target, rule) {
  const settings = rule || { alternateColors: true, emptyColumn: 'none' };
  if (!card) return false;
  if (!target) {
    if (settings.emptyColumn === 'any') return true;
    if (settings.emptyColumn === 'king') return card.rank === 13;
    return false;
  }
  if (card.rank + 1 !== target.rank) return false;
  if (settings.sameSuit && card.suit !== target.suit) return false;
  if (settings.alternateColors && !oppositeColor(card, target)) return false;
  return true;
}

export function isCompleteRun(run, length = 13) {
  if (!run || run.length !== length) return false;
  const suit = run[0].suit;
  for (let i = 0; i < length; i++) {
    if (run[i].suit !== suit) return false;
    if (run[i].rank !== length - i) return false;
  }
  return true;
}

export function randomSeed() {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0];
}

export function canStackOnFoundation(card, foundationPile) {
  const target = topOf(foundationPile);
  if (!target) return card.rank === 1;
  return target.suit === card.suit && card.rank === target.rank + 1;
}

function movableRun(state, from) {
  const piles = state.piles;
  if (from.pile === PILE.TABLEAU) {
    const column = piles.tableau[from.index];
    if (!column || from.cardIndex == null) return null;
    const start = from.cardIndex;
    const run = column.slice(start);
    if (!run.length) return null;
    if (!run[0].faceUp) return null;
    const spec = specFor(state);
    const rule = { alternateColors: spec.alternateColors, sameSuit: spec.sameSuit, emptyColumn: 'none' };
    for (let i = 1; i < run.length; i++) {
      if (!run[i].faceUp) return null;
      if (!spec.looseRun && !canStackOnTableau(run[i], run[i - 1], rule)) return null;
    }
    return run;
  }
  if (from.pile === PILE.WASTE) {
    const card = topOf(piles.waste);
    return card ? [card] : null;
  }
  if (from.pile === PILE.FREECELL) {
    const card = topOf(piles.freeCells[from.index]);
    return card ? [card] : null;
  }
  return null;
}

export function canMove(state, from, to) {
  if (!from || !to) return false;
  const spec = specFor(state);
  const piles = state.piles;

  if (from.pile === PILE.STOCK) {
    if (!piles.stock.length) return false;
    if (spec.dealRows) return to.pile === PILE.TABLEAU;
    return to.pile === PILE.WASTE;
  }
  if (to.pile === PILE.STOCK) return false;

  const run = movableRun(state, from);
  if (!run) return false;

  if (to.pile === PILE.TABLEAU) {
    if (from.pile === PILE.TABLEAU && to.index === from.index) return false;
    const target = topOf(piles.tableau[to.index]);
    return canStackOnTableau(run[0], target, {
      alternateColors: spec.alternateColors,
      sameSuit: spec.sameSuit,
      emptyColumn: spec.emptyColumn,
    });
  }
  if (to.pile === PILE.FOUNDATION) {
    if (spec.foundationRule === 'run') {
      return piles.foundations[to.index].length === 0 && isCompleteRun(run, spec.runLength);
    }
    if (run.length !== 1) return false;
    return canStackOnFoundation(run[0], piles.foundations[to.index]);
  }
  if (to.pile === PILE.FREECELL) {
    if (run.length !== 1) return false;
    return piles.freeCells[to.index].length === 0;
  }
  return false;
}

function performMove(piles, from, to, spec) {
  if (from.pile === PILE.STOCK) {
    const drawn = piles.stock.splice(Math.max(0, piles.stock.length - spec.drawCount));
    drawn.forEach((card) => {
      card.faceUp = true;
      piles.waste.push(card);
    });
    return;
  }

  let moving;
  if (from.pile === PILE.WASTE) {
    moving = [piles.waste.pop()];
  } else if (from.pile === PILE.FREECELL) {
    moving = [piles.freeCells[from.index].pop()];
  } else {
    moving = piles.tableau[from.index].splice(from.cardIndex);
  }

  if (to.pile === PILE.WASTE) piles.waste.push(...moving);
  else if (to.pile === PILE.FREECELL) piles.freeCells[to.index].push(...moving);
  else if (to.pile === PILE.FOUNDATION) piles.foundations[to.index].push(...moving);
  else if (to.pile === PILE.TABLEAU) piles.tableau[to.index].push(...moving);
}

function revealTop(piles, columnIndex) {
  const column = piles.tableau[columnIndex];
  if (!column || !column.length) return;
  const card = topOf(column);
  if (!card.faceUp) card.faceUp = true;
}

function pushHistory(state) {
  const history = state.history.slice();
  history.push({
    piles: clonePiles(state.piles),
    moves: state.moves,
    redeals: state.redeals,
    elapsedMs: state.elapsedMs,
    won: state.won,
  });
  while (history.length > HISTORY_LIMIT) history.shift();
  return history;
}

export function canDealRow(state) {
  const spec = specFor(state);
  return spec.dealRows && state.piles.stock.length > 0;
}

export function applyDealRow(state) {
  if (!canDealRow(state)) return null;
  const spec = specFor(state);
  const history = pushHistory(state);
  const piles = clonePiles(state.piles);
  const columns = piles.tableau.length;

  for (let i = 0; i < columns && piles.stock.length; i++) {
    const card = piles.stock.pop();
    card.faceUp = true;
    piles.tableau[i].push(card);
  }

  return {
    ...state,
    piles,
    history,
    moves: state.moves + 1,
    won: isWonPiles(piles, spec.totalCards),
  };
}

export function findCompleteRunColumn(state) {
  const spec = specFor(state);
  if (spec.foundationRule !== 'run') return null;
  const piles = state.piles;
  for (let i = 0; i < piles.tableau.length; i++) {
    const column = piles.tableau[i];
    if (column.length < spec.runLength) continue;
    if (isCompleteRun(column.slice(column.length - spec.runLength), spec.runLength)) {
      return { index: i, start: column.length - spec.runLength };
    }
  }
  return null;
}

export function autoCompleteRun(state) {
  const found = findCompleteRunColumn(state);
  if (!found) return null;
  const target = state.piles.foundations.findIndex((col) => col.length === 0);
  if (target < 0) return null;
  const from = { pile: PILE.TABLEAU, index: found.index, cardIndex: found.start };
  return applyMove(state, from, { pile: PILE.FOUNDATION, index: target });
}

export function applyMove(state, from, to) {
  const spec = specFor(state);
  if (from.pile === PILE.STOCK && spec.dealRows) {
    return applyDealRow(state);
  }
  if (!canMove(state, from, to)) return null;

  const history = pushHistory(state);

  const piles = clonePiles(state.piles);
  performMove(piles, from, to, specFor(state));

  if (from.pile === PILE.TABLEAU) revealTop(piles, from.index);

  const next = {
    ...state,
    piles,
    history,
    moves: state.moves + 1,
    won: isWonPiles(piles, specFor(state).totalCards),
  };
  return next;
}

export function canRecycle(state) {
  const spec = specFor(state);
  return spec.stock && state.piles.stock.length === 0 && state.piles.waste.length > 0;
}

export function applyRecycle(state) {
  if (!canRecycle(state)) return null;

  const history = state.history.slice();
  history.push({
    piles: clonePiles(state.piles),
    moves: state.moves,
    redeals: state.redeals,
    elapsedMs: state.elapsedMs,
    won: state.won,
  });
  while (history.length > HISTORY_LIMIT) history.shift();

  const piles = clonePiles(state.piles);
  piles.stock = piles.waste.slice().reverse();
  piles.waste = [];
  piles.stock.forEach((card) => {
    card.faceUp = false;
  });

  return {
    ...state,
    piles,
    history,
    moves: state.moves + 1,
    redeals: state.redeals + 1,
    won: isWonPiles(piles, specFor(state).totalCards),
  };
}

export function applyFlip(state, columnIndex) {
  if (state.variantId === 'klondike') return null;
  const column = state.piles.tableau[columnIndex];
  if (!column || !column.length) return null;
  const card = topOf(column);
  if (card.faceUp) return null;

  const history = state.history.slice();
  history.push({
    piles: clonePiles(state.piles),
    moves: state.moves,
    redeals: state.redeals,
    elapsedMs: state.elapsedMs,
    won: state.won,
  });
  while (history.length > HISTORY_LIMIT) history.shift();

  const piles = clonePiles(state.piles);
  topOf(piles.tableau[columnIndex]).faceUp = true;

  return { ...state, piles, history, moves: state.moves + 1, won: isWonPiles(piles, specFor(state).totalCards) };
}

export function undo(state) {
  if (!state.history.length) return null;
  const history = state.history.slice();
  const previous = history.pop();
  return {
    ...state,
    piles: previous.piles,
    history,
    moves: previous.moves,
    redeals: previous.redeals,
    elapsedMs: previous.elapsedMs,
    won: previous.won,
  };
}

export function isWonPiles(piles, totalCards = 52) {
  const total = piles.foundations.reduce((sum, col) => sum + col.length, 0);
  return total === totalCards;
}

export function isWon(state) {
  return state.won;
}

export function foundationTargets(state, from) {
  const targets = [];
  const run = movableRun(state, from);
  if (!run) return targets;
  const spec = specFor(state);

  if (spec.foundationRule === 'run') {
    if (!isCompleteRun(run, spec.runLength)) return targets;
    state.piles.foundations.forEach((col, index) => {
      if (col.length === 0) targets.push({ pile: PILE.FOUNDATION, index });
    });
    return targets;
  }

  if (run.length !== 1) return targets;
  const card = run[0];
  state.piles.foundations.forEach((col, index) => {
    if (canStackOnFoundation(card, col)) targets.push({ pile: PILE.FOUNDATION, index });
  });
  return targets;
}

export function findAutoFoundationMove(state, from) {
  const targets = foundationTargets(state, from);
  return targets.length ? targets[0] : null;
}

export function findEmptyColumnTarget(state, from) {
  if (specFor(state).emptyColumn !== 'any') return null;
  const run = movableRun(state, from);
  if (!run) return null;
  const index = state.piles.tableau.findIndex((col) => col.length === 0);
  if (index < 0) return null;
  return { pile: PILE.TABLEAU, index };
}

export function allCardsFaceUp(state) {
  const piles = state.piles;
  if (piles.stock.length || piles.waste.length) return false;
  return piles.tableau.every((col) => col.every((card) => card.faceUp));
}

export function autoFinish(state) {
  if (!allCardsFaceUp(state)) return null;
  let current = state;
  let guard = 0;
  let changed = false;

  while (guard++ < 60) {
    let moved = false;
    for (let i = 0; i < current.piles.tableau.length; i++) {
      const column = current.piles.tableau[i];
      if (!column.length) continue;
      const card = topOf(column);
      const from = { pile: PILE.TABLEAU, index: i, cardIndex: column.length - 1 };
      const to = findAutoFoundationMove(current, from);
      if (to) {
        current = applyMove(current, from, to);
        moved = true;
        changed = true;
        break;
      }
    }
    if (!moved) {
      for (let i = 0; i < current.piles.freeCells.length; i++) {
        const cell = current.piles.freeCells[i];
        if (!cell.length) continue;
        const from = { pile: PILE.FREECELL, index: i };
        const to = findAutoFoundationMove(current, from);
        if (to) {
          current = applyMove(current, from, to);
          moved = true;
          changed = true;
          break;
        }
      }
    }
    if (!moved) break;
  }

  return changed ? current : null;
}

export function analyzePosition(state) {
  const moves = legalMoves(state);
  const canDraw = canDealRow(state) || canRecycle(state);

  if (!moves.length && !canDraw) {
    return {
      dead: true,
      certain: true,
      moves: 0,
      short: 'This game is over',
      reason: 'There are no legal moves left, and no way to turn over more cards.',
    };
  }

  const spec = specFor(state);

  if (spec.id === 'freecell') {
    const emptyColumns = state.piles.tableau.filter((col) => col.length === 0).length;
    const freeCells = state.piles.freeCells.filter((col) => col.length === 0).length;
    const capacity = (freeCells + 1) * Math.pow(2, emptyColumns);
    const movableSources = new Set(moves.map((move) => move.from.pile + ':' + move.from.index + ':' + move.from.cardIndex));

    for (let column = 0; column < state.piles.tableau.length; column++) {
      const cards = state.piles.tableau[column];
      if (!cards.length) continue;
      const topKey = PILE.TABLEAU + ':' + column + ':' + (cards.length - 1);
      const topCanMove = movableSources.has(topKey);
      if (topCanMove) continue;

      for (let index = 1; index < cards.length; index++) {
        if (!cards[index].faceUp) continue;
        const block = cards.length - index;
        if (block > capacity) {
          return {
            dead: true,
            certain: false,
            moves: moves.length,
            short: 'This game cannot be won',
            reason:
              'A pile of ' + block + ' cards is too large to shift with ' + freeCells +
              ' free cells and ' + emptyColumns + ' empty columns, so it can never be broken up.',
          };
        }
      }
    }
  }

  if (spec.id === 'klondike') {
    const canStillDraw = state.piles.stock.length > 0 || state.piles.waste.length > 0;
    const hasEmptyColumn = state.piles.tableau.some((col) => col.length === 0);
    const hasKing = state.piles.tableau.some((col) => col.some((card) => card.rank === 13 && card.faceUp));
    const foundationMove = moves.some((move) => move.to.pile === PILE.FOUNDATION);
    if (!canStillDraw && !hasEmptyColumn && !hasKing && !foundationMove) {
      return {
        dead: true,
        certain: false,
        moves: moves.length,
        short: 'This game cannot be won',
        reason:
          'There is no empty column and no King in sight, so no new sequence can ever be started.',
      };
    }
  }

  return { dead: false, certain: false, moves: moves.length, short: '', reason: '' };
}

export function legalMoves(state) {
  const moves = [];
  const spec = specFor(state);
  const sources = [];

  if (spec.stock && state.piles.stock.length) {
    sources.push({ pile: PILE.STOCK, index: 0, cardIndex: null });
  }
  if (spec.dealRows && state.piles.stock.length) {
    sources.push({ pile: PILE.STOCK, index: 0, cardIndex: null });
  }
  if (state.piles.waste.length) {
    sources.push({ pile: PILE.WASTE, index: 0, cardIndex: null });
  }
  state.piles.freeCells.forEach((col, index) => {
    if (col.length) sources.push({ pile: PILE.FREECELL, index, cardIndex: null });
  });
  state.piles.tableau.forEach((col, index) => {
    for (let i = 0; i < col.length; i++) {
      if (!col[i].faceUp) continue;
      sources.push({ pile: PILE.TABLEAU, index, cardIndex: i });
    }
  });

  const targets = [];
  state.piles.foundations.forEach((_, index) => targets.push({ pile: PILE.FOUNDATION, index }));
  state.piles.freeCells.forEach((_, index) => targets.push({ pile: PILE.FREECELL, index }));
  state.piles.tableau.forEach((_, index) => targets.push({ pile: PILE.TABLEAU, index }));
  if (spec.waste) targets.push({ pile: PILE.WASTE, index: 0 });

  for (const from of sources) {
    for (const to of targets) {
      if (canMove(state, from, to)) moves.push({ from, to });
    }
  }
  return moves;
}

export function hasLegalMove(state) {
  return legalMoves(state).length > 0;
}

export function legalTargets(state, from) {
  const targets = [];
  if (!from) return targets;
  const piles = state.piles;

  if (from.pile === PILE.STOCK) {
    if (piles.stock.length) targets.push({ pile: PILE.WASTE, index: 0 });
    return targets;
  }

  piles.foundations.forEach((_, index) => {
    if (canMove(state, from, { pile: PILE.FOUNDATION, index })) {
      targets.push({ pile: PILE.FOUNDATION, index });
    }
  });
  piles.freeCells.forEach((_, index) => {
    if (canMove(state, from, { pile: PILE.FREECELL, index })) {
      targets.push({ pile: PILE.FREECELL, index });
    }
  });
  piles.tableau.forEach((_, index) => {
    if (canMove(state, from, { pile: PILE.TABLEAU, index })) {
      targets.push({ pile: PILE.TABLEAU, index });
    }
  });

  return targets;
}

export function findHint(state) {
  const moves = legalMoves(state);

  const foundation = moves.find((m) => m.to.pile === PILE.FOUNDATION);
  if (foundation) return { ...foundation, reason: 'Send to a foundation' };

  const freeCell = moves.find((m) => m.to.pile === PILE.FREECELL);
  if (freeCell) return { ...freeCell, reason: 'Move to a free cell' };

  const waste = moves.find((m) => m.from.pile === PILE.WASTE);
  if (waste) return { ...waste, reason: 'Move this card from the waste' };

  const tableau = moves.find((m) => m.to.pile === PILE.TABLEAU);
  if (tableau) return { ...tableau, reason: 'Build down on this pile' };

  if (canDealRow(state)) {
    return { from: { pile: PILE.STOCK, index: 0, cardIndex: null }, reason: 'Turn over a card from the stock' };
  }

  const stock = moves.find((m) => m.from.pile === PILE.STOCK);
  if (stock) return { ...stock, reason: 'Turn over a card from the stock' };

  return null;
}

export function serialize(state) {
  return JSON.stringify({
    variantId: state.variantId,
    options: state.options,
    seed: state.seed,
    piles: state.piles,
    history: state.history,
    moves: state.moves,
    redeals: state.redeals,
    startedAt: state.startedAt,
    elapsedMs: state.elapsedMs,
    won: state.won,
  });
}

export function deserialize(raw) {
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!data || !data.variantId || !data.piles) return null;
    return {
      variantId: data.variantId,
      options: normalizeOptions(data.variantId, data.options),
      seed: data.seed != null ? data.seed >>> 0 : randomSeed(),
      piles: data.piles,
      history: Array.isArray(data.history) ? data.history : [],
      moves: data.moves || 0,
      redeals: data.redeals || 0,
      startedAt: data.startedAt || Date.now(),
      elapsedMs: data.elapsedMs || 0,
      won: Boolean(data.won),
    };
  } catch (error) {
    return null;
  }
}
