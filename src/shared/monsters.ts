// The bestiary. Every creature, its stats, what it leaves behind and how it behaves. The mechanics are
// the classic ones (see shared/combat.ts); every name, number and drop here is this game's own.
import { combatLevel, type MeleeType } from "./combat.ts";

/** Which code-built model a creature wears. Several creatures share a shape in different sizes and colours. */
export type MonsterShape =
  | "rodent" | "fowl" | "waterfowl" | "cattle" | "woolly" | "boar" | "canine" | "crawler" | "stinger"
  | "lizard" | "flier" | "hopper" | "humanoid" | "skeletal";

/** One thing a kill can leave: a count of an item, or a range to roll within. */
export interface Drop {
  item: string;
  min?: number;
  max?: number;
}

/** A drop with its share of the table's roll. */
export interface WeightedDrop extends Drop {
  weight: number;
}

/**
 * What a kill leaves. `always` drops every time. Then one roll for the rest, taken in two parts: the
 * `rare` table out of `RARE_DENOMINATOR` first, and if that comes to nothing, `main` out of
 * `DROP_DENOMINATOR`. Whatever the weights leave over is the chance of nothing at all.
 *
 * Two denominators so each table's weights read straight off as its odds: 8 in 128 from the main
 * table, 1 in 512 from the rare one. A rare drop comes instead of the main roll, never on top of it,
 * so a kill leaves its certain drops and at most one thing besides.
 */
export interface DropTable {
  always?: Drop[];
  main?: WeightedDrop[];
  rare?: WeightedDrop[];
}

/** Every main roll is out of this many, so a weight reads straight off as "n in 128". */
export const DROP_DENOMINATOR = 128;
/** And every rare roll out of this many: "n in 512". */
export const RARE_DENOMINATOR = 512;

export interface MonsterDef {
  key: string;
  name: string;
  examine: string;
  hitpoints: number;
  attack: number;
  strength: number;
  defence: number;
  /** The most damage one of its blows can do. Monsters carry this outright rather than deriving it. */
  maxHit: number;
  /** How it strikes, and how well: one bonus in its own type. Creatures fight hand to hand (PLAN Phase 11). */
  attackType: MeleeType;
  attackBonus: number;
  /** What it turns aside, by the type of blow coming at it; an arrow or a spell meets the same numbers as a crush. */
  defenceBonus: Record<MeleeType, number>;
  /** Ticks between its swings. */
  speed: number;
  /** How far from where it spawned it will wander, in tiles. */
  wander: number;
  /** How far off it notices a player and starts a fight; 0 for a creature that never starts one. */
  aggro: number;
  /** Ticks before it is back on its feet after dying. */
  respawn: number;
  /** How big it is beside a person, for the model. */
  scale: number;
  shape: MonsterShape;
  /** Its two colours: the body, and the markings, beak, horns or rags. */
  colors: [number, number];
  drops: DropTable;

  // --- Villagers (Phase 7) ---
  /**
   * A person rather than a creature. They cannot be attacked, they never start anything, and their
   * first left-click option is Talk-to rather than Attack.
   */
  person?: true;
  /** The dialogue tree this one opens, by its key in `DIALOGUE`. */
  talk?: string;
  /** A shop this one keeps, by its key in `SHOPS`: it offers to trade as well as to talk. */
  shop?: string;
  /** Whether talking to this one can open the bank. */
  banker?: true;
  /**
   * A person's appearance, in the player's own look slots (shared/look.ts): the reference draws its
   * townsfolk with the player's body kit in fixed clothes, and so does this game (2026-09-24). A person
   * without one is drawn as a creature of its `shape`.
   */
  look?: number[];
  /** What a person wears over the look, by equipment slot: a helm, a sword, a shield. Item keys. */
  wear?: Partial<Record<"head" | "cape" | "weapon" | "body" | "shield" | "legs" | "hands" | "feet", string>>;
  /** An apron over the clothes, in this colour: what a shopkeeper, an innkeeper or a smith wears. */
  apron?: number;
}

const defence = (stab: number, slash: number, crush: number): Record<MeleeType, number> => ({ stab, slash, crush });

/**
 * The roster, weakest first. The stats set the combat level (see `levelOf`), so tuning a creature's
 * hitpoints or strength moves the level with it and the two can never disagree.
 */
export const MONSTERS: MonsterDef[] = [
  {
    key: "field_rat", name: "Field rat", examine: "It eyes your ankles with some interest.",
    hitpoints: 3, attack: 1, strength: 1, defence: 1, maxHit: 1, attackType: "stab", attackBonus: -18,
    defenceBonus: defence(-14, -14, -14), speed: 4, wander: 5, aggro: 0, respawn: 40, scale: 0.27, shape: "rodent",
    colors: [0x6d5c46, 0xc09a86],
    drops: { always: [{ item: "bones" }] },
  },
  {
    key: "hen", name: "Hen", examine: "Busy, and entirely unbothered by you.",
    hitpoints: 3, attack: 1, strength: 1, defence: 1, maxHit: 1, attackType: "crush", attackBonus: -20,
    defenceBonus: defence(-16, -16, -16), speed: 5, wander: 4, aggro: 0, respawn: 40, scale: 0.44, shape: "fowl",
    colors: [0xd8cdba, 0xc4472e],
    drops: { always: [{ item: "bones" }, { item: "raw_fowl" }], main: [{ item: "feather", min: 5, max: 15, weight: 96 }] },
  },
  {
    key: "mallard", name: "Mallard", examine: "It paddles off whenever you get close.",
    hitpoints: 4, attack: 1, strength: 1, defence: 1, maxHit: 1, attackType: "crush", attackBonus: -20,
    defenceBonus: defence(-16, -16, -16), speed: 5, wander: 6, aggro: 0, respawn: 40, scale: 0.46, shape: "waterfowl",
    colors: [0x5a4b35, 0x2f7a45],
    drops: { always: [{ item: "bones" }], main: [{ item: "feather", min: 4, max: 12, weight: 88 }] },
  },
  {
    key: "cow", name: "Cow", examine: "Placid, heavy, and chewing something.",
    hitpoints: 8, attack: 1, strength: 1, defence: 1, maxHit: 1, attackType: "crush", attackBonus: -16,
    defenceBonus: defence(-10, -10, -10), speed: 5, wander: 4, aggro: 0, respawn: 50, scale: 1.08, shape: "cattle",
    colors: [0xd9d2c4, 0x4a3b2c],
    drops: { always: [{ item: "bones" }, { item: "raw_beef" }, { item: "cowhide" }] },
  },
  {
    key: "ram", name: "Ram", examine: "It lowers its head when you look at it.",
    hitpoints: 8, attack: 2, strength: 2, defence: 2, maxHit: 1, attackType: "crush", attackBonus: -12,
    defenceBonus: defence(-8, -8, -8), speed: 5, wander: 4, aggro: 0, respawn: 50, scale: 0.86, shape: "woolly",
    colors: [0xcfc4ac, 0x6b5a3e],
    drops: { always: [{ item: "bones" }] },
  },
  {
    key: "pond_newt", name: "Pond newt", examine: "Slick, spotted, and in no hurry at all.",
    hitpoints: 5, attack: 2, strength: 2, defence: 2, maxHit: 1, attackType: "stab", attackBonus: -12,
    defenceBonus: defence(-8, -8, -8), speed: 5, wander: 5, aggro: 0, respawn: 45, scale: 0.44, shape: "lizard",
    colors: [0x4a6b3a, 0xd8c24a],
    drops: { always: [{ item: "bones" }] },
  },
  {
    key: "thicket_spider", name: "Thicket spider", examine: "Eight legs, and all of them coming this way.",
    hitpoints: 6, attack: 3, strength: 3, defence: 3, maxHit: 1, attackType: "stab", attackBonus: -8,
    defenceBonus: defence(-6, -6, -6), speed: 4, wander: 4, aggro: 0, respawn: 45, scale: 0.6, shape: "crawler",
    colors: [0x3a3128, 0x8a6f3c],
    drops: { main: [{ item: "spider_silk", weight: 40 }] },
  },
  {
    key: "mudfoot_goblin", name: "Mudfoot goblin", examine: "Small, green and badly armed.",
    hitpoints: 7, attack: 4, strength: 4, defence: 3, maxHit: 2, attackType: "crush", attackBonus: -6,
    defenceBonus: defence(-6, -6, -6), speed: 5, wander: 6, aggro: 0, respawn: 55, scale: 0.78, shape: "humanoid",
    colors: [0x6f8a4a, 0x7a3a2e],
    drops: {
      always: [{ item: "bones" }],
      main: [
        { item: "coins", min: 3, max: 18, weight: 56 }, { item: "bronze_dagger", weight: 12 },
        { item: "bronze_helm", weight: 6 }, { item: "tinderbox", weight: 5 },
      ],
    },
  },
  {
    key: "marsh_frog", name: "Marsh frog", examine: "Fat, warty and surprisingly quick.",
    hitpoints: 9, attack: 5, strength: 5, defence: 4, maxHit: 2, attackType: "crush", attackBonus: -4,
    defenceBonus: defence(-4, -4, -4), speed: 5, wander: 5, aggro: 0, respawn: 50, scale: 0.56, shape: "hopper",
    colors: [0x5c7a3c, 0xc8b86a],
    drops: { always: [{ item: "bones" }] },
  },
  {
    key: "cave_bat", name: "Cave bat", examine: "It keeps to the shade, and it does not keep still.",
    hitpoints: 8, attack: 6, strength: 5, defence: 5, maxHit: 2, attackType: "stab", attackBonus: -2,
    defenceBonus: defence(-4, -4, -4), speed: 4, wander: 7, aggro: 4, respawn: 50, scale: 0.64, shape: "flier",
    colors: [0x3b3038, 0x6a5560],
    drops: { always: [{ item: "bones" }] },
  },
  {
    key: "giant_rat", name: "Giant rat", examine: "It has done very well for itself down here.",
    hitpoints: 10, attack: 6, strength: 6, defence: 5, maxHit: 2, attackType: "stab", attackBonus: 0,
    defenceBonus: defence(-2, -2, -2), speed: 4, wander: 6, aggro: 0, respawn: 50, scale: 0.76, shape: "rodent",
    colors: [0x554839, 0xb09070],
    drops: { always: [{ item: "bones" }] },
  },
  {
    key: "wild_boar", name: "Wild boar", examine: "Tusks, temper, and not much neck.",
    hitpoints: 13, attack: 7, strength: 8, defence: 6, maxHit: 3, attackType: "stab", attackBonus: 3,
    defenceBonus: defence(2, 2, 0), speed: 5, wander: 6, aggro: 0, respawn: 60, scale: 0.95, shape: "boar",
    colors: [0x4e4137, 0xd8cfc0],
    drops: { always: [{ item: "bones" }], main: [{ item: "raw_beef", weight: 64 }] },
  },
  {
    key: "mudfoot_raider", name: "Mudfoot raider", examine: "This one has found a shield and an opinion.",
    hitpoints: 14, attack: 9, strength: 9, defence: 8, maxHit: 3, attackType: "slash", attackBonus: 6,
    defenceBonus: defence(4, 5, 3), speed: 5, wander: 6, aggro: 5, respawn: 60, scale: 0.84, shape: "humanoid",
    colors: [0x5f7a44, 0x4a3a58],
    drops: {
      always: [{ item: "bones" }],
      main: [
        { item: "coins", min: 10, max: 45, weight: 60 }, { item: "bronze_sword", weight: 12 },
        { item: "bronze_shield", weight: 8 }, { item: "bronze_mace", weight: 6 }, { item: "bronze_helm", weight: 5 },
      ],
      rare: [{ item: "coins", min: 250, max: 600, weight: 4 }, { item: "steel_axe", weight: 2 }],
    },
  },
  {
    key: "grey_wolf", name: "Grey wolf", examine: "It has been watching you for a while.",
    hitpoints: 16, attack: 11, strength: 11, defence: 9, maxHit: 3, attackType: "stab", attackBonus: 8,
    defenceBonus: defence(4, 4, 2), speed: 4, wander: 8, aggro: 6, respawn: 65, scale: 0.9, shape: "canine",
    colors: [0x6b6a64, 0x2f2d2a],
    drops: { always: [{ item: "bones" }], main: [{ item: "wolf_pelt", weight: 72 }] },
  },
  {
    key: "highwayman", name: "Highwayman", examine: "He would like a word about your purse.",
    hitpoints: 18, attack: 12, strength: 12, defence: 11, maxHit: 4, attackType: "stab", attackBonus: 10,
    defenceBonus: defence(6, 7, 5), speed: 4, wander: 5, aggro: 5, respawn: 70, scale: 1, shape: "humanoid",
    colors: [0xc19a76, 0x2e2a2c],
    drops: {
      always: [{ item: "bones" }],
      main: [
        { item: "coins", min: 20, max: 80, weight: 66 }, { item: "iron_dagger", weight: 10 },
        { item: "leather_gloves", weight: 8 }, { item: "leather_boots", weight: 6 }, { item: "red_cape", weight: 4 },
      ],
      rare: [{ item: "coins", min: 300, max: 900, weight: 5 }, { item: "steel_sword", weight: 1 }],
    },
  },
  {
    key: "dust_scorpion", name: "Dust scorpion", examine: "The tail is the part to watch.",
    hitpoints: 18, attack: 14, strength: 13, defence: 12, maxHit: 4, attackType: "stab", attackBonus: 12,
    defenceBonus: defence(8, 8, 4), speed: 4, wander: 5, aggro: 5, respawn: 70, scale: 0.72, shape: "stinger",
    colors: [0x8a6a3c, 0x3a2c1c],
    drops: { always: [{ item: "bones" }] },
  },
  {
    key: "ruin_skeleton", name: "Ruin skeleton", examine: "Still standing guard over nothing at all.",
    hitpoints: 22, attack: 16, strength: 15, defence: 15, maxHit: 5, attackType: "slash", attackBonus: 14,
    defenceBonus: defence(10, 12, 4), speed: 4, wander: 4, aggro: 6, respawn: 80, scale: 0.98, shape: "skeletal",
    colors: [0xd6cdb4, 0x4a4030],
    drops: {
      always: [{ item: "bones" }],
      main: [
        { item: "coins", min: 15, max: 60, weight: 64 }, { item: "iron_helm", weight: 8 },
        { item: "bronze_sword", weight: 8 }, { item: "iron_dagger", weight: 5 },
      ],
      rare: [{ item: "coins", min: 200, max: 500, weight: 4 }, { item: "steel_axe", weight: 2 }],
    },
  },
  {
    key: "quarry_brute", name: "Quarry brute", examine: "It has been breaking rock all its life, by the look of it.",
    hitpoints: 28, attack: 19, strength: 21, defence: 17, maxHit: 6, attackType: "crush", attackBonus: 18,
    defenceBonus: defence(14, 14, 10), speed: 5, wander: 5, aggro: 6, respawn: 90, scale: 1.18, shape: "humanoid",
    colors: [0x7a6a58, 0x3e3226],
    drops: {
      always: [{ item: "bones" }],
      main: [
        { item: "coins", min: 30, max: 120, weight: 62 }, { item: "iron_sword", weight: 8 },
        { item: "bronze_shield", weight: 7 }, { item: "iron_pickaxe", weight: 5 }, { item: "steel_pickaxe", weight: 2 },
      ],
      rare: [{ item: "coins", min: 400, max: 900, weight: 5 }, { item: "steel_sword", weight: 3 }],
    },
  },
  {
    key: "grave_shambler", name: "Grave shambler", examine: "Whatever it wanted in life, it still wants.",
    hitpoints: 32, attack: 22, strength: 24, defence: 20, maxHit: 7, attackType: "crush", attackBonus: 20,
    defenceBonus: defence(16, 16, 12), speed: 5, wander: 4, aggro: 6, respawn: 95, scale: 1.02, shape: "skeletal",
    colors: [0x7c8468, 0x39301f],
    drops: {
      always: [{ item: "bones" }],
      main: [
        { item: "coins", min: 40, max: 160, weight: 60 }, { item: "iron_sword", weight: 9 },
        { item: "iron_helm", weight: 7 }, { item: "leather_jerkin", weight: 6 },
      ],
      rare: [{ item: "coins", min: 300, max: 700, weight: 5 }, { item: "steel_sword", weight: 2 }],
    },
  },
  // Sandreach's road and the Dunes (Wave 4): the waste's edge and the sand, on the bestiary's shapes in the desert's colours.
  {
    key: "sand_stalker", name: "Sand stalker", examine: "Lean, dun-coloured, and never alone for long.",
    hitpoints: 28, attack: 24, strength: 24, defence: 20, maxHit: 5, attackType: "stab", attackBonus: 20,
    defenceBonus: defence(12, 12, 8), speed: 3, wander: 8, aggro: 7, respawn: 70, scale: 0.85, shape: "canine",
    colors: [0xb08a58, 0x5a4428],
    drops: { always: [{ item: "bones" }] },
  },
  {
    key: "mudfoot_warchief", name: "Mudfoot warchief", examine: "The biggest of them, and it knows it.",
    hitpoints: 36, attack: 26, strength: 26, defence: 24, maxHit: 8, attackType: "slash", attackBonus: 24,
    defenceBonus: defence(20, 20, 16), speed: 5, wander: 5, aggro: 7, respawn: 110, scale: 1.24, shape: "humanoid",
    colors: [0x4f7040, 0x8a6a22],
    drops: {
      always: [{ item: "bones" }],
      main: [
        { item: "coins", min: 60, max: 220, weight: 58 }, { item: "iron_sword", weight: 10 },
        { item: "bronze_shield", weight: 8 }, { item: "iron_helm", weight: 6 }, { item: "steel_axe", weight: 3 },
      ],
      rare: [{ item: "coins", min: 600, max: 1400, weight: 6 }, { item: "steel_sword", weight: 3 }],
    },
  },
  {
    key: "dune_scorpion", name: "Dune scorpion", examine: "Twice the size of the waste's scorpions, and twice as sure of itself.",
    hitpoints: 34, attack: 30, strength: 28, defence: 26, maxHit: 6, attackType: "stab", attackBonus: 26,
    defenceBonus: defence(16, 16, 10), speed: 4, wander: 5, aggro: 6, respawn: 80, scale: 1, shape: "stinger",
    colors: [0xc2a060, 0x5a4020],
    drops: { always: [{ item: "bones" }], rare: [{ item: "gold_ring", weight: 4 }] },
  },
  // Deepdelve Mine's second and third levels (PLAN §8.5, Wave 3), on the rodent's shape.
  {
    key: "delve_rat", name: "Delve rat", examine: "The size of a dog, and it has eaten better than one down here.",
    hitpoints: 38, attack: 34, strength: 32, defence: 30, maxHit: 5, attackType: "stab", attackBonus: 28,
    defenceBonus: defence(18, 18, 14), speed: 4, wander: 5, aggro: 6, respawn: 80, scale: 0.5, shape: "rodent",
    colors: [0x4a4038, 0x8a7a68],
    drops: {
      always: [{ item: "bones" }],
      main: [{ item: "coins", min: 10, max: 40, weight: 66 }, { item: "coal", min: 1, max: 2, weight: 40 }, { item: "iron_ore", weight: 22 }],
      rare: [{ item: "silver_ring", weight: 6 }],
    },
  },
  {
    key: "barrow_warden", name: "Barrow warden", examine: "It was put here to keep something in.",
    hitpoints: 45, attack: 32, strength: 33, defence: 30, maxHit: 10, attackType: "crush", attackBonus: 30,
    defenceBonus: defence(26, 26, 22), speed: 5, wander: 4, aggro: 8, respawn: 130, scale: 1.14, shape: "skeletal",
    colors: [0xa8a288, 0x2f3a46],
    drops: {
      always: [{ item: "bones" }],
      main: [
        { item: "coins", min: 100, max: 400, weight: 56 }, { item: "iron_sword", weight: 11 },
        { item: "iron_helm", weight: 9 }, { item: "bronze_shield", weight: 7 }, { item: "steel_pickaxe", weight: 3 },
      ],
      rare: [{ item: "coins", min: 1000, max: 2500, weight: 7 }, { item: "steel_sword", weight: 5 }],
    },
  },
  {
    key: "dune_raider", name: "Dune raider", examine: "The Dunes' gold is his, he says, and he has a blade to argue it.",
    hitpoints: 42, attack: 36, strength: 38, defence: 32, maxHit: 7, attackType: "slash", attackBonus: 34,
    defenceBonus: defence(22, 24, 16), speed: 4, wander: 5, aggro: 7, respawn: 110, scale: 1, shape: "humanoid",
    colors: [0xb07a54, 0xd8c8a0],
    drops: {
      always: [{ item: "bones" }],
      main: [
        { item: "coins", min: 30, max: 90, weight: 50 }, { item: "gold_ore", weight: 20 }, { item: "iron_sword", weight: 10 },
        { item: "steel_dagger", weight: 6 },
      ],
      rare: [{ item: "steel_sword", weight: 3 }, { item: "gold_amulet", weight: 4 }],
    },
  },
  // The Searmouth (PLAN §8.5, Wave 2): what lives on the mountain's heat, band 45–75. Each stands on a
  // shape the bestiary already has, in the mountain's own colours: nothing here needed new art.
  {
    key: "sear_bat", name: "Sear bat", examine: "Its wings smoulder at the edges, and it does not seem to mind.",
    hitpoints: 46, attack: 40, strength: 38, defence: 35, maxHit: 6, attackType: "slash", attackBonus: 34,
    defenceBonus: defence(20, 28, 18), speed: 3, wander: 6, aggro: 7, respawn: 90, scale: 0.6, shape: "flier",
    colors: [0x2a201c, 0xd8481c],
    drops: {
      always: [{ item: "bones" }],
      main: [{ item: "coins", min: 20, max: 90, weight: 70 }, { item: "coal", min: 1, max: 2, weight: 40 }, { item: "ember_dust", min: 1, max: 3, weight: 18 }],
      rare: [{ item: "emberite_ore", weight: 6 }],
    },
  },
  {
    key: "basalt_crawler", name: "Basalt crawler", examine: "A shell of black rock, and eight legs under it that are much too quick.",
    hitpoints: 55, attack: 44, strength: 46, defence: 48, maxHit: 8, attackType: "stab", attackBonus: 38,
    defenceBonus: defence(40, 40, 30), speed: 5, wander: 4, aggro: 7, respawn: 120, scale: 0.9, shape: "crawler",
    colors: [0x1e1a18, 0x8c4a34],
    drops: {
      always: [{ item: "bones" }],
      main: [{ item: "coins", min: 40, max: 140, weight: 60 }, { item: "coal", min: 2, max: 4, weight: 36 }, { item: "emberite_ore", weight: 14 }, { item: "steel_dagger", weight: 8 }],
      rare: [{ item: "coldiron_dagger", weight: 6 }],
    },
  },
  // Deepdelve Mine's gold vault (PLAN §8.5, Wave 3), on the skeleton's shape, in gold.
  {
    key: "delve_haunt", name: "Delve haunt", examine: "A miner who found the gold, and never left it.",
    hitpoints: 60, attack: 48, strength: 46, defence: 48, maxHit: 10, attackType: "crush", attackBonus: 42,
    defenceBonus: defence(40, 40, 32), speed: 4, wander: 3, aggro: 8, respawn: 200, scale: 1.12, shape: "skeletal",
    colors: [0x8a8478, 0xd8b23a],
    drops: {
      always: [{ item: "bones" }],
      main: [
        { item: "coins", min: 60, max: 200, weight: 52 }, { item: "coldiron_ore", weight: 24 }, { item: "gold_ore", weight: 20 }, { item: "steel_helm", weight: 12 },
      ],
      rare: [{ item: "coins", min: 800, max: 2000, weight: 6 }, { item: "coldiron_sword", weight: 4 }],
    },
  },
  // The Rift under the Broken Tower (PLAN §8.5, Wave 3): band 60–90, the worst company on the map, on the bestiary's shapes in the Rift's violet.
  {
    key: "rift_hound", name: "Rift hound", examine: "Something like a dog, if a dog had come up out of the dark and liked it better.",
    hitpoints: 62, attack: 50, strength: 52, defence: 50, maxHit: 11, attackType: "stab", attackBonus: 48,
    defenceBonus: defence(42, 42, 34), speed: 3, wander: 6, aggro: 9, respawn: 150, scale: 1.05, shape: "canine",
    colors: [0x1a1624, 0x6a4ab0],
    drops: {
      always: [{ item: "bones" }],
      main: [{ item: "coins", min: 60, max: 200, weight: 50 }, { item: "coldiron_ore", min: 1, max: 2, weight: 30 }, { item: "emberite_ore", weight: 16 }],
      rare: [{ item: "starfall_ore", weight: 6 }],
    },
  },
  {
    key: "ash_wight", name: "Ash wight", examine: "A miner, once. The mountain kept him, and keeps him working.",
    hitpoints: 66, attack: 52, strength: 54, defence: 54, maxHit: 11, attackType: "crush", attackBonus: 46,
    defenceBonus: defence(44, 44, 36), speed: 4, wander: 4, aggro: 8, respawn: 150, scale: 1.1, shape: "skeletal",
    colors: [0x6a6660, 0xd8481c],
    drops: {
      always: [{ item: "bones" }],
      main: [
        { item: "coins", min: 60, max: 220, weight: 52 }, { item: "emberite_ore", min: 1, max: 2, weight: 26 }, { item: "coal", min: 3, max: 6, weight: 24 },
        { item: "steel_helm", weight: 10 }, { item: "steel_pickaxe", weight: 8 },
      ],
      rare: [{ item: "coldiron_sword", weight: 4 }, { item: "coins", min: 1200, max: 3000, weight: 6 }],
    },
  },
  {
    key: "rift_sworn", name: "Rift-sworn", examine: "It knelt to whatever is down here, and got up something else.",
    hitpoints: 74, attack: 60, strength: 62, defence: 60, maxHit: 14, attackType: "slash", attackBonus: 58,
    defenceBonus: defence(52, 52, 44), speed: 4, wander: 4, aggro: 10, respawn: 200, scale: 1.1, shape: "humanoid",
    colors: [0x2a2438, 0x8a7ad0],
    drops: {
      always: [{ item: "bones" }],
      main: [
        { item: "coins", min: 100, max: 300, weight: 46 }, { item: "emberite_ore", min: 1, max: 2, weight: 28 }, { item: "coldiron_helm", weight: 10 },
        { item: "coldiron_sword", weight: 8 },
      ],
      rare: [{ item: "emberite_sword", weight: 4 }, { item: "coins", min: 3000, max: 6000, weight: 6 }],
    },
  },
  {
    key: "sear_drake", name: "Sear drake", examine: "It has lived in the heart of the mountain long enough to be made of it.",
    hitpoints: 85, attack: 58, strength: 60, defence: 60, maxHit: 15, attackType: "slash", attackBonus: 56,
    defenceBonus: defence(50, 50, 42), speed: 4, wander: 3, aggro: 10, respawn: 300, scale: 1.7, shape: "lizard",
    colors: [0x1a1412, 0xe8601c],
    drops: {
      always: [{ item: "bones" }],
      main: [
        { item: "coins", min: 150, max: 500, weight: 50 }, { item: "emberite_ore", min: 1, max: 2, weight: 34 }, { item: "coal", min: 4, max: 8, weight: 20 },
        { item: "ember_dust", min: 3, max: 8, weight: 16 }, { item: "steel_sword", weight: 8 },
      ],
      rare: [{ item: "coldiron_sword", weight: 6 }, { item: "coins", min: 2000, max: 5000, weight: 6 }],
    },
  },
  {
    key: "rift_wraith", name: "Rift wraith", examine: "Bones held together by the light of the stone it guards, and not much else.",
    hitpoints: 90, attack: 70, strength: 70, defence: 72, maxHit: 17, attackType: "crush", attackBonus: 66,
    defenceBonus: defence(62, 62, 52), speed: 4, wander: 3, aggro: 10, respawn: 300, scale: 1.25, shape: "skeletal",
    colors: [0x3a3448, 0xb0a0ff],
    drops: {
      always: [{ item: "bones" }],
      main: [
        { item: "coins", min: 200, max: 600, weight: 44 }, { item: "emberite_ore", min: 1, max: 3, weight: 30 }, { item: "starfall_ore", weight: 20 },
        { item: "emberite_helm", weight: 6 },
      ],
      rare: [{ item: "starfall_sword", weight: 3 }, { item: "starfall_helm", weight: 3 }],
    },
  },
];

/**
 * The people of Oakridge (PLAN §7.4). They share the bestiary's machinery — one entity path, one model
 * pipeline, one wander rule — but `person` marks them out: nobody may swing at them, they swing at
 * nobody, and clicking one talks to it. Their combat numbers exist only because every entity has them.
 */
const villager = (
  key: string, name: string, examine: string, look: number[],
  extra: Partial<MonsterDef> = {},
): MonsterDef => ({
  key, name, examine, person: true, look,
  hitpoints: 10, attack: 1, strength: 1, defence: 1, maxHit: 0, attackType: "crush", attackBonus: 0,
  defenceBonus: defence(0, 0, 0), speed: 4, wander: 2, aggro: 0, respawn: 20, scale: 1, shape: "humanoid",
  colors: [0xe0ac7e, 0x8a5a2e], drops: {}, ...extra,
});

/**
 * Who wears what. A look is the player's thirteen slots — body, hair, jaw, torso, arms, hands, legs,
 * feet, skin, hair colour, top colour, legs colour, feet colour — so every one of these could be typed
 * into the character creator, and the reference's townsfolk are the pattern: a banker in a pale belted
 * shirt and grey trousers, a shopkeeper in an apron, a guard in a helm with sword and shield, a man in
 * a laced green shirt, a woman in a blouse and long skirt.
 */
export const VILLAGERS: MonsterDef[] = [
  villager("banker", "Banker", "Tidy, patient, and very hard to hurry.", [0, 1, 0, 3, 2, 0, 0, 1, 1, 0, 7, 15, 1], {
    talk: "banker", banker: true, wander: 0,
  }),
  villager("shopkeeper_general", "Maud Tarrow", "She runs the store, and most of the gossip.", [1, 6, 0, 0, 0, 0, 2, 0, 2, 8, 10, 8, 0], {
    talk: "shopkeeper_general", shop: "oakridge_general", wander: 0, apron: 0xb59a6a,
  }),
  villager("shopkeeper_tools", "Odric Brayle", "Hands like old leather. He sells the tools that made them.", [0, 1, 3, 0, 0, 0, 0, 1, 3, 8, 10, 3, 1], {
    talk: "shopkeeper_tools", shop: "oakridge_tools", wander: 0, apron: 0xa88a62,
  }),
  villager("gatekeeper", "Emberway keeper", "He has the key, and no intention of using it.", [0, 1, 1, 0, 1, 0, 0, 1, 2, 7, 10, 5, 0], {
    talk: "gatekeeper", wander: 0, wear: { head: "iron_helm" },
  }),
  villager("innkeeper", "Hesper Doon", "She keeps the Split Oak, and everyone in it in line.", [1, 3, 0, 0, 1, 0, 0, 1, 1, 3, 15, 2, 0], {
    talk: "innkeeper", wander: 0, apron: 0xe8e2d0,
  }),
  villager("smith", "Garrow Lund", "Soot to the elbows, and cheerful about it.", [0, 0, 4, 0, 0, 1, 0, 1, 2, 1, 0, 13, 2], {
    talk: "smith", wander: 1, apron: 0x4a3a2c,
  }),
  villager("farmer", "Tolle Hark", "He is counting something, and has lost his place.", [0, 1, 0, 2, 1, 0, 0, 1, 1, 2, 8, 3, 1], {
    talk: "farmer", wander: 3,
  }),
  villager("miller", "Nessa Rill", "White to the eyebrows with flour.", [1, 5, 0, 0, 0, 0, 2, 0, 0, 5, 7, 0, 1], {
    talk: "miller", wander: 1,
  }),
  villager("guard", "Oakridge guard", "He watches the road, mostly.", [0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 15, 2, 0], {
    talk: "guard", wander: 4, wear: { head: "iron_helm", weapon: "iron_sword", shield: "bronze_shield" },
  }),
  villager("villager", "Villager", "One of the people of Oakridge.", [0, 1, 1, 1, 0, 0, 0, 1, 1, 1, 2, 3, 1], {
    talk: "villager", wander: 5,
  }),
  villager("villager_woman", "Villager", "One of the people of Oakridge.", [1, 3, 0, 0, 0, 0, 2, 0, 1, 0, 5, 2, 1], {
    talk: "villager", wander: 5,
  }),
  // The people of Stonecote (PLAN §7.6, Wave 1): the innkeeper and the tackle seller keep to their
  // counters; the cotters wander the lanes.
  villager("innkeeper_stonecote", "Tamsin Reeve", "She keeps the Drover's Rest, and it runs on her say-so.", [1, 5, 0, 0, 1, 0, 0, 1, 2, 5, 9, 4, 0], {
    talk: "innkeeper_stonecote", wander: 0, apron: 0xd8cdb0,
  }),
  villager("tackle_keeper", "Corwen Pike", "Smells of the river, and is proud of it.", [0, 2, 1, 2, 1, 0, 0, 1, 2, 7, 6, 8, 1], {
    talk: "tackle_keeper", shop: "stonecote_tackle", wander: 0, apron: 0x6f7d66,
  }),
  villager("cotter", "Cotter", "One of the people of Stonecote.", [0, 1, 4, 1, 0, 0, 0, 1, 1, 2, 4, 6, 1], {
    talk: "cotter", wander: 5,
  }),
  villager("cotter_woman", "Cotter", "One of the people of Stonecote.", [1, 6, 0, 0, 0, 0, 2, 0, 1, 3, 12, 5, 1], {
    talk: "cotter", wander: 5,
  }),
  // The people of Wickstead (PLAN §7.6, Wave 1): the net seller and the innkeeper keep to their
  // counters, the squire to his hall and the constable to the lock-up's door; the fishers wander.
  villager("netmaker", "Nell Ferris", "Salt in her hair and twine on every finger.", [1, 4, 0, 0, 1, 0, 2, 0, 1, 2, 12, 4, 1], {
    talk: "netmaker", shop: "wickstead_nets", wander: 0, apron: 0x5c6e7a,
  }),
  villager("innkeeper_wickstead", "Ivo Marram", "He keeps the Grayling, and knows what came in this morning.", [0, 3, 2, 1, 1, 0, 0, 1, 3, 4, 8, 3, 0], {
    talk: "innkeeper_wickstead", wander: 0, apron: 0xd0c4a4,
  }),
  villager("squire", "Squire Corbet Wick", "The name on the village, and he would like that remembered.", [0, 2, 5, 3, 2, 1, 1, 1, 1, 6, 13, 15, 0], {
    talk: "squire", wander: 0,
  }),
  villager("constable", "Wickstead constable", "He stands where the lock-up can see him, and so can everyone else.", [0, 1, 3, 1, 1, 0, 0, 1, 2, 0, 15, 2, 0], {
    talk: "constable", wander: 2, wear: { head: "iron_helm", weapon: "iron_mace", shield: "bronze_shield" },
  }),
  villager("fisher", "Fisher", "One of the people of Wickstead.", [0, 5, 1, 2, 0, 0, 0, 1, 2, 3, 6, 10, 1], {
    talk: "fisher", wander: 5,
  }),
  villager("fisher_woman", "Fisher", "One of the people of Wickstead.", [1, 7, 0, 0, 0, 0, 2, 0, 1, 1, 9, 5, 1], {
    talk: "fisher", wander: 5,
  }),
  // The people of Brinehaven (PLAN §7.6, Wave 1): the harbourmaster on his quay, the shipwright in her
  // yard, the ferryman at the berth his boat is not in, a keeper to the counter and the Bell; the
  // dockhands and the sailors wander the waterfront.
  villager("harbourmaster", "Harbourmaster Tobin Kell", "He keeps the book, and the book keeps the port.", [0, 2, 3, 1, 1, 0, 0, 1, 1, 0, 14, 12, 0], {
    talk: "harbourmaster", wander: 1,
  }),
  villager("shipwright", "Ada Sennen", "Pitch to the wrists, and a plane she will not put down to talk.", [1, 6, 0, 0, 1, 0, 2, 0, 2, 4, 6, 3, 1], {
    talk: "shipwright", wander: 2, apron: 0x7a6a4e,
  }),
  villager("innkeeper_brinehaven", "Piran Locke", "He keeps the Drowned Bell, and hears every tale that comes in on the tide.", [0, 4, 4, 0, 1, 0, 0, 1, 2, 2, 8, 6, 0], {
    talk: "innkeeper_brinehaven", wander: 0, apron: 0xc8b89a,
  }),
  villager("potmaker", "Morwen Hale", "Wicker in her lap and a crab's worth of scars on her hands.", [1, 2, 0, 0, 0, 0, 2, 0, 1, 6, 12, 10, 1], {
    talk: "potmaker", shop: "brinehaven_pots", wander: 0, apron: 0x4e6a5c,
  }),
  villager("ferryman", "Jory Tregear", "A man with a berth and no boat in it.", [0, 5, 2, 2, 0, 0, 0, 1, 3, 3, 9, 8, 1], {
    talk: "ferryman", wander: 1,
  }),
  villager("dockhand", "Dockhand", "One of the people of Brinehaven.", [0, 1, 4, 1, 0, 0, 0, 1, 2, 2, 4, 6, 1], {
    talk: "dockhand", wander: 5,
  }),
  villager("dockhand_woman", "Dockhand", "One of the people of Brinehaven.", [1, 5, 0, 0, 0, 0, 2, 0, 1, 3, 12, 5, 1], {
    talk: "dockhand", wander: 5,
  }),
  villager("sailor", "Sailor", "Ashore, and not happy about it.", [0, 1, 5, 3, 2, 0, 0, 1, 1, 0, 3, 15, 0], {
    talk: "sailor", wander: 6,
  }),
  // The people of Thornbury (PLAN §7.6, Wave 1): the guard in iron at every gate, a keeper to every
  // counter, the castellan in his keep, and townsfolk about the streets.
  villager("city_guard", "Thornbury guard", "Iron on his head and a look that has seen everything twice.", [0, 1, 2, 1, 1, 0, 0, 1, 2, 1, 15, 15, 0], {
    talk: "city_guard", wander: 3, wear: { head: "iron_helm", weapon: "iron_sword", shield: "iron_shield" },
  }),
  villager("shopkeeper_thornbury", "Wilf Ashby", "He has it, whatever it is. Somewhere.", [0, 3, 3, 0, 0, 0, 0, 1, 1, 6, 10, 2, 1], {
    talk: "shopkeeper_thornbury", shop: "thornbury_general", wander: 0, apron: 0xb59a6a,
  }),
  villager("weaponsmith", "Bram Coyle", "Every blade on his wall has his mark on it.", [0, 0, 4, 0, 0, 1, 0, 1, 3, 1, 3, 13, 2], {
    talk: "weaponsmith", shop: "thornbury_weapons", wander: 0, apron: 0x4a3a2c,
  }),
  villager("armourer", "Hild Marrow", "She can tell a dented helm from a bad one at forty paces.", [1, 2, 0, 0, 1, 0, 0, 1, 2, 4, 15, 15, 0], {
    talk: "armourer", shop: "thornbury_armour", wander: 0, apron: 0x6b6f74,
  }),
  villager("fletcher", "Fenn Tolliver", "Feathers in his hair, and glue on everything else.", [0, 4, 1, 2, 0, 0, 0, 1, 1, 8, 4, 6, 1], {
    talk: "fletcher", shop: "thornbury_archery", wander: 0, apron: 0x8a7a5a,
  }),
  villager("goldsmith", "Isolde Garnett", "Small hands, a jeweller's glass, and no patience for haggling.", [1, 7, 0, 0, 1, 0, 2, 0, 0, 2, 11, 9, 0], {
    talk: "goldsmith", shop: "thornbury_goldsmith", wander: 0, apron: 0xd8b060,
  }),
  villager("staff_seller", "Orrin Vell", "He talks as if he knows a thing or two you don't.", [0, 5, 5, 0, 2, 0, 1, 1, 1, 9, 12, 12, 1], {
    talk: "staff_seller", shop: "thornbury_staves", wander: 0, apron: 0x3a4a80,
  }),
  villager("apothecary", "Agnes Quill", "Ink on her fingers and a smell of crushed leaves.", [1, 4, 0, 0, 0, 0, 2, 0, 1, 5, 8, 6, 1], {
    talk: "apothecary", wander: 0,
  }),
  villager("innkeeper_thornbury", "Rolf Penhallow", "He keeps the Blackthorn, and it keeps him busy.", [0, 2, 3, 0, 1, 0, 0, 1, 2, 3, 7, 3, 0], {
    talk: "innkeeper_thornbury", wander: 0, apron: 0xe8e2d0,
  }),
  villager("smith_thornbury", "Dunstan Ferrier", "Arms like hawsers and a voice to match.", [0, 0, 2, 0, 0, 1, 0, 1, 3, 0, 0, 13, 2], {
    talk: "smith_thornbury", wander: 1, apron: 0x4a3a2c,
  }),
  villager("market_trader", "Meg Sallow", "She has been up since before the hens.", [1, 3, 0, 0, 0, 0, 2, 0, 1, 7, 13, 8, 1], {
    talk: "market_trader", shop: "thornbury_market", wander: 0, apron: 0xc8b890,
  }),
  villager("castellan", "Castellan Vane", "He holds the castle for a lord who is never in it.", [0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 14, 15, 0], {
    talk: "castellan", wander: 0, wear: { head: "steel_helm", weapon: "steel_sword", shield: "steel_shield" },
  }),
  villager("townsman", "Townsman", "One of the people of Thornbury.", [0, 6, 0, 1, 0, 0, 0, 1, 2, 4, 9, 3, 1], {
    talk: "townsfolk", wander: 6,
  }),
  villager("townswoman", "Townswoman", "One of the people of Thornbury.", [1, 2, 0, 0, 0, 0, 2, 0, 3, 1, 6, 10, 1], {
    talk: "townsfolk", wander: 6,
  }),
  // Kilnhold (PLAN §7.6, Wave 2).
  villager("smith_kilnhold", "Brannoc Hask", "Burn scars up both arms, and proud of every one.", [0, 2, 4, 0, 0, 1, 0, 1, 3, 4, 0, 13, 2], {
    talk: "smith_kilnhold", wander: 1, apron: 0x4a3a2c,
  }),
  villager("bladesmith", "Sefa Hask", "She sells what her brother makes, and knows what each one weighs.", [1, 4, 0, 0, 0, 0, 2, 0, 2, 2, 8, 12, 1], {
    talk: "bladesmith", shop: "kilnhold_blades", wander: 0, apron: 0x6a4a3a,
  }),
  villager("innkeeper_kilnhold", "Wat Embry", "He keeps the Kiln Door, and a jug of something under the counter.", [0, 3, 2, 0, 1, 0, 0, 1, 3, 0, 9, 3, 0], {
    talk: "innkeeper_kilnhold", wander: 0, apron: 0xe8e2d0,
  }),
  villager("kilnman", "Kilnman", "Black to the eyebrows. The kilns don't tend themselves.", [0, 1, 4, 1, 0, 0, 0, 1, 3, 1, 4, 6, 1], {
    talk: "kilnman", wander: 2,
  }),
  villager("hold_warden", "Hold warden", "He watches the road, and you on it.", [0, 1, 1, 0, 1, 0, 0, 1, 2, 7, 10, 5, 0], {
    talk: "hold_warden", wander: 0, wear: { head: "iron_helm", weapon: "iron_sword", shield: "iron_shield" },
  }),
  villager("holdsman", "Holdsman", "One of the people of Kilnhold.", [0, 5, 1, 1, 0, 0, 0, 1, 3, 2, 12, 3, 1], {
    talk: "kilnhold_folk", wander: 6,
  }),
  villager("holdswoman", "Holdswoman", "One of the people of Kilnhold.", [1, 3, 0, 0, 0, 0, 2, 0, 3, 5, 4, 10, 1], {
    talk: "kilnhold_folk", wander: 6,
  }),
  // Tarhollow, on Sablewood Isle (PLAN §7.6, Wave 2).
  villager("ferryman_isle", "Perrin Tregear", "The ferryman's brother, and the isle's whole harbour staff.", [0, 5, 2, 2, 0, 0, 0, 1, 3, 1, 9, 8, 1], {
    talk: "ferryman_isle", wander: 0,
  }),
  villager("innkeeper_tarhollow", "Nance Pellow", "She keeps the Black Pine, and the fire in it, which is the same job.", [1, 3, 0, 0, 1, 0, 0, 1, 2, 1, 6, 2, 0], {
    talk: "innkeeper_tarhollow", wander: 0, apron: 0x8a6a4a,
  }),
  villager("storekeeper_tarhollow", "Ewan Tarr", "He sells what the ferry brings, at what the ferry costs.", [0, 1, 3, 0, 0, 0, 0, 1, 2, 4, 11, 3, 1], {
    talk: "storekeeper_tarhollow", shop: "tarhollow_stores", wander: 0, apron: 0x6a6a5a,
  }),
  villager("woodcutter_isle", "Hob", "An axe on his shoulder, and the shoulder to carry it.", [0, 0, 4, 1, 0, 0, 0, 1, 3, 2, 3, 6, 1], {
    talk: "woodcutter_isle", wander: 2,
  }),
  villager("islander", "Islander", "One of the people of Sablewood Isle.", [0, 6, 1, 1, 0, 0, 0, 1, 3, 1, 5, 3, 1], {
    talk: "islanders", wander: 6,
  }),
  villager("islander_woman", "Islander", "One of the people of Sablewood Isle.", [1, 2, 0, 0, 0, 0, 2, 0, 3, 0, 3, 12, 1], {
    talk: "islanders", wander: 6,
  }),
  // Deepdelve and Hollow Pass (PLAN §7.6, Wave 3).
  villager("pass_keeper", "Pass keeper", "She keeps the gate, and the count of who went by it.", [1, 3, 0, 0, 1, 0, 0, 1, 2, 5, 10, 5, 0], {
    talk: "pass_keeper", wander: 0, wear: { head: "iron_helm" },
  }),
  villager("smith_deepdelve", "Old Cadwal", "Sixty years at a furnace, and it shows in the hands.", [0, 0, 4, 0, 0, 1, 0, 1, 2, 9, 0, 13, 2], {
    talk: "smith_deepdelve", wander: 1, apron: 0x4a3a2c,
  }),
  villager("toolseller", "Bryn Tarrant", "Picks, more picks, and a pick for whatever the first two don't crack.", [0, 1, 2, 0, 0, 0, 0, 1, 3, 3, 8, 3, 1], {
    talk: "toolseller", shop: "deepdelve_tools", wander: 0, apron: 0x7a6a5a,
  }),
  villager("innkeeper_deepdelve", "Gwenna Pryce", "She keeps the Pick and Lantern warm, which under this cliff is work.", [1, 4, 0, 0, 1, 0, 0, 1, 2, 2, 7, 3, 0], {
    talk: "innkeeper_deepdelve", wander: 0, apron: 0xe8e2d0,
  }),
  villager("foreman", "Foreman Idris", "He counts the carts out and the men back, and minds which number is bigger.", [0, 2, 3, 1, 0, 0, 0, 1, 3, 1, 4, 6, 1], {
    talk: "foreman", wander: 1, wear: { head: "iron_helm" },
  }),
  villager("miner", "Miner", "Dust to the eyebrows, and a pick over one shoulder.", [0, 1, 4, 1, 0, 0, 0, 1, 3, 2, 3, 6, 1], {
    talk: "miners", wander: 5,
  }),
  villager("delver", "Delver", "One of the people of Deepdelve.", [0, 6, 1, 1, 0, 0, 0, 1, 2, 4, 9, 3, 1], {
    talk: "delvers", wander: 6,
  }),
  villager("delver_woman", "Delver", "One of the people of Deepdelve.", [1, 2, 0, 0, 0, 0, 2, 0, 3, 1, 6, 10, 1], {
    talk: "delvers", wander: 6,
  }),
  // The Harrow Gate (PLAN §7.6, Wave 3).
  villager("ditch_warden", "Ditch warden", "He watches the north, and the fools who walk into it.", [0, 1, 1, 0, 1, 0, 0, 1, 2, 7, 10, 5, 0], {
    talk: "ditch_warden", wander: 0, wear: { head: "steel_helm", weapon: "iron_sword", shield: "iron_shield" },
  }),
  // Sandreach (PLAN §7.6, Wave 4).
  villager("caravan_master", "Idrah Voss", "She has sold something to everyone who ever came up the Sand Road, and bought something back.", [1, 5, 0, 0, 1, 0, 2, 0, 4, 7, 9, 7, 3], {
    talk: "caravan_master", shop: "sandreach_caravan", wander: 0, apron: 0x7a6a5a,
  }),
  villager("innkeeper_sandreach", "Mahra Sel", "She keeps the Last Well, and knows where the water is past it.", [1, 3, 0, 1, 0, 0, 2, 0, 5, 0, 10, 7, 1], {
    talk: "innkeeper_sandreach", wander: 0, apron: 0xe8e2d0,
  }),
  villager("tomb_warden", "Warden Kesh", "He keeps the old tombs shut, and has for longer than he admits.", [0, 1, 4, 3, 1, 1, 0, 1, 4, 8, 7, 8, 0], {
    talk: "tomb_warden", wander: 0, wear: { head: "iron_helm", weapon: "iron_sword" },
  }),
  villager("sandreacher", "Sandreacher", "One of the people of Sandreach.", [0, 2, 2, 2, 0, 0, 0, 0, 3, 7, 7, 4, 3], {
    talk: "sandreachers", wander: 6,
  }),
  villager("sandreacher_woman", "Sandreacher", "One of the people of Sandreach.", [1, 4, 0, 0, 0, 0, 2, 0, 5, 0, 4, 7, 3], {
    talk: "sandreachers", wander: 6,
  }),
  villager("caravaneer", "Caravaneer", "Loading, unloading, and counting what the road cost this time.", [0, 6, 1, 3, 1, 2, 0, 1, 4, 1, 9, 8, 0], {
    talk: "caravaneers", wander: 4,
  }),
];

export const MONSTER_BY_KEY = new Map([...MONSTERS, ...VILLAGERS].map((m) => [m.key, m]));

export function monster(key: string): MonsterDef {
  const def = MONSTER_BY_KEY.get(key);
  if (!def) throw new Error(`no monster ${key}`);
  return def;
}

/** A creature's combat level, on the same formula as a player's. */
export function levelOf(def: MonsterDef): number {
  return combatLevel({ attack: def.attack, strength: def.strength, defence: def.defence, hitpoints: def.hitpoints });
}

/**
 * Whether a creature that starts fights would start one with a fighter of this combat level: the
 * classic rule, that it leaves alone anyone above twice its own level.
 */
export function attacksOnSight(def: MonsterDef, level: number): boolean {
  return def.aggro > 0 && level <= 2 * levelOf(def);
}

/** Ticks a player may spend beside creatures that start fights before they lose interest: ten minutes. */
export const TOLERANCE_TICKS = 1000;

/** Ticks between a fighter's natural hitpoint regained: one a minute. */
export const REGEN_TICKS = 100;
