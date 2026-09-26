/** How long a touch must be held to open the menu instead of taking the default option. */
export const LONG_PRESS_MS = 500;
/** How far a press may wander and still count as a click (a touch gets more room than a mouse). */
const SLOP = { mouse: 6, touch: 12 };

export interface PressHandlers {
  /** A click (mouse released without dragging) or a tap: the default option. */
  primary: (x: number, y: number) => void;
  /** Right click or a long touch: the menu. */
  menu: (x: number, y: number) => void;
  /** Called when a press on `el` moves past the click slop; return true to take it over as a drag. */
  dragStart?: (x: number, y: number) => boolean;
  dragMove?: (x: number, y: number) => void;
  dragEnd?: (x: number, y: number) => void;
}

/**
 * Keeps the browser's own drag-and-drop off a surface the player drags on (the map, the world, the character in
 * the designer). With any text selected that takes the surface in, Firefox answers a drag on it by lifting a
 * picture of it to drop elsewhere, and the surface never sees the drag: a press clears the selection first, and
 * a drag the browser starts anyway is refused. (A press on a canvas starts no selection of its own.)
 */
export function holdDrags(el: HTMLElement): void {
  el.addEventListener("pointerdown", () => window.getSelection()?.removeAllRanges());
  el.addEventListener("dragstart", (e) => e.preventDefault());
}

/**
 * Interface buttons the classic way: a left click takes the default option, a right click opens the
 * menu. On touch, a tap takes the default and holding opens the menu. A press that moves can become a drag.
 */
export function bindPress(el: HTMLElement, h: PressHandlers): void {
  let press: { id: number; x: number; y: number; touch: boolean; timer: number; dragging: boolean } | null = null;
  const end = () => {
    if (press) clearTimeout(press.timer);
    press = null;
  };
  el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const touch = e.pointerType === "touch", x = e.clientX, y = e.clientY;
    press = {
      id: e.pointerId, x, y, touch, dragging: false,
      timer: touch ? window.setTimeout(() => { end(); h.menu(x, y); }, LONG_PRESS_MS) : 0,
    };
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // A scripted event has no live pointer to capture; the element still gets its own events.
    }
    e.preventDefault();
  });
  el.addEventListener("pointermove", (e) => {
    if (!press || e.pointerId !== press.id) return;
    if (press.dragging) {
      h.dragMove?.(e.clientX, e.clientY);
    } else if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > SLOP[press.touch ? "touch" : "mouse"]) {
      clearTimeout(press.timer);
      if (h.dragStart?.(press.x, press.y)) {
        press.dragging = true;
        h.dragMove?.(e.clientX, e.clientY);
      } else if (press.touch) {
        end();
      }
    }
  });
  el.addEventListener("pointerup", (e) => {
    if (!press || e.pointerId !== press.id) return;
    const p = press;
    end();
    if (p.dragging) h.dragEnd?.(e.clientX, e.clientY);
    else if (Math.hypot(e.clientX - p.x, e.clientY - p.y) <= SLOP[p.touch ? "touch" : "mouse"]) h.primary(p.x, p.y);
  });
  el.addEventListener("pointercancel", () => {
    if (press?.dragging) h.dragEnd?.(NaN, NaN);
    end();
  });
  el.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    end();
    h.menu(e.clientX, e.clientY);
  });
}
