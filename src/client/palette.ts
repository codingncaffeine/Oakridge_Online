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
export const UNDERLAY_COLORS = [0x7a9530, 0x5c7527, 0x7d6644, 0xcdb480];
/** Indexed by the map's overlay ids: none, path, water. */
export const OVERLAY_COLORS = [0x000000, 0x8a7654, 0x5f7fa5];

export const TRUNK = 0xb27c4e;
export const TRUNK_DARK = 0x94623a;
export const OAK_TRUNK = 0xa06e44;
/** Leaf-texture greens, from sunlit to shadow. */
export const LEAF_GREENS = ["#b3c257", "#9cb14a", "#86a03c", "#718d31", "#5f7c29", "#4c6821", "#3b5419", "#2c4112"];
export const LEAF_BACKING = "#34491a";
export const ROCK = [0x7d7a74, 0x6a6760];
export const FENCE = 0x8a6a42;
export const WALL_STONE = 0x8a857c;
export const WALL_CAP = 0x6f6b64;

export const WALK_CROSS = "#ffff00";

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
/** Fixed colours for face details and the shirt shown under a vest. */
export const EYE_WHITE = 0xf2efe8;
export const EYE_PUPIL = 0x2a2018;
export const MOUTH = 0x8a4a3a;
export const UNDERSHIRT = 0xe8e2d0;
export const BELT = 0x3a2616;
