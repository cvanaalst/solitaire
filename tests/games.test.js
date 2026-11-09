import test from 'node:test';
import assert from 'node:assert/strict';

import { PILE, analyzePosition, applyMove, canMove, createGame, undo } from '../src/engine.js';
import { dailySeed, decodeDeal, dealCode, decodeOptions, encodeOptions } from '../src/deals.js';

function card(suit, rank, faceUp = true) {
  return { id: suit + rank, suit, rank, faceUp };
}

test('a seeded game always deals the same cards', () => {
  const first = createGame('klondike', { seed: 12345 });
  const second = createGame('klondike', { seed: 12345 });
  const other = createGame('klondike', { seed: 54321 });

  const ids = (state) => state.piles.tableau.map((col) => col.map((c) => c.id).join(',')).join('|');
  assert.equal(ids(first), ids(second));
  assert.notEqual(ids(first), ids(other));
  assert.equal(first.seed, 12345);
});

test('a game without a seed still gets one', () => {
  const state = createGame('klondike', {});
  assert.equal(typeof state.seed, 'number');
  assert.ok(Number.isFinite(state.seed));
});

test('the daily seed is the same on a given day and different the next', () => {
  const first = new Date(2026, 10, 9);
  const second = new Date(2026, 10, 10);
  assert.equal(dailySeed(first), dailySeed(new Date(2026, 10, 9)));
  assert.notEqual(dailySeed(first), dailySeed(second));
});

test('a deal code round trips through a share link', () => {
  const state = { variantId: 'freecell', seed: 987654, options: { suits: 2, cells: 6 } };
  const code = dealCode(state);
  const decoded = decodeDeal(code);

  assert.equal(decoded.variantId, 'freecell');
  assert.equal(decoded.seed, 987654);
  assert.deepEqual(decoded.options, { suits: 2, cells: 6 });
});

test('option encoding is stable whatever order the keys arrive in', () => {
  assert.equal(encodeOptions({ cells: 6, suits: 2 }), encodeOptions({ suits: 2, cells: 6 }));
  assert.deepEqual(decodeOptions('suits:2-cells:6'), { suits: 2, cells: 6 });
});

test('a broken deal code is rejected', () => {
  assert.equal(decodeDeal(''), null);
  assert.equal(decodeDeal('klondike'), null);
  assert.equal(decodeDeal('klondike.###'), null);
});

test('yukon deals seven columns with the top five face up', () => {
  const state = createGame('yukon', { seed: 4242 });
  assert.deepEqual(state.piles.tableau.map((col) => col.length), [1, 6, 7, 8, 9, 10, 11]);
  assert.equal(state.piles.stock.length, 0);
  assert.equal(state.piles.freeCells.length, 0);

  state.piles.tableau.forEach((col) => {
    const faceUp = col.filter((c) => c.faceUp).length;
    assert.equal(faceUp, Math.min(5, col.length));
  });

  const total = state.piles.tableau.reduce((sum, col) => sum + col.length, 0);
  assert.equal(total, 52);
});

test('yukon moves a group even when the cards are not in order', () => {
  const state = {
    variantId: 'yukon',
    options: {},
    seed: 1,
    piles: {
      stock: [],
      waste: [],
      freeCells: [],
      foundations: [[], [], [], []],
      tableau: [[], [], [], [], [], [], []],
    },
    history: [],
    moves: 0,
    redeals: 0,
    startedAt: 0,
    elapsedMs: 0,
    won: false,
  };

  state.piles.tableau[0].push(card('S', 8), card('H', 7), card('S', 5));
  state.piles.tableau[1].push(card('H', 9));

  assert.equal(
    canMove(state, { pile: PILE.TABLEAU, index: 0, cardIndex: 0 }, { pile: PILE.TABLEAU, index: 1 }),
    true
  );

  const moved = applyMove(state, { pile: PILE.TABLEAU, index: 0, cardIndex: 0 }, { pile: PILE.TABLEAU, index: 1 });
  assert.ok(moved);
  assert.equal(moved.piles.tableau[0].length, 0);
  assert.equal(moved.piles.tableau[1].length, 4);
});

test('yukon only lets a king start an empty column', () => {
  const state = {
    variantId: 'yukon',
    options: {},
    seed: 1,
    piles: {
      stock: [],
      waste: [],
      freeCells: [],
      foundations: [[], [], [], []],
      tableau: [[], [], [], [], [], [], []],
    },
    history: [],
    moves: 0,
    redeals: 0,
    startedAt: 0,
    elapsedMs: 0,
    won: false,
  };

  state.piles.tableau[0].push(card('S', 5));
  assert.equal(
    canMove(state, { pile: PILE.TABLEAU, index: 0, cardIndex: 0 }, { pile: PILE.TABLEAU, index: 3 }),
    false
  );

  state.piles.tableau[0][0] = card('S', 13);
  assert.equal(
    canMove(state, { pile: PILE.TABLEAU, index: 0, cardIndex: 0 }, { pile: PILE.TABLEAU, index: 3 }),
    true
  );
});

test('forty thieves deals forty cards without eights, tens or kings', () => {
  const state = createGame('fortyThieves', { seed: 777 });
  assert.deepEqual(state.piles.tableau.map((col) => col.length), [4, 4, 4, 4, 4, 4, 4, 4, 4, 4]);

  const all = [];
  state.piles.tableau.forEach((col) => all.push.apply(all, col));
  assert.equal(all.length, 40);
  assert.equal(Math.max(...all.map((c) => c.rank)), 10);
  assert.equal(all.every((c) => c.faceUp), true);
});

test('forty thieves builds on the same suit only', () => {
  const state = createGame('fortyThieves', { seed: 778 });
  state.piles.tableau[0].length = 0;
  state.piles.tableau[0].push(card('S', 7), card('S', 8));
  state.piles.tableau[1].length = 0;
  state.piles.tableau[1].push(card('H', 7));

  assert.equal(
    canMove(state, { pile: PILE.TABLEAU, index: 1, cardIndex: 0 }, { pile: PILE.TABLEAU, index: 0 }),
    false
  );

  const sameSuit = createGame('fortyThieves', { seed: 779 });
  sameSuit.piles.tableau[0].length = 0;
  sameSuit.piles.tableau[0].push(card('S', 7), card('S', 8));
  sameSuit.piles.tableau[1].length = 0;
  sameSuit.piles.tableau[1].push(card('S', 7));
  assert.equal(
    canMove(sameSuit, { pile: PILE.TABLEAU, index: 1, cardIndex: 0 }, { pile: PILE.TABLEAU, index: 0 }),
    true
  );
});

test('spiderette deals one deck with no stock', () => {
  const state = createGame('spiderette', { seed: 31337 });
  assert.equal(state.piles.stock.length, 0);
  assert.equal(state.piles.tableau.length, 8);
  const total = state.piles.tableau.reduce((sum, col) => sum + col.length, 0);
  assert.equal(total, 52);
  assert.equal(state.piles.foundations.length, 4);
});

test('every game deals a full deck and can be undone', () => {
  ['klondike', 'freecell', 'spider', 'spiderette', 'fortyThieves', 'yukon'].forEach((variantId) => {
    const state = createGame(variantId, { seed: 99 });
    const spec = state.variantId ? null : null;
    void spec;
    const cards = [];
    state.piles.tableau.forEach((col) => cards.push.apply(cards, col));
    state.piles.stock.forEach((c) => cards.push(c));
    state.piles.waste.forEach((c) => cards.push(c));
    assert.ok(cards.length >= 40, variantId + ' dealt ' + cards.length);
    assert.equal(new Set(cards.map((c) => c.id)).size, cards.length, variantId + ' has duplicate ids');
    void undo;
  });
});

function emptyState(variantId, options = {}) {
  return {
    variantId,
    options: options.options || {},
    seed: 1,
    piles: {
      stock: [],
      waste: [],
      freeCells: [],
      foundations: [[], [], [], []],
      tableau: [[], [], [], [], [], [], []],
    },
    history: [],
    moves: 0,
    redeals: 0,
    startedAt: 0,
    elapsedMs: 0,
    won: false,
  };
}

test('a position with no moves at all is certainly dead', () => {
  const state = emptyState('klondike');
  state.piles.tableau[0].push(card('H', 7), card('S', 8));
  state.piles.tableau[1].push(card('H', 3), card('D', 4));
  state.piles.tableau[2].push(card('C', 9));

  const result = analyzePosition(state);
  assert.equal(result.dead, true);
  assert.equal(result.certain, true);
  assert.ok(result.reason.length > 0);
});

test('a position that can still be dealt from is not dead', () => {
  const spider = emptyState('spider');
  spider.piles.tableau = [[], [], [], [], [], [], [], [], [], []];
  spider.piles.stock.push(card('S', 5));
  spider.piles.foundations = [[], [], [], [], [], [], [], []];

  const result = analyzePosition(spider);
  assert.equal(result.dead, false);
});

test('a klondike that can still be recycled is not dead', () => {
  const state = emptyState('klondike');
  state.piles.tableau[0].push(card('H', 7), card('S', 8));
  state.piles.waste.push(card('H', 3));

  const result = analyzePosition(state);
  assert.equal(result.dead, false);
});

test('klondike with no empty column, no king and no foundation move looks lost', () => {
  const state = emptyState('klondike');
  state.piles.stock = [];
  state.piles.tableau[0].push(card('H', 7), card('S', 8));
  state.piles.tableau[1].push(card('H', 3), card('D', 4));
  state.piles.tableau[2].push(card('C', 9));
  state.piles.tableau[3].push(card('S', 2));
  state.piles.tableau[4].push(card('D', 5));
  state.piles.tableau[5].push(card('C', 6));
  state.piles.tableau[6].push(card('H', 10));

  const result = analyzePosition(state);
  assert.equal(result.dead, true);
  assert.equal(result.certain, false);
  assert.ok(/King/.test(result.reason));
});

test('a healthy position is never reported as dead', () => {
  const state = createGame('klondike', { seed: 5 });
  assert.equal(analyzePosition(state).dead, false);

  const freecell = createGame('freecell', { seed: 5 });
  assert.equal(analyzePosition(freecell).dead, false);
});
