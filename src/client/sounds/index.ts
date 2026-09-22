// Made by tools/sounds.mjs from the sound pack in sounds/. Edit the table there and run it again.
import chop1 from "./chop-1.mp3";
import chop2 from "./chop-2.mp3";
import chop3 from "./chop-3.mp3";
import chop4 from "./chop-4.mp3";
import mine1 from "./mine-1.mp3";
import mine2 from "./mine-2.mp3";
import mine3 from "./mine-3.mp3";
import mine4 from "./mine-4.mp3";
import splash1 from "./splash-1.mp3";
import splash2 from "./splash-2.mp3";
import fell1 from "./fell-1.mp3";
import fell2 from "./fell-2.mp3";
import take1 from "./take-1.mp3";
import take2 from "./take-2.mp3";
import drop1 from "./drop-1.mp3";
import drop2 from "./drop-2.mp3";
import wield1 from "./wield-1.mp3";
import wear1 from "./wear-1.mp3";
import wear2 from "./wear-2.mp3";

/** Every sound's files. Playing one picks a file at random, so the same action never sounds quite the same twice. */
export const SOUND_FILES = {
  chop: [chop1, chop2, chop3, chop4],
  mine: [mine1, mine2, mine3, mine4],
  splash: [splash1, splash2],
  fell: [fell1, fell2],
  take: [take1, take2],
  drop: [drop1, drop2],
  wield: [wield1],
  wear: [wear1, wear2],
};

export type SoundName = keyof typeof SOUND_FILES;
