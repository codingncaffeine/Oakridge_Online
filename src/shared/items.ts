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
  action?: "Eat" | "Bury";
  /** Hitpoints an Eat item restores. */
  heals?: number;
  /** Prayer XP (tenths) a Bury item pays when it goes into the ground. */
  prayerXp?: number;
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
/**
 * Slots in the bank. Everything in it stacks, whatever the item, so this is how many *kinds* of thing
 * one account can keep at once; tabs come later (PLAN Phase 7).
 */
export const BANK_SIZE = 400;
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
