import { BONUS_NAMES, EQUIP_SLOTS, ITEM_BY_ID, stackLabel, type EquipSlot, type Stack } from "../../shared/items.ts";
import type { C2S } from "../../shared/protocol.ts";
import { itemExamine } from "../info.ts";
import { itemIcon, slotOutline } from "../render/items.ts";
import type { Chatbox } from "./chatbox.ts";
import { hoverHtml, type ContextMenu, type MenuOption } from "./menu.ts";
import { bindPress } from "./press.ts";

const SLOT_NAMES: Record<EquipSlot, string> = {
  head: "Head", cape: "Cape", neck: "Neck", weapon: "Weapon", body: "Body", shield: "Shield",
  legs: "Legs", hands: "Hands", feet: "Feet", ring: "Ring", ammo: "Ammunition",
};

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/**
 * Worn equipment: eleven slots laid out on a figure (head at the top, feet at the bottom, weapon and
 * shield either side of the body), each empty one showing a faint outline of what goes there. Clicking
 * a worn item takes it off. "Equipment stats" swaps the figure for the bonuses and carried weight.
 */
export class EquipmentPanel {
  onHover: (html: string | null) => void = () => {};
  private items: Partial<Record<EquipSlot, Stack>> = {};
  private bonuses: number[] = BONUS_NAMES.map(() => 0);
  private weight = 0;
  private readonly slots = new Map<EquipSlot, HTMLButtonElement>();
  private readonly send: (msg: C2S) => void;
  private readonly chat: Chatbox;
  private readonly menu: ContextMenu;
  private readonly doll = document.getElementById("equipment-doll") as HTMLElement;
  private readonly stats = document.getElementById("equipment-stats") as HTMLElement;

  constructor(send: (msg: C2S) => void, chat: Chatbox, menu: ContextMenu) {
    this.send = send;
    this.chat = chat;
    this.menu = menu;
    const figure = document.getElementById("paperdoll") as HTMLElement;
    for (const slot of EQUIP_SLOTS) {
      const b = Object.assign(document.createElement("button"), { type: "button", className: "eq-slot" });
      b.dataset.slot = slot;
      b.style.gridArea = slot;
      b.append(Object.assign(document.createElement("img"), { alt: "", draggable: false }));
      b.append(Object.assign(document.createElement("span"), { className: "count" }));
      bindPress(b, {
        primary: () => { this.menu.close(); this.options(slot)[0]?.run(); this.onHover(hoverHtml(this.options(slot))); },
        menu: (x, y) => { const o = this.options(slot); if (o.length) this.menu.show(x, y, o); },
      });
      b.addEventListener("pointerenter", () => this.onHover(hoverHtml(this.options(slot))));
      b.addEventListener("pointerleave", () => this.onHover(null));
      figure.append(b);
      this.slots.set(slot, b);
    }
    document.getElementById("equipment-show-stats")!.addEventListener("click", () => this.showStats(true));
    document.getElementById("equipment-hide-stats")!.addEventListener("click", () => this.showStats(false));
    this.render();
  }

  set(items: Partial<Record<EquipSlot, Stack>>, bonuses: number[], weight: number): void {
    this.items = items;
    this.bonuses = bonuses;
    this.weight = weight;
    this.render();
  }

  get(slot: EquipSlot): Stack | undefined {
    return this.items[slot];
  }

  options(slot: EquipSlot): MenuOption[] {
    const s = this.items[slot], def = s ? ITEM_BY_ID.get(s.id) : undefined;
    if (!s || !def) return [];
    return [
      { verb: "Remove", target: def.name, kind: "item", run: () => this.send({ t: "unequip", where: slot }) },
      { verb: "Examine", target: def.name, kind: "item", run: () => this.chat.game(itemExamine(def, s.count)) },
    ];
  }

  private showStats(on: boolean): void {
    this.doll.hidden = on;
    this.stats.hidden = !on;
  }

  private render(): void {
    for (const [slot, b] of this.slots) {
      const s = this.items[slot], def = s ? ITEM_BY_ID.get(s.id) : undefined;
      const img = b.firstElementChild as HTMLImageElement, count = b.lastElementChild as HTMLElement;
      const src = s && def ? itemIcon(s.id) : slotOutline(slot);
      if (img.getAttribute("src") !== src) img.src = src;
      b.classList.toggle("empty", !def);
      b.setAttribute("aria-label", def ? `${SLOT_NAMES[slot]}: ${def.name}` : `${SLOT_NAMES[slot]}: empty`);
      const label = s && s.count > 1 ? stackLabel(s.count) : null;
      count.textContent = label?.text ?? "";
      count.className = label ? `count ${label.color}` : "count";
    }
    // Attack and defence side by side for each style, then the rest.
    const [stab, slash, crush, magic, ranged, dStab, dSlash, dCrush, dMagic, dRanged, strength, prayer] = this.bonuses.map((n) => signed(n ?? 0));
    const rows: Array<[string, string, string]> = [
      ["Stab", stab!, dStab!], ["Slash", slash!, dSlash!], ["Crush", crush!, dCrush!], ["Magic", magic!, dMagic!], ["Ranged", ranged!, dRanged!],
    ];
    const body = this.stats.querySelector("tbody")!;
    body.replaceChildren(...rows.map(([name, a, d]) => {
      const tr = document.createElement("tr");
      for (const text of [name, a, d]) tr.append(Object.assign(document.createElement(tr.childElementCount ? "td" : "th"), { textContent: text }));
      return tr;
    }));
    (document.getElementById("equipment-other") as HTMLElement).textContent = `Strength ${strength} · Prayer ${prayer}`;
    (document.getElementById("equipment-weight") as HTMLElement).textContent = `Weight: ${this.weight.toFixed(1)} kg`;
  }
}
