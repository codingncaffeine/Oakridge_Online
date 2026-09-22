// Item definitions shared by the server (rules) and the client (names, icons, menus).

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
  };
  /** What left-clicking it in the inventory does when it isn't equipment. */
  action?: "Eat";
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
    equip: { slot: "weapon", bonuses: bonus({ Stab: -1, Slash: 5, Crush: 1, Strength: 4 }) },
  },
  {
    id: 9, key: "bronze_pickaxe", name: "Bronze pickaxe", examine: "A bronze-tipped pick for breaking rock.", value: 16, weight: 2.2,
    equip: { slot: "weapon", bonuses: bonus({ Stab: 5, Slash: -1, Crush: 1, Strength: 4 }) },
  },
  { id: 10, key: "fishing_net", name: "Fishing net", examine: "A fine mesh net for scooping up little fish.", value: 5, weight: 0.4 },
  { id: 11, key: "tinderbox", name: "Tinderbox", examine: "Flint, steel and dry tinder, for lighting fires.", value: 1, weight: 0.1 },
  {
    id: 12, key: "bronze_dagger", name: "Bronze dagger", examine: "A short, sharp bronze blade.", value: 10, weight: 0.4,
    equip: { slot: "weapon", bonuses: bonus({ Stab: 5, Slash: 2, Crush: -3, Strength: 3 }) },
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
  { id: 20, key: "bread", name: "Bread", examine: "A crusty loaf. Good for a quick bite.", value: 12, weight: 0.4, action: "Eat" },
  {
    id: 21, key: "iron_axe", name: "Iron axe", examine: "A sturdy iron axe. It bites deeper than bronze.", value: 60, weight: 1.4,
    equip: { slot: "weapon", bonuses: bonus({ Stab: -2, Slash: 8, Crush: 2, Strength: 7 }) },
  },
  {
    id: 22, key: "steel_axe", name: "Steel axe", examine: "A keen steel axe that makes short work of timber.", value: 210, weight: 1.4,
    equip: { slot: "weapon", bonuses: bonus({ Stab: -2, Slash: 12, Crush: 3, Strength: 11 }) },
  },
  {
    id: 23, key: "iron_pickaxe", name: "Iron pickaxe", examine: "An iron pick, heavy enough to crack stubborn stone.", value: 60, weight: 2.3,
    equip: { slot: "weapon", bonuses: bonus({ Stab: 8, Slash: -2, Crush: 2, Strength: 7 }) },
  },
  {
    id: 24, key: "steel_pickaxe", name: "Steel pickaxe", examine: "A well-balanced steel pick that swings true.", value: 210, weight: 2.3,
    equip: { slot: "weapon", bonuses: bonus({ Stab: 12, Slash: -2, Crush: 3, Strength: 11 }) },
  },
  { id: 25, key: "raw_smelt", name: "Raw smelt", examine: "A slim fish that smells faintly of cucumber. It needs cooking.", value: 9, weight: 0.2 },
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
