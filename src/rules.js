export const HOW_TO_PLAY = [
  {
    title: 'Tap to select, tap to place',
    text: 'Tap a card to pick it up, then tap the pile you want it on. Tap the same card again to put it down.',
  },
  {
    title: 'Drag it instead',
    text: 'Press and hold a card, then drag it anywhere on the board. A legal drop lands, an illegal one snaps back.',
  },
  {
    title: 'Double tap to send home',
    text: 'Double tap a card to send it straight to a foundation. Double tap again if it has nowhere to go.',
  },
  {
    title: 'Undo is unlimited',
    text: 'Undo takes back any number of moves, including a deal from the stock. The Hint button shows a legal move.',
  },
  {
    title: 'Your game is saved',
    text: 'Every move is saved automatically, so you can close the app and come back to the same board.',
  },
];

export const RULES = {
  klondike: {
    summary: 'Seven tableau piles, four foundations, a stock and a waste. The hardest of the three to win.',
    points: [
      'Build tableau piles downwards in alternating colours, so a red 7 sits on a black 8.',
      'Foundations are built up in a single suit from Ace to King.',
      'Only a King may be moved onto an empty column.',
      'The stock is turned one card at a time, or three if you switch the draw setting. When the stock runs out the waste is picked up and turned back over.',
      'You win when all 52 cards are on the foundations.',
    ],
  },
  freecell: {
    summary: 'Eight tableau piles, free cells, four foundations. Almost every deal can be won.',
    points: [
      'Build tableau piles downwards in alternating colours, the same as Klondike.',
      'Each free cell holds one card and is the key to moving long sequences.',
      'A sequence can be moved to an empty column if it can be split apart and rebuilt through the free cells.',
      'The fewer free cells you use, the further you can move a sequence at once.',
      'You win when all 52 cards are on the foundations.',
    ],
  },
  spider: {
    summary: 'Ten tableau piles, eight foundations and a stock of fifty cards. Two decks of a single suit.',
    points: [
      'Build tableau piles downwards, and cards must be the same suit.',
      'Any card may be moved onto an empty column.',
      'A complete run of thirteen cards, King down to Ace in one suit, moves itself to a foundation.',
      'Every card in the tableau must be the same suit as the one it sits on.',
      'Tapping the stock deals one card onto every column, face up, five rounds in total.',
      'You win when all 104 cards are on the foundations.',
    ],
  },
  spiderette: {
    summary: 'Spider with a single deck and no stock. A gentler way into the Spider idea.',
    points: [
      'Build tableau piles downwards, and cards must be the same suit.',
      'Any card may be moved onto an empty column.',
      'A complete run of thirteen cards, King down to Ace in one suit, moves itself to a foundation.',
      'There is no stock, so every card is dealt from the start.',
      'You win when all 52 cards are on the foundations.',
    ],
  },
  fortyThieves: {
    summary: 'Forty cards from a single deck, without the eights, tens or kings. Everything is face up.',
    points: [
      'Ten columns of four cards are dealt, all of them face up.',
      'Build tableau piles downwards in the same suit, never in alternate colours.',
      'Any card may be moved onto an empty column.',
      'The foundations are built up in suit from Ace to Ten.',
      'You win when all 40 cards are on the foundations.',
    ],
  },
  yukon: {
    summary: 'Seven long columns, no stock, and groups move whether they are in order or not.',
    points: [
      'The columns hold 1, 6, 7, 8, 9, 10 and 11 cards, with the top five of each column face up.',
      'Build tableau piles downwards in alternating colours.',
      'You may pick up any face up card along with the cards on top of it, even if they are not in order.',
      'Only a King may be moved onto an empty column.',
      'You win when all 52 cards are on the foundations.',
    ],
  },
};

export const SUIT_RULES = {
  4: 'One standard deck of all four suits.',
  2: 'Two copies each of spades and hearts, so every rank appears twice.',
  1: 'Four copies of a single suit, so every rank appears four times.',
};

export const DRAW_RULES = {
  1: 'The stock is turned over one card at a time.',
  3: 'The stock is turned over three cards at a time, and only the top card of the waste can be played.',
};
