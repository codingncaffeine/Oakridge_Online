import { ITEM_BY_KEY, type Stack } from "../../shared/items.ts";
import { TICK_MS } from "../../shared/constants.ts";
import { SKILL_NAME } from "../../shared/skills.ts";
import { autocastable, CHARGED_MAX_HIT, ELEMENT_RUNE, shortOf, SPELL_BY_KEY, spellMaxHit, SPELLS, type Element, type RuneKey, type Spell } from "../../shared/spells.ts";

/** An item's name with its article, lower case: "a tide orb". */
const aOrAnName = (key: string) => {
  const name = ITEM_BY_KEY.get(key)!.name.toLowerCase();
  return `${/^[aeiou]/.test(name) ? "an" : "a"} ${name}`;
};
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
  /** Casts a spell on oneself at once (a teleport, the bones spells). */
  onCastSelf: (key: string) => void = () => {};
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

  /** The spell chosen to cast on the next thing clicked, and what it is cast on, while it waits for one. */
  chosenSpell(): { key: string; name: string; on: "creature" | "item" | "ground" | "player" } | null {
    const spell = this.chosen ? SPELL_BY_KEY.get(this.chosen) : undefined;
    return spell ? { key: spell.key, name: spell.name, on: spell.on === "item" || spell.on === "ground" || spell.on === "player" ? spell.on : "creature" } : null;
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
    // A spell cast on oneself goes at the click; the rest are chosen, and wait for what they are cast on.
    const out: MenuOption[] = [spell.on === "self"
      ? { verb: "Cast", target: spell.name, kind: "item", run: () => this.onCastSelf(spell.key) }
      : {
        verb: "Cast", target: spell.name, kind: "item",
        run: () => {
          this.chosen = this.chosen === spell.key ? null : spell.key;
          if (this.chosen) this.onChoose();
          this.render();
        },
      }];
    if (this.holdsStaff && autocastable(spell) && this.autocast !== spell.key) out.push({ verb: "Autocast", target: spell.name, kind: "item", run: () => this.onAutocast(spell.key) });
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
    this.tip.innerHTML = `<b>${spell.name}</b><div>Level ${spell.level}${this.level < spell.level ? " — not yet" : ""}</div>${lines.join("")}<div>${this.does(spell)}</div>`;
    this.tip.hidden = false;
    const grid = button.parentElement!.getBoundingClientRect(), r = button.getBoundingClientRect();
    this.tip.style.left = `${Math.max(0, Math.min(grid.width - this.tip.offsetWidth, r.left - grid.left - 20))}px`;
    this.tip.style.top = `${r.bottom - grid.top + 4}px`;
  }

  /** What a spell does, in a line: how hard it hits, what it lowers, how long it holds, or what it reads. */
  private does(spell: Spell): string {
    const through = spell.staff ? `, through the ${ITEM_BY_KEY.get(spell.staff)!.name}` : "";
    switch (spell.kind) {
      case "strike": {
        const most = spellMaxHit(spell, Math.max(this.level, spell.level));
        if (spell.dart) return `Hits up to ${most}, a tenth of your Magic and ten more${through}`;
        if (spell.drains) return `Hits up to ${most} (${CHARGED_MAX_HIT} while charged)${through}, and lowers its ${SKILL_NAME[spell.drains.stat]} ${Math.round(spell.drains.share * 100)}% when it lands`;
        return `Hits up to ${most}${spell.undeadOnly ? ", on the dead alone" : ""}${through}`;
      }
      case "curse": return `Lowers its ${SKILL_NAME[spell.curse!.stat]} by ${Math.round(spell.curse!.share * 100)}% for a minute`;
      case "bind": return `Holds it where it stands for ${Math.round(((spell.holds ?? 0) * TICK_MS) / 100) / 10} seconds${spell.maxHit > 0 ? `, hitting up to ${spell.maxHit}` : ""}`;
      case "inspect": return "Reads out a creature's levels and how hard it hits";
      case "utility":
        if (spell.gild) return `Turns an item into ${spell.gild === 0.4 ? "two fifths" : "three fifths"} of its value in coins`;
        if (spell.bonesTo) return `Turns every bone in the pack into ${ITEM_BY_KEY.get(spell.bonesTo)!.name.toLowerCase()}`;
        if (spell.forge) return "Draws an ore's metal out into a bar, as a furnace would";
        if (spell.orb) return `Fills a glass orb in the pack, making ${aOrAnName(spell.orb.to)}`;
        if (spell.arrows) return "Enchants ten gem-tipped arrows in the pack; each gem asks its own Magic level and runes, from opal at 4 to onyx at 87";
        if (spell.enchants) return `Enchants a piece of ${spell.enchants.map((g) => g.replace("_", " ")).join(" or ")} jewellery in the pack`;
        if (spell.charge) return `For seven minutes Sunfall, Pyre and Wildclaw hit up to ${CHARGED_MAX_HIT}; once a minute at most`;
        return "Calls an item on the ground to the pack, from ten tiles over a clear line";
      case "teleport":
        return spell.hearth ? "Home to the Oakridge green: a long cast a step breaks, then half an hour's wait" : "Takes you to the town";
      case "send":
        return `Asks another player, ten tiles off at most, whether they will be sent to ${spell.name.replace(/^Send to /, "")}`;
    }
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
