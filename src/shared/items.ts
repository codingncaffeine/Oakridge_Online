// Item definitions shared by the server (rules) and the client (names, icons, menus).
import type { WeaponClassName } from "./combat.ts";

export const EQUIP_SLOTS = ["head", "cape", "neck", "weapon", "body", "shield", "legs", "hands", "feet", "ring", "ammo"] as const;
export type EquipSlot = (typeof EQUIP_SLOTS)[number];

/** Combat bonuses (unused until there is combat): attack by style, defence by style, then strength and prayer. */
export const BONUS_NAMES = [
  "Stab", "Slash", "Crush", "Magic", "Ranged", "Stab defence", "Slash defence", "Crush defence", "Magic defence",
  "Ranged defence", "Strength", "Prayer",
] as const;
export type Bonuses = number[];

export interface ItemDef {
  id: number;
  key: string;
  name: string;
  examine: string;
  /** Coins-style items share one slot however many there are. */
  stackable?: boolean;
  value: number;
  /** Kilograms, for run energy. Stackable items count their weight once per stack. */
  weight: number;
  equip?: {
    slot: EquipSlot;
    bonuses?: Bonuses;
    /** Colours this item paints on the wearer in place of their own: top, legs, hands, feet. */
    tint?: { top?: number; legs?: number; hands?: number; feet?: number };
    /** Held in a hand and swung: which family of styles it offers. Anything else fights bare-handed. */
    weapon?: WeaponClassName;
  };
  /** What left-clicking it in the inventory does when it isn't equipment. */
  action?: "Eat";
  /** Hitpoints an Eat item restores. */
  heals?: number;
}

const bonus = (partial: Partial<Record<(typeof BONUS_NAMES)[number], number>>): Bonuses =>
  BONUS_NAMES.map((n) => partial[n] ?? 0);

/** Every item. Ids are permanent (saves refer to them): add new items at the end, never renumber. */
export const ITEMS: ItemDef[] = [
  { id: 1, key: "coins", name: "Coins", examine: "Coins of the realm, warm from someone's pocket.", stackable: true, value: 1, weight: 0 },
  { id: 2, key: "logs", name: "Logs", examine: "Freshly cut logs, still smelling of sap.", value: 4, weight: 2 },
  { id: 3, key: "oak_logs", name: "Oak logs", examine: "Heavy, close-grained logs from an oak.", value: 20, weight: 2 },
  { id: 4, key: "copper_ore", name: "Copper ore", examine: "Reddish ore. Smelts well with tin.", value: 5, weight: 2.2 },
  { id: 5, key: "tin_ore", name: "Tin ore", examine: "Dull grey ore. Smelts well with copper.", value: 5, weight: 2.2 },
  { id: 6, key: "iron_ore", name: "Iron ore", examine: "Rust-coloured ore, heavy in the hand.", value: 17, weight: 2.2 },
  { id: 7, key: "raw_sardine", name: "Raw sardine", examine: "A small silver fish. It needs cooking.", value: 5, weight: 0.2 },
  {
    id: 8, key: "bronze_axe", name: "Bronze axe", examine: "A bronze-headed axe for felling trees.", value: 16, weight: 1.3,
    equip: { slot: "weapon", weapon: "axe", bonuses: bonus({ Stab: -1, Slash: 5, Crush: 1, Strength: 4 }) },
  },
  {
    id: 9, key: "bronze_pickaxe", name: "Bronze pickaxe", examine: "A bronze-tipped pick for breaking rock.", value: 16, weight: 2.2,
    equip: { slot: "weapon", weapon: "pick", bonuses: bonus({ Stab: 5, Slash: -1, Crush: 1, Strength: 4 }) },
  },
  { id: 10, key: "fishing_net", name: "Fishing net", examine: "A fine mesh net for scooping up little fish.", value: 5, weight: 0.4 },
  { id: 11, key: "tinderbox", name: "Tinderbox", examine: "Flint, steel and dry tinder, for lighting fires.", value: 1, weight: 0.1 },
  {
    id: 12, key: "bronze_dagger", name: "Bronze dagger", examine: "A short, sharp bronze blade.", value: 10, weight: 0.4,
    equip: { slot: "weapon", weapon: "blade", bonuses: bonus({ Stab: 5, Slash: 2, Crush: -3, Strength: 3 }) },
  },
  {
    id: 13, key: "wooden_shield", name: "Wooden shield", examine: "Planks bound with iron. Better than nothing.", value: 20, weight: 2.3,
    equip: { slot: "shield", bonuses: bonus({ Magic: -1, "Ranged": -2, "Stab defence": 4, "Slash defence": 5, "Crush defence": 3, "Ranged defence": 4 }) },
  },
  {
    id: 14, key: "leather_cap", name: "Leather cap", examine: "A snug cap of boiled leather.", value: 20, weight: 0.4,
    equip: { slot: "head", bonuses: bonus({ "Stab defence": 2, "Slash defence": 3, "Crush defence": 2, "Ranged defence": 3 }) },
  },
  {
    id: 15, key: "leather_jerkin", name: "Leather jerkin", examine: "A sleeveless coat of stiff leather.", value: 30, weight: 3.6,
    equip: { slot: "body", bonuses: bonus({ "Stab defence": 8, "Slash defence": 9, "Crush defence": 10, "Ranged defence": 9 }), tint: { top: 0x7a5230 } },
  },
  {
    id: 16, key: "leather_trousers", name: "Leather trousers", examine: "Hard-wearing trousers for rough work.", value: 25, weight: 2.3,
    equip: { slot: "legs", bonuses: bonus({ "Stab defence": 4, "Slash defence": 5, "Crush defence": 5, "Ranged defence": 4 }), tint: { legs: 0x6a4428 } },
  },
  {
    id: 17, key: "leather_gloves", name: "Leather gloves", examine: "Supple gloves that still let you grip.", value: 10, weight: 0.2,
    equip: { slot: "hands", bonuses: bonus({ "Stab defence": 1, "Slash defence": 1, "Crush defence": 1 }), tint: { hands: 0x6a4428 } },
  },
  {
    id: 18, key: "leather_boots", name: "Leather boots", examine: "Sturdy boots for long roads.", value: 10, weight: 0.3,
    equip: { slot: "feet", bonuses: bonus({ "Stab defence": 1, "Slash defence": 1, "Crush defence": 1 }), tint: { feet: 0x4a3020 } },
  },
  {
    id: 19, key: "red_cape", name: "Red cape", examine: "A bold red cape. It swishes nicely.", value: 12, weight: 0.4,
    equip: { slot: "cape", bonuses: bonus({ "Stab defence": 1, "Slash defence": 1, "Crush defence": 1 }) },
  },
  { id: 20, key: "bread", name: "Bread", examine: "A crusty loaf. Good for a quick bite.", value: 12, weight: 0.4, action: "Eat", heals: 3 },
  {
    id: 21, key: "iron_axe", name: "Iron axe", examine: "A sturdy iron axe. It bites deeper than bronze.", value: 60, weight: 1.4,
    equip: { slot: "weapon", weapon: "axe", bonuses: bonus({ Stab: -2, Slash: 8, Crush: 2, Strength: 7 }) },
  },
  {
    id: 22, key: "steel_axe", name: "Steel axe", examine: "A keen steel axe that makes short work of timber.", value: 210, weight: 1.4,
    equip: { slot: "weapon", weapon: "axe", bonuses: bonus({ Stab: -2, Slash: 12, Crush: 3, Strength: 11 }) },
  },
  {
    id: 23, key: "iron_pickaxe", name: "Iron pickaxe", examine: "An iron pick, heavy enough to crack stubborn stone.", value: 60, weight: 2.3,
    equip: { slot: "weapon", weapon: "pick", bonuses: bonus({ Stab: 8, Slash: -2, Crush: 2, Strength: 7 }) },
  },
  {
    id: 24, key: "steel_pickaxe", name: "Steel pickaxe", examine: "A well-balanced steel pick that swings true.", value: 210, weight: 2.3,
    equip: { slot: "weapon", weapon: "pick", bonuses: bonus({ Stab: 12, Slash: -2, Crush: 3, Strength: 11 }) },
  },
  { id: 25, key: "raw_smelt", name: "Raw smelt", examine: "A slim fish that smells faintly of cucumber. It needs cooking.", value: 9, weight: 0.2 },
  { id: 26, key: "bones", name: "Bones", examine: "Picked clean. Somebody should see to these.", value: 1, weight: 0.4 },
  {
    id: 27, key: "bronze_sword", name: "Bronze sword", examine: "A plain bronze blade with a leather-bound grip.", value: 32, weight: 1.6,
    equip: { slot: "weapon", weapon: "sword", bonuses: bonus({ Stab: 4, Slash: 7, Crush: 2, Strength: 6 }) },
  },
  {
    id: 28, key: "bronze_mace", name: "Bronze mace", examine: "A stubby bronze head on a short haft. It dents things.", value: 30, weight: 1.8,
    equip: { slot: "weapon", weapon: "club", bonuses: bonus({ Stab: 2, Slash: 1, Crush: 8, Strength: 6 }) },
  },
  {
    id: 29, key: "iron_dagger", name: "Iron dagger", examine: "A narrow iron blade, ground to a needle point.", value: 40, weight: 0.4,
    equip: { slot: "weapon", weapon: "blade", bonuses: bonus({ Stab: 9, Slash: 4, Crush: -3, Strength: 6 }) },
  },
  {
    id: 30, key: "iron_sword", name: "Iron sword", examine: "An iron blade with a plain crossguard. Honest work.", value: 120, weight: 1.7,
    equip: { slot: "weapon", weapon: "sword", bonuses: bonus({ Stab: 7, Slash: 12, Crush: 3, Strength: 11 }) },
  },
  {
    // The best weapon there is, and what makes a rare table worth rolling: nothing on the map sells one.
    id: 40, key: "steel_sword", name: "Steel sword", examine: "Pale steel, evenly ground, and heavier than it looks.", value: 420, weight: 1.9,
    equip: { slot: "weapon", weapon: "sword", bonuses: bonus({ Stab: 11, Slash: 18, Crush: 5, Strength: 16 }) },
  },
  {
    id: 31, key: "bronze_helm", name: "Bronze helm", examine: "A bronze cap with a nose guard. It rings when struck.", value: 44, weight: 1.8,
    equip: { slot: "head", bonuses: bonus({ "Stab defence": 3, "Slash defence": 4, "Crush defence": 2, "Ranged defence": 3 }) },
  },
  {
    id: 32, key: "iron_helm", name: "Iron helm", examine: "A heavy iron helm. It muffles everything.", value: 154, weight: 2.2,
    equip: { slot: "head", bonuses: bonus({ "Stab defence": 5, "Slash defence": 7, "Crush defence": 4, "Ranged defence": 5 }) },
  },
  {
    id: 33, key: "bronze_shield", name: "Bronze shield", examine: "A bronze-faced shield, scuffed from use.", value: 60, weight: 4.5,
    equip: {
      slot: "shield",
      bonuses: bonus({ Magic: -2, Ranged: -3, "Stab defence": 6, "Slash defence": 7, "Crush defence": 5, "Ranged defence": 6 }),
    },
  },
  { id: 34, key: "raw_beef", name: "Raw beef", examine: "A cut of beef. Raw, and rather unappealing.", value: 5, weight: 0.5 },
  { id: 35, key: "cowhide", name: "Cowhide", examine: "A stiff hide. A tanner would know what to do with it.", value: 9, weight: 1.4 },
  { id: 36, key: "raw_fowl", name: "Raw fowl", examine: "A plucked bird. It needs cooking.", value: 4, weight: 0.4 },
  { id: 37, key: "feather", name: "Feather", examine: "A small, stiff feather.", stackable: true, value: 1, weight: 0 },
  { id: 38, key: "wolf_pelt", name: "Wolf pelt", examine: "Thick grey fur, still smelling of the forest.", value: 30, weight: 1.2 },
  { id: 39, key: "spider_silk", name: "Spider silk", examine: "A hank of silk. Stronger than it has any right to be.", value: 14, weight: 0.1 },

  // The rest of the woodcutting ladder (PLAN §8.2), in tier order.
  { id: 41, key: "alder_logs", name: "Alder logs", examine: "Damp pale logs from a waterside alder.", value: 45, weight: 2 },
  { id: 42, key: "rowan_logs", name: "Rowan logs", examine: "Reddish logs with a tight, twisting grain.", value: 85, weight: 2 },
  { id: 43, key: "blackthorn_logs", name: "Blackthorn logs", examine: "Hard black logs, still carrying a few thorns.", value: 150, weight: 2 },
  { id: 44, key: "ironbark_logs", name: "Ironbark logs", examine: "So dense they barely float. The axe complained.", value: 260, weight: 2.4 },
  { id: 45, key: "sable_logs", name: "Sable logs", examine: "Near-black logs that smell of woodsmoke already.", value: 420, weight: 2.4 },
  { id: 46, key: "heartoak_logs", name: "Heartoak logs", examine: "The heart of a very old tree. Warm to hold.", value: 700, weight: 2.8 },

  // The rest of the mining ladder (PLAN §8.3), in tier order.
  { id: 47, key: "coal", name: "Coal", examine: "A lump of coal, black and greasy with dust.", value: 45, weight: 2.2 },
  { id: 48, key: "silver_ore", name: "Silver ore", examine: "Pale metal glints in the broken stone.", value: 90, weight: 2.2 },
  { id: 49, key: "coldiron_ore", name: "Coldiron ore", examine: "Blue-grey ore. It never warms in the hand.", value: 160, weight: 2.2 },
  { id: 50, key: "gold_ore", name: "Gold ore", examine: "Heavy ore, threaded with yellow.", value: 200, weight: 2.2 },
  { id: 51, key: "emberite_ore", name: "Emberite ore", examine: "Dull red ore with a heat still in it.", value: 380, weight: 2.2 },
  { id: 52, key: "starfall_ore", name: "Starfall ore", examine: "It fell a long way. The stone remembers.", value: 900, weight: 2.2 },

  // The rest of the fishing ladder (PLAN §8.4), in tier order.
  { id: 53, key: "raw_redfin", name: "Raw redfin", examine: "A river fish with a red-edged fin. It needs cooking.", value: 18, weight: 0.3 },
  { id: 54, key: "raw_grayling", name: "Raw grayling", examine: "Silver-grey, with a tall sail on its back. It needs cooking.", value: 32, weight: 0.4 },
  { id: 55, key: "raw_bay_crab", name: "Raw bay crab", examine: "A broad crab, still waving one claw. It needs cooking.", value: 55, weight: 0.5 },
  { id: 56, key: "raw_blackfish", name: "Raw blackfish", examine: "A heavy dark fish out of deep water. It needs cooking.", value: 90, weight: 0.9 },
  { id: 57, key: "raw_deepclaw", name: "Raw deepclaw", examine: "A long-armed crab from the cold deep. It needs cooking.", value: 140, weight: 0.7 },
  { id: 58, key: "raw_hoarfish", name: "Raw hoarfish", examine: "Pale northern fish, cold right through. It needs cooking.", value: 220, weight: 1.2 },

  // The three fishing tools the ladder needs beyond the net, and the bait a rod spends.
  { id: 59, key: "fishing_rod", name: "Fishing rod", examine: "A springy rod with a line and hook. It wants bait.", value: 40, weight: 1 },
  { id: 60, key: "creel", name: "Creel", examine: "A wicker trap, weighted to sit on the bottom.", value: 60, weight: 1.5 },
  {
    id: 61, key: "harpoon", name: "Harpoon", examine: "A barbed head on a stout shaft, for fish that fight back.", value: 90, weight: 3,
    equip: { slot: "weapon", weapon: "pick", bonuses: bonus({ Stab: 10, Slash: -2, Crush: 1, Strength: 8 }) },
  },
  { id: 62, key: "bait", name: "Bait", examine: "Pungent scraps that fish seem to like.", stackable: true, value: 2, weight: 0 },
];

export const ITEM_BY_ID = new Map(ITEMS.map((d) => [d.id, d]));
export const ITEM_BY_KEY = new Map(ITEMS.map((d) => [d.key, d]));

export function item(key: string): ItemDef {
  const def = ITEM_BY_KEY.get(key);
  if (!def) throw new Error(`no item ${key}`);
  return def;
}

/** An inventory slot or ground pile: which item, how many. */
export interface Stack {
  id: number;
  count: number;
}

export const INVENTORY_SIZE = 28;
/** The most of one stackable item a slot can hold (the largest signed 32-bit number). */
export const MAX_STACK = 2_147_483_647;

/** Stack counts as the classic client shows them: exact under 100,000, then K, then M from ten million. */
export function stackLabel(count: number): { text: string; color: "yellow" | "white" | "green" } {
  if (count < 100_000) return { text: String(count), color: "yellow" };
  if (count < 10_000_000) return { text: `${Math.floor(count / 1000)}K`, color: "white" };
  return { text: `${Math.floor(count / 1_000_000)}M`, color: "green" };
}

/** Equipment slots other players can see, in the order a player's `gear` lists them. */
export const VISIBLE_GEAR: EquipSlot[] = ["head", "cape", "weapon", "body", "shield", "legs", "hands", "feet"];
