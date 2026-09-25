import { ITEM_BY_KEY, type Stack } from "../../shared/items.ts";
import { ELEMENT_RUNE, shortOf, SPELL_BY_KEY, spellMaxHit, SPELLS, type Element, type RuneKey, type Spell } from "../../shared/spells.ts";
import { hoverHtml, type ContextMenu, type MenuOption } from "./menu.ts";
import { bindPress } from "./press.ts";
import { spellIcon } from "./spellicons.ts";

/**
 * The spellbook tab (the magic plan): every spell as an icon in level order, dimmed below the caster's
 * level. A click chooses a spell to cast on the next creature clicked; a right click offers it to a staff
 * to cast on its own (autocast). The card beside the cursor gives the level, the runes with how many the
 * pack holds (short in red, what a staff stands in for said so), how hard it hits now, and what it is.
 */
export class SpellBook {
  /** Asks the server to set the spell a staff casts; an empty key stops it. */
  onAutocast: (key: string) => void = () => {};
  /** A spell was chosen to cast: whatever the inventory had chosen to "Use" is let go. */
  onChoose: () => void = () => {};
  /** A word for the chatbox, such as the level a spell still wants. */
  onSay: (text: string) => void = () => {};
  onHover: (html: string | null) => void = () => {};
  private level = 1;
  private items: Array<Stack | null> = [];
  private staff: Element | null = null;
  private holdsStaff = false;
  private autocast = "";
  private chosen: string | null = null;
  private readonly tip = document.getElementById("spell-tip") as HTMLElement;
  private readonly buttons = new Map<string, HTMLButtonElement>();
  private readonly menu: ContextMenu;

  constructor(menu: ContextMenu) {
    this.menu = menu;
    const grid = document.getElementById("spell-grid") as HTMLElement;
    for (const spell of SPELLS) {
      const button = Object.assign(document.createElement("button"), { type: "button", className: "spell" });
      button.dataset.spell = spell.key;
      button.setAttribute("aria-label", spell.name);
      button.append(Object.assign(document.createElement("img"), { src: spellIcon(spell), alt: "", draggable: false }));
      bindPress(button, {
        primary: () => {
          this.menu.close();
          this.options(spell)[0]?.run();
        },
        menu: (x, y) => this.menu.show(x, y, this.options(spell)),
      });
      button.addEventListener("pointerenter", () => {
        this.onHover(hoverHtml(this.options(spell)));
        this.showTip(spell, button);
      });
      button.addEventListener("pointerleave", () => {
        this.onHover(null);
        this.tip.hidden = true;
      });
      grid.append(button);
      this.buttons.set(spell.key, button);
    }
    window.addEventListener("keydown", (e) => { if (e.key === "Escape") this.letGo(); });
    this.render();
  }

  /** The Magic level, which decides what can be cast and how hard each tier hits. */
  setLevel(level: number): void {
    this.level = level;
    this.render();
  }

  /** The pack, for counting runes on the card. */
  setItems(items: Array<Stack | null>): void {
    this.items = items;
  }

  /** What is held: whether it is a staff at all (autocast is a staff's), and which element's runes it stands in for. */
  setWeapon(isStaff: boolean, element: Element | null): void {
    this.holdsStaff = isStaff;
    this.staff = element;
  }

  /** The spell the staff casts, as the server holds it ("" for none). */
  setAutocast(key: string): void {
    this.autocast = key;
    this.render();
  }

  /** The spell chosen to cast on the next creature clicked, while it waits for one. */
  chosenSpell(): { key: string; name: string } | null {
    const spell = this.chosen ? SPELL_BY_KEY.get(this.chosen) : undefined;
    return spell ? { key: spell.key, name: spell.name } : null;
  }

  /** Lets go of a chosen spell, as a click anywhere else does. */
  letGo(): void {
    if (this.chosen === null) return;
    this.chosen = null;
    this.render();
  }

  /** Every option a spell's icon offers, the default first. */
  options(spell: Spell): MenuOption[] {
    if (this.level < spell.level) {
      return [{ verb: "Examine", target: spell.name, kind: "item", run: () => this.onSay(`You need a Magic level of ${spell.level} to cast ${spell.name}.`) }];
    }
    const out: MenuOption[] = [{
      verb: "Cast", target: spell.name, kind: "item",
      run: () => {
        this.chosen = this.chosen === spell.key ? null : spell.key;
        if (this.chosen) this.onChoose();
        this.render();
      },
    }];
    if (this.holdsStaff && this.autocast !== spell.key) out.push({ verb: "Autocast", target: spell.name, kind: "item", run: () => this.onAutocast(spell.key) });
    if (this.autocast === spell.key) out.push({ verb: "Stop autocasting", target: spell.name, kind: "item", run: () => this.onAutocast("") });
    return out;
  }

  private held(rune: RuneKey): number {
    const id = ITEM_BY_KEY.get(rune)!.id;
    return this.items.reduce((n, s) => n + (s && s.id === id ? s.count : 0), 0);
  }

  private showTip(spell: Spell, button: HTMLElement): void {
    const short = new Set(shortOf(spell, (r) => this.held(r), this.staff).map((s) => s.rune));
    const lines = spell.runes.map(([rune, count]) => {
      const name = ITEM_BY_KEY.get(rune)!.name;
      if (this.staff !== null && ELEMENT_RUNE[this.staff] === rune) return `<div class="rune staffed">${count} ${name} — your staff</div>`;
      return `<div class="rune${short.has(rune) ? " short" : ""}">${count} ${name} (${this.held(rune)})</div>`;
    });
    const most = spellMaxHit(spell, Math.max(this.level, spell.level));
    this.tip.innerHTML = `<b>${spell.name}</b><div>Level ${spell.level}${this.level < spell.level ? " — not yet" : ""}</div>${lines.join("")}<div>Hits up to ${most}</div>`;
    this.tip.hidden = false;
    const grid = button.parentElement!.getBoundingClientRect(), r = button.getBoundingClientRect();
    this.tip.style.left = `${Math.max(0, Math.min(grid.width - this.tip.offsetWidth, r.left - grid.left - 20))}px`;
    this.tip.style.top = `${r.bottom - grid.top + 4}px`;
  }

  private render(): void {
    for (const spell of SPELLS) {
      const button = this.buttons.get(spell.key)!;
      button.classList.toggle("locked", this.level < spell.level);
      button.classList.toggle("autocast", this.autocast === spell.key);
      button.setAttribute("aria-pressed", String(this.chosen === spell.key));
    }
  }
}
