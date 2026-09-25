// The sound preview (#sounds): every sound on a button, for listening through them without playing.
import type { Sound } from "./audio.ts";
import { SOUND_FILES, type SoundName } from "./sounds/index.ts";

/** What each sound is heard on, for the preview's labels. */
const WHEN: Record<SoundName, string> = {
  chop: "Each swing of an axe",
  mine: "Each swing of a pick",
  splash: "A net going in the water",
  fell: "A tree coming down",
  take: "Picking something up",
  drop: "Dropping something",
  wield: "Taking a weapon or shield in hand",
  wear: "Putting on clothes or armour",
  hit: "A blow landing",
  hurt: "Taking a blow",
  die: "Running out of hitpoints",
  eat: "Eating something",
  cast: "A spell leaving the hands",
  gale: "A Gale spell landing (Shot, Lance, Crash)",
  gale_big: "A Gale Storm or Gale Fury landing",
  tide: "A Tide spell landing (Shot, Lance, Crash)",
  tide_big: "A Tide Storm or Tide Fury landing",
  stone: "A Stone spell landing (Shot, Lance, Crash)",
  stone_big: "A Stone Storm or Stone Fury landing",
  ember: "An Ember spell landing (Shot, Lance, Crash)",
  ember_big: "An Ember Storm or Ember Fury landing",
  levelup: "A level gained",
};

export function startSoundPreview(sound: Sound): void {
  document.body.classList.add("preview");
  const box = Object.assign(document.createElement("section"), { className: "sound-preview" });
  box.append(Object.assign(document.createElement("h2"), { textContent: "Sounds" }));
  box.append(Object.assign(document.createElement("p"), {
    textContent: "Each button plays the sound as the game does: one of its recordings, pitched a little up or down. "
      + "The last two play a sound as if it came from six tiles away, the way you hear other players.",
  }));
  const buttons = Object.assign(document.createElement("div"), { className: "buttons" });
  for (const name of Object.keys(SOUND_FILES) as SoundName[]) {
    const count = SOUND_FILES[name].length;
    const button = Object.assign(document.createElement("button"), {
      type: "button", className: "stone", textContent: `${name} (${count})`, title: WHEN[name],
    });
    button.addEventListener("click", () => sound.effect(name));
    buttons.append(button);
  }
  for (const name of ["chop", "fell"] as SoundName[]) {
    const button = Object.assign(document.createElement("button"), {
      type: "button", className: "stone", textContent: `${name}, 6 tiles off`,
    });
    button.addEventListener("click", () => sound.area(name, 6));
    buttons.append(button);
  }
  const levelUp = Object.assign(document.createElement("button"), { type: "button", className: "stone", textContent: "level-up" });
  levelUp.addEventListener("click", () => sound.levelUp());
  buttons.append(levelUp);
  box.append(buttons);

  // Music: the same shuffled run of tracks the world plays, at the volume the settings start on.
  box.append(Object.assign(document.createElement("p"), {
    textContent: "Music plays the tracks in a shuffled order, one after another with a pause between, each fading in and out. "
      + "In the game it starts once you are in the world, at 30% volume until you move the slider.",
  }));
  const musicButtons = Object.assign(document.createElement("div"), { className: "buttons" });
  for (const [label, on] of [["play music", true], ["stop music", false]] as const) {
    const button = Object.assign(document.createElement("button"), { type: "button", className: "stone", textContent: label });
    button.addEventListener("click", () => sound.music.play(on));
    musicButtons.append(button);
  }
  box.append(musicButtons);
  document.body.append(box);
}
