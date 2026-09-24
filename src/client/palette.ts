// Every colour, light and fog setting and every appearance choice, in one place. Colours are sRGB hex,
// so tuning is a one-line change. Lists indexed by a look slot must be at least that slot's count.

export const FOG_COLOR = 0x000000;
export const FOG_NEAR = 22;
export const FOG_FAR = 40;

export const SKY_LIGHT = 0xe4ebf5;
export const GROUND_LIGHT = 0x5c5242;
export const SKY_INTENSITY = 1.6;
export const SUN_COLOR = 0xfff0d8;
export const SUN_INTENSITY = 2.2;
/** Direction the sunlight comes FROM (x east, y up, z south). */
export const SUN_FROM = [-0.5, 1, 0.55] as const;

/** Indexed by the map's underlay ids: grass, forest floor, dirt, sand. */
export const UNDERLAY_COLORS = [0x7a9530, 0x5c7527, 0x7d6644, 0xcdb480, 0x2b2825];
/** Indexed by the map's overlay ids: none, path, water. */
export const OVERLAY_COLORS = [0x000000, 0x8a7654, 0x5f7fa5];

export const TRUNK = 0xb27c4e;
export const TRUNK_DARK = 0x94623a;
export const OAK_TRUNK = 0xa06e44;
/** Bark up the rest of the woodcutting ladder: alder, rowan, blackthorn, ironbark, sablewood, heartoak. */
export const BARK = {
  alder: 0x7a6a5a, rowan: 0xa89c86, blackthorn: 0x4a3c34, ironbark: 0x8d8c86, sablewood: 0x3a332e, heartoak: 0x9a6a3e,
};
/** Leaf-texture greens, from sunlit to shadow. */
export const LEAF_GREENS = ["#b3c257", "#9cb14a", "#86a03c", "#718d31", "#5f7c29", "#4c6821", "#3b5419", "#2c4112"];
export const LEAF_BACKING = "#34491a";
/**
 * What each tree's foliage multiplies the one leaf texture by, so the eight tiers read apart from a
 * distance. White leaves the texture alone, which is what a plain tree and an oak use.
 */
export const LEAF_TINT = {
  alder: 0xa8c0b0, rowan: 0xd8cc80, blackthorn: 0x6e7a70, ironbark: 0x9aa89c, sablewood: 0x4a4e52, heartoak: 0xd0b464,
};
/** Rowan's berries, and the thorns on a blackthorn. */
export const BERRY = 0xc03428;
export const THORN = 0x6a5a4a;
export const ROCK = [0x7d7a74, 0x6a6760];
/** The nuggets in an ore rock, by ore. */
export const ORE = {
  copper: 0xd07a3e, tin: 0xd6d8d2, iron: 0x9c4526, coal: 0x2a2a2e, silver: 0xd8dce4,
  coldiron: 0x8aa2bd, gold: 0xe0b83a, emberite: 0xd8542a, starfall: 0xa88ce8,
};
/** The sawn top of a stump. */
export const CUT_WOOD = 0xdcc08e;
export const FENCE = 0x8a6a42;
/** The pale coping along the top of every wall, and the string course where an upper floor begins. */
export const WALL_CAP = 0xb9b5aa;

export const WALK_CROSS = "#ffff00";
/** The cross for clicking to act on something (taking an item, later chopping or attacking). */
export const ACTION_CROSS = "#ff0000";

// Appearance. Style names label the designer; colour lists are what the swatches show.
export const BODY_TYPES = ["Type A", "Type B"];
export const HAIR_STYLES = ["Bald", "Short", "Swept", "Long", "Spiky", "Ponytail", "Bun", "Mohawk"];
export const BEARD_STYLES = ["None", "Goatee", "Moustache", "Short beard", "Full beard", "Long beard"];
export const TORSO_STYLES = ["Plain", "Buttoned", "Vest", "Belted", "Two-toned"];
export const ARM_STYLES = ["Short sleeves", "Long sleeves", "Cuffed"];
export const HAND_STYLES = ["Bare", "Gloves", "Wristbands"];
export const LEG_STYLES = ["Trousers", "Shorts", "Skirt"];
export const FEET_STYLES = ["Shoes", "Boots"];

export const SKIN = [0xf2c9a0, 0xe0ac7e, 0xc98e5f, 0xa8744a, 0x8a5a36, 0x6b4228, 0x4e2f1d, 0x3a2216];
export const HAIR = [0x3b2616, 0x5e3a1e, 0x8a5a2b, 0x8f3b1b, 0xb5541f, 0xd4a84b, 0xe6d8a8, 0x1c1714, 0x8a8580, 0xdcdad4, 0x5a1a14, 0x23283a];
export const CLOTH = [
  0x8b2f2a, 0x2f5a8b, 0x3f6a2f, 0x7a6a2a, 0xb58a2e, 0x5a2f6a, 0x2a2a2e, 0xd8d2c0,
  0x8a5a2e, 0x2e6a6a, 0xb5602e, 0x6a2a2e, 0x2a3a5a, 0x9aa06a, 0xa06a8a, 0x5a5a5a,
];
export const FOOTWEAR = [0x3a2a1e, 0x5a3a22, 0x2a2a2a, 0x6a5a48, 0x4a4a4e, 0x7a2a22, 0x2a3a4a, 0x8a7a5a];
/** Fixed colours for the eyes and for the shirt shown under a vest. */
export const EYE_DARK = 0x2a2018;
export const UNDERSHIRT = 0xe8e2d0;
export const BELT = 0x3a2616;

// --- The village (Phase 7; stone since 2026-09-24, after the reference) -------------------------
/** Timber for what is still wood: fences, counters, gates, furniture. */
export const TIMBER = 0x6b4a2e;
export const DOOR_WOOD = 0x7a5230;
/** The walls: grey coursed stone with dark mortar between the blocks (the texture is painted from these). */
export const STONE = 0x8e8c86;
export const STONE_MORTAR = 0x4e4b46;
/** Light oak for doors; the pale stone of jambs, lintels and window frames; the glazing and its bars; an arrow slit. */
export const DOOR_OAK = 0xb08838;
export const FRAME_PALE = 0xcdc5b2;
export const PANE = 0xf2efe6;
export const MULLION = 0x4a4038;
export const SLIT = 0x0c0a08;
/** Each roof as the three tones its texture is painted in: the tile, the shadow under a row's edge, its lit top. */
export const ROOF_CLAY_TONES = { base: "#9a4a36", dark: "#5e2a1e", light: "#b8604a" };
export const ROOF_SLATE_TONES = { base: "#6c6f72", dark: "#3c3f42", light: "#8c9094" };
export const THATCH_TONES = { base: "#b0924e", dark: "#7a6230", light: "#d2b46a" };
/** The board along the eaves, the cap along each kind of ridge, and the leads of a flat roof. */
export const FASCIA = 0xb7a883;
export const RIDGE_CAP = { clay: 0x6a3024, slate: 0x45484b, thatch: 0x8a6a34 };
export const LEADS = 0x6a6a68;
export const IRON_BAR = 0x4a4844;
/** The hearth, the forge and a lit fire, from the coals up through the flame. */
export const EMBER = 0xd8481c;
export const FLAME = 0xf0a028;
export const ASH = 0x4a463e;
/** Worked stone, for graves, sarcophagi, millstones and the anvil's block. */
export const CUT_STONE = 0x9a958c;
export const DARK_STONE = 0x5e5a54;
export const ANVIL_IRON = 0x34333a;
/** Field and garden: the bushes, the reeds and the tilled rows. */
export const BUSH_GREEN = 0x4e7a34;
export const REED_GREEN = 0x7d8a44;
export const CROP_GREEN = 0x8a9a3e;
export const SACK_CLOTH = 0xbaa87e;

/** Underground (PLAN §8.5): the same lights turned down and the dark drawn in closer, and the rock the rooms are cut from. */
export const CAVE_SKY_INTENSITY = 0.8;
export const CAVE_SUN_INTENSITY = 1.2;
export const CAVE_FOG_NEAR = 16;
export const CAVE_FOG_FAR = 34;
export const CAVE_ROCK = 0x3e3a36;
export const CAVE_ROCK_LIGHT = 0x585149;

// --- The sky (PLAN Phase 16) ---------------------------------------------------------------------
/**
 * The sky through the day, as colours at the hours the eye notices: the dome's zenith and horizon,
 * the sun's own colour, the light from the sky and from the ground, keyed by the day's phase
 * (0 midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset) and blended between. Noon is exactly the daylight
 * the village was approved under; the fog takes the horizon's colour, so the ground fades into the sky.
 */
export interface SkyKey {
  at: number;
  zenith: number;
  horizon: number;
  sun: number;
  sky: number;
  ground: number;
}
export const SKY_KEYS: SkyKey[] = [
  { at: 0.0, zenith: 0x0a0f24, horizon: 0x1a2140, sun: 0xc0ccec, sky: 0x7484b0, ground: 0x2a2c38 },
  { at: 0.2, zenith: 0x141a36, horizon: 0x2c2a4c, sun: 0xc8b8c8, sky: 0x8088b0, ground: 0x2e2a30 },
  { at: 0.26, zenith: 0x4a6aa8, horizon: 0xe8a070, sun: 0xffb070, sky: 0xb8b4c8, ground: 0x4a3c30 },
  { at: 0.34, zenith: 0x4d8fd6, horizon: 0xb8d6ee, sun: 0xfff0d8, sky: 0xe4ebf5, ground: 0x5c5242 },
  { at: 0.66, zenith: 0x4d8fd6, horizon: 0xb8d6ee, sun: 0xfff0d8, sky: 0xe4ebf5, ground: 0x5c5242 },
  { at: 0.74, zenith: 0x4a5a98, horizon: 0xf08a52, sun: 0xff8a40, sky: 0xc8a498, ground: 0x4a3830 },
  { at: 0.8, zenith: 0x141a36, horizon: 0x3a2a4c, sun: 0xc8b8c8, sky: 0x8088b0, ground: 0x2e2a30 },
  { at: 1.0, zenith: 0x0a0f24, horizon: 0x1a2140, sun: 0xc0ccec, sky: 0x7484b0, ground: 0x2a2c38 },
];
/** The moon's light and the night sky's, at their fullest: a night that is blue and readable, never black. */
export const NIGHT_SUN_INTENSITY = 0.9;
export const NIGHT_SKY_INTENSITY = 1.1;
/** Cloud: what an overcast sky tends to by day and by night, and a storm's, darker still. */
export const CLOUD_DAY = 0xb4bcc6;
export const CLOUD_NIGHT = 0x1c2030;
export const STORM_CLOUD = 0x565e6c;
/** Mist: the fog closes in to these distances at its thickest, in this colour by day. */
export const MIST_FOG_NEAR = 8;
export const MIST_FOG_FAR = 28;
export const MIST_COLOR = 0xc8ccd0;
/** The rain's streaks. */
export const RAIN_COLOR = 0xc8d4e0;

// --- Ground cover and fire (PLAN Phase 15) ------------------------------------------------------
/** A tuft of grass: the blades' colour at the root and at the tip. */
export const GRASS_ROOT = 0x4a7328;
export const GRASS_TIP = 0x8cb448;
/** A tongue of flame: the ember at its foot, the flame, and the pale tip. */
export const FLAME_TIP = 0xffe27a;
