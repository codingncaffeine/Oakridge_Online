import type { FishingMethod } from "../shared/gathering.ts";
import type { ItemDef } from "../shared/items.ts";
import { isTree, type ObjectKind, type SignIcon } from "../shared/map.ts";
import { levelOf, MONSTER_BY_KEY } from "../shared/monsters.ts";

export interface ObjectInfo {
  name: string;
  examine: string;
}

/** What each kind of map object is called in menus, and what "Examine" says about it. */
export const OBJECT_INFO: Record<ObjectKind, ObjectInfo> = {
  tree: { name: "Tree", examine: "A common tree. Good firewood, if you had an axe." },
  oak: { name: "Oak", examine: "A broad old oak. It was here long before the village." },
  alder: { name: "Alder", examine: "A waterside tree, pale under its dark bark." },
  rowan: { name: "Rowan", examine: "Slim, red-berried, and fond of high ground." },
  blackthorn: { name: "Blackthorn", examine: "Black wood and long thorns. It does not want cutting." },
  ironbark: { name: "Ironbark", examine: "The bark rings when you knock on it." },
  sablewood: { name: "Sablewood", examine: "Almost black, and taller than anything near it." },
  heartoak: { name: "Heartoak", examine: "Older than the kingdom, by the look of it." },
  rock: { name: "Rocks", examine: "A lump of plain grey rock, with nothing in it worth the digging." },
  copper_rock: { name: "Copper rocks", examine: "Streaks of copper run through this rock." },
  tin_rock: { name: "Tin rocks", examine: "Dull grey tin shows in the stone." },
  iron_rock: { name: "Iron rocks", examine: "Rust-red veins of iron mark this rock." },
  coal_rock: { name: "Coal seam", examine: "A black seam runs through the stone here." },
  silver_rock: { name: "Silver rocks", examine: "Pale metal shows where the rock has split." },
  coldiron_rock: { name: "Coldiron rocks", examine: "Blue-grey veins, cold to the touch." },
  gold_rock: { name: "Gold rocks", examine: "Yellow threads run through the stone." },
  emberite_rock: { name: "Emberite rocks", examine: "The red in this rock looks like it is still burning." },
  starfall_rock: { name: "Starfall rocks", examine: "Something in this rock did not come out of the ground." },
  fence: { name: "Fence", examine: "Rough wooden fencing. It keeps the animals in, mostly." },
  wall: { name: "Wall", examine: "Good grey stone, laid in courses." },
  stone_wall: { name: "Wall", examine: "Old stones, and the marks of older weather." },
  wall_window: { name: "Window", examine: "Small panes in a stone frame. You can't see much through them." },
  door: { name: "Door", examine: "A stout oak door on iron hinges." },
  gate: { name: "Gate", examine: "Heavy, and hung to swing both ways." },
  field_gate: { name: "Gate", examine: "Rails and a brace on a stout post. It keeps the animals in, if you shut it." },
  barred: { name: "Barred mouth", examine: "An adit into the hillside, and iron across it." },
  adit: { name: "Adit", examine: "A mouth in the hillside, and the dark going in. The bars are gone." },
  sealed: { name: "Sealed stair", examine: "Steps going down, and a slab over them that has not moved in years." },
  open_stair: { name: "Barrow stair", examine: "The slab has been shoved aside. The steps go down into a cold that smells of old earth." },
  sign: { name: "Sign", examine: "A painted board on an iron arm, so the trade inside is plain from down the street." },
  bank_booth: { name: "Bank booth", examine: "The clerk on the other side is already looking at you." },
  counter: { name: "Counter", examine: "Goods on the shelf and a keeper behind them." },
  stall: { name: "Market stall", examine: "Boards on trestles, and a bit of everything on top." },
  furnace: { name: "Furnace", examine: "Hot enough to run ore into metal." },
  anvil: { name: "Anvil", examine: "Scarred all over. It has shaped a great deal." },
  range: { name: "Range", examine: "The plate is hot. Something could be cooked here." },
  fire: { name: "Fire", examine: "It will burn a while yet. Long enough to cook on." },
  millstone: { name: "Millstone", examine: "It turns when the sails do, and grinds what is under it." },
  grave: { name: "Grave", examine: "Somebody's name, worn down past reading." },
  sarcophagus: { name: "Sarcophagus", examine: "Stone, and heavier than it looks. Best left shut." },
  table: { name: "Table", examine: "Scrubbed, scarred, and steady enough." },
  barrel: { name: "Barrel", examine: "Sealed, and heavier at one end." },
  crate: { name: "Crate", examine: "Nailed shut. Somebody else's." },
  stairs: { name: "Staircase", examine: "Worn in the middle of every step." },
  ladder: { name: "Ladder", examine: "It looks like it will hold." },
  signpost: { name: "Signpost", examine: "Arms pointing four ways, and two of them have been turned round." },
  bush: { name: "Bush", examine: "Thick and low, and nothing in it." },
  reed: { name: "Reeds", examine: "They rattle when the wind comes off the water." },
  crop: { name: "Crop", examine: "Someone's rows, coming along nicely." },
  well: { name: "Well", examine: "Cold water a long way down, and a bucket that has seen better days." },
  chest: { name: "Chest", examine: "Iron-bound and shut. Somebody meant it to stay that way." },
  trapdoor: { name: "Trapdoor", examine: "Oak boards over a hole, and a smell coming up through the gaps." },
  boat: { name: "Boat", examine: "Tarred planks and a furled sail, riding to her lines. Nobody aboard." },
  altar: { name: "Altar", examine: "Stone, a cloth, two candles, and the quiet." },
  dead_tree: { name: "Dead tree", examine: "Bark gone, wood black, and still standing out of spite." },
  kiln: { name: "Kiln", examine: "Fired brick banked with earth, and hot right through. Kilnhold is named for these." },
  vent: { name: "Vent", examine: "A crack in the rock with the mountain's breath coming up through it. Don't stand over it." },
  round_tower: { name: "Tower", examine: "A round tower of grey stone under a tall slate cap, the way they build past the pass." },
  bell: { name: "Bell", examine: "Mourn's bell, green with the fen, come down to the chapel it was cast for. The lip is scored bright where something has been striking it." },
  // Runesmithing (Phase 18). An altar is named for its rune by `objectInfo`.
  rune_altar: { name: "Altar", examine: "Dark stone with a rune's sign cut in the top. It answers only to its charm." },
  standing_stone: { name: "Standing stone", examine: "Older than anyone's grandmother's stories, and leaning in toward the altar." },
  glimstone: { name: "Glimstone", examine: "Pale rock that holds the light a moment after you look away. There seems to be no end of it." },
  gem_rock: { name: "Gem rock", examine: "Grey stone with coloured points of light caught in it. A pick and some patience might get them out." },
  spinning_wheel: { name: "Spinning wheel", examine: "A treadle, a wheel and a spindle. Wool goes in at one end and yarn comes out at the other." },
  loom: { name: "Loom", examine: "A frame strung with the warp. The yarn goes across it a row at a time." },
  portal: { name: "Portal", examine: "A doorway of old stone with a skin of light across it. Thornbury is through it, or so Vell says." },
};

/** A felled tree, a mined-out rock and a searched chest, while they come back. */
const STUMP: ObjectInfo = { name: "Tree stump", examine: "All that's left of a tree. Another will grow." };
const EMPTY_ROCK: ObjectInfo = { name: "Rocks", examine: "Mined out for now. The ore will come back." };
const OPEN_CHEST: ObjectInfo = { name: "Open chest", examine: "Empty. Whatever was in it will be back, in time." };

/** What a trade's sign is called and says: its picture, and what the picture means is inside. */
const SIGN_INFO: Record<SignIcon, ObjectInfo> = {
  bank: { name: "Bank sign", examine: "Gold scales on blue. A bank: your things kept safe, and nothing taken for it." },
  anvil: { name: "Smithy sign", examine: "An anvil and a hammer. A smithy, with a furnace and an anvil to work at." },
  swords: { name: "Blade sign", examine: "Two swords crossed. Blades sold here." },
  breastplate: { name: "Armour sign", examine: "A breastplate. An armourer's." },
  bow: { name: "Fletcher's sign", examine: "A bow with an arrow on the string. Bows and arrows sold here." },
  star: { name: "Staff seller's sign", examine: "A many-pointed star. Staves, and the things a spell burns." },
  tankard: { name: "Inn sign", examine: "A tankard with a head on it. An inn: a drink, a meal and a fire." },
  bread: { name: "Store sign", examine: "A round loaf. A store: food, and the odds and ends a traveller runs out of." },
  apples: { name: "Market sign", examine: "A pile of apples. The market." },
  fish: { name: "Tackle sign", examine: "A fish. Nets, rods and pots, and they'll buy the catch." },
  tools: { name: "Tool sign", examine: "A pick crossed with an axe. Tools for the trees and the rocks." },
  ring: { name: "Goldsmith's sign", examine: "A gold ring set with a red stone. A goldsmith." },
  anchor: { name: "Shipwright's sign", examine: "An anchor. The shipwright's: hulls built and mended here." },
};

/** The stair down to the Fen Hollows, which is no barrow's. */
const HOLLOWS_STAIR_INFO: ObjectInfo = {
  name: "Hollows stair",
  examine: "The slab lies where it was shoved, and it was shoved from underneath. The steps go down into the wet and the cold.",
};

/** What an object is called and says, as it stands or once it has run out; a sign by the picture on it. */
export function objectInfo(kind: ObjectKind, depleted: boolean, tag?: string): ObjectInfo {
  if (kind === "sign") return SIGN_INFO[tag as SignIcon] ?? OBJECT_INFO.sign;
  if (kind === "open_stair" && tag === "fenhollows") return HOLLOWS_STAIR_INFO;
  if (kind === "rune_altar" && tag) {
    const rune = tag.replace(/_rune$/, "");
    return { name: `${rune[0]!.toUpperCase()}${rune.slice(1)} altar`, examine: `Dark stone with the ${rune} rune's sign cut in the top. It answers only to the ${rune} charm.` };
  }
  if (!depleted) return OBJECT_INFO[kind];
  if (kind === "chest") return OPEN_CHEST;
  return isTree(kind) ? STUMP : EMPTY_ROCK;
}

/**
 * A fishing spot, by what the water offers: the menu option that works it, what it is called, and what
 * "Examine" says. The name is the only sight of a tier a player has before they are near enough to fish.
 */
export const SPOT_INFO: Record<FishingMethod, ObjectInfo & { verb: string }> = {
  net: { verb: "Net", name: "Fishing spot", examine: "Small fish dart about under the surface." },
  angle: { verb: "Cast", name: "Fishing spot", examine: "Something is rising to feed out in the current." },
  trap: { verb: "Set trap", name: "Shellfish bed", examine: "Claws move over the stones down there." },
  harpoon: { verb: "Harpoon", name: "Deep water spot", examine: "A long dark shape turns below the surface." },
};

/** What a creature is called in menus, how hard it looks, and what "Examine" says about it. */
export function monsterInfo(key: string): ObjectInfo & { level: number } {
  const def = MONSTER_BY_KEY.get(key);
  if (!def) return { name: "Creature", examine: "You can't make it out.", level: 0 };
  return { name: def.name, examine: def.examine, level: levelOf(def) };
}

/** "Examine" on an item: its description, or for a stack too big to read in its slot, the exact count. */
export function itemExamine(def: ItemDef, count: number): string {
  return count >= 100_000 ? `${count.toLocaleString("en-GB")} x ${def.name}.` : def.examine;
}
