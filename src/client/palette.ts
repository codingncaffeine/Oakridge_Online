// Every colour, light and fog setting in one place (colours are sRGB hex), so tuning is a one-line change.

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
export const UNDERLAY_COLORS = [0x5b8a3a, 0x416b2c, 0x7a6446, 0xc2ad7c];
/** Indexed by the map's overlay ids: none, path, water. */
export const OVERLAY_COLORS = [0x000000, 0x8a7350, 0x35587e];

export const SKIN = [0xe6b48a, 0xc98d62, 0x93613f, 0x5e3b26];
export const HAIR = [0x3a2616, 0x6e4526, 0xb88a3c, 0x1d1b1a, 0x8f8f8f, 0x9c3b1f];
export const TOP = [0x5f7a34, 0x365d8c, 0x8c3434, 0x7a6644, 0x4a4a6e, 0x8c7a2a, 0x5c2e5c, 0x2e6a6a];
export const LEGS = [0x4a3a2a, 0x2c3c5c, 0x3a3a3a, 0x5c4a36, 0x2c4a2c, 0x6a5a48];
export const FEET = [0x2a1f18, 0x3a3a3a, 0x4a3020, 0x1a1a1a];
export const EYES = 0x1a1410;

export const TRUNK = 0x5e4127;
export const LEAVES = [0x3f7a2c, 0x4d8a32];
export const OAK_TRUNK = 0x54391f;
export const OAK_LEAVES = [0x2f6424, 0x3a7429, 0x2a5a20];
export const ROCK = [0x7d7a74, 0x6a6760];
export const FENCE = 0x7a5a36;
export const WALL_STONE = 0x8a857c;
export const WALL_CAP = 0x6f6b64;

export const WALK_CROSS = "#ffff00";
