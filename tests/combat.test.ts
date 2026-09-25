import assert from "node:assert/strict";
import { test } from "node:test";
import {
  attackRoll, combatLevel, defenceRoll, effectiveLevel, hitChance, lands, maxHit, rangedMaxHit, rangeOf, stanceBoost, styleAt, styleXp,
  stylesOf, swing, WEAPON_CLASSES, type Fighter, type Style,
} from "../src/shared/combat.ts";
import { BONUS_NAMES, ITEM_BY_KEY, item, type Bonuses } from "../src/shared/items.ts";
import { attacksOnSight, DROP_DENOMINATOR, levelOf, MONSTERS, RARE_DENOMINATOR } from "../src/shared/monsters.ts";
import { mulberry32 } from "../src/shared/rng.ts";
import { levelForXp, noXp, readXp, SKILL_KEYS, xpForLevel } from "../src/shared/skills.ts";

const noBonus: Bonuses = BONUS_NAMES.map(() => 0);
const withBonus = (partial: Partial<Record<(typeof BONUS_NAMES)[number], number>>): Bonuses =>
  BONUS_NAMES.map((n) => partial[n] ?? 0);

const player = (levels: Partial<Fighter> = {}): Fighter =>
  ({ attack: 1, strength: 1, defence: 1, ranged: 1, magic: 1, bonuses: noBonus, rangedStrength: 0, boosts: {}, stance: "forceful", ...levels });

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

/**
 * Levelling Attack has to land more blows — that is what the skill is for, and the one thing a player
 * feels. It is checked at the LEVEL, not at the roll: a bonus, a stance or the flat +8 could go astray
 * between the two. The rolled share is checked against it too, because a formula nothing rolls against
 * is half an answer — and a hitsplat cannot stand in for this, since a landed blow that rolls no damage
 * looks exactly like a miss.
 */
test("a higher Attack lands more blows, and what is rolled agrees with the chance", () => {
  const wolf = MONSTERS.find((m) => m.key === "grey_wolf")!;
  const defender: Fighter = player({
    attack: wolf.attack, strength: wolf.strength, defence: wolf.defence, stance: null,
    bonuses: withBonus({ "Stab defence": wolf.defenceBonus.stab, "Slash defence": wolf.defenceBonus.slash }),
  });
  const fighter = (attack: number): Fighter => player({ attack, bonuses: withBonus({ Slash: 7 }), stance: "precise" });
  const chanceAt = (attack: number) => hitChance(attackRoll(fighter(attack), "slash"), defenceRoll(defender, "slash"));

  let last = 0;
  for (let attack = 1; attack <= 99; attack++) {
    const now = chanceAt(attack);
    assert.ok(now > last, `Attack ${attack} must land more often than ${attack - 1} (${last} then ${now})`);
    last = now;
  }
  assert.ok(chanceAt(1) < 0.45, `a beginner misses this thing often (${chanceAt(1).toFixed(3)})`);
  assert.ok(chanceAt(99) > 0.9, `a master rarely misses it (${chanceAt(99).toFixed(3)})`);
  assert.ok(chanceAt(50) - chanceAt(1) > 0.3, "and the climb between them is worth feeling");

  // What the game actually rolls, against what was asked for. Fixed seeds, so it cannot flake.
  for (const attack of [1, 30, 99]) {
    const rand = mulberry32(attack * 31 + 7);
    const me = fighter(attack), rolls = 20_000;
    let landed = 0;
    for (let i = 0; i < rolls; i++) if (lands(me, defender, "slash", rand)) landed++;
    const want = chanceAt(attack);
    assert.ok(
      Math.abs(landed / rolls - want) < 0.015,
      `Attack ${attack}: ${(landed / rolls * 100).toFixed(1)}% landed against ${(want * 100).toFixed(1)}% asked for`,
    );
  }
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
  // Rolls: the first decides the hit, the second the damage. The damage roll is read from the top,
  // so 0 is the hardest blow and a roll just under 1 is the softest.
  assert.equal(swing(attacker, defender, "slash", () => 0), most, "a pinned run hits for everything it has");
  const rolls = [0, 0.9999];
  assert.equal(swing(attacker, defender, "slash", () => rolls.shift()!), 1, "and a blow a player lands is never nothing");
});

/**
 * A blow a player gets through is worth at least one, however weakly it rolls; a creature's can still
 * come to nothing. Bare-handed at level 1 the max hit is 1, so without this half of every blow that
 * got through showed a nought and read to the player as a miss — which is most of what made the
 * beginning feel like nothing was happening.
 */
test("a player's landed blow is never a nothing, and a creature's still can be", () => {
  const weakest = player({ strength: 1 });
  assert.equal(maxHit(weakest), 1, "the softest fighter in the game hits for one");
  const defender = player({ defence: 1 });
  // The first roll lands the blow, the second is the softest damage there is.
  const softest = () => {
    const rolls = [0, 0.9999];
    return () => rolls.shift()!;
  };
  assert.equal(swing(weakest, defender, "crush", softest()), 1, "so every blow it lands is worth one");
  // The control: the same rolls from a creature (which has no stance) land for nothing, as they should.
  const creature: Fighter = { ...weakest, stance: null };
  assert.equal(swing(creature, defender, "crush", softest()), 0, "a creature's blow can still come to nothing");
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
    const styles: readonly Style[] = cls.styles;
    const trained = new Set(styles.map((s) => s.stance));
    if (name === "bow") {
      // A bow shoots: an aimed stance, a quick one, and a far one that trains Defence as well.
      assert.deepEqual([...trained], ["aimed", "quick", "far"]);
      for (const s of styles) assert.equal(s.type, "ranged", `${s.name} is a shot`);
      assert.ok(styles.every((s) => (s.range ?? 0) >= 7), "every shot carries at least seven tiles");
    } else if (name === "staff") {
      // A staff casts the spell it is set to, plainly or warding, and can still be swung, and it keeps a guard.
      const casting = styles.filter((s) => s.autocast);
      assert.equal(casting.length, 2, "a staff offers its two ways of casting");
      for (const s of casting) assert.ok(s.type === "magic" && (s.range ?? 0) >= 8, `${s.name} casts from tiles off`);
      assert.ok(trained.has("guarded"), "a staff must offer a defensive stance");
      assert.ok(trained.has("forceful"), "and a swing for an empty pouch");
    } else {
      assert.ok(trained.has("guarded"), `${name} must offer a defensive stance`);
      assert.ok(trained.has("forceful"), `${name} must offer an aggressive stance`);
      for (const s of styles) assert.equal(rangeOf(s), 1, `${s.name} is thrown from beside the target`);
    }
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

/** What one roll of a drop is worth at most: the item's value, times the largest count it can leave. */
const valueOf = (drop: { item: string; min?: number; max?: number }) =>
  (ITEM_BY_KEY.get(drop.item)?.value ?? 0) * (drop.max ?? drop.min ?? 1);

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
    // The rare table, out of its own larger denominator, and worth more than the main one or it is
    // not a rare table at all.
    let rareWeight = 0;
    const mainValue = Math.max(0, ...(def.drops.main ?? []).map((d) => valueOf(d)));
    for (const drop of def.drops.rare ?? []) {
      assert.ok(ITEM_BY_KEY.has(drop.item), `${def.key} rarely drops ${drop.item}, which exists`);
      assert.ok(drop.weight > 0, `${def.key}'s rare ${drop.item} has a share of the roll`);
      if (drop.max !== undefined) assert.ok(drop.max >= (drop.min ?? 1), `${def.key}'s rare ${drop.item} range runs upward`);
      assert.ok(valueOf(drop) > mainValue, `${def.key}'s rare ${drop.item} beats anything on its main table`);
      rareWeight += drop.weight;
    }
    assert.ok(rareWeight <= RARE_DENOMINATOR, `${def.key}'s rare weights (${rareWeight}) fit in ${RARE_DENOMINATOR}`);
    assert.ok(rareWeight < RARE_DENOMINATOR / 8, `${def.key}'s rare table stays rare (${rareWeight} in ${RARE_DENOMINATOR})`);
  }
  assert.ok(MONSTERS.filter((m) => m.drops.rare?.length).length >= 5, "enough creatures are worth hunting for something");
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
