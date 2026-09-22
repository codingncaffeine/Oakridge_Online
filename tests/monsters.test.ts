import assert from "node:assert/strict";
import { test } from "node:test";
import { countOf, emptyInventory } from "../src/server/inventory.ts";
import { DEATH_TICKS, World, type Npc, type Player } from "../src/server/world.ts";
import { DEFENCE_XP, WEAPON_CLASSES } from "../src/shared/combat.ts";
import { item } from "../src/shared/items.ts";
import { blankMap, type WorldMap } from "../src/shared/map.ts";
import { ALREADY_FIGHTING, CANT_REACH, defeated, NO_DUELLING, YOU_DIED } from "../src/shared/messages.ts";
import { levelOf, monster, TOLERANCE_TICKS } from "../src/shared/monsters.ts";
import { noXp, xpForLevel, type SkillKey } from "../src/shared/skills.ts";

/** A 32×32 field holding just the creatures named, so nothing else eats the scripted random numbers. */
function field(monsters: Array<[string, number, number]>, walls: Array<[number, number]> = []): WorldMap {
  const map = blankMap(32, 32);
  for (const [monsterKey, x, y] of monsters) map.monsters.push({ monster: monsterKey, x, y });
  for (const [x, y] of walls) map.collision.block(x, y);
  return map;
}

/** Random numbers the test sets as it goes: `roll.queue` first, then `roll.next` forever. */
function scripted(first: number) {
  const roll = { next: first, queue: [] as number[] };
  return { roll, rand: () => roll.queue.shift() ?? roll.next };
}

const levels = (at: Partial<Record<SkillKey, number>>): Record<SkillKey, number> => {
  const xp = noXp();
  for (const [skill, level] of Object.entries(at)) xp[skill as SkillKey] = xpForLevel(level);
  return xp;
};

/** A fighter good enough to win: high levels, so the rolls go their way. */
const champion = () => levels({ attack: 60, strength: 60, defence: 60, hitpoints: 60 });

const only = (world: World): Npc => {
  const list = [...world.npcs.values()];
  assert.equal(list.length, 1, "this test wants exactly one creature");
  return list[0]!;
};

const stepUntil = (world: World, ok: () => boolean, max = 400) => {
  for (let i = 0; i < max && !ok(); i++) world.step();
  assert.ok(ok(), "never happened");
};

const said = (p: Player, text: string) => p.messages.includes(text);

test("creatures spawn from the map, whole, where they were put", () => {
  const world = new World(field([["field_rat", 10, 10], ["cow", 20, 20]]));
  assert.equal(world.npcs.size, 2);
  const rat = [...world.npcs.values()].find((n) => n.def.key === "field_rat")!;
  assert.deepEqual([rat.x, rat.y], [10, 10]);
  assert.equal(rat.hp, monster("field_rat").hitpoints);
  assert.notEqual(rat.id, [...world.players.values()][0]?.id, "creature ids never collide with players'");
});

test("a player walks up to a creature, stops beside it, and swings on its weapon's beat", () => {
  // Half on every roll: no creature takes a wander beat (they need under 0.35), so nothing moves away.
  // The warden has the hitpoints to survive being measured.
  const world = new World(field([["barrow_warden", 20, 16]]), scripted(0.5).rand);
  const p = world.add("Fighter", undefined, { at: { x: 10, y: 16 }, xp: champion() });
  const warden = only(world);
  world.attack(p, warden.id);
  const beside = () => Math.abs(p.x - warden.x) + Math.abs(p.y - warden.y) === 1;
  stepUntil(world, beside);
  assert.equal(p.path.length, 0, "it stops the moment it is within reach");
  assert.ok(beside(), "and stands orthogonally beside it, never off a corner");
  assert.equal(p.act?.anim, "fight");
  const beat = (world: World, p: Player) => {
    const swings: number[] = [];
    // Long enough to catch three of even the slowest beat measured here.
    for (let i = 0; i < 24; i++) {
      world.step();
      if (p.swung) swings.push(world.tick);
    }
    assert.ok(swings.length >= 3, `it keeps swinging (${swings.length})`);
    const gaps = swings.slice(1).map((t, i) => t - swings[i]!);
    assert.equal(new Set(gaps).size, 1, `an even beat, not ${gaps.join(", ")}`);
    return gaps[0]!;
  };
  assert.equal(beat(world, p), WEAPON_CLASSES.unarmed.speed, "bare hands swing on their own beat");

  // The weapon sets the beat: a sword is slower than bare hands, and the same fight proves it.
  const armed = new World(field([["barrow_warden", 12, 16]]), scripted(0.5).rand);
  const q = armed.add("Swordsman", undefined, {
    at: { x: 11, y: 16 }, xp: champion(), equipment: { weapon: { id: item("bronze_sword").id, count: 1 } },
  });
  armed.attack(q, only(armed).id);
  armed.step();
  assert.equal(beat(armed, q), WEAPON_CLASSES.sword.speed);
  assert.notEqual(WEAPON_CLASSES.sword.speed, WEAPON_CLASSES.unarmed.speed, "the two beats really do differ");
});

test("standing on a creature, you step off it to fight rather than give up", () => {
  // Creatures do not block their tile, so a player can end up standing on one. The walk used for
  // objects counts "inside it" as close enough, which leaves nothing ever in melee range: the fight
  // has to use a search that ends beside the target instead.
  const world = new World(field([["cow", 16, 16]]), scripted(0.5).rand);
  const p = world.add("OnTop", undefined, { at: { x: 16, y: 16 }, xp: champion() });
  const cow = only(world);
  world.attack(p, cow.id);
  stepUntil(world, () => p.act?.anim === "fight", 30);
  assert.equal(Math.abs(p.x - cow.x) + Math.abs(p.y - cow.y), 1, `it stepped off to (${p.x}, ${p.y})`);
  assert.ok(!said(p, CANT_REACH), "and never claimed it couldn't get there");
});

test("walking up to a creature ends beside it, never on its tile", () => {
  // Every approach angle must land orthogonally beside it, which is where melee reach is measured.
  for (const [dx, dy] of [[-6, 0], [6, 0], [0, -6], [0, 6], [-5, -5], [5, 5], [-4, 6], [7, -3]] as const) {
    const world = new World(field([["cow", 16, 16]]), scripted(0.5).rand);
    const p = world.add("Walker", undefined, { at: { x: 16 + dx, y: 16 + dy }, xp: champion() });
    const cow = only(world);
    world.attack(p, cow.id);
    stepUntil(world, () => p.act?.anim === "fight", 60);
    const away = Math.abs(p.x - cow.x) + Math.abs(p.y - cow.y);
    assert.equal(away, 1, `from (${dx}, ${dy}) it stopped ${away} away, at (${p.x}, ${p.y}) beside (${cow.x}, ${cow.y})`);
  }
});

test("a landed blow takes hitpoints, shows a hitsplat and pays XP by stance", () => {
  const { roll, rand } = scripted(0.5);
  const world = new World(field([["cow", 12, 16]]), rand);
  const p = world.add("Fighter", undefined, { at: { x: 11, y: 16 }, xp: champion() });
  const cow = only(world);
  const before = { ...p.xp };
  world.attack(p, cow.id);
  // The swing takes two numbers: one to land the blow, one for how hard. Both at 0 is the max hit.
  roll.queue = [0, 0];
  world.step();
  const damage = cow.def.hitpoints - cow.hp;
  assert.ok(damage > 0, "the blow landed");
  assert.deepEqual(cow.hits, [damage], "and shows as one hitsplat of that size");
  assert.equal(p.swung, true);
  // Fighting forcefully (style 0 of bare hands is precise; the default index is 0).
  assert.equal(p.xp.attack, before.attack + 40 * damage, "Attack XP is four a point of damage");
  assert.equal(p.xp.hitpoints, before.hitpoints + 13 * damage, "Hitpoints XP is 1.3 a point");
  assert.equal(p.xp.strength, before.strength, "a precise stance pays nothing into Strength");
});

/**
 * Defending trains Defence. Hitting back is off here and the player never swings, so every point of XP
 * in this test can only have come from taking the blow.
 */
test("a blow you take pays Defence XP, and one that misses pays nothing", () => {
  const { roll, rand } = scripted(0);
  const world = new World(field([["grey_wolf", 16, 16]]), rand);
  // A fresh character, so the wolf is willing to come for them; standing right beside it.
  const p = world.add("Tank", undefined, { at: { x: 15, y: 16 }, xp: noXp() });
  world.setRetaliate(p, false);
  const before = { ...p.xp };
  const full = p.hp;
  stepUntil(world, () => p.hp < full, 30);
  const taken = full - p.hp;
  assert.ok(taken > 0, "the wolf landed one");
  assert.equal(p.swung, false, "and the player never swung back");
  assert.equal(p.xp.defence, before.defence + DEFENCE_XP * taken, "Defence XP is two a point of damage taken");
  assert.equal(p.xp.hitpoints, before.hitpoints, "taking a hit pays nothing into Hitpoints");
  assert.equal(p.xp.attack, before.attack, "nor into Attack");

  // The control: a wolf that keeps missing pays nothing, so it is the damage that is being paid for.
  roll.next = 0.9999;
  const missed = new World(field([["grey_wolf", 16, 16]]), rand);
  const q = missed.add("Dodger", undefined, { at: { x: 15, y: 16 }, xp: noXp() });
  missed.setRetaliate(q, false);
  for (let i = 0; i < 30; i++) missed.step();
  assert.equal(q.hp, missed.maxHpOf(q), "nothing landed");
  assert.equal(q.xp.defence, 0, "and nothing was paid for standing there");
});

test("a blow that misses shows a zero hitsplat and earns nothing", () => {
  const { roll, rand } = scripted(0.5);
  const world = new World(field([["cow", 12, 16]]), rand);
  const p = world.add("Fighter", undefined, { at: { x: 11, y: 16 }, xp: champion() });
  const cow = only(world);
  const before = p.xp.attack;
  world.attack(p, cow.id);
  roll.queue = [0.9999];
  world.step();
  assert.deepEqual(cow.hits, [0], "a roll above the chance is a miss");
  assert.equal(cow.hp, cow.def.hitpoints, "it took nothing");
  assert.equal(p.xp.attack, before, "and paid nothing");
});

test("a kill leaves its certain drops to the killer, then the body goes and comes back", () => {
  const { roll, rand } = scripted(0);
  const world = new World(field([["cow", 12, 16]]), rand);
  const p = world.add("Fighter", undefined, { at: { x: 11, y: 16 }, xp: champion(), inventory: emptyInventory() });
  const cow = only(world);
  world.attack(p, cow.id);
  // Every blow lands for the most it can, so the cow goes down quickly. The rolls are queued fresh each
  // tick because the creature's own wander beat draws from the same numbers.
  roll.next = 0;
  for (let i = 0; i < 60 && cow.hp > 0; i++) {
    roll.queue = [0, 0];
    world.step();
  }
  assert.equal(cow.hp, 0, "the cow went down");
  assert.ok(said(p, defeated(cow.def.name)));
  assert.equal(cow.deathTick, world.tick);
  // A cow always leaves bones, beef and a hide, on the tile it fell on, to whoever killed it.
  const fell = { x: cow.x, y: cow.y };
  const left = [...world.ground.values()].filter((g) => g.x === fell.x && g.y === fell.y);
  assert.deepEqual(left.map((g) => g.id).sort(), [item("bones").id, item("raw_beef").id, item("cowhide").id].sort());
  for (const g of left) assert.equal(g.owner, "Fighter", "the drop is the killer's for a while");
  assert.equal(p.target, null, "and the fight is over");

  // It lies there for a beat, then is gone from view, then stands up again at home, at full health.
  assert.ok(world.viewFor(p).ents.some((e) => e.id === cow.id && e.dead === 1), "everyone sees it go down");
  for (let i = 0; i < DEATH_TICKS; i++) world.step();
  p.known.add(cow.id);
  assert.ok(world.viewFor(p).gone.includes(cow.id), "then the body leaves");
  stepUntil(world, () => cow.deathTick === 0, cow.def.respawn + 20);
  assert.equal(cow.hp, cow.def.hitpoints);
  assert.deepEqual([cow.x, cow.y], [cow.home.x, cow.home.y], "back where it lived");
  assert.notDeepEqual(fell, { x: cow.home.x, y: cow.home.y }, "it had wandered, so coming home really moved it");
});

test("a creature that starts fights goes for a weak player, and leaves a strong one alone", () => {
  const wolf = monster("grey_wolf");
  const { rand } = scripted(0.99);
  const world = new World(field([["grey_wolf", 16, 16]]), rand);
  const weak = world.add("Cub", undefined, { at: { x: 16, y: 16 - wolf.aggro }, xp: noXp() });
  world.step();
  const n = only(world);
  assert.equal(n.target, weak.id, "it noticed the weak one at the edge of its range");

  // A player above twice its level is beneath its notice. Control: the same player, weakened, is not.
  const strong = world.add("Veteran", undefined, { at: { x: 16, y: 16 + 1 }, xp: levels({ attack: 70, strength: 70, defence: 70, hitpoints: 70 }) });
  assert.ok(world.combatLevelOf(strong) > 2 * levelOf(wolf), "the control player really is out of its league");
  world.remove(weak.id);
  n.target = null;
  world.step();
  assert.equal(n.target, null, "it leaves the strong one alone");
  const beatUp = world.add("Cub2", undefined, { at: { x: 16, y: 16 + 1 }, xp: noXp() });
  world.step();
  assert.equal(n.target, beatUp.id, "but a weak player on the same tile is fair game");
});

test("a creature that never starts fights never does, however close you stand", () => {
  const { rand } = scripted(0.99);
  const world = new World(field([["cow", 16, 16]]), rand);
  const p = world.add("Bystander", undefined, { at: { x: 15, y: 16 }, xp: noXp() });
  for (let i = 0; i < 40; i++) world.step();
  const cow = only(world);
  assert.equal(cow.target, null);
  assert.equal(p.hp, world.maxHpOf(p), "and it never laid a hoof on anyone");
});

test("creatures lose interest after ten minutes in their midst", () => {
  const { rand } = scripted(0.99);
  const world = new World(field([["grey_wolf", 16, 16]]), rand);
  // Not hitting back: a creature that is being fought stays in that fight, tolerance or not.
  const p = world.add("Loiterer", undefined, { at: { x: 16, y: 14 }, xp: noXp(), retaliate: false });
  world.step();
  const n = only(world);
  assert.equal(n.target, p.id, "it starts interested");
  n.target = null;
  p.toleranceFrom = world.tick - TOLERANCE_TICKS;
  world.step();
  assert.equal(n.target, null, "after that it ignores them");
  // Control: the timer is what changed, nothing else. Reset it and the wolf is interested again.
  p.toleranceFrom = world.tick;
  world.step();
  assert.equal(n.target, p.id);
});

test("being hit starts a fight back, unless hitting back is turned off", () => {
  const { roll, rand } = scripted(0);
  const world = new World(field([["grey_wolf", 16, 16]]), rand);
  // Weak enough that the wolf takes an interest in the first place.
  const p = world.add("Target", undefined, { at: { x: 15, y: 16 }, xp: noXp(), retaliate: true });
  void roll;
  stepUntil(world, () => p.hits.length > 0, 30);
  assert.equal(p.target, only(world).id, "it hit them, so they hit back");

  const world2 = new World(field([["grey_wolf", 16, 16]]), scripted(0).rand);
  const q = world2.add("Pacifist", undefined, { at: { x: 15, y: 16 }, xp: noXp(), retaliate: false });
  stepUntil(world2, () => q.hits.length > 0, 30);
  assert.equal(q.target, null, "with it off, they take it");
});

test("running out of hitpoints wakes you at the spawn, whole, with everything you carried", () => {
  const { roll, rand } = scripted(0);
  const map = field([["barrow_warden", 16, 16]]);
  const world = new World(map, rand);
  const p = world.add("Doomed", undefined, { at: { x: 15, y: 16 }, xp: noXp() });
  const carried = countOf(p.inventory, item("coins").id);
  roll.next = 0;
  for (let i = 0; i < 200 && p.deathTick === 0; i++) {
    roll.queue = [0, 0];
    world.step();
  }
  assert.notEqual(p.deathTick, 0, "the warden finished them");
  assert.ok(said(p, YOU_DIED));
  assert.equal(p.hp, 0);
  assert.equal(only(world).target, null, "whatever killed them has let go");
  // Falling over is sent to whoever can see it, and so is getting back up: a viewer draws a body on
  // its side until it is told otherwise, so a player who is never stood up walks around lying down.
  assert.equal(world.viewFor(p).ents.find((e) => e.id === p.id)?.dead, 1, "everyone sees them go down");
  let stoodUp;
  for (let i = 0; i <= DEATH_TICKS; i++) {
    world.step();
    stoodUp ??= world.viewFor(p).ents.find((e) => e.id === p.id && e.dead === 0);
  }
  assert.ok(stoodUp, "and sees them get back up");
  assert.deepEqual([stoodUp.x, stoodUp.y], [map.spawn.x, map.spawn.y], "standing at the spawn");
  assert.equal(p.deathTick, 0, "they are back on their feet");
  assert.deepEqual([p.x, p.y], [map.spawn.x, map.spawn.y]);
  assert.equal(p.hp, world.maxHpOf(p), "whole again");
  assert.equal(countOf(p.inventory, item("coins").id), carried, "and still carrying what they had");
});

test("you cannot fight another player, or something someone else is already fighting", () => {
  const { rand } = scripted(0.5);
  const world = new World(field([["cow", 12, 16]]), rand);
  const a = world.add("A", undefined, { at: { x: 11, y: 16 }, xp: champion() });
  const b = world.add("B", undefined, { at: { x: 13, y: 16 }, xp: champion() });
  world.attack(a, b.id);
  assert.ok(said(a, NO_DUELLING));
  assert.equal(a.target, null);

  const cow = only(world);
  world.attack(a, cow.id);
  world.step();
  world.attack(b, cow.id);
  assert.ok(said(b, ALREADY_FIGHTING));
  assert.equal(b.target, null);
});

test("walking away ends the fight", () => {
  const { rand } = scripted(0.5);
  const world = new World(field([["cow", 12, 16]]), rand);
  const p = world.add("Fighter", undefined, { at: { x: 11, y: 16 }, xp: champion() });
  world.attack(p, only(world).id);
  world.step();
  assert.equal(p.act?.anim, "fight");
  world.walk(p, 4, 4);
  world.step();
  assert.equal(p.target, null);
  assert.notEqual(p.act?.anim, "fight");
});

test("something behind a wall cannot be got at", () => {
  const { rand } = scripted(0.5);
  // A creature walled in on every side of its tile.
  const map = field([["cow", 16, 16]], [[15, 16], [17, 16], [16, 15], [16, 17], [15, 15], [17, 17], [15, 17], [17, 15]]);
  const world = new World(map, rand);
  const p = world.add("Fighter", undefined, { at: { x: 12, y: 16 }, xp: champion() });
  world.attack(p, only(world).id);
  stepUntil(world, () => said(p, CANT_REACH), 40);
  assert.equal(p.target, null);
});

test("a creature wanders near its home and comes back when dragged away", () => {
  const { rand } = scripted(0.2);
  const world = new World(field([["field_rat", 16, 16]]), rand);
  const rat = only(world);
  const seen = new Set<string>();
  for (let i = 0; i < 300; i++) {
    world.step();
    seen.add(`${rat.x},${rat.y}`);
    assert.ok(
      Math.max(Math.abs(rat.x - 16), Math.abs(rat.y - 16)) <= rat.def.wander,
      `it stayed within ${rat.def.wander} of home (at ${rat.x},${rat.y})`,
    );
  }
  assert.ok(seen.size > 1, "it did move");
  rat.x = 16 + rat.def.wander + 6;
  rat.y = 16;
  stepUntil(world, () => rat.x <= 16 + rat.def.wander, 200);
});
