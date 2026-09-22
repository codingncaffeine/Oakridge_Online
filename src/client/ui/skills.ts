import { levelForXp, MAX_LEVEL, noXp, shownGain, SKILL_NAME, SKILLS, xpForLevel, type SkillKey } from "../../shared/skills.ts";
import { SKILL_ICONS } from "./skillicons.ts";

/** Whole XP with thousands separators, from tenths. */
const whole = (tenths: number) => Math.floor(tenths / 10).toLocaleString("en-GB");

/**
 * The skills tab: each skill's picture and level in the classic grid, with the total level beneath.
 * Hovering a skill shows its XP, where the next level starts and how much XP is left to get there.
 */
export class SkillsPanel {
  private xp = noXp();
  private readonly cells = new Map<SkillKey, HTMLElement>();
  private readonly total = document.getElementById("skills-total") as HTMLElement;
  private readonly tip = document.getElementById("skill-tip") as HTMLElement;

  constructor() {
    const grid = document.getElementById("skills-grid") as HTMLElement;
    for (const s of SKILLS) {
      const cell = document.createElement("div");
      cell.className = "skill";
      cell.dataset.skill = s.key;
      cell.innerHTML = `${SKILL_ICONS[s.key]}<span class="now"></span><span class="base"></span>`;
      cell.addEventListener("pointerenter", () => this.showTip(s.key, cell));
      cell.addEventListener("pointerleave", () => { this.tip.hidden = true; });
      grid.append(cell);
      this.cells.set(s.key, cell);
    }
    this.render();
  }

  /** Every skill's XP (tenths), as the server sends it on entering the world. */
  set(xp: Record<SkillKey, number>): void {
    this.xp = { ...noXp(), ...xp };
    this.render();
  }

  /** One skill's new XP total (tenths). Returns the whole XP it grew by, for the XP drop. */
  update(skill: SkillKey, xp: number): number {
    const before = this.xp[skill];
    this.xp[skill] = xp;
    this.render();
    return shownGain(before, xp);
  }

  private render(): void {
    let total = 0;
    for (const [key, cell] of this.cells) {
      const level = levelForXp(this.xp[key]);
      total += level;
      // Two numbers, as in the classic tab: the level as it stands now over the level itself (the same until boosts exist).
      cell.querySelector(".now")!.textContent = String(level);
      cell.querySelector(".base")!.textContent = String(level);
      cell.setAttribute("aria-label", `${SKILL_NAME[key]} level ${level}, ${whole(this.xp[key])} XP`);
    }
    this.total.textContent = `Total level: ${total}`;
  }

  private showTip(skill: SkillKey, cell: HTMLElement): void {
    const xp = this.xp[skill], level = levelForXp(xp);
    const lines = [`${SKILL_NAME[skill]} XP: ${whole(xp)}`];
    if (level < MAX_LEVEL) {
      const next = xpForLevel(level + 1);
      lines.push(`Next level at: ${whole(next)}`, `Remaining XP: ${(Math.floor(next / 10) - Math.floor(xp / 10)).toLocaleString("en-GB")}`);
    }
    this.tip.replaceChildren(...lines.map((text) => Object.assign(document.createElement("div"), { textContent: text })));
    this.tip.hidden = false;
    // Just under the cell, kept inside the panel.
    const page = this.tip.offsetParent as HTMLElement | null, r = cell.getBoundingClientRect(), box = page?.getBoundingClientRect();
    if (!box) return;
    this.tip.style.top = `${r.bottom - box.top + 2}px`;
    this.tip.style.left = `${Math.max(2, Math.min(box.width - this.tip.offsetWidth - 2, r.left - box.left))}px`;
  }
}

/** XP drops: the skill's picture and the XP just earned, rising beside the minimap and fading out. */
export class XpDrops {
  private readonly box = document.getElementById("xp-drops") as HTMLElement;

  /** Shows a drop for a gain of `amount` whole XP (nothing for less than one); returns it for previews. */
  show(skill: SkillKey, amount: number): HTMLElement | null {
    if (amount <= 0) return null;
    const el = document.createElement("div");
    el.className = "xp-drop";
    el.dataset.skill = skill;
    el.innerHTML = SKILL_ICONS[skill];
    el.append(Object.assign(document.createElement("span"), { textContent: `+${amount.toLocaleString("en-GB")}` }));
    this.box.append(el);
    el.addEventListener("animationend", () => el.remove());
    return el;
  }
}
