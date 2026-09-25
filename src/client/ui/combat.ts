import { combatLevel, DEFAULT_CLASS, stylesOf, type Stance, type Style, type WeaponClassName } from "../../shared/combat.ts";
import { ITEM_BY_ID } from "../../shared/items.ts";
import { levelForXp, noXp, SKILL_NAME, type SkillKey } from "../../shared/skills.ts";
import { SPELL_BY_KEY } from "../../shared/spells.ts";

/** What each stance is training, said plainly under its name. */
const TRAINS: Record<Stance, string> = {
  precise: "Attack",
  forceful: "Strength",
  guarded: "Defence",
  balanced: "Shared",
  aimed: "Ranged",
  quick: "Ranged, faster",
  far: "Ranged, Defence",
  casting: "Magic",
  warding: "Magic, Defence",
};

/** The line under a style's name: how it strikes and what it trains; a staff's casting styles name the spell they cast. */
function describe(style: Style, autocast: string): string {
  if (style.autocast) return `${SPELL_BY_KEY.get(autocast)?.name ?? "no spell chosen"} · ${TRAINS[style.stance]}`;
  return `${style.type} · ${TRAINS[style.stance]}`;
}

/**
 * The combat tab: the weapon in hand, the styles it offers, your combat level and whether being hit
 * starts a fight back. The styles come from the weapon, so picking up a different one changes them.
 */
export class CombatPanel {
  onStyle: (index: number) => void = () => {};
  onRetaliate: (on: boolean) => void = () => {};
  private weapon = 0;
  private style = 0;
  private retaliate = true;
  /** The spell a staff casts, by key ("" for none), as the server holds it. */
  private autocast = "";
  private xp = noXp();
  private readonly name = document.getElementById("combat-weapon") as HTMLElement;
  private readonly styles = document.getElementById("combat-styles") as HTMLElement;
  private readonly level = document.getElementById("combat-level") as HTMLElement;
  private readonly hitBack = document.getElementById("combat-retaliate") as HTMLButtonElement;

  constructor() {
    this.hitBack.addEventListener("click", () => {
      this.retaliate = !this.retaliate;
      this.render();
      this.onRetaliate(this.retaliate);
    });
    this.render();
  }

  /** The weapon being held (an item id, or 0 for bare hands), from the equipment the server sends. */
  setWeapon(id: number): void {
    if (id === this.weapon) return;
    this.weapon = id;
    // A weapon with fewer styles than the last one keeps the choice inside its list.
    this.style = Math.min(this.style, stylesOf(this.weaponClass).length - 1);
    this.render();
  }

  /** The chosen style, whether hitting back is on, and the spell a staff casts, as the server holds them. */
  set(style: number, retaliate: boolean, autocast = ""): void {
    this.style = style;
    this.retaliate = retaliate;
    this.autocast = autocast;
    this.render();
  }

  /** Every skill's XP, for the combat level. */
  setSkills(xp: Record<SkillKey, number>): void {
    this.xp = { ...noXp(), ...xp };
    this.render();
  }

  updateSkill(skill: SkillKey, xp: number): void {
    this.xp[skill] = xp;
    this.render();
  }

  private get weaponClass(): WeaponClassName {
    return ITEM_BY_ID.get(this.weapon)?.equip?.weapon ?? DEFAULT_CLASS;
  }

  private render(): void {
    const def = ITEM_BY_ID.get(this.weapon);
    this.name.textContent = def ? def.name : "Unarmed";
    const list = stylesOf(this.weaponClass);
    this.styles.replaceChildren(...list.map((style, i) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "combat-style";
      button.setAttribute("aria-pressed", String(i === this.style));
      button.innerHTML = "";
      button.append(
        document.createTextNode(style.name),
        Object.assign(document.createElement("small"), { textContent: describe(style, this.autocast) }),
      );
      button.addEventListener("click", () => {
        this.style = i;
        this.render();
        this.onStyle(i);
      });
      return button;
    }));
    const level = combatLevel({
      attack: levelForXp(this.xp.attack), strength: levelForXp(this.xp.strength),
      defence: levelForXp(this.xp.defence), hitpoints: levelForXp(this.xp.hitpoints),
      ranged: levelForXp(this.xp.ranged), magic: levelForXp(this.xp.magic), prayer: levelForXp(this.xp.prayer),
    });
    this.level.textContent = `Combat level: ${level}`;
    this.level.title = `${SKILL_NAME.attack} ${levelForXp(this.xp.attack)}, ${SKILL_NAME.strength} ${levelForXp(this.xp.strength)}, `
      + `${SKILL_NAME.defence} ${levelForXp(this.xp.defence)}, ${SKILL_NAME.hitpoints} ${levelForXp(this.xp.hitpoints)}, `
      + `${SKILL_NAME.ranged} ${levelForXp(this.xp.ranged)}, ${SKILL_NAME.magic} ${levelForXp(this.xp.magic)}, `
      + `${SKILL_NAME.prayer} ${levelForXp(this.xp.prayer)}`;
    this.hitBack.setAttribute("aria-pressed", String(this.retaliate));
    this.hitBack.textContent = this.retaliate ? "Hitting back: on" : "Hitting back: off";
  }
}
