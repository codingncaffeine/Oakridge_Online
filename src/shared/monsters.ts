// The bestiary. Every creature, its stats, what it leaves behind and how it behaves. The mechanics are
// the classic ones (see shared/combat.ts); every name, number and drop here is this game's own.
import { type AttackType, combatLevel } from "./combat.ts";

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
  /** How it strikes, and how well: one bonus in its own type. */
  attackType: AttackType;
  attackBonus: number;
  /** What it turns aside, by the type of blow coming at it. */
  defenceBonus: Record<AttackType, number>;
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
}

const defence = (stab: number, slash: number, crush: number): Record<AttackType, number> => ({ stab, slash, crush });

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
];

export const MONSTER_BY_KEY = new Map(MONSTERS.map((m) => [m.key, m]));

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
