import test from 'node:test';
import assert from 'node:assert/strict';

import { makeDeck, makeSeededRandomInt, shuffle } from '../src/cards.js';
import { getSpec } from '../src/variants.js';
import {
  PILE,
  allCardsFaceUp,
  applyDealRow,
  applyFlip,
  applyMove,
  applyRecycle,
  autoCompleteRun,
  autoFinish,
  canMove,
  canStackOnFoundation,
  canStackOnTableau,
  createGame,
  deserialize,
  findAutoFoundationMove,
  findEmptyColumnTarget,
  findHint,
  hasLegalMove,
  isWonPiles,
  legalMoves,
  serialize,
  undo,
} from '../src/engine.js';

function card(suit, rank, faceUp = true) {
  return { id: suit + rank, suit, rank, faceUp };
}

function blankPiles(variantId, options) {
  const spec = getSpec(variantId, options);
  return {
    stock: [],
    waste: [],
    freeCells: Array.from({ length: spec.freeCells }, () => []),
    foundations: Array.from({ length: spec.foundations }, () => []),
    tableau: spec.tableauRows.map(() => []),
  };
}

function makeState(variantId, piles) {
  return {
    variantId,
    piles,
    history: [],
    moves: 0,
    redeals: 0,
    startedAt: 0,
    elapsedMs: 0,
    won: false,
  };
}

test('deck contains 52 unique cards', () => {
  const deck = makeDeck();
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map((c) => c.id)).size, 52);
});

test('shuffle keeps every card and is deterministic with a seed', () => {
  const deck = makeDeck();
  const first = shuffle(deck, makeSeededRandomInt(7));
  const second = shuffle(deck, makeSeededRandomInt(7));
  assert.deepEqual(first.map((c) => c.id), second.map((c) => c.id));
  assert.equal(new Set(first.map((c) => c.id)).size, 52);
});

test('klondike deal is 28 tableau cards and 24 in stock', () => {
  const state = createGame('klondike', { randomInt: makeSeededRandomInt(3) });
  const tableauCount = state.piles.tableau.reduce((sum, col) => sum + col.length, 0);
  assert.deepEqual(state.piles.tableau.map((col) => col.length), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(tableauCount, 28);
  assert.equal(state.piles.stock.length, 24);
  assert.equal(state.piles.waste.length, 0);
  state.piles.tableau.forEach((col) => {
    assert.equal(col.filter((c) => c.faceUp).length, 1);
    assert.equal(col[col.length - 1].faceUp, true);
  });
});

test('freecell deal fills eight columns and leaves no stock', () => {
  const state = createGame('freecell', { randomInt: makeSeededRandomInt(11) });
  assert.deepEqual(state.piles.tableau.map((col) => col.length), [7, 7, 7, 7, 6, 6, 6, 6]);
  const total = state.piles.tableau.reduce((sum, col) => sum + col.length, 0);
  assert.equal(total, 52);
  assert.equal(state.piles.stock.length, 0);
  assert.equal(state.piles.freeCells.length, 4);
});

const COLOUR_RULE = { alternateColors: true, emptyColumn: 'none' };
const ANY_COLUMN = { alternateColors: true, emptyColumn: 'any' };
const KING_COLUMN = { alternateColors: true, emptyColumn: 'king' };
const RANK_ONLY = { alternateColors: false, emptyColumn: 'any' };

test('tableau stacking requires descending rank and alternating colour', () => {
  assert.equal(canStackOnTableau(card('H', 5), card('S', 6), COLOUR_RULE), true);
  assert.equal(canStackOnTableau(card('H', 5), card('D', 6), COLOUR_RULE), false);
  assert.equal(canStackOnTableau(card('H', 5), card('S', 7), COLOUR_RULE), false);
  assert.equal(canStackOnTableau(card('H', 5), null, COLOUR_RULE), false);
  assert.equal(canStackOnTableau(card('H', 5), null, ANY_COLUMN), true);
});

test('an empty column takes only a king under the klondike rule', () => {
  assert.equal(canStackOnTableau(card('H', 13), null, KING_COLUMN), true);
  assert.equal(canStackOnTableau(card('H', 5), null, KING_COLUMN), false);
  assert.equal(canStackOnTableau(card('H', 5), null, RANK_ONLY), true);
});

test('a rank only rule ignores colour', () => {
  assert.equal(canStackOnTableau(card('H', 5), card('H', 6), RANK_ONLY), true);
  assert.equal(canStackOnTableau(card('H', 5), card('D', 6), COLOUR_RULE), false);
});

test('foundations build by suit from ace up', () => {
  assert.equal(canStackOnFoundation(card('H', 1), []), true);
  assert.equal(canStackOnFoundation(card('H', 2), []), false);
  assert.equal(canStackOnFoundation(card('H', 2), [card('H', 1)]), true);
  assert.equal(canStackOnFoundation(card('S', 2), [card('H', 1)]), false);
});

test('klondike moves a king onto an empty column but nothing else', () => {
  const klondike = makeState('klondike', blankPiles('klondike'));
  klondike.piles.tableau[0].push(card('H', 5));
  assert.equal(
    canMove(klondike, { pile: PILE.TABLEAU, index: 0, cardIndex: 0 }, { pile: PILE.TABLEAU, index: 1 }),
    false
  );

  const withKing = makeState('klondike', blankPiles('klondike'));
  withKing.piles.tableau[0].push(card('H', 13));
  assert.equal(
    canMove(withKing, { pile: PILE.TABLEAU, index: 0, cardIndex: 0 }, { pile: PILE.TABLEAU, index: 1 }),
    true
  );

  const moved = applyMove(withKing, { pile: PILE.TABLEAU, index: 0, cardIndex: 0 }, { pile: PILE.TABLEAU, index: 1 });
  assert.ok(moved);
  assert.equal(moved.piles.tableau[1].length, 1);
  assert.equal(moved.piles.tableau[1][0].id, 'H13');
});

test('freecell moves any card onto an empty column', () => {
  const freecell = makeState('freecell', blankPiles('freecell'));
  freecell.piles.tableau[0].push(card('H', 5));
  assert.equal(
    canMove(freecell, { pile: PILE.TABLEAU, index: 0, cardIndex: 0 }, { pile: PILE.TABLEAU, index: 7 }),
    true
  );
});

test('moves between piles are applied and can be undone', () => {
  const state = makeState('klondike', blankPiles('klondike'));
  state.piles.tableau[0].push(card('H', 5));
  state.piles.tableau[1].push(card('S', 6));

  const moved = applyMove(state, { pile: PILE.TABLEAU, index: 0, cardIndex: 0 }, { pile: PILE.TABLEAU, index: 1 });
  assert.ok(moved);
  assert.equal(moved.piles.tableau[0].length, 0);
  assert.equal(moved.piles.tableau[1].length, 2);
  assert.equal(moved.piles.tableau[1][1].id, 'H5');
  assert.equal(moved.moves, 1);

  const reverted = undo(moved);
  assert.equal(reverted.piles.tableau[0].length, 1);
  assert.equal(reverted.piles.tableau[1].length, 1);
  assert.equal(reverted.moves, 0);
});

test('moving off a tableau column reveals the card underneath', () => {
  const state = makeState('klondike', blankPiles('klondike'));
  state.piles.tableau[0].push(card('S', 8, false), card('H', 7));
  state.piles.tableau[1].push(card('C', 8));

  const moved = applyMove(state, { pile: PILE.TABLEAU, index: 0, cardIndex: 1 }, { pile: PILE.TABLEAU, index: 1 });
  assert.ok(moved);
  assert.equal(moved.piles.tableau[0][0].faceUp, true);
});

test('a run of face-up cards moves together', () => {
  const state = makeState('klondike', blankPiles('klondike'));
  state.piles.tableau[0].push(card('H', 9), card('S', 8), card('D', 7));
  state.piles.tableau[1].push(card('D', 9));

  const moved = applyMove(state, { pile: PILE.TABLEAU, index: 0, cardIndex: 1 }, { pile: PILE.TABLEAU, index: 1 });
  assert.ok(moved);
  assert.equal(moved.piles.tableau[0].length, 1);
  assert.equal(moved.piles.tableau[1].length, 3);
  assert.equal(moved.piles.tableau[1][1].id, 'S8');
  assert.equal(moved.piles.tableau[1][2].id, 'D7');
});

test('a face-down card cannot be dragged', () => {
  const state = makeState('klondike', blankPiles('klondike'));
  state.piles.tableau[0].push(card('S', 8, false));
  assert.equal(
    canMove(state, { pile: PILE.TABLEAU, index: 0, cardIndex: 0 }, { pile: PILE.FOUNDATION, index: 0 }),
    false
  );
});

test('stock deals to the waste and klondike redeal restores the draw order', () => {
  const state = makeState('klondike', blankPiles('klondike'));
  state.piles.stock.push(card('S', 1), card('H', 2));

  const dealt = applyMove(state, { pile: PILE.STOCK, index: 0 }, { pile: PILE.WASTE, index: 0 });
  assert.equal(dealt.piles.waste.length, 1);
  assert.equal(dealt.piles.waste[0].id, 'H2');

  const second = applyMove(dealt, { pile: PILE.STOCK, index: 0 }, { pile: PILE.WASTE, index: 0 });
  assert.equal(second.piles.stock.length, 0);
  assert.equal(second.piles.waste.length, 2);

  const recycled = applyRecycle(second);
  assert.ok(recycled);
  assert.equal(recycled.piles.waste.length, 0);
  assert.equal(recycled.piles.stock.length, 2);
  assert.equal(recycled.piles.stock[recycled.piles.stock.length - 1].id, 'H2');
  assert.equal(recycled.piles.stock[0].id, 'S1');
  assert.equal(recycled.redeals, 1);

  const nextDraw = applyMove(recycled, { pile: PILE.STOCK, index: 0 }, { pile: PILE.WASTE, index: 0 });
  assert.equal(nextDraw.piles.waste[0].id, 'H2');
});

test('cards drawn from the stock turn face up in the waste', () => {
  const state = makeState('klondike', blankPiles('klondike'));
  state.piles.stock.push(card('S', 1, false), card('H', 2, false));

  const dealt = applyMove(state, { pile: PILE.STOCK, index: 0 }, { pile: PILE.WASTE, index: 0 });
  assert.equal(dealt.piles.waste[0].faceUp, true);
  assert.equal(dealt.piles.waste[0].id, 'H2');
});

test('cards recycled from the waste turn face down in the stock', () => {
  const state = makeState('klondike', blankPiles('klondike'));
  state.piles.waste.push(card('S', 1, true), card('H', 2, true));

  const recycled = applyRecycle(state);
  assert.ok(recycled);
  assert.equal(recycled.piles.stock.length, 2);
  recycled.piles.stock.forEach((card) => assert.equal(card.faceUp, false));
});

test('freecell exposes four free cells that accept a single card', () => {
  const state = makeState('freecell', blankPiles('freecell'));
  state.piles.tableau[0].push(card('H', 5));
  state.piles.tableau[1].push(card('C', 9));

  const moved = applyMove(state, { pile: PILE.TABLEAU, index: 0, cardIndex: 0 }, { pile: PILE.FREECELL, index: 2 });
  assert.ok(moved);
  assert.equal(moved.piles.freeCells[2].length, 1);

  const second = applyMove(moved, { pile: PILE.TABLEAU, index: 1, cardIndex: 0 }, { pile: PILE.FREECELL, index: 1 });
  assert.ok(second);
  assert.equal(second.piles.freeCells[1].length, 1);

  const blocked = applyMove(second, { pile: PILE.FREECELL, index: 2 }, { pile: PILE.FREECELL, index: 1 });
  assert.equal(blocked, null);
});

test('freecell flips the top card of a column and klondike does not', () => {
  const freecell = makeState('freecell', blankPiles('freecell'));
  freecell.piles.tableau[0].push(card('S', 8, false), card('H', 7, false));
  const flipped = applyFlip(freecell, 0);
  assert.ok(flipped);
  assert.equal(flipped.piles.tableau[0][1].faceUp, true);
  assert.equal(flipped.piles.tableau[0][0].faceUp, false);

  const klondike = makeState('klondike', blankPiles('klondike'));
  klondike.piles.tableau[0].push(card('S', 8, false));
  assert.equal(applyFlip(klondike, 0), null);
});

test('the game is won when all 52 cards reach the foundations', () => {
  const piles = blankPiles('klondike');
  const suits = ['S', 'H', 'D', 'C'];
  suits.forEach((suit, index) => {
    for (let rank = 1; rank <= 13; rank++) piles.foundations[index].push(card(suit, rank));
  });
  assert.equal(isWonPiles(piles), true);
  assert.equal(isWonPiles(blankPiles('klondike')), false);
});

test('auto move finds the matching foundation', () => {
  const state = makeState('klondike', blankPiles('klondike'));
  state.piles.foundations[0].push(card('H', 1));
  state.piles.tableau[0].push(card('H', 2));

  const target = findAutoFoundationMove(state, { pile: PILE.TABLEAU, index: 0, cardIndex: 0 });
  assert.deepEqual(target, { pile: PILE.FOUNDATION, index: 0 });
});

test('auto finish clears the board when every card is face up', () => {
  const state = makeState('klondike', blankPiles('klondike'));
  state.piles.foundations[0].push(card('H', 1));
  state.piles.tableau[0].push(card('H', 2));

  assert.equal(allCardsFaceUp(state), true);
  const finished = autoFinish(state);
  assert.ok(finished);
  assert.equal(finished.piles.tableau[0].length, 0);
  assert.equal(finished.piles.foundations[0].length, 2);
});

test('legal moves, hints and empty column targets are reported', () => {
  const state = makeState('klondike', blankPiles('klondike'));
  state.piles.foundations[0].push(card('H', 1));
  state.piles.tableau[0].push(card('H', 2));
  state.piles.tableau[1].push(card('S', 5));

  const moves = legalMoves(state);
  assert.ok(moves.length > 0);
  assert.equal(hasLegalMove(state), true);

  const hint = findHint(state);
  assert.ok(hint);
  assert.equal(hint.to.pile, PILE.FOUNDATION);

  const freecell = makeState('freecell', blankPiles('freecell'));
  freecell.piles.tableau[0].push(card('H', 2));
  const emptyTarget = findEmptyColumnTarget(freecell, { pile: PILE.TABLEAU, index: 0, cardIndex: 0 });
  assert.deepEqual(emptyTarget, { pile: PILE.TABLEAU, index: 1 });
});

test('a fresh game always has at least one legal move', () => {
  ['klondike', 'freecell'].forEach((variantId) => {
    for (let seed = 0; seed < 25; seed++) {
      const state = createGame(variantId, { randomInt: makeSeededRandomInt(seed + 1) });
      assert.equal(hasLegalMove(state), true, variantId + ' seed ' + seed);
    }
  });
});

test('klondike can draw one or three cards at a time', () => {
  const single = makeState('klondike', blankPiles('klondike'));
  single.options = { drawCount: 1 };
  single.piles.stock.push(card('S', 1), card('H', 2), card('D', 3));
  const oneDrawn = applyMove(single, { pile: PILE.STOCK, index: 0 }, { pile: PILE.WASTE, index: 0 });
  assert.equal(oneDrawn.piles.waste.length, 1);
  assert.equal(oneDrawn.piles.stock.length, 2);

  const triple = makeState('klondike', blankPiles('klondike'));
  triple.options = { drawCount: 3 };
  triple.piles.stock.push(card('S', 1), card('H', 2), card('D', 3));
  const threeDrawn = applyMove(triple, { pile: PILE.STOCK, index: 0 }, { pile: PILE.WASTE, index: 0 });
  assert.equal(threeDrawn.piles.waste.length, 3);
  assert.equal(threeDrawn.piles.stock.length, 0);
  threeDrawn.piles.waste.forEach((c) => assert.equal(c.faceUp, true));
  assert.equal(threeDrawn.piles.waste[2].id, 'D3');
});

test('with draw three only the top waste card can be played', () => {
  const state = makeState('klondike', blankPiles('klondike'));
  state.options = { drawCount: 3 };
  state.piles.stock.push(card('S', 1), card('H', 2), card('D', 3));
  state.piles.tableau[1].push(card('S', 4));
  const drawn = applyMove(state, { pile: PILE.STOCK, index: 0 }, { pile: PILE.WASTE, index: 0 });

  assert.equal(drawn.piles.waste.length, 3);
  assert.equal(
    canMove(drawn, { pile: PILE.WASTE, index: 0, cardIndex: null }, { pile: PILE.FOUNDATION, index: 0 }),
    false
  );
  assert.equal(
    canMove(drawn, { pile: PILE.WASTE, index: 0, cardIndex: null }, { pile: PILE.TABLEAU, index: 1 }),
    true
  );
});

test('freecell with one suit deals four copies of a single suit', () => {
  const state = createGame('freecell', { suits: 1, randomInt: makeSeededRandomInt(9) });
  const all = [];
  state.piles.tableau.forEach((col) => all.push.apply(all, col));
  assert.equal(all.length, 52);
  assert.equal(new Set(all.map((c) => c.id)).size, 52);
  assert.equal(all.every((c) => c.suit === 'H'), true);

  const ranks = {};
  all.forEach((c) => {
    ranks[c.rank] = (ranks[c.rank] || 0) + 1;
  });
  Object.keys(ranks).forEach((rank) => assert.equal(ranks[rank], 4));
});

test('freecell with two suits deals two copies of a red and a black suit', () => {
  const state = createGame('freecell', { suits: 2, randomInt: makeSeededRandomInt(13) });
  const all = [];
  state.piles.tableau.forEach((col) => all.push.apply(all, col));
  assert.equal(all.length, 52);
  assert.equal(new Set(all.map((c) => c.id)).size, 52);

  const counts = {};
  all.forEach((c) => {
    counts[c.suit] = (counts[c.suit] || 0) + 1;
  });
  assert.equal(counts.S, 26);
  assert.equal(counts.H, 26);
});

test('the one suit variant ignores colour when building the tableau', () => {
  const state = makeState('freecell', blankPiles('freecell', { suits: 1 }));
  state.options = { suits: 1 };
  state.piles.tableau[0].push(card('H', 6));
  state.piles.tableau[1].push(card('H', 5));
  assert.equal(
    canMove(state, { pile: PILE.TABLEAU, index: 1, cardIndex: 0 }, { pile: PILE.TABLEAU, index: 0 }),
    true
  );
});

test('the four suit variant still requires alternating colour', () => {
  const state = makeState('freecell', blankPiles('freecell', { suits: 4 }));
  state.options = { suits: 4 };
  state.piles.tableau[0].push(card('H', 6));
  state.piles.tableau[1].push(card('H', 5));
  assert.equal(
    canMove(state, { pile: PILE.TABLEAU, index: 1, cardIndex: 0 }, { pile: PILE.TABLEAU, index: 0 }),
    false
  );
});

test('one and two suit games keep four foundations and win on all 52 cards', () => {
  [1, 2, 4].forEach((suits) => {
    const spec = getSpec('freecell', { suits });
    assert.equal(spec.foundations, 4);
    assert.equal(spec.totalCards, 52);
    assert.equal(spec.foundationSuits.length, 4);
  });

  const piles = blankPiles('freecell', { suits: 1 });
  ['S', 'H', 'D', 'C'].forEach((suit) => {
    for (let rank = 1; rank <= 13; rank++) piles.foundations[0].push(card(suit, rank));
  });
  assert.equal(isWonPiles(piles, 52), true);
});

test('every freecell suit count produces a playable deal', () => {
  [1, 2, 4].forEach((suits) => {
    for (let seed = 0; seed < 10; seed++) {
      const state = createGame('freecell', { suits, randomInt: makeSeededRandomInt(seed + 1) });
      assert.equal(hasLegalMove(state), true, 'suits ' + suits + ' seed ' + seed);
    }
  });
});

test('klondike draw mode survives a save and restore', () => {
  const state = createGame('klondike', { drawCount: 3, randomInt: makeSeededRandomInt(21) });
  const restored = deserialize(serialize(state));
  assert.deepEqual(restored.options, { drawCount: 3 });
  assert.equal(restored.piles.stock.length, 24);
});

test('spider deals two decks of one suit into ten columns', () => {
  const state = createGame('spider', { randomInt: makeSeededRandomInt(31) });
  assert.deepEqual(state.piles.tableau.map((col) => col.length), [6, 6, 6, 6, 5, 5, 5, 5, 5, 5]);
  assert.equal(state.piles.stock.length, 50);

  const all = [];
  state.piles.tableau.forEach((col) => all.push.apply(all, col));
  state.piles.stock.forEach((c) => all.push(c));
  assert.equal(all.length, 104);
  assert.equal(new Set(all.map((c) => c.id)).size, 104);
  assert.equal(all.every((c) => c.suit === 'S'), true);

  state.piles.tableau.forEach((col) => {
    assert.equal(col[col.length - 1].faceUp, true);
    assert.equal(col.filter((c) => c.faceUp).length, 1);
  });
});

test('spider builds down in the same suit only', () => {
  const state = makeState('spider', blankPiles('spider'));
  state.piles.tableau[0].push(card('S', 6));
  state.piles.tableau[1].push(card('S', 5));
  state.piles.tableau[2].push(card('H', 5));

  assert.equal(
    canMove(state, { pile: PILE.TABLEAU, index: 1, cardIndex: 0 }, { pile: PILE.TABLEAU, index: 0 }),
    true
  );
  assert.equal(
    canMove(state, { pile: PILE.TABLEAU, index: 2, cardIndex: 0 }, { pile: PILE.TABLEAU, index: 0 }),
    false
  );
});

test('spider moves any card onto an empty column', () => {
  const state = makeState('spider', blankPiles('spider'));
  state.piles.tableau[0].push(card('S', 9));
  assert.equal(
    canMove(state, { pile: PILE.TABLEAU, index: 0, cardIndex: 0 }, { pile: PILE.TABLEAU, index: 9 }),
    true
  );
});

test('spider deals a row of cards from the stock onto every column', () => {
  const state = makeState('spider', blankPiles('spider'));
  for (let i = 0; i < 12; i++) state.piles.stock.push(card('S', (i % 13) + 1, false));

  const dealt = applyDealRow(state);
  assert.ok(dealt);
  assert.equal(dealt.piles.stock.length, 2);
  assert.equal(dealt.piles.tableau[0].length, 1);
  assert.equal(dealt.piles.tableau[9].length, 1);
  assert.equal(dealt.piles.tableau[0][0].faceUp, true);

  const second = applyDealRow(dealt);
  assert.equal(second.piles.stock.length, 0);
  assert.equal(second.piles.tableau[0].length, 2);
  assert.equal(second.piles.tableau[1].length, 2);
  assert.equal(second.piles.tableau[2].length, 1);
  assert.equal(applyDealRow(second), null);
});

test('spider only sends a complete king to ace run to a foundation', () => {
  const state = makeState('spider', blankPiles('spider'));
  const run = [];
  for (let rank = 13; rank >= 1; rank--) run.push(card('S', rank));
  state.piles.tableau[0].push(...run);

  assert.equal(
    canMove(state, { pile: PILE.TABLEAU, index: 0, cardIndex: 0 }, { pile: PILE.FOUNDATION, index: 0 }),
    true
  );

  const moved = applyMove(state, { pile: PILE.TABLEAU, index: 0, cardIndex: 0 }, { pile: PILE.FOUNDATION, index: 0 });
  assert.ok(moved);
  assert.equal(moved.piles.foundations[0].length, 13);
  assert.equal(moved.piles.tableau[0].length, 0);
});

test('spider rejects a run that is not a full king to ace sequence', () => {
  const state = makeState('spider', blankPiles('spider'));
  const run = [];
  for (let rank = 13; rank >= 2; rank--) run.push(card('S', rank));
  state.piles.tableau[0].push(...run);

  assert.equal(
    canMove(state, { pile: PILE.TABLEAU, index: 0, cardIndex: 0 }, { pile: PILE.FOUNDATION, index: 0 }),
    false
  );
});

test('spider auto completes a run once it is finished', () => {
  const state = makeState('spider', blankPiles('spider'));
  const run = [];
  for (let rank = 13; rank >= 1; rank--) run.push(card('S', rank));
  state.piles.tableau[0].push(...run);

  const completed = autoCompleteRun(state);
  assert.ok(completed);
  assert.equal(completed.piles.foundations[0].length, 13);
  assert.equal(completed.piles.tableau[0].length, 0);
});

test('spider wins when all 104 cards reach the foundations', () => {
  const piles = blankPiles('spider');
  for (let column = 0; column < 8; column++) {
    for (let rank = 1; rank <= 13; rank++) piles.foundations[column].push(card('S', rank));
  }
  assert.equal(isWonPiles(piles, 104), true);
  assert.equal(isWonPiles(piles, 52), false);
});

test('a fresh spider game always has a legal move', () => {
  for (let seed = 0; seed < 15; seed++) {
    const state = createGame('spider', { randomInt: makeSeededRandomInt(seed + 1) });
    assert.equal(hasLegalMove(state), true, 'spider seed ' + seed);
  }
});

test('freecell can be played with six free cells', () => {
  const state = createGame('freecell', { suits: 4, cells: 6, randomInt: makeSeededRandomInt(17) });
  assert.equal(state.piles.freeCells.length, 6);
  assert.equal(state.piles.tableau.length, 8);

  const all = [];
  state.piles.tableau.forEach((col) => all.push.apply(all, col));
  assert.equal(all.length, 52);
  assert.equal(new Set(all.map((c) => c.id)).size, 52);
});

test('spider difficulty changes the suits but keeps 104 cards', () => {
  const two = createGame('spider', { suits: 2, randomInt: makeSeededRandomInt(23) });
  const four = createGame('spider', { suits: 4, randomInt: makeSeededRandomInt(23) });

  const count = (state) => {
    const all = [];
    state.piles.tableau.forEach((col) => all.push.apply(all, col));
    state.piles.stock.forEach((card) => all.push(card));
    const bySuit = {};
    all.forEach((card) => {
      bySuit[card.suit] = (bySuit[card.suit] || 0) + 1;
    });
    return { total: all.length, unique: new Set(all.map((c) => c.id)).size, bySuit };
  };

  const twoCounts = count(two);
  assert.equal(twoCounts.total, 104);
  assert.equal(twoCounts.unique, 104);
  assert.equal(twoCounts.bySuit.S, 52);
  assert.equal(twoCounts.bySuit.H, 52);

  const fourCounts = count(four);
  assert.equal(fourCounts.total, 104);
  assert.equal(fourCounts.unique, 104);
  assert.equal(fourCounts.bySuit.S, 26);
  assert.equal(fourCounts.bySuit.C, 26);
});

test('spider with four suits still needs a same suit run for a foundation', () => {
  const state = makeState('spider', blankPiles('spider'));
  state.options = { suits: 4 };

  const mixed = [];
  for (let rank = 13; rank >= 1; rank--) mixed.push(card(rank % 2 ? 'S' : 'H', rank));
  state.piles.tableau[0].push(...mixed);
  assert.equal(
    canMove(state, { pile: PILE.TABLEAU, index: 0, cardIndex: 0 }, { pile: PILE.FOUNDATION, index: 0 }),
    false
  );

  const clean = [];
  for (let rank = 13; rank >= 1; rank--) clean.push(card('S', rank));
  state.piles.tableau[1].push(...clean);
  assert.equal(
    canMove(state, { pile: PILE.TABLEAU, index: 1, cardIndex: 0 }, { pile: PILE.FOUNDATION, index: 0 }),
    true
  );
});

test('difficulty options survive a save and restore', () => {
  const spider = createGame('spider', { suits: 2, randomInt: makeSeededRandomInt(29) });
  assert.deepEqual(deserialize(serialize(spider)).options, { suits: 2 });

  const freecell = createGame('freecell', { suits: 2, cells: 6, randomInt: makeSeededRandomInt(29) });
  assert.deepEqual(deserialize(serialize(freecell)).options, { suits: 2, cells: 6 });
});

test('state survives a serialize and deserialize round trip', () => {
  const state = createGame('freecell', { randomInt: makeSeededRandomInt(5) });
  const restored = deserialize(serialize(state));
  assert.ok(restored);
  assert.equal(restored.variantId, 'freecell');
  assert.deepEqual(
    restored.piles.tableau.map((col) => col.map((c) => c.id)),
    state.piles.tableau.map((col) => col.map((c) => c.id))
  );
  assert.equal(deserialize('not json'), null);
});
