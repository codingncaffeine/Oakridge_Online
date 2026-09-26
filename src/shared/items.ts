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
  /** A stackable item whose slot holds at most this many: past it the next ones start a slot of their own. */
  stackLimit?: number;
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
    /** A blessed silver blade's bite (Crafting, C6): the top of a melee blow against the undead is this many times higher. */
    vsUndead?: number;
  };
  /** What left-clicking it in the inventory does when it isn't equipment: a charm's Locate says which way its altar lies. */
  action?: "Eat" | "Bury" | "Locate" | "Rub";
  /** Hitpoints an Eat item restores. */
  heals?: number;
  /** Prayer XP (tenths) a Bury item pays when it goes into the ground. */
  prayerXp?: number;
  /** A bag (Crafting, C2): worn in one of the BAG_SLOTS, it adds this many slots to the pack. */
  bag?: number;
}

/** A slot of glimstone, plain or pure, holds this many. */
export const GLIMSTONE_STACK = 99;

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
    equip: { slot: "head", bonuses: bonus({ "Stab defence": 2, "Slash defence": 3, "Crush defence": 2, "Magic defence": 2, "Ranged defence": 3 }) },
  },
  {
    id: 15, key: "leather_jerkin", name: "Leather jerkin", examine: "A sleeveless coat of stiff leather.", value: 30, weight: 3.6,
    equip: { slot: "body", bonuses: bonus({ "Stab defence": 8, "Slash defence": 9, "Crush defence": 10, "Magic defence": 5, "Ranged defence": 9 }), tint: { top: 0x7a5230 } },
  },
  {
    id: 16, key: "leather_trousers", name: "Leather trousers", examine: "Hard-wearing trousers for rough work.", value: 25, weight: 2.3,
    equip: { slot: "legs", bonuses: bonus({ "Stab defence": 4, "Slash defence": 5, "Crush defence": 5, "Magic defence": 3, "Ranged defence": 4 }), tint: { legs: 0x6a4428 } },
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
  { id: 26, key: "bones", name: "Bones", examine: "Picked clean. Somebody should see to these.", value: 1, weight: 0.4, action: "Bury", prayerXp: 45 },
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
    equip: { slot: "head", bonuses: bonus({ "Stab defence": 3, "Slash defence": 4, "Crush defence": 2, "Magic defence": -2, "Ranged defence": 3 }) },
  },
  {
    id: 32, key: "iron_helm", name: "Iron helm", examine: "A heavy iron helm. It muffles everything.", value: 154, weight: 2.2,
    equip: { slot: "head", bonuses: bonus({ "Stab defence": 5, "Slash defence": 7, "Crush defence": 4, "Magic defence": -3, "Ranged defence": 5 }) },
  },
  {
    id: 33, key: "bronze_shield", name: "Bronze shield", examine: "A bronze-faced shield, scuffed from use.", value: 60, weight: 4.5,
    equip: {
      slot: "shield",
      bonuses: bonus({ Magic: -2, Ranged: -3, "Stab defence": 6, "Slash defence": 7, "Crush defence": 5, "Magic defence": -3, "Ranged defence": 6 }),
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

  // --- Phase 8 -------------------------------------------------------------------------------
  // Bars, in the metal order of PLAN §8.3, then the two soft metals that go to crafting instead.
  { id: 63, key: "bronze_bar", name: "Bronze bar", examine: "Copper and tin, run together and cooled.", value: 20, weight: 1.6 },
  { id: 64, key: "iron_bar", name: "Iron bar", examine: "A bar of grey iron, still faintly warm.", value: 70, weight: 1.6 },
  { id: 65, key: "steel_bar", name: "Steel bar", examine: "Iron and coal, made into something better.", value: 240, weight: 1.6 },
  { id: 66, key: "coldiron_bar", name: "Coldiron bar", examine: "It takes the heat and gives none of it back.", value: 700, weight: 1.7 },
  { id: 67, key: "emberite_bar", name: "Emberite bar", examine: "A dull red glow that never quite goes out.", value: 1800, weight: 1.7 },
  { id: 68, key: "starfall_bar", name: "Starfall bar", examine: "Pale and faintly speckled, like a night sky.", value: 4200, weight: 1.8 },
  { id: 69, key: "silver_bar", name: "Silver bar", examine: "Bright, soft, and far too pretty for a blade.", value: 180, weight: 1.6 },
  { id: 70, key: "gold_bar", name: "Gold bar", examine: "Heavy and yellow. It buys more than it cuts.", value: 400, weight: 1.6 },

  // Cooking: one cooked fish per rung of §8.4, the two farm meats, and the two ways to ruin them.
  { id: 71, key: "sardine", name: "Sardine", examine: "Cooked through, and gone in two bites.", value: 10, weight: 0.2, action: "Eat", heals: 3 },
  { id: 72, key: "smelt", name: "Smelt", examine: "Crisp at the edges. Better than it looks.", value: 18, weight: 0.2, action: "Eat", heals: 5 },
  { id: 73, key: "redfin", name: "Redfin", examine: "Firm pink flesh off the bone.", value: 36, weight: 0.3, action: "Eat", heals: 8 },
  { id: 74, key: "grayling", name: "Grayling", examine: "Cooked whole, skin and all.", value: 64, weight: 0.4, action: "Eat", heals: 11 },
  { id: 75, key: "bay_crab", name: "Bay crab", examine: "Cracked and dressed. Worth the work.", value: 110, weight: 0.5, action: "Eat", heals: 14 },
  { id: 76, key: "blackfish", name: "Blackfish", examine: "Dark, oily and filling.", value: 180, weight: 0.9, action: "Eat", heals: 17 },
  { id: 77, key: "deepclaw", name: "Deepclaw", examine: "Sweet white meat from a very long arm.", value: 280, weight: 0.7, action: "Eat", heals: 20 },
  { id: 78, key: "hoarfish", name: "Hoarfish", examine: "It cooks pale and stays cold in the middle. That's right.", value: 440, weight: 1.2, action: "Eat", heals: 23 },
  { id: 79, key: "cooked_beef", name: "Cooked beef", examine: "A browned cut of beef.", value: 12, weight: 0.5, action: "Eat", heals: 4 },
  { id: 80, key: "cooked_fowl", name: "Cooked fowl", examine: "Roasted, and nicely crisped.", value: 10, weight: 0.4, action: "Eat", heals: 4 },
  { id: 81, key: "burnt_fish", name: "Burnt fish", examine: "Black, brittle and no use to anyone.", value: 1, weight: 0.2 },
  { id: 82, key: "burnt_meat", name: "Burnt meat", examine: "A cinder that used to be dinner.", value: 1, weight: 0.4 },

  // Smithing tools, and the two a leatherworker needs.
  { id: 83, key: "hammer", name: "Hammer", examine: "A smith's hammer, worn smooth at the grip.", value: 12, weight: 1.5 },
  { id: 84, key: "needle", name: "Needle", examine: "A stout needle for punching through hide.", value: 2, weight: 0 },
  { id: 85, key: "thread", name: "Thread", examine: "Waxed thread on a little card.", stackable: true, value: 1, weight: 0 },
  { id: 86, key: "leather", name: "Leather", examine: "A cured hide, ready for the needle.", value: 16, weight: 1.1 },

  // Smithing: the rungs missing from iron and steel, then the three metals above them in full.
  // Bronze is already complete above; every bonus here is scaled from its bronze and iron anchors.
  {
    id: 87, key: "iron_mace", name: "Iron mace", examine: "An iron head that lands like a dropped anvil.", value: 105, weight: 2,
    equip: { slot: "weapon", weapon: "club", bonuses: bonus({ Stab: 3, Slash: 2, Crush: 13, Strength: 10 }) },
  },
  {
    id: 88, key: "iron_shield", name: "Iron shield", examine: "Iron over oak. It has stopped a few things.", value: 210, weight: 5,
    equip: {
      slot: "shield",
      bonuses: bonus({ Magic: -3, Ranged: -4, "Stab defence": 10, "Slash defence": 12, "Crush defence": 8, "Magic defence": -4, "Ranged defence": 10 }),
    },
  },
  {
    id: 89, key: "steel_dagger", name: "Steel dagger", examine: "A steel point that goes in without asking.", value: 140, weight: 0.4,
    equip: { slot: "weapon", weapon: "blade", bonuses: bonus({ Stab: 14, Slash: 6, Crush: -3, Strength: 9 }) },
  },
  {
    id: 90, key: "steel_mace", name: "Steel mace", examine: "Steel, and heavier at the far end than it looks.", value: 370, weight: 2.1,
    equip: { slot: "weapon", weapon: "club", bonuses: bonus({ Stab: 4, Slash: 2, Crush: 19, Strength: 15 }) },
  },
  {
    id: 91, key: "steel_helm", name: "Steel helm", examine: "A steel helm with a hinged cheek guard.", value: 540, weight: 2.4,
    equip: { slot: "head", bonuses: bonus({ "Stab defence": 8, "Slash defence": 10, "Crush defence": 6, "Magic defence": -4, "Ranged defence": 8 }) },
  },
  {
    id: 92, key: "steel_shield", name: "Steel shield", examine: "Faced with steel and rimmed in iron.", value: 740, weight: 5.4,
    equip: {
      slot: "shield",
      bonuses: bonus({ Magic: -4, Ranged: -5, "Stab defence": 15, "Slash defence": 17, "Crush defence": 12, "Magic defence": -5, "Ranged defence": 15 }),
    },
  },
  {
    id: 93, key: "coldiron_dagger", name: "Coldiron dagger", examine: "The blade frosts over where your hand isn't.", value: 480, weight: 0.5,
    equip: { slot: "weapon", weapon: "blade", bonuses: bonus({ Stab: 19, Slash: 8, Crush: -3, Strength: 12 }) },
  },
  {
    id: 94, key: "coldiron_sword", name: "Coldiron sword", examine: "It hums faintly, and the edge never dulls.", value: 1450, weight: 2,
    equip: { slot: "weapon", weapon: "sword", bonuses: bonus({ Stab: 15, Slash: 25, Crush: 7, Strength: 22 }) },
  },
  {
    id: 95, key: "coldiron_mace", name: "Coldiron mace", examine: "Cold to hold, and colder to be hit with.", value: 1100, weight: 2.3,
    equip: { slot: "weapon", weapon: "club", bonuses: bonus({ Stab: 5, Slash: 3, Crush: 26, Strength: 20 }) },
  },
  {
    id: 96, key: "coldiron_axe", name: "Coldiron axe", examine: "Timber splits ahead of the blade, as if it knew.", value: 720, weight: 1.5,
    equip: { slot: "weapon", weapon: "axe", bonuses: bonus({ Stab: -2, Slash: 17, Crush: 4, Strength: 15 }) },
  },
  {
    id: 97, key: "coldiron_pickaxe", name: "Coldiron pickaxe", examine: "Stone gives up sooner than the pick does.", value: 720, weight: 2.4,
    equip: { slot: "weapon", weapon: "pick", bonuses: bonus({ Stab: 17, Slash: -2, Crush: 4, Strength: 15 }) },
  },
  {
    id: 98, key: "coldiron_helm", name: "Coldiron helm", examine: "Your breath fogs inside it, even in summer.", value: 1600, weight: 2.5,
    equip: { slot: "head", bonuses: bonus({ "Stab defence": 11, "Slash defence": 14, "Crush defence": 9, "Magic defence": -5, "Ranged defence": 11 }) },
  },
  {
    id: 99, key: "coldiron_shield", name: "Coldiron shield", examine: "Blows land on it and seem to lose interest.", value: 2200, weight: 5.6,
    equip: {
      slot: "shield",
      bonuses: bonus({ Magic: -5, Ranged: -6, "Stab defence": 21, "Slash defence": 24, "Crush defence": 17, "Magic defence": -6, "Ranged defence": 21 }),
    },
  },
  {
    id: 100, key: "emberite_dagger", name: "Emberite dagger", examine: "The blade glows when it is drawn.", value: 1250, weight: 0.5,
    equip: { slot: "weapon", weapon: "blade", bonuses: bonus({ Stab: 25, Slash: 11, Crush: -3, Strength: 16 }) },
  },
  {
    id: 101, key: "emberite_sword", name: "Emberite sword", examine: "Hot to the touch, and it sears what it cuts.", value: 3700, weight: 2.1,
    equip: { slot: "weapon", weapon: "sword", bonuses: bonus({ Stab: 20, Slash: 33, Crush: 9, Strength: 29 }) },
  },
  {
    id: 102, key: "emberite_mace", name: "Emberite mace", examine: "The head smokes gently between swings.", value: 2800, weight: 2.4,
    equip: { slot: "weapon", weapon: "club", bonuses: bonus({ Stab: 7, Slash: 4, Crush: 34, Strength: 26 }) },
  },
  {
    id: 103, key: "emberite_axe", name: "Emberite axe", examine: "It leaves the cut edge scorched.", value: 1900, weight: 1.6,
    equip: { slot: "weapon", weapon: "axe", bonuses: bonus({ Stab: -2, Slash: 22, Crush: 5, Strength: 20 }) },
  },
  {
    id: 104, key: "emberite_pickaxe", name: "Emberite pickaxe", examine: "Rock crumbles where the point rests.", value: 1900, weight: 2.5,
    equip: { slot: "weapon", weapon: "pick", bonuses: bonus({ Stab: 22, Slash: -2, Crush: 5, Strength: 20 }) },
  },
  {
    id: 105, key: "emberite_helm", name: "Emberite helm", examine: "Warm as a hearth, and it never fogs.", value: 4100, weight: 2.6,
    equip: { slot: "head", bonuses: bonus({ "Stab defence": 15, "Slash defence": 18, "Crush defence": 12, "Magic defence": -6, "Ranged defence": 15 }) },
  },
  {
    id: 106, key: "emberite_shield", name: "Emberite shield", examine: "A red line runs round the rim, and stays lit.", value: 5600, weight: 5.8,
    equip: {
      slot: "shield",
      bonuses: bonus({ Magic: -6, Ranged: -7, "Stab defence": 27, "Slash defence": 31, "Crush defence": 22, "Magic defence": -7, "Ranged defence": 27 }),
    },
  },
  {
    id: 107, key: "starfall_dagger", name: "Starfall dagger", examine: "It is lighter than it has any business being.", value: 3000, weight: 0.4,
    equip: { slot: "weapon", weapon: "blade", bonuses: bonus({ Stab: 32, Slash: 14, Crush: -3, Strength: 20 }) },
  },
  {
    id: 108, key: "starfall_sword", name: "Starfall sword", examine: "The speckles in the steel move when you don't look.", value: 8800, weight: 2,
    equip: { slot: "weapon", weapon: "sword", bonuses: bonus({ Stab: 26, Slash: 42, Crush: 12, Strength: 37 }) },
  },
  {
    id: 109, key: "starfall_mace", name: "Starfall mace", examine: "It falls faster than you swing it.", value: 6700, weight: 2.2,
    equip: { slot: "weapon", weapon: "club", bonuses: bonus({ Stab: 9, Slash: 5, Crush: 43, Strength: 33 }) },
  },
  {
    id: 110, key: "starfall_axe", name: "Starfall axe", examine: "A heartoak took three swings. Three.", value: 4500, weight: 1.4,
    equip: { slot: "weapon", weapon: "axe", bonuses: bonus({ Stab: -2, Slash: 28, Crush: 7, Strength: 25 }) },
  },
  {
    id: 111, key: "starfall_pickaxe", name: "Starfall pickaxe", examine: "It came out of the ground. Now it goes back in.", value: 4500, weight: 2.2,
    equip: { slot: "weapon", weapon: "pick", bonuses: bonus({ Stab: 28, Slash: -2, Crush: 7, Strength: 25 }) },
  },
  {
    id: 112, key: "starfall_helm", name: "Starfall helm", examine: "Pale metal, and the speckles show best in the dark.", value: 9800, weight: 2.3,
    equip: { slot: "head", bonuses: bonus({ "Stab defence": 20, "Slash defence": 24, "Crush defence": 16, "Magic defence": -7, "Ranged defence": 20 }) },
  },
  {
    id: 113, key: "starfall_shield", name: "Starfall shield", examine: "Nothing has got through it yet.", value: 13000, weight: 5.2,
    equip: {
      slot: "shield",
      bonuses: bonus({ Magic: -7, Ranged: -8, "Stab defence": 35, "Slash defence": 40, "Crush defence": 28, "Magic defence": -8, "Ranged defence": 35 }),
    },
  },

  // Crafting: what silver and gold are for, since neither takes an edge (PLAN §8.3).
  { id: 114, key: "silver_ring", name: "Silver ring", examine: "A plain silver band.", value: 220, weight: 0, equip: { slot: "ring" } },
  { id: 115, key: "gold_ring", name: "Gold ring", examine: "Heavier than it looks, and warmer.", value: 480, weight: 0, equip: { slot: "ring" } },
  {
    id: 116, key: "gold_amulet", name: "Gold amulet", examine: "A gold disc on a fine chain.", value: 620, weight: 0.1,
    equip: { slot: "neck", bonuses: bonus({ "Stab defence": 2, "Slash defence": 2, "Crush defence": 2 }) },
  },

  // Fletching: shafts and string first, then the bows, which Ranged (Phase 11) shoots.
  { id: 117, key: "arrow_shafts", name: "Arrow shafts", examine: "Straight lengths of wood, waiting for a head.", stackable: true, value: 1, weight: 0 },
  { id: 118, key: "bow_string", name: "Bow string", examine: "Spider silk, spun and waxed. It hums.", stackable: true, value: 12, weight: 0 },
  { id: 119, key: "unstrung_shortbow", name: "Unstrung shortbow", examine: "A short stave, bent and notched. It needs a string.", value: 18, weight: 1 },
  { id: 120, key: "unstrung_longbow", name: "Unstrung longbow", examine: "A tall stave, bent and notched. It needs a string.", value: 30, weight: 1.4 },
  { id: 121, key: "unstrung_oak_shortbow", name: "Unstrung oak shortbow", examine: "Oak, short and stiff. It needs a string.", value: 60, weight: 1 },
  { id: 122, key: "unstrung_oak_longbow", name: "Unstrung oak longbow", examine: "Oak, tall and heavy. It needs a string.", value: 90, weight: 1.4 },
  {
    id: 123, key: "shortbow", name: "Shortbow", examine: "Quick to draw, and quiet.", value: 40, weight: 1,
    equip: { slot: "weapon", weapon: "bow", bonuses: bonus({ Ranged: 8 }) },
  },
  {
    id: 124, key: "longbow", name: "Longbow", examine: "Slow to draw, and it carries.", value: 70, weight: 1.4,
    equip: { slot: "weapon", weapon: "bow", bonuses: bonus({ Ranged: 12 }) },
  },
  {
    id: 125, key: "oak_shortbow", name: "Oak shortbow", examine: "Oak, and it fights you all the way back.", value: 130, weight: 1,
    equip: { slot: "weapon", weapon: "bow", bonuses: bonus({ Ranged: 16 }) },
  },
  {
    id: 126, key: "oak_longbow", name: "Oak longbow", examine: "As tall as you are, and twice as stubborn.", value: 190, weight: 1.4,
    equip: { slot: "weapon", weapon: "bow", bonuses: bonus({ Ranged: 22 }) },
  },
  { id: 127, key: "bronze_arrowheads", name: "Bronze arrowheads", examine: "Fifteen little bronze points.", stackable: true, value: 2, weight: 0 },
  { id: 128, key: "iron_arrowheads", name: "Iron arrowheads", examine: "Fifteen little iron points.", stackable: true, value: 6, weight: 0 },
  { id: 129, key: "steel_arrowheads", name: "Steel arrowheads", examine: "Fifteen little steel points.", stackable: true, value: 20, weight: 0 },
  {
    id: 130, key: "bronze_arrow", name: "Bronze arrow", examine: "Shaft, feather and a bronze head.", stackable: true, value: 4, weight: 0,
    equip: { slot: "ammo", bonuses: bonus({ Ranged: 7 }) },
  },
  {
    id: 131, key: "iron_arrow", name: "Iron arrow", examine: "Shaft, feather and an iron head.", stackable: true, value: 10, weight: 0,
    equip: { slot: "ammo", bonuses: bonus({ Ranged: 10 }) },
  },
  {
    id: 132, key: "steel_arrow", name: "Steel arrow", examine: "Shaft, feather and a steel head.", stackable: true, value: 26, weight: 0,
    equip: { slot: "ammo", bonuses: bonus({ Ranged: 16 }) },
  },
  // Magic (Phase 11): the staves, the reagents that are runes now, and the wool a mage wears. Wool keeps out a
  // bolt and nothing else: an arrow goes straight through it, which is the third side of the triangle.
  {
    id: 133, key: "ash_staff", name: "Ash staff", examine: "Pale ash, worn smooth where the hand goes, and a knot at the top that hums.", value: 60, weight: 1.8,
    equip: { slot: "weapon", weapon: "staff", bonuses: bonus({ Crush: 4, Magic: 8, "Magic defence": 2, Strength: 3 }) },
  },
  {
    id: 134, key: "oak_staff", name: "Oak staff", examine: "Heavy oak, iron-shod, with a glass bead set in the head.", value: 180, weight: 2.2,
    equip: { slot: "weapon", weapon: "staff", bonuses: bonus({ Crush: 6, Magic: 12, "Magic defence": 4, Strength: 5 }) },
  },
  // Phase 11's three reagents are three of the magic plan's runes now, under the same ids, so every pack and bank keeps them.
  { id: 135, key: "ember_rune", name: "Ember rune", examine: "A stone carved with a flame, warm in the palm. The fire in every fire spell.", stackable: true, value: 4, weight: 0 },
  { id: 136, key: "tide_rune", name: "Tide rune", examine: "A blue stone carved with a wave. It is always faintly damp.", stackable: true, value: 4, weight: 0 },
  { id: 137, key: "gale_rune", name: "Gale rune", examine: "A pale stone carved with the curl of the wind. It weighs less than it should.", stackable: true, value: 4, weight: 0 },
  {
    id: 138, key: "wool_robe", name: "Wool robe", examine: "Deep blue wool, hooded at the neck. It turns a spell and little else.", value: 40, weight: 1.2,
    equip: { slot: "body", bonuses: bonus({ Magic: 4, "Magic defence": 6, "Ranged defence": -4 }), tint: { top: 0x3a4a80 } },
  },
  {
    id: 139, key: "wool_hood", name: "Wool hood", examine: "A soft blue hood. It keeps the rain off and a spell out.", value: 20, weight: 0.3,
    equip: { slot: "head", bonuses: bonus({ Magic: 2, "Magic defence": 3, "Ranged defence": -2 }) },
  },
  // The Silence at Mourn (Wave 4): the castle's leave to cross the Black Rill, sealed by the castellan.
  { id: 140, key: "sealed_leave", name: "Sealed leave", examine: "Folded parchment under the castle's seal. It says you may cross the Rill, at some length.", value: 1, weight: 0 },
  // Magic built out (the magic plan, stage A1): the rest of the runes, then a staff for each element that stands in for its rune.
  { id: 141, key: "stone_rune", name: "Stone rune", examine: "A brown stone carved with a peak. Heavy, and patient about it.", stackable: true, value: 4, weight: 0 },
  { id: 142, key: "thought_rune", name: "Thought rune", examine: "Carved with an open eye. Holding it, you notice things.", stackable: true, value: 3, weight: 0 },
  { id: 143, key: "sinew_rune", name: "Sinew rune", examine: "Carved with a knotted cord. It flexes, very slightly.", stackable: true, value: 3, weight: 0 },
  { id: 144, key: "wild_rune", name: "Wild rune", examine: "Carved with a spiral that will not sit still while you look at it.", stackable: true, value: 60, weight: 0 },
  { id: 145, key: "bloom_rune", name: "Bloom rune", examine: "Carved with a leaf, and green at the edges as if it grew there.", stackable: true, value: 110, weight: 0 },
  { id: 146, key: "oath_rune", name: "Oath rune", examine: "Carved with a ring bound shut. It keeps what it is told.", stackable: true, value: 150, weight: 0 },
  { id: 147, key: "grave_rune", name: "Grave rune", examine: "Carved with a barrow's mound. It is cold, and it stays cold.", stackable: true, value: 170, weight: 0 },
  { id: 148, key: "heart_rune", name: "Heart rune", examine: "Carved with a heart, and it beats if you hold it long enough.", stackable: true, value: 250, weight: 0 },
  { id: 149, key: "shade_rune", name: "Shade rune", examine: "A dark stone carved with a hollow ring. It casts no shadow at all.", stackable: true, value: 250, weight: 0 },
  { id: 150, key: "fury_rune", name: "Fury rune", examine: "Carved with a jagged stroke, and hot with something that is not heat.", stackable: true, value: 320, weight: 0 },
  {
    id: 151, key: "gale_staff", name: "Gale staff", examine: "A pale stone caught in the head of it, and the wind comes when it is called. It stands in for gale runes.", value: 1200, weight: 2,
    equip: { slot: "weapon", weapon: "staff", bonuses: bonus({ Crush: 5, Magic: 10, "Magic defence": 8, Strength: 3 }) },
  },
  {
    id: 152, key: "tide_staff", name: "Tide staff", examine: "A blue stone caught in the head of it, beaded with water that never drips. It stands in for tide runes.", value: 1200, weight: 2,
    equip: { slot: "weapon", weapon: "staff", bonuses: bonus({ Crush: 5, Magic: 10, "Magic defence": 8, Strength: 3 }) },
  },
  {
    id: 153, key: "stone_staff", name: "Stone staff", examine: "A brown stone caught in the head of it, and the staff is heavier for it. It stands in for stone runes.", value: 1200, weight: 2.4,
    equip: { slot: "weapon", weapon: "staff", bonuses: bonus({ Crush: 6, Magic: 10, "Magic defence": 8, Strength: 4 }) },
  },
  {
    id: 154, key: "ember_staff", name: "Ember staff", examine: "A red stone caught in the head of it, too warm to hold for long. It stands in for ember runes.", value: 1200, weight: 2,
    equip: { slot: "weapon", weapon: "staff", bonuses: bonus({ Crush: 5, Magic: 10, "Magic defence": 8, Strength: 3 }) },
  },
  // What Bones to Plums makes of bones (the magic plan, stage A3).
  { id: 155, key: "plum", name: "Plum", examine: "Dark, sweet and heavy with juice. Nobody asks where it came from.", value: 24, weight: 0.1, action: "Eat", heals: 8 },
  // The element spells on this game's own terms (the magic plan, stage A4): the Star rune, the glass orb the
  // orb spells fill and the four they make, the battlestaff an orb is set in, and the staff each special spell
  // is cast through.
  { id: 156, key: "star_rune", name: "Star rune", examine: "Carved with a small star, and it keeps a faint light of its own in the dark.", stackable: true, value: 90, weight: 0 },
  { id: 157, key: "glass_orb", name: "Glass orb", examine: "A ball of clear glass, waiting for something to fill it.", value: 60, weight: 0.3 },
  { id: 158, key: "tide_orb", name: "Tide orb", examine: "Blue all through, and something moves inside it like a slow current.", value: 650, weight: 0.3 },
  { id: 159, key: "stone_orb", name: "Stone orb", examine: "Green-brown and heavy, as if it had been filled with the ground itself.", value: 700, weight: 0.4 },
  { id: 160, key: "ember_orb", name: "Ember orb", examine: "Red at the heart and warm in the hand. It glows brighter when you breathe on it.", value: 750, weight: 0.3 },
  { id: 161, key: "gale_orb", name: "Gale orb", examine: "Almost clear. A breeze turns inside it that nothing outside can feel.", value: 800, weight: 0.2 },
  {
    id: 162, key: "battlestaff", name: "Battlestaff", examine: "A stout staff shod at both ends, with an empty socket in the head for an orb.", value: 2400, weight: 2.3,
    equip: { slot: "weapon", weapon: "staff", bonuses: bonus({ Crush: 8, Magic: 10, "Magic defence": 8, Strength: 6 }) },
  },
  {
    id: 163, key: "tide_battlestaff", name: "Tide battlestaff", examine: "A tide orb set fast in a battlestaff's head. It stands in for tide runes.", value: 3600, weight: 2.5,
    equip: { slot: "weapon", weapon: "staff", bonuses: bonus({ Crush: 9, Magic: 12, "Magic defence": 10, Strength: 7 }) },
  },
  {
    id: 164, key: "stone_battlestaff", name: "Stone battlestaff", examine: "A stone orb set fast in a battlestaff's head, and the staff is the heavier for it. It stands in for stone runes.", value: 3600, weight: 2.8,
    equip: { slot: "weapon", weapon: "staff", bonuses: bonus({ Crush: 10, Magic: 12, "Magic defence": 10, Strength: 8 }) },
  },
  {
    id: 165, key: "ember_battlestaff", name: "Ember battlestaff", examine: "An ember orb set fast in a battlestaff's head. The socket has gone black round it. It stands in for ember runes.", value: 3600, weight: 2.5,
    equip: { slot: "weapon", weapon: "staff", bonuses: bonus({ Crush: 9, Magic: 12, "Magic defence": 10, Strength: 7 }) },
  },
  {
    id: 166, key: "gale_battlestaff", name: "Gale battlestaff", examine: "A gale orb set fast in a battlestaff's head. It swings lighter than it should. It stands in for gale runes.", value: 3600, weight: 2.2,
    equip: { slot: "weapon", weapon: "staff", bonuses: bonus({ Crush: 9, Magic: 12, "Magic defence": 10, Strength: 7 }) },
  },
  {
    id: 167, key: "dawn_staff", name: "Dawn staff", examine: "Pale wood capped in gold, and the head of it is never quite in shadow. Sunfall is cast through it.", value: 12000, weight: 2.2,
    equip: { slot: "weapon", weapon: "staff", bonuses: bonus({ Crush: 7, Magic: 14, "Magic defence": 12, Strength: 5 }) },
  },
  {
    id: 168, key: "pyre_staff", name: "Pyre staff", examine: "Black wood that has been through a fire and come out harder. Pyre is cast through it.", value: 12000, weight: 2.2,
    equip: { slot: "weapon", weapon: "staff", bonuses: bonus({ Crush: 7, Magic: 14, "Magic defence": 12, Strength: 5 }) },
  },
  {
    id: 169, key: "briar_staff", name: "Briar staff", examine: "A thorned stem that has not yet noticed it was cut. Wildclaw is cast through it.", value: 12000, weight: 2,
    equip: { slot: "weapon", weapon: "staff", bonuses: bonus({ Crush: 7, Magic: 14, "Magic defence": 12, Strength: 5 }) },
  },
  {
    id: 170, key: "sear_staff", name: "Sear staff", examine: "Dark stone that was never cut, only broken off the mountain's heart. Scorch is cast through it.", value: 8000, weight: 2.6,
    equip: { slot: "weapon", weapon: "staff", bonuses: bonus({ Crush: 8, Magic: 15, "Magic defence": 10, Strength: 6 }) },
  },
  {
    id: 171, key: "hunter_staff", name: "Hunter's staff", examine: "Plain ash, notched along its length with a tally nobody has finished. Thought Dart is cast through it.", value: 6000, weight: 1.9,
    equip: { slot: "weapon", weapon: "staff", bonuses: bonus({ Crush: 6, Magic: 12, "Magic defence": 8, Strength: 4 }) },
  },
  // Runesmithing (Phase 18): the stone runes are carved from, mined in the glimstone pit, and a charm for each
  // altar, without which the altar will not answer.
  // Both kinds of glimstone stack, 99 to a slot (2026-09-25).
  { id: 172, key: "glimstone", name: "Glimstone", examine: "A pale stone that holds the light a moment after you look away. The plainer runes carve from it.", stackable: true, stackLimit: GLIMSTONE_STACK, value: 4, weight: 0.3 },
  { id: 173, key: "pure_glimstone", name: "Pure glimstone", examine: "Glimstone without a flaw in it. Any rune at all will carve from this.", stackable: true, stackLimit: GLIMSTONE_STACK, value: 8, weight: 0.3 },
  { id: 174, key: "gale_charm", name: "Gale charm", examine: "A pale disc with the wind's curl cut in it. It tugs, very slightly, toward its altar.", value: 20, weight: 0, action: "Locate" },
  { id: 175, key: "tide_charm", name: "Tide charm", examine: "A blue disc with a wave cut in it, and it is never quite dry.", value: 20, weight: 0, action: "Locate" },
  { id: 176, key: "stone_charm", name: "Stone charm", examine: "A brown disc cut with a peak. It is heavier than a disc that size should be.", value: 20, weight: 0, action: "Locate" },
  { id: 177, key: "ember_charm", name: "Ember charm", examine: "A red disc cut with a flame, and warm whatever the weather.", value: 20, weight: 0, action: "Locate" },
  { id: 178, key: "thought_charm", name: "Thought charm", examine: "A violet disc with an open eye cut in it. It seems to be paying attention.", value: 20, weight: 0, action: "Locate" },
  { id: 179, key: "sinew_charm", name: "Sinew charm", examine: "A disc cut with a knotted cord. It flexes if you press it.", value: 20, weight: 0, action: "Locate" },
  { id: 180, key: "wild_charm", name: "Wild charm", examine: "A dark disc with a spiral cut in it that will not hold still.", value: 300, weight: 0, action: "Locate" },
  { id: 181, key: "star_charm", name: "Star charm", examine: "A deep blue disc with a star cut in it, and a little light of its own.", value: 250, weight: 0, action: "Locate" },
  { id: 182, key: "bloom_charm", name: "Bloom charm", examine: "A green disc cut with a leaf. Moss grows on it faster than it should.", value: 400, weight: 0, action: "Locate" },
  { id: 183, key: "oath_charm", name: "Oath charm", examine: "A disc cut with a ring bound shut. It will not be put down anywhere but where it means to be.", value: 500, weight: 0, action: "Locate" },
  { id: 184, key: "grave_charm", name: "Grave charm", examine: "A grey disc cut with a mound, cold enough to ache.", value: 600, weight: 0, action: "Locate" },
  { id: 185, key: "heart_charm", name: "Heart charm", examine: "A red-black disc cut with a heart, and it keeps a slow beat.", value: 800, weight: 0, action: "Locate" },
  { id: 186, key: "shade_charm", name: "Shade charm", examine: "A dark disc cut with a hollow ring. Held up, it throws no shadow.", value: 800, weight: 0, action: "Locate" },
  { id: 187, key: "fury_charm", name: "Fury charm", examine: "A disc cut with a jagged stroke. It is not hot, but it will not sit easy in the hand.", value: 1000, weight: 0, action: "Locate" },
  // The Pull of the Charm (Runesmithing's quest): what the Gale altar gives up, and what Agnes Quill makes of it.
  { id: 188, key: "altar_rubbing", name: "Altar rubbing", examine: "Charcoal on paper, taken off the side of the meadow's altar. The marks mean nothing to you.", value: 1, weight: 0 },
  { id: 189, key: "agnes_note", name: "Agnes's note", examine: "Agnes Quill's neat hand: one word, underlined twice, and under it, 'Orrin. Really.'", value: 1, weight: 0 },
  // Runesmithing: the silver circlet, and each rune's circlet with its charm set in it, worn in place of carrying the charm.
  { id: 190, key: "silver_circlet", name: "Silver circlet", examine: "A thin band of silver to go round the brow, with an empty setting at the front.", value: 240, weight: 0.1, equip: { slot: "head" } },
  { id: 191, key: "gale_circlet", name: "Gale circlet", examine: "A silver circlet with the gale charm set at the brow. Its altar knows it.", value: 300, weight: 0.1, equip: { slot: "head" } },
  { id: 192, key: "thought_circlet", name: "Thought circlet", examine: "A silver circlet with the thought charm set at the brow. Its altar knows it.", value: 300, weight: 0.1, equip: { slot: "head" } },
  { id: 193, key: "tide_circlet", name: "Tide circlet", examine: "A silver circlet with the tide charm set at the brow. Its altar knows it.", value: 300, weight: 0.1, equip: { slot: "head" } },
  { id: 194, key: "stone_circlet", name: "Stone circlet", examine: "A silver circlet with the stone charm set at the brow. Its altar knows it.", value: 300, weight: 0.1, equip: { slot: "head" } },
  { id: 195, key: "ember_circlet", name: "Ember circlet", examine: "A silver circlet with the ember charm set at the brow. Its altar knows it.", value: 300, weight: 0.1, equip: { slot: "head" } },
  { id: 196, key: "sinew_circlet", name: "Sinew circlet", examine: "A silver circlet with the sinew charm set at the brow. Its altar knows it.", value: 300, weight: 0.1, equip: { slot: "head" } },
  { id: 197, key: "star_circlet", name: "Star circlet", examine: "A silver circlet with the star charm set at the brow. Its altar knows it.", value: 300, weight: 0.1, equip: { slot: "head" } },
  { id: 198, key: "wild_circlet", name: "Wild circlet", examine: "A silver circlet with the wild charm set at the brow. Its altar knows it.", value: 300, weight: 0.1, equip: { slot: "head" } },
  { id: 199, key: "bloom_circlet", name: "Bloom circlet", examine: "A silver circlet with the bloom charm set at the brow. Its altar knows it.", value: 300, weight: 0.1, equip: { slot: "head" } },
  { id: 200, key: "oath_circlet", name: "Oath circlet", examine: "A silver circlet with the oath charm set at the brow. Its altar knows it.", value: 300, weight: 0.1, equip: { slot: "head" } },
  { id: 201, key: "grave_circlet", name: "Grave circlet", examine: "A silver circlet with the grave charm set at the brow. Its altar knows it.", value: 300, weight: 0.1, equip: { slot: "head" } },
  { id: 202, key: "heart_circlet", name: "Heart circlet", examine: "A silver circlet with the heart charm set at the brow. Its altar knows it.", value: 300, weight: 0.1, equip: { slot: "head" } },
  { id: 203, key: "shade_circlet", name: "Shade circlet", examine: "A silver circlet with the shade charm set at the brow. Its altar knows it.", value: 300, weight: 0.1, equip: { slot: "head" } },
  { id: 204, key: "fury_circlet", name: "Fury circlet", examine: "A silver circlet with the fury charm set at the brow. Its altar knows it.", value: 300, weight: 0.1, equip: { slot: "head" } },
  // Gems (the magic plan, stage A5): each uncut, then cut with a chisel (shared/gems.ts has the ladder).
  { id: 205, key: "uncut_opal", name: "Uncut opal", examine: "A pale lump that might be something, once cut.", value: 36, weight: 0.1 },
  { id: 206, key: "uncut_jade", name: "Uncut jade", examine: "A green stone, dull on the outside.", value: 54, weight: 0.1 },
  { id: 207, key: "uncut_red_topaz", name: "Uncut red topaz", examine: "A reddish stone with a glassy break in one side.", value: 84, weight: 0.1 },
  { id: 208, key: "uncut_sapphire", name: "Uncut sapphire", examine: "A blue stone, rough as it came out of the ground.", value: 150, weight: 0.1 },
  { id: 209, key: "uncut_emerald", name: "Uncut emerald", examine: "A green stone with a hint of fire inside.", value: 300, weight: 0.1 },
  { id: 210, key: "uncut_ruby", name: "Uncut ruby", examine: "A dark red stone, waiting on a chisel.", value: 600, weight: 0.1 },
  { id: 211, key: "uncut_diamond", name: "Uncut diamond", examine: "A clear stone, dull until it is cut.", value: 1200, weight: 0.1 },
  { id: 212, key: "uncut_wyrmstone", name: "Uncut wyrmstone", examine: "A violet stone, heavy for its size.", value: 6000, weight: 0.1 },
  { id: 213, key: "uncut_onyx", name: "Uncut onyx", examine: "A black stone, and a great weight of it in the hand.", value: 18000, weight: 0.1 },
  { id: 214, key: "uncut_sunstone", name: "Uncut sunstone", examine: "A dull orange stone with something bright waiting in it.", value: 36000, weight: 0.1 },
  { id: 215, key: "opal", name: "Opal", examine: "Milky white, with colours moving in it when you tilt it.", value: 60, weight: 0.1 },
  { id: 216, key: "jade", name: "Jade", examine: "Deep green and cool to hold, however warm the day.", value: 90, weight: 0.1 },
  { id: 217, key: "red_topaz", name: "Red topaz", examine: "Red as a coal, and it throws the light about.", value: 140, weight: 0.1 },
  { id: 218, key: "sapphire", name: "Sapphire", examine: "Blue all the way down.", value: 250, weight: 0.1 },
  { id: 219, key: "emerald", name: "Emerald", examine: "A bright, grassy green, cut clean.", value: 500, weight: 0.1 },
  { id: 220, key: "ruby", name: "Ruby", examine: "Red, and very sure of it.", value: 1000, weight: 0.1 },
  { id: 221, key: "diamond", name: "Diamond", examine: "Hard enough to cut anything but itself, and clear as water.", value: 2000, weight: 0.1 },
  { id: 222, key: "wyrmstone", name: "Wyrmstone", examine: "Violet, and warm, and it seems to look back.", value: 10000, weight: 0.1 },
  { id: 223, key: "onyx", name: "Onyx", examine: "Black and flawless. The light goes in and does not come out.", value: 30000, weight: 0.1 },
  { id: 224, key: "sunstone", name: "Sunstone", examine: "Gold and orange at once, and brighter than the room it is in.", value: 60000, weight: 0.1 },
  { id: 225, key: "chisel", name: "Chisel", examine: "A short steel blade with a wooden handle, for cutting what does not want to be cut.", value: 12, weight: 0.3 },
  // Gem jewellery (the magic plan, stage A5b): three soft gems in silver, seven in gold, each a ring, a necklace,
  // a bracelet or an amulet. Plain until an enchanting spell is cast on it.
  { id: 226, key: "gold_necklace", name: "Gold necklace", examine: "A plain gold chain, heavier than it looks.", value: 520, weight: 0.1, equip: { slot: "neck" } },
  { id: 227, key: "gold_bracelet", name: "Gold bracelet", examine: "A plain gold bracelet, warm from the hand.", value: 560, weight: 0.1, equip: { slot: "hands" } },
  { id: 228, key: "opal_ring", name: "Opal ring", examine: "A silver band holding an opal.", value: 264, weight: 0.1, equip: { slot: "ring" } },
  { id: 229, key: "opal_necklace", name: "Opal necklace", examine: "A fine silver chain with an opal hanging from it.", value: 285, weight: 0.1, equip: { slot: "neck" } },
  { id: 230, key: "opal_bracelet", name: "Opal bracelet", examine: "A silver bracelet with an opal set in the clasp.", value: 306, weight: 0.1, equip: { slot: "hands" } },
  { id: 231, key: "opal_amulet", name: "Opal amulet", examine: "An opal in a silver setting, on a chain.", value: 327, weight: 0.1, equip: { slot: "neck" } },
  { id: 232, key: "jade_ring", name: "Jade ring", examine: "A silver band holding a jade.", value: 306, weight: 0.1, equip: { slot: "ring" } },
  { id: 233, key: "jade_necklace", name: "Jade necklace", examine: "A fine silver chain with a jade hanging from it.", value: 330, weight: 0.1, equip: { slot: "neck" } },
  { id: 234, key: "jade_bracelet", name: "Jade bracelet", examine: "A silver bracelet with a jade set in the clasp.", value: 355, weight: 0.1, equip: { slot: "hands" } },
  { id: 235, key: "jade_amulet", name: "Jade amulet", examine: "A jade in a silver setting, on a chain.", value: 379, weight: 0.1, equip: { slot: "neck" } },
  { id: 236, key: "topaz_ring", name: "Topaz ring", examine: "A silver band holding a red topaz.", value: 376, weight: 0.1, equip: { slot: "ring" } },
  { id: 237, key: "topaz_necklace", name: "Topaz necklace", examine: "A fine silver chain with a red topaz hanging from it.", value: 406, weight: 0.1, equip: { slot: "neck" } },
  { id: 238, key: "topaz_bracelet", name: "Topaz bracelet", examine: "A silver bracelet with a red topaz set in the clasp.", value: 436, weight: 0.1, equip: { slot: "hands" } },
  { id: 239, key: "topaz_amulet", name: "Topaz amulet", examine: "A red topaz in a silver setting, on a chain.", value: 466, weight: 0.1, equip: { slot: "neck" } },
  { id: 240, key: "sapphire_ring", name: "Sapphire ring", examine: "A gold band holding a sapphire.", value: 750, weight: 0.1, equip: { slot: "ring" } },
  { id: 241, key: "sapphire_necklace", name: "Sapphire necklace", examine: "A fine gold chain with a sapphire hanging from it.", value: 810, weight: 0.1, equip: { slot: "neck" } },
  { id: 242, key: "sapphire_bracelet", name: "Sapphire bracelet", examine: "A gold bracelet with a sapphire set in the clasp.", value: 870, weight: 0.1, equip: { slot: "hands" } },
  { id: 243, key: "sapphire_amulet", name: "Sapphire amulet", examine: "A sapphire in a gold setting, on a chain.", value: 930, weight: 0.1, equip: { slot: "neck" } },
  { id: 244, key: "emerald_ring", name: "Emerald ring", examine: "A gold band holding an emerald.", value: 1100, weight: 0.1, equip: { slot: "ring" } },
  { id: 245, key: "emerald_necklace", name: "Emerald necklace", examine: "A fine gold chain with an emerald hanging from it.", value: 1188, weight: 0.1, equip: { slot: "neck" } },
  { id: 246, key: "emerald_bracelet", name: "Emerald bracelet", examine: "A gold bracelet with an emerald set in the clasp.", value: 1276, weight: 0.1, equip: { slot: "hands" } },
  { id: 247, key: "emerald_amulet", name: "Emerald amulet", examine: "An emerald in a gold setting, on a chain.", value: 1364, weight: 0.1, equip: { slot: "neck" } },
  { id: 248, key: "ruby_ring", name: "Ruby ring", examine: "A gold band holding a ruby.", value: 1800, weight: 0.1, equip: { slot: "ring" } },
  { id: 249, key: "ruby_necklace", name: "Ruby necklace", examine: "A fine gold chain with a ruby hanging from it.", value: 1944, weight: 0.1, equip: { slot: "neck" } },
  { id: 250, key: "ruby_bracelet", name: "Ruby bracelet", examine: "A gold bracelet with a ruby set in the clasp.", value: 2088, weight: 0.1, equip: { slot: "hands" } },
  { id: 251, key: "ruby_amulet", name: "Ruby amulet", examine: "A ruby in a gold setting, on a chain.", value: 2232, weight: 0.1, equip: { slot: "neck" } },
  { id: 252, key: "diamond_ring", name: "Diamond ring", examine: "A gold band holding a diamond.", value: 3200, weight: 0.1, equip: { slot: "ring" } },
  { id: 253, key: "diamond_necklace", name: "Diamond necklace", examine: "A fine gold chain with a diamond hanging from it.", value: 3456, weight: 0.1, equip: { slot: "neck" } },
  { id: 254, key: "diamond_bracelet", name: "Diamond bracelet", examine: "A gold bracelet with a diamond set in the clasp.", value: 3712, weight: 0.1, equip: { slot: "hands" } },
  { id: 255, key: "diamond_amulet", name: "Diamond amulet", examine: "A diamond in a gold setting, on a chain.", value: 3968, weight: 0.1, equip: { slot: "neck" } },
  { id: 256, key: "wyrmstone_ring", name: "Wyrmstone ring", examine: "A gold band holding a wyrmstone.", value: 14400, weight: 0.1, equip: { slot: "ring" } },
  { id: 257, key: "wyrmstone_necklace", name: "Wyrmstone necklace", examine: "A fine gold chain with a wyrmstone hanging from it.", value: 15552, weight: 0.1, equip: { slot: "neck" } },
  { id: 258, key: "wyrmstone_bracelet", name: "Wyrmstone bracelet", examine: "A gold bracelet with a wyrmstone set in the clasp.", value: 16704, weight: 0.1, equip: { slot: "hands" } },
  { id: 259, key: "wyrmstone_amulet", name: "Wyrmstone amulet", examine: "A wyrmstone in a gold setting, on a chain.", value: 17856, weight: 0.1, equip: { slot: "neck" } },
  { id: 260, key: "onyx_ring", name: "Onyx ring", examine: "A gold band holding an onyx.", value: 42400, weight: 0.1, equip: { slot: "ring" } },
  { id: 261, key: "onyx_necklace", name: "Onyx necklace", examine: "A fine gold chain with an onyx hanging from it.", value: 45792, weight: 0.1, equip: { slot: "neck" } },
  { id: 262, key: "onyx_bracelet", name: "Onyx bracelet", examine: "A gold bracelet with an onyx set in the clasp.", value: 49184, weight: 0.1, equip: { slot: "hands" } },
  { id: 263, key: "onyx_amulet", name: "Onyx amulet", examine: "An onyx in a gold setting, on a chain.", value: 52576, weight: 0.1, equip: { slot: "neck" } },
  { id: 264, key: "sunstone_ring", name: "Sunstone ring", examine: "A gold band holding a sunstone.", value: 84400, weight: 0.1, equip: { slot: "ring" } },
  { id: 265, key: "sunstone_necklace", name: "Sunstone necklace", examine: "A fine gold chain with a sunstone hanging from it.", value: 91152, weight: 0.1, equip: { slot: "neck" } },
  { id: 266, key: "sunstone_bracelet", name: "Sunstone bracelet", examine: "A gold bracelet with a sunstone set in the clasp.", value: 97904, weight: 0.1, equip: { slot: "hands" } },
  { id: 267, key: "sunstone_amulet", name: "Sunstone amulet", examine: "A sunstone in a gold setting, on a chain.", value: 104656, weight: 0.1, equip: { slot: "neck" } },
  // Enchanted jewellery (the magic plan, stage A5c): each plain piece's enchanted self. What it does is enchant.ts's.
  { id: 268, key: "hunters_ring", name: "Hunter's ring", examine: "An opal ring that remembers a trail, and lends the arm a little strength.", value: 343, weight: 0.1, equip: { slot: "ring", bonuses: bonus({ Strength: 1 }) } },
  { id: 269, key: "nimble_necklace", name: "Nimble necklace", examine: "An opal on a silver chain, humming faintly. A blow slides off it.", value: 371, weight: 0.1, equip: { slot: "neck", bonuses: bonus({ "Stab defence": 1, "Slash defence": 1, "Crush defence": 1, "Magic defence": 1, "Ranged defence": 1 }) } },
  { id: 270, key: "quick_bracelet", name: "Quick bracelet", examine: "Silver and opal, light on the wrist, and the hand moves quicker for it.", value: 398, weight: 0.1, equip: { slot: "hands", bonuses: bonus({ Stab: 1, Slash: 1, Crush: 1, Magic: 1, Ranged: 1 }) } },
  { id: 271, key: "amulet_of_plenty", name: "Amulet of Plenty", examine: "An opal amulet warm with an old blessing.", value: 425, weight: 0.1, equip: { slot: "neck", bonuses: bonus({ Prayer: 1 }) } },
  { id: 272, key: "homing_ring", name: "Homing ring", examine: "A jade ring that knows the way to Oakridge green. Rub it and it takes you there.", value: 398, weight: 0.1, equip: { slot: "ring" }, action: "Rub" },
  { id: 273, key: "wayfinders_necklace", name: "Wayfinder's necklace", examine: "Jade on a silver chain, cool at the throat. It turns aside a glancing blow.", value: 429, weight: 0.1, equip: { slot: "neck", bonuses: bonus({ "Stab defence": 2, "Slash defence": 2, "Crush defence": 2, "Magic defence": 2, "Ranged defence": 2 }) } },
  { id: 274, key: "masons_bracelet", name: "Mason's bracelet", examine: "A jade bracelet that steadies the hand.", value: 462, weight: 0.1, equip: { slot: "hands", bonuses: bonus({ Stab: 2, Slash: 2, Crush: 2, Magic: 2, Ranged: 2 }) } },
  { id: 275, key: "brewers_amulet", name: "Brewer's amulet", examine: "Jade in silver, and a smell of herbs that were never there.", value: 493, weight: 0.1, equip: { slot: "neck", bonuses: bonus({ Prayer: 2 }) } },
  { id: 276, key: "ring_of_mercy", name: "Ring of Mercy", examine: "A topaz ring with a small warmth at its heart.", value: 489, weight: 0.1, equip: { slot: "ring", bonuses: bonus({ Strength: 2 }) } },
  { id: 277, key: "devout_necklace", name: "Devout necklace", examine: "A topaz on a silver chain, and the chain is always warm.", value: 528, weight: 0.1, equip: { slot: "neck", bonuses: bonus({ "Stab defence": 3, "Slash defence": 3, "Crush defence": 3, "Magic defence": 3, "Ranged defence": 3 }) } },
  { id: 278, key: "trackers_bracelet", name: "Tracker's bracelet", examine: "Silver and topaz, and the wrist knows where to strike.", value: 567, weight: 0.1, equip: { slot: "hands", bonuses: bonus({ Stab: 3, Slash: 3, Crush: 3, Magic: 3, Ranged: 3 }) } },
  { id: 279, key: "ember_amulet", name: "Ember amulet", examine: "A topaz amulet, faintly smoking at the edges.", value: 606, weight: 0.1, equip: { slot: "neck", bonuses: bonus({ Prayer: 3 }) } },
  { id: 280, key: "ring_of_thorns", name: "Ring of Thorns", examine: "A sapphire ring that bites back: whatever strikes the wearer feels a little of it.", value: 975, weight: 0.1, equip: { slot: "ring" } },
  { id: 281, key: "travellers_necklace", name: "Traveller's necklace", examine: "A sapphire on gold, cool as a mountain stream.", value: 1053, weight: 0.1, equip: { slot: "neck", bonuses: bonus({ "Stab defence": 2, "Slash defence": 2, "Crush defence": 2, "Magic defence": 2, "Ranged defence": 2 }) } },
  { id: 282, key: "potters_bracelet", name: "Potter's bracelet", examine: "Gold and sapphire, and the hand is surer for it.", value: 1131, weight: 0.1, equip: { slot: "hands", bonuses: bonus({ Stab: 2, Slash: 2, Crush: 2, Magic: 2, Ranged: 2 }) } },
  { id: 283, key: "mages_amulet", name: "Mage's amulet", examine: "A sapphire amulet that hums when a spell is near.", value: 1209, weight: 0.1, equip: { slot: "neck", bonuses: bonus({ Magic: 10 }) } },
  { id: 284, key: "duellists_ring", name: "Duellist's ring", examine: "An emerald ring for a fair fight. It lends the arm a little weight.", value: 1430, weight: 0.1, equip: { slot: "ring", bonuses: bonus({ Strength: 2 }) } },
  { id: 285, key: "knotted_necklace", name: "Knotted necklace", examine: "An emerald on gold, tied with a knot that will not come undone.", value: 1544, weight: 0.1, equip: { slot: "neck", bonuses: bonus({ "Stab defence": 3, "Slash defence": 3, "Crush defence": 3, "Magic defence": 3, "Ranged defence": 3 }) } },
  { id: 286, key: "siege_bracelet", name: "Siege bracelet", examine: "Gold and emerald, heavy on the wrist, and the blow lands the truer.", value: 1659, weight: 0.1, equip: { slot: "hands", bonuses: bonus({ Stab: 3, Slash: 3, Crush: 3, Magic: 3, Ranged: 3 }) } },
  { id: 287, key: "wardens_amulet", name: "Warden's amulet", examine: "An emerald amulet. Blows seem to find less of you.", value: 1773, weight: 0.1, equip: { slot: "neck", bonuses: bonus({ "Stab defence": 7, "Slash defence": 7, "Crush defence": 7, "Magic defence": 7, "Ranged defence": 7 }) } },
  { id: 288, key: "forge_ring", name: "Forge ring", examine: "A ruby ring with a coal's glow in it. The arm swings harder.", value: 2340, weight: 0.1, equip: { slot: "ring", bonuses: bonus({ Strength: 2 }) } },
  { id: 289, key: "diggers_pendant", name: "Digger's pendant", examine: "A ruby on gold, dusty however often it is wiped.", value: 2527, weight: 0.1, equip: { slot: "neck", bonuses: bonus({ "Stab defence": 4, "Slash defence": 4, "Crush defence": 4, "Magic defence": 4, "Ranged defence": 4 }) } },
  { id: 290, key: "warded_bracelet", name: "Warded bracelet", examine: "Gold and ruby, and the hand strikes where it means to.", value: 2714, weight: 0.1, equip: { slot: "hands", bonuses: bonus({ Stab: 4, Slash: 4, Crush: 4, Magic: 4, Ranged: 4 }) } },
  { id: 291, key: "amulet_of_might", name: "Amulet of Might", examine: "A ruby amulet that makes the arm feel like somebody bigger's.", value: 2902, weight: 0.1, equip: { slot: "neck", bonuses: bonus({ Strength: 10 }) } },
  { id: 292, key: "lifeward_ring", name: "Lifeward ring", examine: "A diamond ring that will not let its wearer die. It takes them home instead, once.", value: 4160, weight: 0.1, equip: { slot: "ring" } },
  { id: 293, key: "rekindling_necklace", name: "Rekindling necklace", examine: "A diamond on gold that holds a spark. When its wearer is nearly spent, it gives the spark back, once.", value: 4493, weight: 0.1, equip: { slot: "neck" } },
  { id: 294, key: "deepwalkers_bracelet", name: "Deepwalker's bracelet", examine: "Gold and diamond, bright even in the dark.", value: 4826, weight: 0.1, equip: { slot: "hands", bonuses: bonus({ Stab: 5, Slash: 5, Crush: 5, Magic: 5, Ranged: 5 }) } },
  { id: 295, key: "amulet_of_the_four", name: "Amulet of the Four", examine: "A diamond amulet that strengthens hand, arm, eye and hide alike.", value: 5158, weight: 0.1, equip: { slot: "neck", bonuses: bonus({ Stab: 6, Slash: 6, Crush: 6, Magic: 6, Ranged: 6, "Stab defence": 6, "Slash defence": 6, "Crush defence": 6, "Magic defence": 6, "Ranged defence": 6, Strength: 6, Prayer: 1 }) } },
  { id: 296, key: "ring_of_plenty", name: "Ring of Plenty", examine: "A wyrmstone ring, and a feeling that luck is not far off.", value: 18720, weight: 0.1, equip: { slot: "ring", bonuses: bonus({ Strength: 4 }) } },
  { id: 297, key: "crafters_necklace", name: "Crafter's necklace", examine: "A wyrmstone on gold. The fingers want to make something.", value: 20218, weight: 0.1, equip: { slot: "neck", bonuses: bonus({ "Stab defence": 7, "Slash defence": 7, "Crush defence": 7, "Magic defence": 7, "Ranged defence": 7 }) } },
  { id: 298, key: "fighters_bracelet", name: "Fighter's bracelet", examine: "Gold and wyrmstone, and a fighter's grip.", value: 21715, weight: 0.1, equip: { slot: "hands", bonuses: bonus({ Stab: 7, Slash: 7, Crush: 7, Magic: 7, Ranged: 7 }) } },
  { id: 299, key: "wyrm_amulet", name: "Wyrm amulet", examine: "A wyrmstone amulet with a spark behind the stone. Rub it to be somewhere else.", value: 23213, weight: 0.1, equip: { slot: "neck", bonuses: bonus({ Stab: 10, Slash: 10, Crush: 10, Magic: 10, Ranged: 10, "Stab defence": 3, "Slash defence": 3, "Crush defence": 3, "Magic defence": 3, "Ranged defence": 3, Strength: 6, Prayer: 3 }) }, action: "Rub" },
  { id: 300, key: "stone_ring", name: "Stone ring", examine: "A black onyx ring. The hand that wears it is hard to move.", value: 55120, weight: 0.1, equip: { slot: "ring", bonuses: bonus({ Strength: 5 }) } },
  { id: 301, key: "raging_necklace", name: "Raging necklace", examine: "Onyx on gold, and a temper that is not quite your own.", value: 59530, weight: 0.1, equip: { slot: "neck", bonuses: bonus({ "Stab defence": 9, "Slash defence": 9, "Crush defence": 9, "Magic defence": 9, "Ranged defence": 9 }) } },
  { id: 302, key: "mending_bracelet", name: "Mending bracelet", examine: "Gold and onyx, and the skin under it heals fast.", value: 63939, weight: 0.1, equip: { slot: "hands", bonuses: bonus({ Stab: 9, Slash: 9, Crush: 9, Magic: 9, Ranged: 9 }) } },
  { id: 303, key: "night_amulet", name: "Night amulet", examine: "An onyx amulet as dark as the hour it is named for.", value: 68349, weight: 0.1, equip: { slot: "neck", bonuses: bonus({ Stab: 10, Slash: 10, Crush: 10, Magic: 10, Ranged: 10, "Stab defence": 15, "Slash defence": 15, "Crush defence": 15, "Magic defence": 15, "Ranged defence": 15, Strength: 8, Prayer: 5 }) } },
  { id: 304, key: "ring_of_endurance", name: "Ring of Endurance", examine: "A sunstone ring. The hand that wears it does not tire.", value: 109720, weight: 0.1, equip: { slot: "ring", bonuses: bonus({ Strength: 6 }) } },
  { id: 305, key: "keen_necklace", name: "Keen necklace", examine: "A sunstone on gold. The eye sees further with it on.", value: 118498, weight: 0.1, equip: { slot: "neck", bonuses: bonus({ "Stab defence": 11, "Slash defence": 11, "Crush defence": 11, "Magic defence": 11, "Ranged defence": 11 }) } },
  { id: 306, key: "grim_bracelet", name: "Grim bracelet", examine: "Gold and sunstone, and the hand is steady as the grave.", value: 127275, weight: 0.1, equip: { slot: "hands", bonuses: bonus({ Stab: 11, Slash: 11, Crush: 11, Magic: 11, Ranged: 11 }) } },
  { id: 307, key: "sun_amulet", name: "Sun amulet", examine: "A sunstone amulet, bright as noon, and the arm is stronger in its light.", value: 136053, weight: 0.1, equip: { slot: "neck", bonuses: bonus({ Stab: 15, Slash: 15, Crush: 15, Strength: 10, Prayer: 2 }) } },
  // Gem-tipped arrows (the magic plan, stage A5d): a cut gem into twelve tips, ten tips onto ten arrows, and an
  // enchanting spell on ten of those. What an enchanted arrow does is enchant.ts's; this game's bows take arrows, not bolts.
  { id: 308, key: "opal_tips", name: "Opal tips", examine: "Twelve small opal points, cut to sit on an arrow.", stackable: true, value: 6, weight: 0 },
  {
    id: 309, key: "opal_tipped_arrow", name: "Opal-tipped arrow", examine: "A iron arrow with a opal point set on its head.", stackable: true, value: 16, weight: 0,
    equip: { slot: "ammo", bonuses: bonus({ Ranged: 12 }) },
  },
  {
    id: 310, key: "enchanted_opal_arrow", name: "Enchanted opal arrow", examine: "A opal-tipped arrow with a charm in the point. Now and then it does more than an arrow should.", stackable: true, value: 24, weight: 0,
    equip: { slot: "ammo", bonuses: bonus({ Ranged: 12 }) },
  },
  { id: 311, key: "jade_tips", name: "Jade tips", examine: "Twelve small jade points, cut to sit on an arrow.", stackable: true, value: 9, weight: 0 },
  {
    id: 312, key: "jade_tipped_arrow", name: "Jade-tipped arrow", examine: "A iron arrow with a jade point set on its head.", stackable: true, value: 19, weight: 0,
    equip: { slot: "ammo", bonuses: bonus({ Ranged: 12 }) },
  },
  {
    id: 313, key: "enchanted_jade_arrow", name: "Enchanted jade arrow", examine: "A jade-tipped arrow with a charm in the point. Now and then it does more than an arrow should.", stackable: true, value: 29, weight: 0,
    equip: { slot: "ammo", bonuses: bonus({ Ranged: 12 }) },
  },
  { id: 314, key: "topaz_tips", name: "Topaz tips", examine: "Twelve small red topaz points, cut to sit on an arrow.", stackable: true, value: 14, weight: 0 },
  {
    id: 315, key: "topaz_tipped_arrow", name: "Topaz-tipped arrow", examine: "A iron arrow with a red topaz point set on its head.", stackable: true, value: 24, weight: 0,
    equip: { slot: "ammo", bonuses: bonus({ Ranged: 12 }) },
  },
  {
    id: 316, key: "enchanted_topaz_arrow", name: "Enchanted topaz arrow", examine: "A red topaz-tipped arrow with a charm in the point. Now and then it does more than an arrow should.", stackable: true, value: 36, weight: 0,
    equip: { slot: "ammo", bonuses: bonus({ Ranged: 12 }) },
  },
  { id: 317, key: "sapphire_tips", name: "Sapphire tips", examine: "Twelve small sapphire points, cut to sit on an arrow.", stackable: true, value: 25, weight: 0 },
  {
    id: 318, key: "sapphire_tipped_arrow", name: "Sapphire-tipped arrow", examine: "A steel arrow with a sapphire point set on its head.", stackable: true, value: 51, weight: 0,
    equip: { slot: "ammo", bonuses: bonus({ Ranged: 18 }) },
  },
  {
    id: 319, key: "enchanted_sapphire_arrow", name: "Enchanted sapphire arrow", examine: "A sapphire-tipped arrow with a charm in the point. Now and then it does more than an arrow should.", stackable: true, value: 77, weight: 0,
    equip: { slot: "ammo", bonuses: bonus({ Ranged: 18 }) },
  },
  { id: 320, key: "emerald_tips", name: "Emerald tips", examine: "Twelve small emerald points, cut to sit on an arrow.", stackable: true, value: 50, weight: 0 },
  {
    id: 321, key: "emerald_tipped_arrow", name: "Emerald-tipped arrow", examine: "A steel arrow with a emerald point set on its head.", stackable: true, value: 76, weight: 0,
    equip: { slot: "ammo", bonuses: bonus({ Ranged: 18 }) },
  },
  {
    id: 322, key: "enchanted_emerald_arrow", name: "Enchanted emerald arrow", examine: "A emerald-tipped arrow with a charm in the point. Now and then it does more than an arrow should.", stackable: true, value: 114, weight: 0,
    equip: { slot: "ammo", bonuses: bonus({ Ranged: 18 }) },
  },
  { id: 323, key: "ruby_tips", name: "Ruby tips", examine: "Twelve small ruby points, cut to sit on an arrow.", stackable: true, value: 100, weight: 0 },
  {
    id: 324, key: "ruby_tipped_arrow", name: "Ruby-tipped arrow", examine: "A steel arrow with a ruby point set on its head.", stackable: true, value: 126, weight: 0,
    equip: { slot: "ammo", bonuses: bonus({ Ranged: 18 }) },
  },
  {
    id: 325, key: "enchanted_ruby_arrow", name: "Enchanted ruby arrow", examine: "A ruby-tipped arrow with a charm in the point. Now and then it does more than an arrow should.", stackable: true, value: 189, weight: 0,
    equip: { slot: "ammo", bonuses: bonus({ Ranged: 18 }) },
  },
  { id: 326, key: "diamond_tips", name: "Diamond tips", examine: "Twelve small diamond points, cut to sit on an arrow.", stackable: true, value: 200, weight: 0 },
  {
    id: 327, key: "diamond_tipped_arrow", name: "Diamond-tipped arrow", examine: "A steel arrow with a diamond point set on its head.", stackable: true, value: 226, weight: 0,
    equip: { slot: "ammo", bonuses: bonus({ Ranged: 18 }) },
  },
  {
    id: 328, key: "enchanted_diamond_arrow", name: "Enchanted diamond arrow", examine: "A diamond-tipped arrow with a charm in the point. Now and then it does more than an arrow should.", stackable: true, value: 339, weight: 0,
    equip: { slot: "ammo", bonuses: bonus({ Ranged: 18 }) },
  },
  { id: 329, key: "wyrmstone_tips", name: "Wyrmstone tips", examine: "Twelve small wyrmstone points, cut to sit on an arrow.", stackable: true, value: 1000, weight: 0 },
  {
    id: 330, key: "wyrmstone_tipped_arrow", name: "Wyrmstone-tipped arrow", examine: "A steel arrow with a wyrmstone point set on its head.", stackable: true, value: 1026, weight: 0,
    equip: { slot: "ammo", bonuses: bonus({ Ranged: 18 }) },
  },
  {
    id: 331, key: "enchanted_wyrmstone_arrow", name: "Enchanted wyrmstone arrow", examine: "A wyrmstone-tipped arrow with a charm in the point. Now and then it does more than an arrow should.", stackable: true, value: 1539, weight: 0,
    equip: { slot: "ammo", bonuses: bonus({ Ranged: 18 }) },
  },
  { id: 332, key: "onyx_tips", name: "Onyx tips", examine: "Twelve small onyx points, cut to sit on an arrow.", stackable: true, value: 3000, weight: 0 },
  {
    id: 333, key: "onyx_tipped_arrow", name: "Onyx-tipped arrow", examine: "A steel arrow with a onyx point set on its head.", stackable: true, value: 3026, weight: 0,
    equip: { slot: "ammo", bonuses: bonus({ Ranged: 18 }) },
  },
  {
    id: 334, key: "enchanted_onyx_arrow", name: "Enchanted onyx arrow", examine: "A onyx-tipped arrow with a charm in the point. Now and then it does more than an arrow should.", stackable: true, value: 4539, weight: 0,
    equip: { slot: "ammo", bonuses: bonus({ Ranged: 18 }) },
  },
  // Crafting, built out (C1): shears for the rams at Hollowbeck Farm, their wool, spun at a wheel and woven at a loom.
  { id: 335, key: "shears", name: "Shears", examine: "Two blades on a spring. Rams have opinions about them.", value: 1, weight: 0.1 },
  { id: 336, key: "wool", name: "Wool", examine: "A ram's fleece, greasy and warm. It wants spinning.", value: 1, weight: 0.1 },
  { id: 337, key: "ball_of_wool", name: "Ball of wool", examine: "Wool spun into yarn and wound into a ball.", value: 2, weight: 0.1 },
  { id: 338, key: "wool_cloth", name: "Wool cloth", examine: "A length of woven wool, ready to be cut and sewn.", value: 12, weight: 0.3 },
  // Bags (Crafting, C2): worn in the bag slots, each adds its slots to the pack; every size up takes more to sew.
  { id: 339, key: "small_pouch", name: "Small pouch", examine: "A leather pouch on a thong. Room for a few more things.", bag: 4, value: 24, weight: 0.2 },
  { id: 340, key: "large_pouch", name: "Large pouch", examine: "A deeper pouch, lined with wool so nothing rattles.", bag: 6, value: 70, weight: 0.3 },
  { id: 341, key: "small_bag", name: "Small bag", examine: "Wool cloth on a leather frame, shut with an iron buckle.", bag: 8, value: 200, weight: 0.5 },
  { id: 342, key: "large_bag", name: "Large bag", examine: "A roomy bag with a wolf-pelt flap and a steel buckle.", bag: 12, value: 520, weight: 0.8 },
  { id: 343, key: "small_backpack", name: "Small backpack", examine: "Two straps, a silk-stitched body and coldiron fittings. It sits well on the back.", bag: 16, value: 1400, weight: 1.2 },
  { id: 344, key: "large_backpack", name: "Large backpack", examine: "The biggest pack a crafter can sew: pelts, silk, and emberite at every buckle.", bag: 20, value: 4200, weight: 1.6 },
  // Crafting, built out (C3): clay from the quarry, softened with water, shaped at a potter's wheel and fired in a kiln.
  { id: 345, key: "clay", name: "Clay", examine: "A lump of grey quarry clay, stiff as cheese. Water would soften it.", value: 2, weight: 1 },
  { id: 346, key: "soft_clay", name: "Soft clay", examine: "Clay worked wet until it gives under a thumb. Ready for the wheel.", value: 4, weight: 1 },
  { id: 347, key: "unfired_pot", name: "Unfired pot", examine: "A pot fresh off the wheel. It wants a kiln before it holds anything.", value: 3, weight: 0.5 },
  { id: 348, key: "unfired_pie_dish", name: "Unfired pie dish", examine: "A shallow dish, still soft. A kiln would set it.", value: 4, weight: 0.5 },
  { id: 349, key: "unfired_bowl", name: "Unfired bowl", examine: "A bowl, still damp from the wheel. Handle it gently until it is fired.", value: 5, weight: 0.5 },
  { id: 350, key: "unfired_plant_pot", name: "Unfired plant pot", examine: "A plant pot, the hole in its foot pushed through with a thumb. Not fired yet.", value: 5, weight: 0.5 },
  { id: 351, key: "unfired_pot_lid", name: "Unfired pot lid", examine: "A clay lid with a knob to lift it by. It wants firing.", value: 4, weight: 0.3 },
  { id: 352, key: "pot", name: "Pot", examine: "A fired clay pot, hard and sound. It rings when flicked.", value: 8, weight: 0.5 },
  { id: 353, key: "pie_dish", name: "Pie dish", examine: "A shallow fired dish. Somebody will want a pie in it.", value: 10, weight: 0.5 },
  { id: 354, key: "bowl", name: "Bowl", examine: "A fired clay bowl, glazed by nothing but the kiln's heat.", value: 12, weight: 0.5 },
  { id: 355, key: "plant_pot", name: "Plant pot", examine: "A fired plant pot with a hole in its foot for the water to go.", value: 14, weight: 0.5 },
  { id: 356, key: "pot_lid", name: "Pot lid", examine: "A fired lid, sized for a pot.", value: 10, weight: 0.3 },
  // Crafting, built out (C4): the rest of the leather ladder, an archer's armour. Every piece gives up a little
  // magic for aim, and turns an arrow better than a blade.
  {
    id: 357, key: "leather_vambraces", name: "Leather vambraces", examine: "Stiff leather guards for the forearms. An archer's first armour.", value: 18, weight: 0.3,
    equip: { slot: "hands", bonuses: bonus({ Magic: -2, Ranged: 4, "Stab defence": 2, "Slash defence": 2, "Crush defence": 2, "Magic defence": 1, "Ranged defence": 3 }), tint: { hands: 0x8a5e34 } },
  },
  { id: 358, key: "hard_leather", name: "Hard leather", examine: "Cowhide tanned hard and stiff. It takes a strong arm on the needle.", value: 40, weight: 1.3 },
  {
    id: 359, key: "hard_leather_body", name: "Hard leather body", examine: "Leather boiled hard and shaped to the chest.", value: 90, weight: 5,
    equip: { slot: "body", bonuses: bonus({ Magic: -4, Ranged: 8, "Stab defence": 12, "Slash defence": 15, "Crush defence": 18, "Magic defence": 6, "Ranged defence": 15 }), tint: { top: 0x5a3a1e } },
  },
  {
    id: 360, key: "leather_coif", name: "Leather coif", examine: "A close leather hood laced under the chin. It leaves the eyes free for aiming.", value: 60, weight: 0.9,
    equip: { slot: "head", bonuses: bonus({ Magic: -1, Ranged: 2, "Stab defence": 4, "Slash defence": 6, "Crush defence": 7, "Magic defence": 4, "Ranged defence": 6 }) },
  },
  { id: 361, key: "steel_studs", name: "Steel studs", examine: "A handful of steel studs, ready to be set into leather.", value: 50, weight: 0.2 },
  {
    id: 362, key: "studded_jerkin", name: "Studded jerkin", examine: "A leather jerkin set all over with steel studs.", value: 190, weight: 5.5,
    equip: { slot: "body", bonuses: bonus({ Magic: -4, Ranged: 8, "Stab defence": 18, "Slash defence": 25, "Crush defence": 22, "Magic defence": 8, "Ranged defence": 25 }), tint: { top: 0x5c4a3a } },
  },
  {
    id: 363, key: "studded_trousers", name: "Studded trousers", examine: "Leather trousers studded with steel from hip to knee.", value: 160, weight: 3.5,
    equip: { slot: "legs", bonuses: bonus({ Magic: -5, Ranged: 6, "Stab defence": 15, "Slash defence": 16, "Crush defence": 17, "Magic defence": 6, "Ranged defence": 16 }), tint: { legs: 0x5c4a3a } },
  },
  // Hides (C4), one tier a creature and each from worse company: the Dunes' sand stalkers, the Rift's hounds and the
  // sear drake in the heart of Mount Sear. A hide is tanned at a range, then sewn with a needle: vambraces, chaps, a body.
  ...hideTier(364, "stalker", "Stalker", 0, { hide: "A coarse dun hide off a sand stalker, gritty with the Dunes. It wants tanning.",
    leather: "Stalker hide tanned supple. The dun stayed in it.", tint: 0xa07a4a, values: [40, 80, 150, 300, 450] }),
  ...hideTier(369, "hound", "Hound", 1, { hide: "A rift hound's hide, near black, with a violet sheen that moves when nothing else does. It wants tanning.",
    leather: "Hound hide tanned dark and close. The sheen is still in it.", tint: 0x3a3048, values: [80, 150, 280, 560, 840] }),
  ...hideTier(374, "drake", "Drake", 2, { hide: "A sear drake's hide, black scale over a hot orange underside. Still warm. It wants tanning.",
    leather: "Drake hide tanned hard as bark. It has not quite cooled.", tint: 0x5a2414, values: [150, 260, 480, 960, 1440] }),
  // Glass (Crafting, C5): sand from the Dunes in a bucket, soda ash from Brinehaven's seaweed, molten glass at a furnace,
  // and what a glassblowing pipe makes of it there.
  { id: 379, key: "bucket", name: "Bucket", examine: "A wooden bucket bound with iron hoops.", value: 2, weight: 1 },
  { id: 380, key: "bucket_of_sand", name: "Bucket of sand", examine: "A bucket of fine dune sand, dry as dust.", value: 4, weight: 3 },
  { id: 381, key: "seaweed", name: "Seaweed", examine: "A wet brown tangle off the tide line. It smells of the sea.", value: 2, weight: 0.3 },
  { id: 382, key: "soda_ash", name: "Soda ash", examine: "The grey ash of burnt seaweed. A glassmaker wants it.", value: 4, weight: 0.2 },
  { id: 383, key: "molten_glass", name: "Molten glass", examine: "A gob of glass still glowing at the heart. It wants blowing.", value: 12, weight: 0.5 },
  { id: 384, key: "glassblowing_pipe", name: "Glassblowing pipe", examine: "A long iron pipe with a mouthpiece at one end.", value: 5, weight: 0.8 },
  { id: 385, key: "beer_glass", name: "Beer glass", examine: "A tall glass for ale, if anyone pours you one.", value: 2, weight: 0.2 },
  { id: 386, key: "candle_lantern", name: "Candle lantern", examine: "Glass panes in a tin frame, with a holder for a candle.", value: 20, weight: 0.4 },
  { id: 387, key: "oil_lamp", name: "Oil lamp", examine: "A glass lamp with a well for oil and a spout for the wick.", value: 28, weight: 0.4 },
  { id: 388, key: "vial", name: "Vial", examine: "A small glass vial with a lip for a cork.", value: 4, weight: 0.1 },
  { id: 389, key: "fishbowl", name: "Fishbowl", examine: "A round glass bowl, room enough for a small fish to go round in.", value: 20, weight: 0.6 },
  { id: 390, key: "lantern_lens", name: "Lantern lens", examine: "A thick glass lens that throws a lantern's light a long way.", value: 40, weight: 0.2 },
  { id: 391, key: "light_orb", name: "Light orb", examine: "A glass orb blown thin and clear enough to hold a light.", value: 90, weight: 0.3 },
  // Silver goods (Crafting, C6): a holy symbol cast, strung and blessed at an altar, and a silver sickle that, blessed
  // the same way, bites the undead harder than steel does.
  { id: 392, key: "unstrung_symbol", name: "Unstrung symbol", examine: "A silver symbol of the faith, with a hole at the top for a string.", value: 200, weight: 0.1 },
  {
    id: 393, key: "unblessed_symbol", name: "Unblessed symbol", examine: "A silver symbol on a woollen string. An altar would bless it.", value: 210, weight: 0.1,
    equip: { slot: "neck" },
  },
  {
    id: 394, key: "holy_symbol", name: "Holy symbol", examine: "A blessed silver symbol. It steadies the prayers of whoever wears it.", value: 300, weight: 0.1,
    equip: { slot: "neck", bonuses: bonus({ Prayer: 8 }) },
  },
  {
    id: 395, key: "silver_sickle", name: "Silver sickle", examine: "A little silver sickle, sharp along the inside of its curve.", value: 190, weight: 0.5,
    equip: { slot: "weapon", weapon: "blade", bonuses: bonus({ Stab: 2, Slash: 8, Crush: -2, Strength: 6 }) },
  },
  {
    id: 396, key: "blessed_silver_sickle", name: "Blessed silver sickle", examine: "A silver sickle blessed at an altar. The dead feel it more than the living do.", value: 260, weight: 0.5,
    equip: { slot: "weapon", weapon: "blade", bonuses: bonus({ Stab: 2, Slash: 8, Crush: -2, Strength: 6 }), vsUndead: 1.15 },
  },
];

/**
 * One tier of hide armour (Crafting, C4): the raw hide, the tanned leather and the three pieces sewn from it, on five
 * ids in a row. Tier `k` counts up from 0; every tier up adds the same to each bonus, so each is plainly the better.
 */
function hideTier(id: number, key: string, name: string, k: number, o: { hide: string; leather: string; tint: number; values: number[] }): ItemDef[] {
  const [hide, leather, vambraces, chaps, body] = o.values as [number, number, number, number, number];
  return [
    { id, key: `${key}_hide`, name: `${name} hide`, examine: o.hide, value: hide, weight: 1.4 },
    { id: id + 1, key: `${key}_leather`, name: `${name} leather`, examine: o.leather, value: leather, weight: 1.1 },
    {
      id: id + 2, key: `${key}hide_vambraces`, name: `${name}hide vambraces`, examine: `Vambraces of ${name.toLowerCase()} leather, laced to the forearm.`, value: vambraces, weight: 0.3,
      equip: {
        slot: "hands", tint: { hands: o.tint },
        bonuses: bonus({ Magic: -10, Ranged: 8 + 3 * k, "Stab defence": 3 + k, "Slash defence": 3 + k, "Crush defence": 4 + k, "Magic defence": 3 + k, "Ranged defence": 5 + k }),
      },
    },
    {
      id: id + 3, key: `${key}hide_chaps`, name: `${name}hide chaps`, examine: `Chaps of ${name.toLowerCase()} leather, buckled over the trousers.`, value: chaps, weight: 2,
      equip: {
        slot: "legs", tint: { legs: o.tint },
        bonuses: bonus({ Magic: -10, Ranged: 8 + 3 * k, "Stab defence": 10 + 3 * k, "Slash defence": 12 + 3 * k, "Crush defence": 14 + 3 * k, "Magic defence": 12 + 3 * k, "Ranged defence": 18 + 3 * k }),
      },
    },
    {
      id: id + 4, key: `${key}hide_body`, name: `${name}hide body`, examine: `A body of ${name.toLowerCase()} leather, three hides' worth, stitched close.`, value: body, weight: 3,
      equip: {
        slot: "body", tint: { top: o.tint },
        bonuses: bonus({ Magic: -15, Ranged: 15 + 5 * k, "Stab defence": 20 + 5 * k, "Slash defence": 28 + 5 * k, "Crush defence": 26 + 5 * k, "Magic defence": 20 + 5 * k, "Ranged defence": 30 + 5 * k }),
      },
    },
  ];
}

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
/** Bags a player can wear at once (Crafting, C2); each adds its slots to the end of the pack. */
export const BAG_SLOTS = 5;
/** The most slots a pack can have: the base, and five of the biggest bag. */
export const MAX_PACK = INVENTORY_SIZE + BAG_SLOTS * Math.max(...ITEMS.map((d) => d.bag ?? 0));
/**
 * Slots in the bank. Everything in it stacks, whatever the item, so this is how many *kinds* of thing
 * one account can keep at once; tabs come later (PLAN Phase 7).
 */
export const BANK_SIZE = 400;
/** The most of one stackable item a slot can hold (the largest signed 32-bit number). */
export const MAX_STACK = 2_147_483_647;

/** How many one slot holds: one of an unstackable item, a capped stackable's limit, and MAX_STACK of the rest. */
export function slotLimit(def: ItemDef): number {
  return def.stackable ? def.stackLimit ?? MAX_STACK : 1;
}

/** Stack counts as the classic client shows them: exact under 100,000, then K, then M from ten million. */
export function stackLabel(count: number): { text: string; color: "yellow" | "white" | "green" } {
  if (count < 100_000) return { text: String(count), color: "yellow" };
  if (count < 10_000_000) return { text: `${Math.floor(count / 1000)}K`, color: "white" };
  return { text: `${Math.floor(count / 1_000_000)}M`, color: "green" };
}

/** Equipment slots other players can see, in the order a player's `gear` lists them. */
export const VISIBLE_GEAR: EquipSlot[] = ["head", "cape", "weapon", "body", "shield", "legs", "hands", "feet"];
