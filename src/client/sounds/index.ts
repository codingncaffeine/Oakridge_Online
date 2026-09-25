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
import hit1 from "./hit-1.mp3";
import hit2 from "./hit-2.mp3";
import hit3 from "./hit-3.mp3";
import hit4 from "./hit-4.mp3";
import hurt1 from "./hurt-1.mp3";
import hurt2 from "./hurt-2.mp3";
import hurt3 from "./hurt-3.mp3";
import die1 from "./die-1.mp3";
import eat1 from "./eat-1.mp3";
import eat2 from "./eat-2.mp3";
import eat3 from "./eat-3.mp3";
import music1 from "./music-1.mp3";
import music2 from "./music-2.mp3";
import music3 from "./music-3.mp3";
import music4 from "./music-4.mp3";
import music5 from "./music-5.mp3";
import music6 from "./music-6.mp3";
import music7 from "./music-7.mp3";
import music8 from "./music-8.mp3";
import music9 from "./music-9.mp3";
import battle1 from "./battle-1.mp3";

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
  hit: [hit1, hit2, hit3, hit4],
  hurt: [hurt1, hurt2, hurt3],
  die: [die1],
  eat: [eat1, eat2, eat3],
};

export type SoundName = keyof typeof SOUND_FILES;

/** Background music, played one track after another in a shuffled order. */
export const MUSIC_TRACKS = [music1, music2, music3, music4, music5, music6, music7, music8, music9];

/** The fight's music, looped while the player fights and faded in and out over the world's. */
export const BATTLE_TRACK = battle1;
