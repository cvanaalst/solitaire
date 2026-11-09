export const SUITS = ['S', 'H', 'D', 'C'];

export const SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const SUIT_NAME = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };

export const RANK_LABEL = {
  1: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7',
  8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K',
};

export function isRed(suit) {
  return suit === 'H' || suit === 'D';
}

export function makeDeck(suits = SUITS, copies = 1, options = {}) {
  const maxRank = options.maxRank || 13;
  const deck = [];
  for (const suit of suits) {
    for (let copy = 0; copy < copies; copy++) {
      for (let rank = 1; rank <= maxRank; rank++) {
        const suffix = copy === 0 ? '' : '#' + (copy + 1);
        deck.push({ id: suit + rank + suffix, suit, rank, copy, faceUp: false });
      }
    }
  }
  return deck;
}

export function secureRandomInt(max) {
  const buffer = new Uint32Array(1);
  const limit = Math.floor(4294967296 / max) * max;
  let value;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= limit);
  return value % max;
}

export function makeSeededRandomInt(seed) {
  let state = seed >>> 0;
  return (max) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return Math.floor((state / 4294967296) * max);
  };
}

export function shuffle(deck, randomInt = secureRandomInt) {
  const out = deck.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}
