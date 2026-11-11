import { PILE, topOf } from './engine.js';

export const CARD_ASPECT = 0.714;

export function computeLayout(variant, width, height) {
  const columns = variant.tableauRows.length;
  const shortSide = Math.min(width, height);
  const pad = Math.max(10, Math.round(shortSide * 0.014));
  const gap = Math.max(5, Math.round(width * 0.0065));
  const topGap = Math.max(12, Math.round(height * 0.03));

  const leftSlots = variant.stock ? (variant.waste ? 2 : 1) : variant.freeCells;
  const rightSlots = variant.foundations;
  const topSlots = leftSlots + rightSlots;
  const separation = variant.freeCells > 0 ? 0.45 : 0;

  const widthForTop = (width - pad * 2 - gap * (topSlots - 1)) / (topSlots + separation);
  const widthForTableau = (width - pad * 2 - gap * (columns - 1)) / columns;

  let cardW = Math.min(widthForTop, widthForTableau);
  let cardH = cardW / CARD_ASPECT;

  const availH = height - pad * 2 - topGap;
  const viableCardH = availH / 2.55;
  if (cardH > viableCardH) {
    cardH = viableCardH;
    cardW = cardH * CARD_ASPECT;
  }

  const tableY = pad + cardH + topGap;
  const tableBottom = height - pad;

  const tableauWidth = columns * cardW + (columns - 1) * gap;
  const tableauStart = Math.max(pad, (width - tableauWidth) / 2);

  const foundations = [];
  for (let i = 0; i < rightSlots; i++) {
    const x = width - pad - (rightSlots - i) * cardW - (rightSlots - 1 - i) * gap;
    foundations.push({ x, y: pad, w: cardW, h: cardH });
  }

  const foundationsLeft = foundations.length ? foundations[0].x : width;
  const stock = { x: pad, y: pad, w: cardW, h: cardH };
  const waste = { x: pad + cardW + gap, y: pad, w: cardW, h: cardH };
  const freeCells = [];
  for (let i = 0; i < variant.freeCells; i++) {
    freeCells.push({ x: pad + i * (cardW + gap), y: pad, w: cardW, h: cardH });
  }

  const wasteRoom = foundationsLeft - (waste.x + cardW) - gap;
  const wasteFan = wasteRoom > 12 ? Math.min(cardW * 0.34, wasteRoom / 2) : 0;

  const tableau = [];
  for (let i = 0; i < columns; i++) {
    tableau.push({ x: tableauStart + i * (cardW + gap), y: tableY, w: cardW, h: cardH });
  }

  const estimatedDepth = 13;
  const fanUp = cardH * 0.30;
  const fanMin = cardH * 0.11;
  const fanDown = Math.max(6, cardH * 0.09);
  const regionH = tableBottom - tableY;
  const roomPerStep = Math.max(0, regionH - cardH) / (estimatedDepth - 1);
  const fanUpFitted = Math.max(fanMin, Math.min(fanUp, roomPerStep));

  return {
    width,
    height,
    hasWaste: Boolean(variant.waste),
    cardW,
    cardH,
    pad,
    gap,
    topGap,
    tableY,
    tableBottom,
    stock,
    waste,
    wasteFan,
    freeCells,
    foundations,
    tableau,
    fanUp: fanUpFitted,
    fanMin,
    fanDown,
  };
}

function columnPositions(layout, column, columnIndex) {
  const count = column.length;
  const positions = [];
  if (!count) return positions;

  const baseX = layout.tableau[columnIndex].x;
  const startY = layout.tableau[columnIndex].y;

  let firstUp = count;
  for (let i = 0; i < count; i++) {
    if (column[i].faceUp) {
      firstUp = i;
      break;
    }
  }
  const downCount = firstUp;
  const upCount = count - firstUp;

  let upStep = layout.fanUp;
  const needed = downCount * layout.fanDown + upCount * upStep + layout.cardH;
  const available = layout.tableBottom - startY;
  if (needed > available && upCount > 1) {
    const room = Math.max(0, available - layout.cardH - downCount * layout.fanDown);
    upStep = Math.max(layout.fanMin, Math.min(layout.fanUp, room / (upCount - 1)));
  }

  let y = startY;
  for (let i = 0; i < count; i++) {
    positions.push({ x: baseX, y, strip: layout.cardH });
    y += i < firstUp ? layout.fanDown : upStep;
  }
  for (let i = 0; i < count - 1; i++) {
    positions[i].strip = positions[i + 1].y - positions[i].y;
  }
  return positions;
}

export function computePositions(layout, state) {
  const piles = state.piles;
  const cards = new Map();
  const place = (card, pile, index, x, y, column = null, strip = null) => {
    if (!card) return;
    cards.set(card.id, { card, pile, index, x, y, column, strip });
  };

  const stockTop = topOf(piles.stock);
  if (stockTop) {
    place(stockTop, PILE.STOCK, piles.stock.length - 1, layout.stock.x, layout.stock.y, null, layout.cardH);
  }

  const wasteCount = piles.waste.length;
  const wasteVisible = Math.min(3, wasteCount);
  for (let i = 0; i < wasteVisible; i++) {
    const index = wasteCount - wasteVisible + i;
    const card = piles.waste[index];
    const isTop = index === wasteCount - 1;
    place(
      card,
      PILE.WASTE,
      index,
      layout.waste.x + i * layout.wasteFan,
      layout.waste.y,
      null,
      isTop ? layout.cardH : Math.max(12, layout.wasteFan)
    );
  }

  piles.foundations.forEach((col, index) => {
    const card = topOf(col);
    if (card) {
      place(card, PILE.FOUNDATION, index, layout.foundations[index].x, layout.foundations[index].y, null, layout.cardH);
    }
  });

  piles.freeCells.forEach((col, index) => {
    const card = topOf(col);
    if (card) {
      place(card, PILE.FREECELL, index, layout.freeCells[index].x, layout.freeCells[index].y, null, layout.cardH);
    }
  });

  piles.tableau.forEach((col, index) => {
    const positions = columnPositions(layout, col, index);
    positions.forEach((pos, i) => {
      place(col[i], PILE.TABLEAU, i, pos.x, pos.y, index, pos.strip);
    });
  });

  return cards;
}

export function hitTest(layout, positions, x, y) {
  const piles = [
    { pile: PILE.FOUNDATION, index: 0, rects: layout.foundations },
    { pile: PILE.FREECELL, index: 0, rects: layout.freeCells },
  ];

  for (const group of piles) {
    for (let i = 0; i < group.rects.length; i++) {
      const rect = group.rects[i];
      if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) {
        return { pile: group.pile, index: i };
      }
    }
  }

  for (let i = 0; i < layout.tableau.length; i++) {
    const rect = layout.tableau[i];
    if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= layout.tableBottom) {
      return { pile: PILE.TABLEAU, index: i };
    }
  }

  if (
    x >= layout.stock.x && x <= layout.stock.x + layout.stock.w &&
    y >= layout.stock.y && y <= layout.stock.y + layout.stock.h
  ) {
    return { pile: PILE.STOCK, index: 0 };
  }

  if (layout.hasWaste) {
    const wasteLeft = layout.waste.x;
    const wasteRight = layout.waste.x + layout.cardW + 2 * layout.wasteFan;
    if (
      x >= wasteLeft && x <= wasteRight &&
      y >= layout.waste.y && y <= layout.waste.y + layout.waste.h
    ) {
      return { pile: PILE.WASTE, index: 0 };
    }
  }

  return null;
}
