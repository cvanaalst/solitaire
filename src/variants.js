export const VARIANTS = {
  klondike: {
    id: 'klondike',
    name: 'Klondike',
    tagline: 'The classic. Kings start empty columns.',
    option: 'draw',
  },
  freecell: {
    id: 'freecell',
    name: 'FreeCell',
    tagline: 'Pure logic, almost always winnable.',
    option: 'suits',
  },
  spider: {
    id: 'spider',
    name: 'Spider',
    tagline: 'Two decks of one suit. Build whole runs, King down to Ace.',
    option: 'suits',
  },
  spiderette: {
    id: 'spiderette',
    name: 'Spiderette',
    tagline: 'Spider with a single deck. Gentler, and no stock to deal.',
    option: 'none',
  },
  fortyThieves: {
    id: 'fortyThieves',
    name: 'Forty Thieves',
    tagline: 'One deck without the eights, tens or kings. Build in suit only.',
    option: 'none',
  },
  yukon: {
    id: 'yukon',
    name: 'Yukon',
    tagline: 'Seven long columns. Move any face up group, in order or not.',
    option: 'none',
  },
};

export const VARIANT_LIST = Object.values(VARIANTS);

export const DEFAULT_OPTIONS = {
  klondike: { drawCount: 1 },
  freecell: { suits: 4, cells: 4 },
  spider: { suits: 1 },
  spiderette: {},
  fortyThieves: {},
  yukon: {},
};

export const DIFFICULTY = {
  klondike: {
    1: 'Draw one card at a time, the harder and more traditional game.',
    3: 'Draw three cards at a time, which makes the game noticeably easier.',
  },
  freecell: {
    cells: {
      4: 'Four free cells, the classic and hardest setting.',
      6: 'Six free cells, which gives you more room to manoeuvre.',
    },
    suits: {
      4: 'One standard deck of all four suits, the classic game.',
      2: 'Two copies each of spades and hearts, so every rank appears twice.',
      1: 'Four copies of a single suit, so every rank appears four times.',
    },
  },
  spider: {
    1: 'One suit, the hardest and most traditional Spider.',
    2: 'Two suits, a little easier than one.',
    4: 'All four suits, the easiest Spider to win.',
  },
};

const SUIT_SETS = {
  4: { suits: ['S', 'H', 'D', 'C'], copies: 1, alternateColors: true },
  2: { suits: ['S', 'H'], copies: 2, alternateColors: true },
  1: { suits: ['H'], copies: 4, alternateColors: false },
};

function foundationSuits(suits) {
  const list = [];
  for (const suit of suits) {
    for (let i = 0; i < 4 / suits.length; i++) list.push(suit);
  }
  return list;
}

export function normalizeOptions(variantId, options) {
  const given = options || {};
  if (variantId === 'klondike') {
    return { drawCount: given.drawCount === 3 ? 3 : 1 };
  }
  if (variantId === 'spider') {
    const suits = given.suits === 2 || given.suits === 4 ? given.suits : 1;
    return { suits };
  }
  if (variantId === 'spiderette' || variantId === 'fortyThieves' || variantId === 'yukon') {
    return {};
  }
  const suits = given.suits === 1 || given.suits === 2 ? given.suits : 4;
  const cells = given.cells === 6 ? 6 : 4;
  return { suits, cells };
}

export function getSpec(variantId, options) {
  const variant = VARIANTS[variantId];
  if (!variant) throw new Error('Unknown variant: ' + variantId);
  const settings = normalizeOptions(variantId, options);

  if (variantId === 'klondike') {
    return {
      id: variantId,
      name: variant.name,
      tagline: variant.tagline,
      suits: ['S', 'H', 'D', 'C'],
      copies: 1,
      tableauRows: [1, 2, 3, 4, 5, 6, 7],
      foundations: 4,
      freeCells: 0,
      stock: true,
      waste: true,
      dealRows: false,
      drawCount: settings.drawCount,
      alternateColors: true,
      sameSuit: false,
      emptyColumn: 'king',
      foundationRule: 'suit',
      runLength: 13,
      looseRun: false,
      faceUpTop: 1,
      maxRank: 13,
      totalCards: 52,
      foundationSuits: ['S', 'H', 'D', 'C'],
    };
  }

  if (variantId === 'spider') {
    const sets = {
      1: { suits: ['S'], copies: 8 },
      2: { suits: ['S', 'H'], copies: 4 },
      4: { suits: ['S', 'H', 'D', 'C'], copies: 2 },
    };
    const set = sets[settings.suits];
    const label = settings.suits === 1 ? '' : ' · ' + settings.suits + ' suits';
    const foundations = [];
    set.suits.forEach((suit) => {
      for (let i = 0; i < 8 / set.suits.length; i++) foundations.push(suit);
    });
    return {
      id: variantId,
      name: variant.name + label,
      tagline: variant.tagline,
      suits: set.suits,
      copies: set.copies,
      tableauRows: [6, 6, 6, 6, 5, 5, 5, 5, 5, 5],
      foundations: 8,
      freeCells: 0,
      stock: true,
      waste: false,
      dealRows: true,
      drawCount: 1,
      alternateColors: false,
      sameSuit: true,
      emptyColumn: 'any',
      foundationRule: 'run',
      runLength: 13,
      looseRun: false,
      faceUpTop: 1,
      maxRank: 13,
      totalCards: 104,
      foundationSuits: foundations,
    };
  }

  if (variantId === 'spiderette') {
    return {
      id: variantId,
      name: variant.name,
      tagline: variant.tagline,
      suits: ['S', 'H', 'D', 'C'],
      copies: 1,
      tableauRows: [7, 7, 7, 7, 6, 6, 6, 6],
      foundations: 4,
      freeCells: 0,
      stock: false,
      waste: false,
      dealRows: false,
      drawCount: 1,
      alternateColors: false,
      sameSuit: true,
      emptyColumn: 'any',
      foundationRule: 'run',
      runLength: 13,
      looseRun: false,
      faceUpTop: 1,
      maxRank: 13,
      totalCards: 52,
      foundationSuits: ['S', 'H', 'D', 'C'],
    };
  }

  if (variantId === 'fortyThieves') {
    return {
      id: variantId,
      name: variant.name,
      tagline: variant.tagline,
      suits: ['S', 'H', 'D', 'C'],
      copies: 1,
      tableauRows: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
      foundations: 4,
      freeCells: 0,
      stock: false,
      waste: false,
      dealRows: false,
      drawCount: 1,
      alternateColors: false,
      sameSuit: true,
      emptyColumn: 'any',
      foundationRule: 'run',
      runLength: 10,
      looseRun: false,
      faceUpTop: 4,
      maxRank: 10,
      totalCards: 40,
      foundationSuits: ['S', 'H', 'D', 'C'],
    };
  }

  if (variantId === 'yukon') {
    return {
      id: variantId,
      name: variant.name,
      tagline: variant.tagline,
      suits: ['S', 'H', 'D', 'C'],
      copies: 1,
      tableauRows: [1, 6, 7, 8, 9, 10, 11],
      foundations: 4,
      freeCells: 0,
      stock: false,
      waste: false,
      dealRows: false,
      drawCount: 1,
      alternateColors: true,
      sameSuit: false,
      emptyColumn: 'king',
      foundationRule: 'suit',
      looseRun: true,
      faceUpTop: 5,
      maxRank: 13,
      totalCards: 52,
      foundationSuits: ['S', 'H', 'D', 'C'],
    };
  }

  const set = SUIT_SETS[settings.suits];
  const label = settings.suits === 4 ? '' : ' · ' + settings.suits + ' suit' + (settings.suits > 1 ? 's' : '');
  return {
    id: variantId,
    name: variant.name + label,
    tagline: variant.tagline,
    suits: set.suits,
    copies: set.copies,
    tableauRows: [7, 7, 7, 7, 6, 6, 6, 6],
    foundations: 4,
    freeCells: settings.cells,
    stock: false,
    waste: false,
    dealRows: false,
    drawCount: 1,
    alternateColors: set.alternateColors,
    sameSuit: false,
    emptyColumn: 'any',
    foundationRule: 'suit',
    looseRun: false,
    faceUpTop: 1,
    maxRank: 13,
    totalCards: 52,
    foundationSuits: foundationSuits(set.suits),
  };
}

export function getVariant(variantId) {
  return VARIANTS[variantId];
}
