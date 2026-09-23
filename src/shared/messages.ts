// Game messages the server sends that the tests and the self-test also look for.
import type { FishingMethod, MethodName, ToolKind } from "./gathering.ts";

/** Using an item, or one item on another, when nothing comes of it. */
export const NOTHING_COMES = "Nothing comes of that.";
/** Trying to put on something that isn't equipment. */
export const CANT_WEAR = "That isn't something you can wear or wield.";
/** Picking something up, or taking something off, with no free inventory slot for it. */
export const NO_ROOM = "You have no room to carry that.";
/** Walking over to an item that can't be reached. */
export const CANT_REACH = "You can't get to that from here.";
/** Eating when there's nothing to heal (until hitpoints exist, always). */
export const NOT_HUNGRY = "You're not hungry right now.";

/** Gathering with no free inventory slot, whether starting or once the last one fills. */
export const PACK_FULL = "Your pack is full.";

/** Starting to gather, by method. */
export const GATHER_START: Record<MethodName, string> = {
  chop: "You start hacking at the tree.",
  mine: "You start chipping at the rock.",
  net: "You lower your net into the water.",
  angle: "You cast your line out.",
  trap: "You sink the creel and wait.",
  harpoon: "You watch the water, harpoon ready.",
};

/** Gathering without any tool of the kind it needs. */
export const NEED_TOOL: Record<ToolKind, string> = {
  axe: "You'll need an axe for that.",
  pickaxe: "You'll need a pickaxe for that.",
  net: "You'll need a net for that.",
  rod: "You'll need a fishing rod for that.",
  creel: "You'll need a creel for that.",
  harpoon: "You'll need a harpoon for that.",
};

/** Fishing with a rod and nothing on the hook. */
export const NEED_BAIT = "You've no bait left.";

/** Carrying a tool that needs a higher level than the player has (`tool` is its name). */
export const toolNeedsLevel = (tool: string, skill: string, level: number) => `Your ${tool.toLowerCase()} needs ${skill} level ${level}.`;

/** A resource that needs a higher level than the player has. */
export const needLevel = (skill: string, level: number, noun: string) => `${skill} level ${level} is needed for this ${noun}.`;

/** Landing a fish, by how it was caught. */
const CAUGHT: Record<FishingMethod, (fish: string) => string> = {
  net: (fish) => `You net a ${fish}.`,
  angle: (fish) => `You land a ${fish}.`,
  trap: (fish) => `You haul up a ${fish}.`,
  harpoon: (fish) => `You spear a ${fish}.`,
};

/** A successful roll, by method; `item` is the name of what it gave. */
export function gotItem(method: MethodName, item: string): string {
  if (method === "chop") return `You cut some ${item.toLowerCase()}.`;
  if (method === "mine") return `You break off some ${item.toLowerCase()}.`;
  return CAUGHT[method](item.replace(/^Raw /, "").toLowerCase());
}

/** A skill reaching a new level. */
export const levelUp = (skill: string, level: number) => `${skill} went up to level ${level}!`;

// --- Combat ---------------------------------------------------------------------------------

/** Swinging at something someone else has already engaged. */
export const ALREADY_FIGHTING = "Someone else is already fighting that.";
/** Swinging at another player, until there is anywhere that allows it. */
export const NO_DUELLING = "You can't fight other people here.";
/** Running out of hitpoints, and what it costs now that there is a bank to leave things in (PLAN §5). */
export const YOU_DIED = "You black out, and come to somewhere safer.";
export const LOST_ON_DEATH = "Whatever you were carrying is lying where you fell. Best hurry.";
/** Putting a creature down. */
export const defeated = (name: string) => `You defeat the ${name.toLowerCase()}.`;
/** Eating something, and eating when there is nothing to mend. */
export const ateItem = (name: string) => `You finish off the ${name.toLowerCase()}.`;
export const NOT_HURT = "You've nothing that needs mending.";
/** Changing how you fight. */
export const nowFighting = (style: string) => `Fighting style: ${style}.`;

// --- The village: banks, shops and doors (Phase 7) --------------------------------------------

/** Moving nothing: an empty slot, or a count that comes to none. */
export const NOTHING_THERE = "There's nothing there to move.";
/** Banking with every slot in the bank already spoken for. */
export const BANK_FULL = "Your bank has no room for another kind of thing.";
/** Buying without the coins for a single one. */
export const TOO_POOR = "You haven't the coins for that.";
/** Buying a line the shop has run out of. */
export const SHOP_OUT_OF = "The shelf is bare.";
/** Offering a shop something it doesn't deal in. */
export const SHOP_NO_BUY = "They shake their head. Not their trade.";
/** A locked door, a barred adit, a sealed stair. */
export const ITS_LOCKED = "It won't budge.";
/** Walking up to talk to something that has nothing to say. */
export const NOTHING_TO_SAY = "They've nothing to say to you.";

// --- Making things (Phase 8) -------------------------------------------------------------------

/** A recipe whose materials aren't all in the pack. */
export const needMaterials = (what: string) => `You haven't got what ${aOrAn(what)} takes.`;
/** A recipe above the player's level in the skill it belongs to. */
export const makeNeedsLevel = (skill: string, level: number, what: string) =>
  `${skill} level ${level} is needed to make ${aOrAn(what)}.`;
/** Lighting a fire where one is already burning, or on ground that won't take one. */
export const NO_FIRE_HERE = "There's nowhere here to set a fire.";
/** Lighting a fire, and a tinderbox that won't catch this time. */
export const FIRE_LIT = "The kindling catches, and the logs take.";
export const FIRE_WONT_CATCH = "The tinder smokes and goes out.";
/** Cooking something well, and ruining it. */
export const cooked = (name: string) => `You cook the ${plainFood(name)}.`;
export const burnt = (name: string) => `You leave the ${plainFood(name)} too long, and it chars.`;
/** Smelting a bar and hammering something out. */
export const smelted = (name: string) => `The metal runs, and you pour ${aOrAn(name)}.`;
export const smithed = (name: string) => `You hammer out ${aOrAn(name)}.`;
/** Working leather, stringing a bow, fletching arrows. */
export const crafted = (name: string) => `You work the leather into ${aOrAn(name)}.`;
export const fletched = (name: string) => `You shape ${aOrAn(name)}.`;
/** Making with nothing left to make, and being interrupted at a workbench. */
export const NOTHING_LEFT = "You've run out of what that takes.";
export const STOPPED_MAKING = "You stop what you were making.";

/** "a bronze axe" / "an iron bar": the article an item's name wants, in lower case. */
export function aOrAn(name: string): string {
  const lower = name.toLowerCase();
  return `${"aeiou".includes(lower[0] ?? "") ? "an" : "a"} ${lower}`;
}

/** A raw fish named as food: "Raw sardine" is a sardine once it is off the hook. */
const plainFood = (name: string) => name.replace(/^Raw /, "").toLowerCase();
