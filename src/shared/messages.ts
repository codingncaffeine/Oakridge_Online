// Game messages the server sends that the tests and the self-test also look for.
import type { MethodName, ToolKind } from "./gathering.ts";

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
};

/** Gathering without any tool of the kind it needs. */
export const NEED_TOOL: Record<ToolKind, string> = {
  axe: "You'll need an axe for that.",
  pickaxe: "You'll need a pickaxe for that.",
  net: "You'll need a net for that.",
};

/** Carrying a tool that needs a higher level than the player has (`tool` is its name). */
export const toolNeedsLevel = (tool: string, skill: string, level: number) => `Your ${tool.toLowerCase()} needs ${skill} level ${level}.`;

/** A resource that needs a higher level than the player has. */
export const needLevel = (skill: string, level: number, noun: string) => `${skill} level ${level} is needed for this ${noun}.`;

/** A successful roll, by method; `item` is the name of what it gave. */
export function gotItem(method: MethodName, item: string): string {
  if (method === "net") return `You net a ${item.replace(/^Raw /, "").toLowerCase()}.`;
  return method === "chop" ? `You cut some ${item.toLowerCase()}.` : `You break off some ${item.toLowerCase()}.`;
}

/** A skill reaching a new level. */
export const levelUp = (skill: string, level: number) => `${skill} went up to level ${level}!`;

// --- Combat ---------------------------------------------------------------------------------

/** Swinging at something someone else has already engaged. */
export const ALREADY_FIGHTING = "Someone else is already fighting that.";
/** Swinging at another player, until there is anywhere that allows it. */
export const NO_DUELLING = "You can't fight other people here.";
/** Running out of hitpoints. */
export const YOU_DIED = "You black out, and come to somewhere safer.";
/** Putting a creature down. */
export const defeated = (name: string) => `You defeat the ${name.toLowerCase()}.`;
/** Eating something, and eating when there is nothing to mend. */
export const ateItem = (name: string) => `You finish off the ${name.toLowerCase()}.`;
export const NOT_HURT = "You've nothing that needs mending.";
/** Changing how you fight. */
export const nowFighting = (style: string) => `Fighting style: ${style}.`;
