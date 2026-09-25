// The world's tunes by what they are for (PLAN Phase 13): an area names one of these, and the client plays
// MUSIC_TRACKS at that index. tools/sounds.mjs writes the tracks in this order. The fight's music is apart
// from these: it comes in over whichever is playing.

/** Each tune's index into the client's tracks. */
export const TUNE = {
  /** The woods and the hills (the pack's relaxing guitar). */
  woods: 0,
  /** The water: shores, jetties, the Wend, the Sound and the sea (relaxing pop). */
  water: 1,
  /** The hard places: the quarry, the barrow, the stockade, the wastes, the Harrow and every dungeon (relaxing pop 2). */
  danger: 2,
  /** The roads and fields between the towns (exploration, out of town). */
  roads: 3,
  /** The towns' own, one to a town, and no two neighbours sharing one (village 1 to 5). */
  village1: 4,
  village2: 5,
  village3: 6,
  village4: 7,
  village5: 8,
} as const;

/** How many tunes there are: the client has a track for each. */
export const TUNE_COUNT = 9;
