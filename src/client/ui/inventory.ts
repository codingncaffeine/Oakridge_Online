import { INVENTORY_SIZE, ITEM_BY_ID, stackLabel, type ItemDef, type Stack } from "../../shared/items.ts";
import type { C2S } from "../../shared/protocol.ts";
import { itemExamine } from "../info.ts";
import { itemIcon } from "../render/items.ts";
import type { Chatbox } from "./chatbox.ts";
import { hoverHtml, type ContextMenu, type MenuOption } from "./menu.ts";
import { bindPress } from "./press.ts";

/** What left-clicking an item does first: wield or wear equipment, eat food; anything else is used. */
function firstVerb(def: ItemDef): string | null {
  if (def.equip) return def.equip.slot === "weapon" || def.equip.slot === "shield" ? "Wield" : "Wear";
  return def.action ?? null;
}

/**
 * The 28-slot inventory, four across and seven down. Left click takes an item's first option, right
 * click lists them all; dragging swaps two slots. "Use" picks an item (outlined in white) to use on the
 * next one clicked.
 */
export class InventoryPanel {
  /** Sets the hover text (markup from hoverHtml) while the cursor is over the inventory. */
  /** An item was chosen to "Use": a spell chosen in the spellbook is let go. */
  onChoose: () => void = () => {};
  /** The spell chosen in the spellbook to cast on an item in the pack (a gilding, Hand Forge); null otherwise. */
  castingOnItem: () => { key: string; name: string } | null = () => null;
  /** A spell cast on an item has gone: the spellbook lets go of it. */
  onCast: () => void = () => {};
  onHover: (html: string | null) => void = () => {};
  private items: Array<Stack | null> = new Array<Stack | null>(INVENTORY_SIZE).fill(null);
  /** The slot chosen with "Use", waiting for something to use it on. */
  private chosen: number | null = null;
  private readonly slots: HTMLButtonElement[] = [];
  private readonly send: (msg: C2S) => void;
  private readonly chat: Chatbox;
  private readonly menu: ContextMenu;
  private ghost: HTMLImageElement | null = null;

  constructor(send: (msg: C2S) => void, chat: Chatbox, menu: ContextMenu) {
    this.send = send;
    this.chat = chat;
    this.menu = menu;
    const grid = document.getElementById("inventory") as HTMLDivElement;
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const b = Object.assign(document.createElement("button"), { type: "button", className: "inv-slot" });
      b.dataset.slot = String(i);
      b.append(Object.assign(document.createElement("img"), { alt: "", draggable: false, hidden: true }));
      b.append(Object.assign(document.createElement("span"), { className: "count" }));
      bindPress(b, {
        primary: () => this.primary(i),
        menu: (x, y) => this.openMenu(i, x, y),
        dragStart: (x, y) => this.dragStart(i, x, y),
        dragMove: (x, y) => this.dragMove(x, y),
        dragEnd: (x, y) => this.dragEnd(i, x, y),
      });
      b.addEventListener("pointerenter", () => this.onHover(hoverHtml(this.options(i))));
      b.addEventListener("pointerleave", () => this.onHover(null));
      grid.append(b);
      this.slots.push(b);
    }
    window.addEventListener("keydown", (e) => { if (e.key === "Escape") this.letGo(); });
    this.render();
  }

  /** The server's inventory, slot by slot. */
  set(items: Array<Stack | null>): void {
    const had = this.chosen === null ? null : this.items[this.chosen];
    this.items = items.slice(0, INVENTORY_SIZE);
    // A chosen item that moved or went (dropped, eaten, swapped) is no longer chosen.
    if (this.chosen !== null && this.items[this.chosen]?.id !== had?.id) this.chosen = null;
    this.render();
  }

  get(slot: number): Stack | null {
    return this.items[slot] ?? null;
  }

  /** The item chosen with "Use" and where it sits, while it waits for something to be used on. */
  chosenItem(): { slot: number; name: string } | null {
    const def = this.chosen === null ? undefined : ITEM_BY_ID.get(this.items[this.chosen]?.id ?? 0);
    return def ? { slot: this.chosen!, name: def.name } : null;
  }

  /** Drops a pending "Use", as a click anywhere else does. */
  letGo(): void {
    if (this.chosen === null) return;
    this.chosen = null;
    this.render();
  }

  /** Every option for the item in `slot`, default first (empty for an empty slot). */
  options(slot: number): MenuOption[] {
    const s = this.items[slot], def = s ? ITEM_BY_ID.get(s.id) : undefined;
    if (!s || !def) return [];
    const casting = this.castingOnItem();
    if (casting) {
      return [{
        verb: "Cast", target: `${casting.name} -> ${def.name}`, kind: "item",
        run: () => { this.onCast(); this.send({ t: "cast_item", spell: casting.key, slot }); },
      }];
    }
    if (this.chosen !== null) {
      const from = this.chosen, used = ITEM_BY_ID.get(this.items[from]?.id ?? 0);
      if (from === slot || !used) return [];
      return [{
        verb: "Use", target: `${used.name} -> ${def.name}`, kind: "item",
        run: () => { this.letGo(); this.send({ t: "use_item", slot: from, on: slot }); },
      }];
    }
    const out: MenuOption[] = [];
    const verb = firstVerb(def);
    if (verb) out.push({ verb, target: def.name, kind: "item", run: () => this.send(def.equip ? { t: "equip", slot } : { t: "use", slot }) });
    out.push({ verb: "Use", target: def.name, kind: "item", run: () => this.choose(slot) });
    out.push({ verb: "Drop", target: def.name, kind: "item", run: () => this.send({ t: "drop", slot }) });
    out.push({ verb: "Examine", target: def.name, kind: "item", run: () => this.chat.game(itemExamine(def, s.count)) });
    return out;
  }

  private primary(slot: number): void {
    this.menu.close();
    const first = this.options(slot)[0];
    if (first) first.run();
    else this.letGo();
    this.onHover(hoverHtml(this.options(slot)));
  }

  private openMenu(slot: number, x: number, y: number): void {
    const options = this.options(slot);
    if (options.length) this.menu.show(x, y, options);
  }

  private choose(slot: number): void {
    this.chosen = slot;
    this.onChoose();
    this.render();
  }

  private dragStart(slot: number, x: number, y: number): boolean {
    const s = this.items[slot];
    if (!s) return false;
    this.menu.close();
    this.ghost = Object.assign(document.createElement("img"), { src: itemIcon(s.id), className: "drag-ghost", alt: "" });
    this.ghost.style.left = `${x - 18}px`;
    this.ghost.style.top = `${y - 16}px`;
    document.body.append(this.ghost);
    this.slots[slot]!.classList.add("dragging");
    return true;
  }

  private dragMove(x: number, y: number): void {
    if (!this.ghost) return;
    this.ghost.style.left = `${x - 18}px`;
    this.ghost.style.top = `${y - 16}px`;
  }

  /** Dropped on another slot: the two swap at once here, and the server's copy follows. */
  private dragEnd(from: number, x: number, y: number): void {
    this.ghost?.remove();
    this.ghost = null;
    this.slots[from]!.classList.remove("dragging");
    const over = Number.isFinite(x) ? (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>(".inv-slot") : null;
    const to = over ? Number(over.dataset.slot) : -1;
    if (to < 0 || to === from) return;
    [this.items[from], this.items[to]] = [this.items[to] ?? null, this.items[from] ?? null];
    if (this.chosen === from || this.chosen === to) this.chosen = null;
    this.render();
    this.send({ t: "swap", from, to });
  }

  private render(): void {
    this.items.forEach((s, i) => {
      const b = this.slots[i]!, img = b.firstElementChild as HTMLImageElement, count = b.lastElementChild as HTMLElement;
      const def = s ? ITEM_BY_ID.get(s.id) : undefined;
      if (s && def) {
        const src = itemIcon(s.id);
        if (img.getAttribute("src") !== src) img.src = src;
        img.hidden = false;
        b.setAttribute("aria-label", s.count > 1 ? `${def.name} (${s.count})` : def.name);
      } else {
        img.hidden = true;
        b.setAttribute("aria-label", "Empty slot");
      }
      // Stack counts show on anything with more than one: yellow, then white K, then green M.
      const label = s && s.count > 1 ? stackLabel(s.count) : null;
      count.textContent = label?.text ?? "";
      count.className = label ? `count ${label.color}` : "count";
      b.classList.toggle("chosen", this.chosen === i);
    });
  }
}
