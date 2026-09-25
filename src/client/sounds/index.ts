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
import cast1 from "./cast-1.mp3";
import gale1 from "./gale-1.mp3";
import gale_big1 from "./gale_big-1.mp3";
import gale_big2 from "./gale_big-2.mp3";
import gale_big3 from "./gale_big-3.mp3";
import tide1 from "./tide-1.mp3";
import tide2 from "./tide-2.mp3";
import tide_big1 from "./tide_big-1.mp3";
import stone1 from "./stone-1.mp3";
import stone2 from "./stone-2.mp3";
import stone_big1 from "./stone_big-1.mp3";
import stone_big2 from "./stone_big-2.mp3";
import stone_big3 from "./stone_big-3.mp3";
import ember1 from "./ember-1.mp3";
import ember2 from "./ember-2.mp3";
import ember_big1 from "./ember_big-1.mp3";
import ember_big2 from "./ember_big-2.mp3";
import levelup1 from "./levelup-1.mp3";
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
  cast: [cast1],
  gale: [gale1],
  gale_big: [gale_big1, gale_big2, gale_big3],
  tide: [tide1, tide2],
  tide_big: [tide_big1],
  stone: [stone1, stone2],
  stone_big: [stone_big1, stone_big2, stone_big3],
  ember: [ember1, ember2],
  ember_big: [ember_big1, ember_big2],
  levelup: [levelup1],
};

export type SoundName = keyof typeof SOUND_FILES;

/** Background music, played one track after another in a shuffled order. */
export const MUSIC_TRACKS = [music1, music2, music3, music4, music5, music6, music7, music8, music9];

/** The fight's music, looped while the player fights and faded in and out over the world's. */
export const BATTLE_TRACK = battle1;
