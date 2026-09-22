import assert from "node:assert/strict";
import { test } from "node:test";
import {
  attackRoll, combatLevel, defenceRoll, effectiveLevel, hitChance, maxHit, stanceBoost, styleAt, styleXp, stylesOf,
  swing, WEAPON_CLASSES, type Fighter,
} from "../src/shared/combat.ts";
import { BONUS_NAMES, ITEM_BY_KEY, item, type Bonuses } from "../src/shared/items.ts";
import { attacksOnSight, DROP_DENOMINATOR, levelOf, MONSTERS } from "../src/shared/monsters.ts";
import { levelForXp, noXp, readXp, SKILL_KEYS, xpForLevel } from "../src/shared/skills.ts";

const noBonus: Bonuses = BONUS_NAMES.map(() => 0);
const withBonus = (partial: Partial<Record<(typeof BONUS_NAMES)[number], number>>): Bonuses =>
  BONUS_NAMES.map((n) => partial[n] ?? 0);

const player = (levels: Partial<Fighter> = {}): Fighter =>
  ({ attack: 1, strength: 1, defence: 1, bonuses: noBonus, stance: "forceful", ...levels });

test("a fresh character starts at combat level 3, with Hitpoints at 10", () => {
  const xp = noXp();
  assert.equal(levelForXp(xp.hitpoints), 10);
  assert.equal(levelForXp(xp.attack), 1);
  assert.equal(combatLevel({ attack: 1, strength: 1, defence: 1, hitpoints: 10 }), 3);
});

test("a save from before the combat skills existed gains them at their starting levels", () => {
  const old = readXp({ woodcutting: 5000, mining: 0 });
  assert.equal(levelForXp(old.hitpoints), 10, "Hitpoints must not read back as level 1");
  assert.equal(old.woodcutting, 5000, "an existing skill keeps its XP");
  // A save that somehow holds less Hitpoints XP than the start is raised to it, never lowered.
  assert.equal(readXp({ hitpoints: 5 }).hitpoints, xpForLevel(10));
  assert.equal(readXp({ hitpoints: xpForLevel(40) }).hitpoints, xpForLevel(40));
});

test("a stance lends three levels to the skill it trains, one to each when balanced", () => {
  assert.equal(stanceBoost("forceful", "strength"), 3);
  assert.equal(stanceBoost("forceful", "attack"), 0);
  assert.equal(stanceBoost("balanced", "defence"), 1);
  // Player: level + stance + 8. Monster (no stance): level + 9.
  assert.equal(effectiveLevel(player({ strength: 20 }), "strength"), 20 + 3 + 8);
  assert.equal(effectiveLevel({ ...player({ strength: 20 }), stance: null }, "strength"), 20 + 9);
});

test("the max hit matches the classic's arithmetic", () => {
  // Bare-handed at level 1, fighting forcefully: (1 + 3 + 8) * 64 + 320, over 640.
  assert.equal(maxHit(player()), Math.floor((12 * 64 + 320) / 640));
  assert.equal(maxHit(player()), 1);
  // A strength bonus of 64 doubles the multiplier, so it doubles the hit.
  assert.equal(maxHit(player({ bonuses: withBonus({ Strength: 64 }) })), 2);
  assert.equal(maxHit(player({ strength: 99 })), Math.floor((110 * 64 + 320) / 640));
});

test("hit chance rises with the attack roll, and meets smoothly at real roll sizes", () => {
  // The weakest roll the game can produce: a level-1 fighter with the worst bonus in the bestiary.
  const smallest = 9 * (Math.min(...MONSTERS.map((m) => m.attackBonus)) + 64);
  assert.ok(smallest > 350, `real rolls are large (smallest ${smallest})`);
  for (const roll of [smallest, 640, 5000, 50_000]) {
    const below = hitChance(roll, roll), above = hitChance(roll + 1, roll);
    assert.ok(below <= above, `chance must not fall as the attack roll rises (${roll})`);
    assert.ok(above - below < 0.002, `the two cases meet without a step (${roll}: ${below} then ${above})`);
    assert.ok(below > 0.49 && below < 0.5, `even rolls are close to even odds (${roll}: ${below})`);
  }
  // Monotonic everywhere, including the small rolls where the two cases do step.
  let last = -1;
  for (let atk = 1; atk < 3000; atk += 7) {
    const p = hitChance(atk, 900);
    assert.ok(p >= last, `chance falls at attack roll ${atk}`);
    last = p;
  }
  assert.ok(hitChance(1_000_000, 1) > 0.99);
  assert.ok(hitChance(1, 1_000_000) < 0.01);
});

test("the rolls read the bonus for the type of blow thrown", () => {
  const f = player({ bonuses: withBonus({ Stab: 40, Slash: 0, "Slash defence": 80 }) });
  assert.equal(attackRoll(f, "stab"), effectiveLevel(f, "attack") * (40 + 64));
  assert.equal(attackRoll(f, "slash"), effectiveLevel(f, "attack") * 64);
  assert.equal(defenceRoll(f, "slash"), effectiveLevel(f, "defence") * (80 + 64));
  assert.equal(defenceRoll(f, "stab"), effectiveLevel(f, "defence") * 64);
});

test("a swing misses on a bad roll, and lands for no more than the max hit", () => {
  const attacker = player({ strength: 50, bonuses: withBonus({ Strength: 40, Slash: 40 }) });
  const defender = player({ defence: 1 });
  assert.equal(swing(attacker, defender, "slash", () => 0.999), 0, "a roll above the chance must miss");
  const most = maxHit(attacker);
  assert.equal(swing(attacker, defender, "slash", () => 0), 0, "the damage roll can land on zero");
  // Rolls: the first decides the hit, the second the damage. A damage roll just under 1 gives the max.
  const rolls = [0, 0.9999];
  assert.equal(swing(attacker, defender, "slash", () => rolls.shift()!), most);
});

test("every stance pays into Hitpoints, and only balanced splits three ways", () => {
  assert.deepEqual(styleXp("precise"), { attack: 40, hitpoints: 13 });
  assert.deepEqual(styleXp("forceful"), { strength: 40, hitpoints: 13 });
  assert.deepEqual(styleXp("guarded"), { defence: 40, hitpoints: 13 });
  assert.deepEqual(styleXp("balanced"), { attack: 13, strength: 13, defence: 13, hitpoints: 13 });
  for (const stance of ["precise", "forceful", "guarded", "balanced"] as const) {
    const xp = styleXp(stance);
    for (const key of Object.keys(xp)) assert.ok(SKILL_KEYS.includes(key as never), `${key} is a real skill`);
  }
});

test("every weapon class offers usable styles, and an out-of-range index is clamped", () => {
  for (const [name, cls] of Object.entries(WEAPON_CLASSES)) {
    assert.ok(cls.styles.length >= 3, `${name} needs at least three styles`);
    assert.ok(cls.speed >= 2 && cls.speed <= 8, `${name} swings at a sane speed`);
    const trained = new Set(cls.styles.map((s) => s.stance));
    assert.ok(trained.has("guarded"), `${name} must offer a defensive stance`);
    assert.ok(trained.has("forceful"), `${name} must offer an aggressive stance`);
    assert.equal(styleAt(name as never, 99), cls.styles.at(-1));
    assert.equal(styleAt(name as never, -5), cls.styles[0]);
  }
});

test("every weapon item names a class that exists", () => {
  for (const def of ITEM_BY_KEY.values()) {
    const cls = def.equip?.weapon;
    if (cls === undefined) continue;
    assert.equal(def.equip?.slot, "weapon", `${def.key} has a weapon class but is not worn in the weapon slot`);
    assert.ok(stylesOf(cls).length > 0, `${def.key} names the class ${cls}`);
  }
});

test("the bestiary is consistent: levels rise, drops exist, and a roll cannot overflow its table", () => {
  let previous = 0;
  const seen = new Set<string>();
  for (const def of MONSTERS) {
    assert.ok(!seen.has(def.key), `${def.key} appears once`);
    seen.add(def.key);
    const level = levelOf(def);
    assert.ok(level >= previous, `${def.key} (level ${level}) must not come before a weaker creature`);
    previous = level;
    assert.ok(def.hitpoints > 0 && def.maxHit > 0 && def.speed > 0, `${def.key} can fight`);
    assert.ok(def.respawn > 0 && def.wander >= 0 && def.aggro >= 0, `${def.key} has sane timings`);
    let weight = 0;
    for (const drop of def.drops.main ?? []) {
      assert.ok(ITEM_BY_KEY.has(drop.item), `${def.key} drops ${drop.item}, which exists`);
      assert.ok(drop.weight > 0, `${def.key}'s ${drop.item} has a share of the roll`);
      if (drop.max !== undefined) assert.ok(drop.max >= (drop.min ?? 1), `${def.key}'s ${drop.item} range runs upward`);
      weight += drop.weight;
    }
    assert.ok(weight <= DROP_DENOMINATOR, `${def.key}'s drop weights (${weight}) fit in ${DROP_DENOMINATOR}`);
    for (const drop of def.drops.always ?? []) assert.ok(ITEM_BY_KEY.has(drop.item), `${def.key} always drops ${drop.item}`);
  }
  assert.ok(MONSTERS.length >= 20, "the bestiary is worth having");
  assert.equal(levelOf(MONSTERS[0]!), 1, "the weakest creature is level 1");
  assert.ok(levelOf(MONSTERS.at(-1)!) >= 30, "the strongest is a real fight");
});

test("only a creature that starts fights does, and it leaves the strong alone", () => {
  const wolf = MONSTERS.find((m) => m.key === "grey_wolf")!;
  const cow = MONSTERS.find((m) => m.key === "cow")!;
  assert.equal(cow.aggro, 0);
  assert.equal(attacksOnSight(cow, 3), false, "a cow starts nothing");
  assert.equal(attacksOnSight(wolf, 3), true);
  assert.equal(attacksOnSight(wolf, 2 * levelOf(wolf)), true, "exactly twice its level is still fair game");
  assert.equal(attacksOnSight(wolf, 2 * levelOf(wolf) + 1), false, "above that it loses interest");
});

test("bread mends, and the items it mends with are real", () => {
  assert.equal(item("bread").action, "Eat");
  assert.ok((item("bread").heals ?? 0) > 0);
});
