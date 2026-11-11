import { PILE } from './engine.js';
import { computePositions } from './layout.js';
import { RANK_LABEL, SUIT_SYMBOL, isRed } from './cards.js';

function createCardElement(card) {
  const element = document.createElement('div');
  element.className = 'card';
  element.dataset.id = card.id;

  const front = document.createElement('div');
  front.className = 'card-face card-front' + (isRed(card.suit) ? ' red' : '');

  const topLeft = document.createElement('div');
  topLeft.className = 'corner corner-tl';
  const rank = document.createElement('span');
  rank.className = 'rank';
  rank.textContent = RANK_LABEL[card.rank];
  const suit = document.createElement('span');
  suit.className = 'suit';
  suit.textContent = SUIT_SYMBOL[card.suit];
  topLeft.append(rank, suit);

  const pip = document.createElement('div');
  pip.className = 'pip';
  pip.textContent = SUIT_SYMBOL[card.suit];

  front.append(topLeft, pip);

  const back = document.createElement('div');
  back.className = 'card-face card-back';

  element.append(front, back);
  return element;
}

export class Renderer {
  constructor(root) {
    this.root = root;
    this.cardElements = new Map();
    this.slotElements = new Map();
    this.badgeElements = new Map();
    this.dealTimer = null;
  }

  dealOrigin(layout, spec) {
    if (spec.stock) {
      return { x: layout.stock.x, y: layout.stock.y };
    }
    return { x: Math.round((layout.width - layout.cardW) / 2), y: layout.height + 20 };
  }

  setVariant(variant, layout) {
    this.root.textContent = '';
    this.cardElements.clear();
    this.slotElements.clear();
    this.badgeElements.clear();

    const foundationSuits = variant.foundationSuits || [];

    const addSlot = (pile, index, extraClass) => {
      const slot = document.createElement('div');
      slot.className = 'slot' + (extraClass ? ' ' + extraClass : '');
      slot.dataset.pile = pile;
      slot.dataset.index = String(index);
      const rect = this.rectFor(pile, index, layout);
      slot.style.left = rect.x + 'px';
      slot.style.top = rect.y + 'px';
      slot.style.width = rect.w + 'px';
      slot.style.height = rect.h + 'px';
      this.root.appendChild(slot);
      this.slotElements.set(pile + ':' + index, slot);
    };

    if (variant.stock) addSlot(PILE.STOCK, 0, 'slot-stock');
    if (variant.waste) addSlot(PILE.WASTE, 0, 'slot-waste');
    for (let i = 0; i < variant.freeCells; i++) addSlot(PILE.FREECELL, i);
    for (let i = 0; i < variant.foundations; i++) {
      addSlot(PILE.FOUNDATION, i, 'slot-foundation');
      const slot = this.slotElements.get(PILE.FOUNDATION + ':' + i);
      const mark = document.createElement('span');
      mark.className = 'slot-mark';
      const suit = foundationSuits[i % Math.max(1, foundationSuits.length)];
      mark.textContent = SUIT_SYMBOL[suit] || '';
      slot.appendChild(mark);
    }
    for (let i = 0; i < variant.tableauRows.length; i++) {
      addSlot(PILE.TABLEAU, i, 'slot-tableau');
    }
  }

  layoutSlots(layout) {
    this.slotElements.forEach((element, key) => {
      const separator = key.lastIndexOf(':');
      const pile = key.slice(0, separator);
      const index = Number(key.slice(separator + 1));
      const rect = this.rectFor(pile, index, layout);
      element.style.left = rect.x + 'px';
      element.style.top = rect.y + 'px';
      element.style.width = rect.w + 'px';
      element.style.height = rect.h + 'px';
    });
  }

  rectFor(pile, index, layout) {
    if (pile === PILE.STOCK) return layout.stock;
    if (pile === PILE.WASTE) return layout.waste;
    if (pile === PILE.FREECELL) return layout.freeCells[index];
    if (pile === PILE.FOUNDATION) return layout.foundations[index];
    return layout.tableau[index];
  }

  render(state, layout, view = {}) {
    const positions = view.positions || computePositions(layout, state);
    const selection = view.selection || null;
    const hint = view.hint || null;
    const targets = view.targets || [];

    this.layoutSlots(layout);

    const targetKeys = new Set(targets.map((target) => target.pile + ':' + target.index));
    this.slotElements.forEach((element, key) => {
      element.classList.toggle('is-target', targetKeys.has(key));
    });

    const live = new Set();
    positions.forEach((info, id) => live.add(id));

    for (const [id, element] of this.cardElements) {
      if (!live.has(id)) {
        element.remove();
        this.cardElements.delete(id);
      }
    }

    const selectedIds = new Set();
    if (selection && selection.pile === PILE.TABLEAU) {
      const column = state.piles.tableau[selection.index];
      for (let i = selection.cardIndex; i < column.length; i++) selectedIds.add(column[i].id);
    } else if (selection) {
      const card = this.cardForSelection(state, selection);
      if (card) selectedIds.add(card.id);
    }

    const hintIds = new Set();
    if (hint) {
      const card = this.cardForSelection(state, hint.from);
      if (card) hintIds.add(card.id);
    }

    const deal = Boolean(view.dealAnimation);
    const origin = deal ? this.dealOrigin(layout, view.spec || { stock: false }) : null;

    positions.forEach((info, id) => {
      let element = this.cardElements.get(id);
      if (!element) {
        element = createCardElement(info.card);
        this.root.appendChild(element);
        this.cardElements.set(id, element);
      }

      element.classList.toggle('is-up', info.card.faceUp);
      element.classList.toggle('is-selected', selectedIds.has(id));
      element.classList.toggle('is-hint', hintIds.has(id));
      const strip = info.strip || layout.cardH;
      element.classList.toggle('is-fanned', strip < layout.cardH * 0.62);
      element.dataset.pile = info.pile;
      element.dataset.index = String(info.index);
      element.dataset.column = info.pile === PILE.TABLEAU ? String(info.column) : '';
      element.__baseX = info.x;
      element.__baseY = info.y;
      element.style.setProperty('--strip', (info.strip || layout.cardH) + 'px');
      element.style.transform = 'translate3d(' + info.x + 'px,' + info.y + 'px,0)';
      element.style.zIndex = String(this.zIndex(info));
    });

    if (deal) this.playDeal(positions, origin, layout);

    this.updateBadges(state, layout);
  }

  playDeal(positions, origin, layout) {
    if (this.dealTimer) clearTimeout(this.dealTimer);

    const order = [];
    positions.forEach((info, id) => {
      order.push({ id, info });
    });
    order.sort((a, b) => (a.info.x || 0) - (b.info.x || 0) || (a.info.y || 0) - (b.info.y || 0));

    order.forEach((entry, index) => {
      const element = this.cardElements.get(entry.id);
      if (!element) return;
      element.style.transitionDelay = index * 22 + 'ms';
      element.style.transform = 'translate3d(' + origin.x + 'px,' + origin.y + 'px,0)';
    });

    requestAnimationFrame(() => {
      order.forEach((entry) => {
        const element = this.cardElements.get(entry.id);
        if (!element) return;
        element.style.transform = 'translate3d(' + entry.info.x + 'px,' + entry.info.y + 'px,0)';
      });
    });

    this.dealTimer = setTimeout(() => {
      this.dealTimer = null;
      this.cardElements.forEach((element) => {
        element.style.transitionDelay = '0ms';
      });
    }, 1200);
  }

  cardForSelection(state, selection) {
    if (!selection) return null;
    const piles = state.piles;
    if (selection.pile === PILE.WASTE) {
      return piles.waste.length ? piles.waste[piles.waste.length - 1] : null;
    }
    if (selection.pile === PILE.FREECELL) {
      const cell = piles.freeCells[selection.index];
      return cell.length ? cell[cell.length - 1] : null;
    }
    if (selection.pile === PILE.FOUNDATION) {
      const col = piles.foundations[selection.index];
      return col.length ? col[col.length - 1] : null;
    }
    if (selection.pile === PILE.TABLEAU) {
      const column = piles.tableau[selection.index];
      return column[selection.cardIndex] || null;
    }
    return null;
  }

  zIndex(info) {
    if (info.pile === PILE.TABLEAU) return 20 + info.index;
    if (info.pile === PILE.FOUNDATION) return 10;
    if (info.pile === PILE.FREECELL) return 10;
    if (info.pile === PILE.WASTE) return 40 + info.index;
    return 30;
  }

  updateBadges(state, layout) {
    const setBadge = (pile, index, text) => {
      const key = 'badge-' + pile + ':' + index;
      let badge = this.badgeElements.get(key);
      if (!text) {
        if (badge) {
          badge.remove();
          this.badgeElements.delete(key);
        }
        return;
      }
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'badge';
        this.root.appendChild(badge);
        this.badgeElements.set(key, badge);
      }
      const rect = this.rectFor(pile, index, layout);
      badge.textContent = text;
      badge.style.left = rect.x + rect.w - layout.cardW * 0.34 + 'px';
      badge.style.top = rect.y + layout.cardH - layout.cardH * 0.34 + 'px';
      badge.style.zIndex = '200';
    };

    setBadge(PILE.STOCK, 0, state.piles.stock.length ? String(state.piles.stock.length) : '');
    setBadge(PILE.WASTE, 0, state.piles.waste.length ? String(state.piles.waste.length) : '');
  }
}
