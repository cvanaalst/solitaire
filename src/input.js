import { PILE, topOf } from './engine.js';
import { hitTest } from './layout.js';

const DRAG_THRESHOLD = 10;
const DOUBLE_TAP_MS = 320;

function groupFor(state, pile, index, cardIndex) {
  if (pile === PILE.TABLEAU) {
    const column = state.piles.tableau[index];
    const group = [];
    for (let i = cardIndex; i < column.length; i++) {
      if (!column[i].faceUp) return null;
      group.push(column[i]);
    }
    return group.length ? group : null;
  }
  if (pile === PILE.WASTE) {
    const card = topOf(state.piles.waste);
    return card ? [card] : null;
  }
  if (pile === PILE.FREECELL) {
    const card = topOf(state.piles.freeCells[index]);
    return card ? [card] : null;
  }
  return null;
}

function isWasteTop(state, element) {
  if (!element) return false;
  const waste = state.piles.waste;
  if (!waste.length) return false;
  return waste[waste.length - 1].id === element.dataset.id;
}

export class InputController {
  constructor(root, context) {
    this.root = root;
    this.context = context;
    this.pending = null;
    this.drag = null;
    this.lastTap = null;

    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onPointerCancel = this.onPointerCancel.bind(this);

    root.addEventListener('pointerdown', this.onPointerDown);
    root.addEventListener('pointermove', this.onPointerMove);
    root.addEventListener('pointerup', this.onPointerUp);
    root.addEventListener('pointercancel', this.onPointerCancel);
    root.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  localPoint(event) {
    const rect = this.root.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  onPointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const element = event.target.closest('.card');
    const point = this.localPoint(event);

    this.pending = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      element,
      pile: element ? element.dataset.pile : null,
      index: element ? Number(element.dataset.index) : null,
      column: element && element.dataset.column ? Number(element.dataset.column) : null,
      moved: false,
      point,
    };

    if (element) event.preventDefault();
  }

  onPointerMove(event) {
    const pending = this.pending;
    if (!pending || pending.pointerId !== event.pointerId) return;

    const dx = event.clientX - pending.startX;
    const dy = event.clientY - pending.startY;
    if (!pending.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;

    if (!pending.moved) {
      const started = this.startDrag(pending);
      if (!started) {
        pending.moved = true;
        return;
      }
    }

    if (this.drag) {
      const point = this.localPoint(event);
      this.drag.dx = point.x - this.drag.origin.x;
      this.drag.dy = point.y - this.drag.origin.y;
      this.applyDrag();
    }
  }

  startDrag(pending) {
    const state = this.context.state();
    const { pile, index, column } = pending;
    if (!pile || pile === PILE.STOCK) return false;
    if (pile === PILE.WASTE && !isWasteTop(state, pending.element)) return false;

    const cardIndex = pile === PILE.TABLEAU ? index : null;
    const group = groupFor(state, pile, column, cardIndex);
    if (!group) return false;

    const origin = pending.point;
    const elements = group.map((card) => this.context.renderer.cardElements.get(card.id)).filter(Boolean);
    if (!elements.length) return false;

    this.drag = {
      pointerId: pending.pointerId,
      pile,
      index: pile === PILE.TABLEAU ? column : index,
      cardIndex,
      group,
      elements,
      origin,
      dx: 0,
      dy: 0,
      bases: elements.map((element) => ({ x: element.__baseX, y: element.__baseY })),
    };

    elements.forEach((element) => {
      element.classList.add('is-dragging');
      element.style.zIndex = '9000';
    });

    if (this.root.setPointerCapture) {
      try {
        this.root.setPointerCapture(pending.pointerId);
      } catch (error) {
        void error;
      }
    }
    return true;
  }

  applyDrag() {
    const drag = this.drag;
    drag.elements.forEach((element, i) => {
      const base = drag.bases[i];
      if (!base) return;
      element.style.transform =
        'translate3d(' + (base.x + drag.dx) + 'px,' + (base.y + drag.dy) + 'px,0)';
    });
  }

  onPointerUp(event) {
    const pending = this.pending;
    this.pending = null;
    if (!pending || pending.pointerId !== event.pointerId) return;

    if (this.drag) {
      const point = this.localPoint(event);
      const drag = this.drag;
      this.drag = null;
      drag.elements.forEach((element) => element.classList.remove('is-dragging'));

      const layout = this.context.layout();
      const positions = this.context.positions();
      const target = hitTest(layout, positions, point.x, point.y);
      const from = { pile: drag.pile, index: drag.index, cardIndex: drag.cardIndex };

      if (target && this.context.tryMove(from, target)) {
        this.context.render();
      } else {
        this.context.render();
      }
      return;
    }

    this.handleTap(pending);
  }

  onPointerCancel(event) {
    const pending = this.pending;
    this.pending = null;
    if (!pending || pending.pointerId !== event.pointerId) return;
    if (this.drag) {
      this.drag.elements.forEach((element) => element.classList.remove('is-dragging'));
      this.drag = null;
      this.context.render();
    }
  }

  handleTap(pending) {
    const state = this.context.state();
    const selection = this.context.selection();
    const now = Date.now();

    if (!pending.element) {
      const target = this.context.slotAt(pending.point.x, pending.point.y);
      if (target && target.pile === PILE.STOCK) {
        this.context.onStockTap();
        return;
      }
      if (target && selection) {
        if (this.context.tryMove(selection, target)) this.context.render();
        return;
      }
      this.context.select(null);
      this.context.render();
      return;
    }

    const pile = pending.pile;
    const index = pending.index;
    const column = pending.column;
    const element = pending.element;

    if (pile === PILE.STOCK) {
      this.context.onStockTap();
      return;
    }

    if (pile === PILE.WASTE && !isWasteTop(state, element)) return;

    const cardId = element.dataset.id;
    const isDoubleTap = this.lastTap && this.lastTap.id === cardId && now - this.lastTap.time < DOUBLE_TAP_MS;
    this.lastTap = isDoubleTap ? null : { id: cardId, time: now };

    if (isDoubleTap) {
      const from = this.sourceFrom(state, pile, column, index);
      if (from) this.context.autoMove(from);
      this.context.render();
      return;
    }

    if (selection && !this.sameSource(selection, pile, column)) {
      const target = { pile, index: pile === PILE.TABLEAU || pile === PILE.FREECELL || pile === PILE.FOUNDATION ? index : 0 };
      if (this.context.tryMove(selection, target)) {
        this.context.render();
        return;
      }
    }

    const from = this.sourceFrom(state, pile, column, index);
    if (!from) {
      this.context.select(null);
      this.context.render();
      return;
    }

    if (from.pile === PILE.TABLEAU) {
      const tableauColumn = state.piles.tableau[from.index];
      const card = tableauColumn[from.cardIndex];
      if (!card.faceUp) {
        if (from.cardIndex === tableauColumn.length - 1) {
          this.context.onFlip(from.index);
        } else {
          this.context.select(null);
        }
        this.context.render();
        return;
      }
    }

    const current = this.context.selection();
    if (current && this.sameSource(current, pile, column)) {
      this.context.select(null);
      this.context.render();
      return;
    }

    this.context.select(from);
    this.context.render();
  }

  sameSource(selection, pile, column) {
    if (!selection) return false;
    if (selection.pile !== pile) return false;
    if (pile === PILE.TABLEAU) return selection.index === column;
    return true;
  }

  sourceFrom(state, pile, column, index) {
    if (pile === PILE.TABLEAU) {
      const tableauColumn = state.piles.tableau[column];
      if (!tableauColumn || !tableauColumn.length) return null;
      return { pile, index: column, cardIndex: index };
    }
    if (pile === PILE.WASTE) {
      if (!state.piles.waste.length) return null;
      return { pile, index: 0, cardIndex: null };
    }
    if (pile === PILE.FREECELL) {
      if (!state.piles.freeCells[index].length) return null;
      return { pile, index, cardIndex: null };
    }
    if (pile === PILE.FOUNDATION) {
      return { pile, index, cardIndex: null };
    }
    return null;
  }
}
