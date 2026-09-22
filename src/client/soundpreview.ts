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
  document.body.append(box);
}
