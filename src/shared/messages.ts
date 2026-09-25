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

/** Searching a chest (PLAN §8.5): what came out of it, or that it stands empty until it fills again. */
export const CHEST_EMPTY = "The chest is empty.";
export const chestFound = (name: string, count: number) =>
  count > 1 ? `You find ${count} ${name.toLowerCase()} in the chest.` : `You find ${aOrAn(name)} in the chest.`;

// --- Quests (PLAN Phase 9) -----------------------------------------------------------------------
export const questBegun = (name: string) => `You've taken on ${name}. The journal has the details.`;
export const questComplete = (name: string) => `Quest complete: ${name}.`;
export const questPointsLine = (gained: number, total: number) =>
  `${gained} quest point${gained === 1 ? "" : "s"} earned. You have ${total} now.`;

// --- Social (PLAN Phase 10) ----------------------------------------------------------------------
export const tradeWish = (name: string) => `${name} wishes to trade with you.`;
export const tradeSent = (name: string) => `Sending a trade offer to ${name}…`;
export const TRADE_DONE = "Trade complete.";
export const tradeDeclined = (name: string) => `${name} declined the trade.`;
export const noRoomFor = (name: string) => `${name} has not got the room for that.`;
export const BUSY_TRADING = "They're busy trading with someone else.";
export const noSuchPlayer = (name: string) => `There's no one called ${name}.`;
export const notOnline = (name: string) => `${name} is not online.`;
export const NOT_YOURSELF = "That's you.";
export const LIST_FULL = "That list is full.";
export const alreadyListed = (name: string, list: string) => `${name} is already on your ${list} list.`;

// --- Ranged, magic and prayer (PLAN Phase 11) ----------------------------------------------------
export const NO_ARROWS = "You have no arrows to shoot.";
/** A spell's recipe short of a rune, named in the plural as the pack would hold them. */
export const noRunes = (name: string) => `You haven't enough ${name.toLowerCase()}s for that spell.`;
/** A staff set to cast, but set to no spell. */
export const CHOOSE_SPELL = "Choose a spell for your staff first: right-click one in the spellbook.";
/** A curse cast on a level some curse has lowered already (the reference's rule: they never stack). */
export const alreadyLowered = (stat: string) => `Its ${stat} is lowered already.`;
/** A bind cast on something already held. */
export const ALREADY_HELD = "It is held fast already.";
/** Lay to Rest on something alive. */
export const DEAD_ONLY = "That spell only works on the dead.";
/** A staff set to a spell it can't cast over and over: a curse, a bind or Take Measure. */
export const NOT_AUTOCAST = "A staff can only be set to a spell that strikes.";
/** Take Measure's reading of a creature: its levels, its life and how hard it hits. */
export const measured = (name: string, level: number, attack: number, strength: number, defence: number, hp: number, maxHp: number, maxHit: number) =>
  `${name}, level ${level}: Attack ${attack}, Strength ${strength}, Defence ${defence}, hitpoints ${hp} of ${maxHp}, hits up to ${maxHit}.`;
/** The bones spells with no bones in the pack. */
export const NO_BONES = "You have no bones to turn.";
/** A gilding cast on coins. */
export const GILD_COINS = "Coins are gold enough already.";
/** Hand Forge cast on something that is no ore. */
export const NOT_ORE = "There's no metal in that to draw out.";
/** Hand Forge short of the rest of what the bar needs (a bronze bar's other ore, a steel bar's coal); short of the level, it says what the furnace says. */
export const forgeShort = (what: string) => `You need ${what.toLowerCase()} for that as well.`;
/** Beckon on something too far off, or round a corner. */
export const BECKON_FAR = "It's too far off to call to you.";
/** Hearthward cast again too soon, the minutes it still wants; and one broken by a step or a blow. */
export const hearthWait = (minutes: number) => `You can call on the hearth again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
export const HEARTH_BROKEN = "Your hearthward breaks.";
/** A spell that waits on a quest (Mourn's teleport, on the Rill warden's leave). */
export const SPELL_NOT_YET = "You haven't been over the Rill yet: the spell won't find Mourn.";
/** Casting on something that can't be fought, or has nothing to cast on. */
export const NOTHING_TO_CAST_ON = "There's nothing there to cast that on.";
export const spellNeeds = (level: number, name: string) => `You need a Magic level of ${level} to cast ${name}.`;
/** Runesmithing (Phase 18): an altar without its charm, short of the level, of glimstone, or of pure glimstone; a carving; a charm's Locate. */
export const ALTAR_SILENT = "The altar does not answer you. It wants its charm.";
export const ALTAR_WAKES = "The charm goes warm in your pack and the altar hums. There is writing cut into its side, and you take a rubbing of it.";
export const carveNeeds = (level: number, rune: string) => `You need a Runesmithing level of ${level} to carve ${rune.toLowerCase()}s.`;
export const NO_GLIMSTONE = "You have no glimstone to carve here.";
export const PURE_ONLY = "Only pure glimstone will carve into these runes.";
export const carved = (count: number, rune: string) => `You carve ${count} ${rune.toLowerCase()}${count === 1 ? "" : "s"}.`;
export const charmPulls = (way: string, below: boolean) => `The charm tugs you ${way}${below ? ", and down" : ""}.`;
export const CHARM_HERE = "The charm is warm in your hand. Its altar is right here.";
/** Gems (the magic plan, stage A5): the rare find in an ore rock, always an uncut one. */
export const foundGem = (gem: string) => `You find an ${gem.toLowerCase()} in the rock.`;
export const circletBound = (rune: string) => `The ${rune.toLowerCase()} charm sinks into the circlet's setting and stays there.`;
export const CIRCLET_NEEDS_CHARM = "The circlet wants a charm in its setting, and this altar's charm is not in your pack.";
/** A special spell cast without its staff in hand (the magic plan, stage A4). */
export const needsStaff = (staff: string, name: string) => `You need the ${staff} in hand to cast ${name}.`;
/** An orb spell cast on anything but a glass orb. */
export const ORB_ONLY = "That spell fills a glass orb, and nothing else.";
/** Charge: cast, worn off, and cast again before it has settled. */
export const CHARGED = "Power gathers round you. The high spells will hit the harder while it holds.";
export const CHARGE_FADES = "The gathered power slips away.";
export const CHARGE_WAIT = "The power has not settled since your last Charge.";
/** Send-to: the question put to the other player and its two answers; what the caster hears; and why it could not be cast. */
export const sendAsk = (from: string, town: string) => `${from} wants to send you to ${town}.`;
export const sendGo = (town: string) => `Go to ${town}.`;
export const SEND_STAY = "Stay here.";
export const sendAsked = (name: string) => `You ask ${name} whether they will go.`;
export const sendDeclined = (name: string) => `${name} would rather stay.`;
export const SEND_SELF = "That spell sends someone else. The teleports are for sending yourself.";
export const sendBusy = (name: string) => `${name} is busy just now.`;
export const SEND_FAR = "They're too far off, or out of sight, for that spell.";
export const BURIED = "You bury the bones.";
export const prayerNeeds = (level: number, name: string) => `You need a Prayer level of ${level} to use ${name}.`;
export const PRAYER_SPENT = "You have run out of prayer points. Pray at an altar to restore them.";
export const PRAYER_RESTORED = "You pray at the altar, and your prayer points are restored.";
export const PRAYER_FULL = "Your prayer points are already full.";
/** Clicking the Emberway Gate: it is the keeper's to open, for the toll (PLAN §7.6, Wave 2). */
export const GATE_TOLL = "The gate is barred from the far side. The keeper opens it, for a toll.";
/** A bar that wants a hotter furnace than this one (PLAN §8.3). */
export const furnaceTooCool = (what: string) => `This furnace doesn't run hot enough for ${aOrAn(what)}. Kilnhold's do.`;
/** Clicking the gate across Hollow Pass (PLAN §7.6, Wave 3): the road beyond is Caldmoor's, and not held. */
export const PASS_SHUT = "The gate is barred from this side, and the pass keeper has no intention of lifting the bar.";
/** Clicking the Rill gate before the warden will pass you over (PLAN §7.6, Wave 4): the castle's order, and his to keep. */
export const RILL_SHUT = "The bar is down across the bridge. The warden lifts it for nobody without the castle's leave.";
/** Passed over the Rill gate by its warden: into the fen, and back out of it. */
export const RILL_OVER = "The warden lifts the bar, lets you through, and drops it again behind you.";
export const RILL_BACK = "The warden lifts the bar and lets you back over.";
