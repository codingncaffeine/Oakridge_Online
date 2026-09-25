// Dialogue and quests (PLAN Phase 9): the quests are well formed and wired into their givers' talk;
// a conversation branches on what the player has done, hides what they cannot yet say, and does what
// an option says; each starter quest is walked through the real world from the first word to the last
// coin; and a kill is tallied for whoever it belongs to, and forgotten when a stage changes.
import assert from "node:assert/strict";
import { test } from "node:test";
import { addItem, countOf } from "../src/server/inventory.ts";
import { World, type Npc, type Player } from "../src/server/world.ts";
import { DIALOGUE, DIALOGUE_START, type Condition, type DialogueTree, type Effect } from "../src/shared/dialogue.ts";
import { item } from "../src/shared/items.ts";
import { blankMap } from "../src/shared/map.ts";
import { questBegun, questComplete } from "../src/shared/messages.ts";
import { MONSTER_BY_KEY } from "../src/shared/monsters.ts";
import { buildOakridge, OAKRIDGE_SEED } from "../src/shared/oakridge.ts";
import { isComplete, QUEST_BY_KEY, questPoints, QUESTS, readQuests, stageOf, TOTAL_QUEST_POINTS } from "../src/shared/quests.ts";
import { noXp, xpForLevel, type SkillKey } from "../src/shared/skills.ts";

const stack = buildOakridge(OAKRIDGE_SEED);

/** Every condition and effect of a tree, wherever it sits. */
function walk(tree: DialogueTree): { conditions: Condition[]; effects: Effect[]; targets: string[] } {
  const conditions: Condition[] = [], effects: Effect[] = [], targets: string[] = [];
  for (const node of Object.values(tree)) {
    for (const b of node.branch ?? []) { conditions.push(...b.when); targets.push(b.to); }
    for (const o of node.options ?? []) {
      conditions.push(...(o.when ?? []));
      effects.push(...(o.do ?? []));
      if (o.to) targets.push(o.to);
    }
  }
  return { conditions, effects, targets };
}

test("every quest is well formed, and its giver's talk begins it and ends it", () => {
  assert.equal(new Set(QUESTS.map((q) => q.key)).size, QUESTS.length, "keys are unique");
  assert.equal(QUESTS.length, 4, "three starter quests, and the Sallowfen's lock");
  for (const q of QUESTS) {
    assert.ok(q.stages.length >= 2, `${q.key} has a begun line and a finished line`);
    assert.ok(q.points >= 1);
    const giver = MONSTER_BY_KEY.get(q.giver);
    assert.ok(giver?.person && giver.talk && DIALOGUE[giver.talk], `${q.key}'s giver ${q.giver} is a person with something to say`);
    for (const [key] of q.reward.items ?? []) assert.ok(item(key), `${q.key} rewards ${key}, which exists`);
    const tree = DIALOGUE[giver!.talk!]!;
    const { conditions, effects, targets } = walk(tree);
    for (const t of targets) assert.ok(tree[t], `${giver!.talk} points at ${t}, which is a node of its own`);
    for (const c of conditions) {
      if ("has" in c) assert.ok(item(c.has), `a condition names ${c.has}, which exists`);
      if ("tally" in c) assert.ok(MONSTER_BY_KEY.has(c.tally), `a condition names ${c.tally}, which exists`);
      if ("quest" in c) assert.ok(QUEST_BY_KEY.has(c.quest), `a condition names ${c.quest}, which exists`);
    }
    const sets = effects.filter((e): e is Extract<Effect, { quest: string }> => "quest" in e && e.quest === q.key).map((e) => e.stage);
    assert.ok(sets.includes(1), `${q.key} is begun by its giver`);
    assert.ok(sets.includes(q.stages.length), `${q.key} is finished by its giver`);
    for (const e of effects) {
      if ("take" in e) assert.ok(item(e.take), `an effect takes ${e.take}, which exists`);
      if ("give" in e) assert.ok(item(e.give), `an effect gives ${e.give}, which exists`);
    }
    // The reward the table promises is what the giver's finishing option gives.
    const finishing = Object.values(tree).flatMap((n) => n.options ?? []).find((o) => (o.do ?? []).some((e) => "quest" in e && e.quest === q.key && e.stage === q.stages.length))!;
    for (const [skill, tenths] of q.reward.xp ?? []) assert.ok(finishing.do!.some((e) => "xp" in e && e.xp === skill && e.tenths === tenths), `${q.key} pays ${tenths} of ${skill}`);
    for (const [key, count] of q.reward.items ?? []) assert.ok(finishing.do!.some((e) => "give" in e && e.give === key && (e.count ?? 1) === count), `${q.key} gives ${count} ${key}`);
  }
  assert.equal(questPoints({}), 0);
  assert.equal(questPoints(Object.fromEntries(QUESTS.map((q) => [q.key, q.stages.length]))), TOTAL_QUEST_POINTS);
  assert.deepEqual(readQuests({ split_oak_table: 1, nonsense: 4, millers_band: 99, mudfoot_mischief: -1 }), { split_oak_table: 1, millers_band: 2 }, "a save is read to the quests and stages that exist");
  assert.deepEqual(readQuests(null), {});
});

/** A player standing beside a person, so a talk opens on the first step. */
function beside(world: World, key: string, state: { xp?: Record<SkillKey, number> } = {}): { p: Player; n: Npc } {
  const n = [...world.npcs.values()].find((c) => c.def.key === key);
  assert.ok(n, `${key} is in the world`);
  let at: { x: number; y: number } | null = null;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const t = { x: n.x + dx, y: n.y + dy };
    if ((world.map.collision.get(t.x, t.y) & 1) === 0) { at = t; break; }
  }
  assert.ok(at, `a free tile beside ${key}`);
  const p = world.add("Quester", undefined, { at: { ...at, plane: n.plane }, ...state });
  return { p, n };
}

/** Opens the talk and steps until the box is up; returns what it says. */
function talk(world: World, p: Player, n: Npc) {
  world.talk(p, n.id);
  for (let i = 0; i < 20 && p.screen?.kind !== "talk"; i++) world.step();
  const box = world.dialogueFor(p);
  assert.ok(box, `talking to ${n.def.name} opens a box`);
  return box;
}

/** Picks the option with this text, which must be on offer. */
function say(world: World, p: Player, text: string) {
  const box = world.dialogueFor(p)!;
  const i = box.options.indexOf(text);
  assert.ok(i >= 0, `"${text}" is on offer (offered: ${box.options.join(" | ")})`);
  world.answer(p, i);
  return world.dialogueFor(p);
}

test("A Table at the Split Oak, walked through: asked, waited on, brought, and paid", () => {
  const world = new World(stack, () => 0.5);
  const { p, n } = beside(world, "innkeeper");
  const first = talk(world, p, n);
  assert.ok(first.options.includes("Is there anything the house needs?"), "the quest is offered before it is begun");
  assert.equal(stageOf(p.quests, "split_oak_table"), 0);
  say(world, p, "Is there anything the house needs?");
  const go = say(world, p, "I'll see to it.");
  assert.equal(stageOf(p.quests, "split_oak_table"), 1, "begun");
  assert.ok(p.messages.includes(questBegun("A Table at the Split Oak")), "and said so");
  assert.ok(p.questsDirty, "and the client will hear");
  assert.ok(go?.lines[0]?.includes("jetty"), "she says where");
  world.answer(p, 0);
  // Back without the goods: she reminds you, and the offer to begin is gone.
  const again = talk(world, p, n);
  assert.ok(again.lines[0]?.includes("not forgotten"), "mid-quest she greets you with what she waits for");
  assert.ok(!again.options.includes("Is there anything the house needs?"), "the begun quest is not offered again");
  world.answer(p, 0);
  // With the goods: she takes them and pays.
  addItem(p.inventory, item("logs").id, 5);
  addItem(p.inventory, item("sardine").id, 2);
  const coinsBefore = countOf(p.inventory, item("coins").id), cookingBefore = p.xp.cooking;
  const done = talk(world, p, n);
  assert.ok(done.lines[0]?.includes("You'll do"), "she sees the goods");
  const thanks = say(world, p, "Here you are.");
  assert.ok(thanks?.lines[0]?.includes("table laid"));
  assert.equal(stageOf(p.quests, "split_oak_table"), 2, "complete");
  assert.ok(isComplete(QUEST_BY_KEY.get("split_oak_table")!, 2));
  assert.equal(countOf(p.inventory, item("logs").id), 0, "the logs are gone");
  assert.equal(countOf(p.inventory, item("sardine").id), 0, "and the sardines");
  assert.equal(countOf(p.inventory, item("coins").id), coinsBefore + 60, "60 coins paid");
  assert.equal(p.xp.cooking, cookingBefore + 3000, "300 Cooking XP");
  assert.equal(questPoints(p.quests), 1, "one quest point");
  assert.ok(p.messages.includes(questComplete("A Table at the Split Oak")), "and the completion is announced");
  world.answer(p, 0);
  // Afterwards she is herself again, and the quest cannot be begun twice.
  const after = talk(world, p, n);
  assert.equal(after.lines[0], "Welcome to the Split Oak. Mind the step.");
  assert.ok(!after.options.includes("Is there anything the house needs?"));
});

test("The Miller's Band, walked through: the bars are hers, the coins and the XP are yours", () => {
  const world = new World(stack, () => 0.5);
  const { p, n } = beside(world, "miller");
  talk(world, p, n);
  say(world, p, "Is the mill turning?");
  say(world, p, "I'll bring the bars.");
  assert.equal(stageOf(p.quests, "millers_band"), 1);
  world.answer(p, 0);
  addItem(p.inventory, item("bronze_bar").id, 2);
  const smithingBefore = p.xp.smithing, coinsBefore = countOf(p.inventory, item("coins").id);
  talk(world, p, n);
  say(world, p, "Here they are.");
  assert.equal(stageOf(p.quests, "millers_band"), 2, "complete");
  assert.equal(countOf(p.inventory, item("bronze_bar").id), 0, "the bars are hers");
  assert.equal(countOf(p.inventory, item("coins").id), coinsBefore + 90, "90 coins paid into the pack");
  assert.equal(p.xp.smithing, smithingBefore + 2500);
  assert.equal(questPoints(p.quests), 1);
});

test("Mudfoot Mischief: a kill is tallied for whoever it belongs to, forgotten when the stage changes, and three of them pay", () => {
  // The tally, on a field of one goblin and a champion who cannot miss.
  const field = blankMap(32, 32);
  field.monsters.push({ monster: "mudfoot_goblin", x: 12, y: 10 });
  const fieldWorld = new World(field, () => 0.5);
  const xp = noXp();
  for (const s of ["attack", "strength", "defence", "hitpoints"] as const) xp[s] = xpForLevel(60);
  const fighter = fieldWorld.add("Fighter", undefined, { at: { x: 10, y: 10 }, xp });
  const goblin = [...fieldWorld.npcs.values()][0]!;
  fieldWorld.attack(fighter, goblin.id);
  for (let i = 0; i < 400 && goblin.deathTick === 0; i++) fieldWorld.step();
  assert.ok(goblin.deathTick > 0, "the goblin is killed");
  assert.equal(fighter.tally.mudfoot_goblin, 1, "and tallied to the one who killed it");
  // The quest itself, on the real world.
  const world = new World(stack, () => 0.5);
  const { p, n } = beside(world, "farmer");
  p.tally.mudfoot_goblin = 5;
  talk(world, p, n);
  say(world, p, "Something wrong with the hens?");
  say(world, p, "I'll deal with them.");
  assert.equal(stageOf(p.quests, "mudfoot_mischief"), 1);
  assert.deepEqual(p.tally, {}, "beginning the quest clears what was killed before it");
  world.answer(p, 0);
  p.tally.mudfoot_goblin = 2;
  const notYet = talk(world, p, n);
  assert.ok(notYet.lines[0]?.startsWith("Three of them"), "two is not three");
  world.answer(p, 0);
  p.tally.mudfoot_goblin = 3;
  // A pack with no room for coins — 28 kinds of thing, none of them coins — so the reward has to land at the feet.
  const fillers = [
    "logs", "oak_logs", "copper_ore", "tin_ore", "iron_ore", "raw_sardine", "bronze_axe", "bronze_pickaxe", "fishing_net", "tinderbox",
    "bronze_dagger", "wooden_shield", "leather_cap", "leather_jerkin", "leather_trousers", "leather_gloves", "leather_boots", "red_cape",
    "bread", "iron_axe", "steel_axe", "iron_pickaxe", "steel_pickaxe", "raw_smelt", "bones", "bronze_sword", "bronze_mace", "bronze_helm",
  ];
  for (const key of fillers) addItem(p.inventory, item(key).id, 1);
  assert.equal(p.inventory.filter((s) => s !== null).length, 28, "the pack is full");
  const attackBefore = p.xp.attack;
  const done = talk(world, p, n);
  assert.ok(done.lines[0]?.startsWith("Three, you say?"), "three is three");
  say(world, p, "Glad to help.");
  assert.equal(stageOf(p.quests, "mudfoot_mischief"), 2, "complete");
  assert.equal(p.xp.attack, attackBefore + 2000);
  assert.equal(countOf(p.inventory, item("coins").id), 0, "no room in the pack for the coins");
  // The next tick's view for the player has them on the ground under their feet, theirs to pick up.
  world.step();
  const atFeet = world.viewFor(p).itemsAdd.find((g) => g.id === item("coins").id && g.x === p.x && g.y === p.y);
  assert.ok(atFeet && atFeet.count === 120, `the 120 coins lie at your feet (${JSON.stringify(atFeet ?? null)})`);
  world.answer(p, 0);
  const after = talk(world, p, n);
  assert.ok(after.lines[0]?.includes("laying again"), "afterwards he remembers");
  // The control: someone who never took the quest is greeted as anyone is, whatever they killed.
  const stranger = world.add("Stranger", undefined, { at: { x: p.x, y: p.y, plane: 0 } });
  stranger.tally.mudfoot_goblin = 10;
  const plain = talk(world, stranger, n);
  assert.equal(plain.lines[0], "Cows are cows. Don't let the gate swing.");
  assert.ok(plain.options.includes("Something wrong with the hens?"));
});

test("the starter quests have a voice: goods already carried are noticed and taken on the spot, the way is told by what the pack holds, and a no gets an answer", () => {
  // Hesper sees five logs and two cooked sardines in the pack before she has asked for them, and takes them there and then.
  const world = new World(stack, () => 0.5);
  const { p, n } = beside(world, "innkeeper");
  addItem(p.inventory, item("logs").id, 5);
  addItem(p.inventory, item("sardine").id, 2);
  talk(world, p, n);
  const ready = say(world, p, "Is there anything the house needs?");
  assert.ok(ready?.lines[0]?.includes("holding exactly that"), "she sees the goods before asking for them");
  const coins = countOf(p.inventory, item("coins").id);
  say(world, p, "Just lucky. Here.");
  assert.equal(stageOf(p.quests, "split_oak_table"), 2, "begun and done in one");
  assert.equal(countOf(p.inventory, item("logs").id), 0, "the logs are hers");
  assert.equal(countOf(p.inventory, item("coins").id), coins + 60, "and the pay is the same");
  // Without them: where the sardines are, told by whether a net is in the pack; and a no gets a reply.
  const second = new World(stack, () => 0.5);
  const q = beside(second, "innkeeper");
  talk(second, q.p, q.n);
  say(second, q.p, "Is there anything the house needs?");
  const bare = say(second, q.p, "Where would I find sardines?");
  assert.ok(bare?.lines[0]?.includes("tools shop"), "with no net, she says where to buy one");
  second.answer(q.p, -1);
  addItem(q.p.inventory, item("fishing_net").id, 1);
  talk(second, q.p, q.n);
  say(second, q.p, "Is there anything the house needs?");
  const netted = say(second, q.p, "Where would I find sardines?");
  assert.ok(netted?.lines[0]?.includes("net on you already"), "with one, she notices it");
  const no = say(second, q.p, "Maybe later.");
  assert.ok(no?.lines[0]?.includes("quiet day"), "and a no gets an answer of its own");
  assert.equal(stageOf(q.p.quests, "split_oak_table"), 0, "and begins nothing");
  // Nessa sees two bronze bars; Tolle says why it is goblins.
  const third = new World(stack, () => 0.5);
  const m = beside(third, "miller");
  addItem(m.p.inventory, item("bronze_bar").id, 2);
  talk(third, m.p, m.n);
  const bars = say(third, m.p, "Is the mill turning?");
  assert.ok(bars?.lines[0]?.includes("two in your pack"), "the miller sees the bars");
  say(third, m.p, "A smith, today. Take them.");
  assert.equal(stageOf(m.p.quests, "millers_band"), 2);
  const f = beside(third, "farmer");
  talk(third, f.p, f.n);
  say(third, f.p, "Something wrong with the hens?");
  const sure = say(third, f.p, "Are you sure it's goblins?");
  assert.ok(sure?.lines[0]?.includes("boot prints"), "the farmer says how he knows");
  const fno = say(third, f.p, "I'd still rather not.");
  assert.ok(fno?.lines[0]?.includes("pitchfork"), "and a no gets an answer");
});

test("the dialogue's start node is what it always was: a person with no quest talks as before", () => {
  const world = new World(stack, () => 0.5);
  const { p, n } = beside(world, "smith");
  const box = talk(world, p, n);
  assert.equal(box.lines[0], DIALOGUE.smith![DIALOGUE_START]!.lines[0]);
  assert.deepEqual(box.options, DIALOGUE.smith![DIALOGUE_START]!.options!.map((o) => o.text));
});
