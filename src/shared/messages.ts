// Game messages the server sends that the tests and the self-test also look for.

/** Using an item, or one item on another, when nothing comes of it. */
export const NOTHING_COMES = "Nothing comes of that.";
/** Trying to put on something that isn't equipment. */
export const CANT_WEAR = "That isn't something you can wear or wield.";
/** Picking something up, or taking something off, with no free inventory slot for it. */
export const NO_ROOM = "You have no room to carry that.";
/** Walking over to an item that can't be reached. */
export const CANT_REACH = "You can't get to that from here.";
/** Eating when there's nothing to heal (until hitpoints exist, always). */
export const NOT_HUNGRY = "You're not hungry right now.";
