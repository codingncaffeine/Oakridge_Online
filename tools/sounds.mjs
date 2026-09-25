// Makes the game's sounds from the sound pack in sounds/ (kept out of git): each sound's source files are
// mixed down to mono, cut to length, levelled and saved as MP3 into src/client/sounds/, along with the
// index the client imports. The output is committed; run this again after changing the table.
// usage: node tools/sounds.mjs
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PACK = join(ROOT, "sounds");
const OUT = join(ROOT, "src/client/sounds");
/** Nothing peaks above this (dBFS). */
const CEILING = -1;

/**
 * Each game sound and the pack files it plays (one picked at random each time). `loud` is the level its
 * loudest 50 ms is set to (dBFS), so sounds of one kind match however the pack recorded them, and
 * `length` cuts a long file short with a fade.
 */
const SOUNDS = {
  // An axe or a pick landing: one per swing of the animation.
  chop: { loud: -11, files: ["Tools/DesignedAxe1.ogg", "Tools/DesignedAxe2.ogg", "Tools/DesignedAxe3.ogg", "Tools/DesignedAxe4.ogg"] },
  mine: { loud: -11, files: ["Tools/DesignedPickaxe1.ogg", "Tools/DesignedPickaxe2.ogg", "Tools/DesignedPickaxe3.ogg", "Tools/DesignedPickaxe4.ogg"] },
  // A net going into the water.
  splash: { loud: -13, files: ["Environment/WaterSplash1.ogg", "Environment/WaterSplash2.ogg"] },
  // A tree coming down.
  fell: { loud: -12, files: ["Destruction/WoodSnap1.ogg", "Destruction/WoodSnap4.ogg"] },
  // Items: picked up, dropped, and put on or taken off (weapons and shields, then clothes and armour).
  take: { loud: -15, files: ["Equipment/LargeBagHandling3.ogg", "Equipment/LargeBagHandling1.ogg"] },
  drop: { loud: -13, files: ["Environment/WoodLogHandling1.ogg", "Environment/WoodLogHandling2.ogg"] },
  wield: { loud: -15, length: 0.45, files: ["Tools/CrowbarDrag1.ogg"] },
  wear: { loud: -15, length: 0.6, files: ["Clothing/ClothesSyntheticfabric3.ogg", "Clothing/ClothesRubberMovement3.ogg"] },
  // Combat: a blow landing, taking one, being finished off, and eating something.
  hit: { loud: -12, files: ["Combat/DesignedPunch1.ogg", "Combat/DesignedPunch2.ogg", "Combat/DesignedPunch3.ogg", "Combat/DesignedPunch4.ogg"] },
  hurt: { loud: -14, length: 0.8, files: ["Human/HumanInjured1.ogg", "Human/HumanInjured3.ogg", "Human/HumanInjured4.ogg"] },
  die: { loud: -13, length: 1.4, files: ["Human/HumanExhausted1.ogg"] },
  eat: { loud: -15, length: 0.9, files: ["Food/EatingFood1.ogg", "Food/EatingFood2.ogg", "Food/EatingFood3.ogg"] },
};

/**
 * Background music. These are minutes long, so they are streamed rather than held in memory: they keep
 * their stereo and are re-encoded smaller, each evened out to the same loudness (`lufs`) so no track
 * arrives louder than the one before it.
 */
const MUSIC = {
  lufs: -20,
  peak: -1.5,
  bitrate: "128k",
  // In the order of shared/tunes.ts: an area names its tune by index, so a new one goes on the end.
  files: [
    "music/relaxing_guitar.mp3", "music/relaxing_pop.mp3", "music/relaxing pop2.mp3", "music/exploration_outoftown.mp3",
    "music/village1.mp3", "music/village2.mp3", "music/village3.mp3", "music/village4.mp3", "music/villeage5.mp3",
  ],
};

/**
 * The fight's music: one track, looped while the player is in a fight and faded in and out over the
 * world's own (client audio.ts). Levelled like the rest, so a fight is no louder than a walk.
 */
const BATTLE = "music/battle_music.mp3";

/** Runs ffmpeg and hands back its log (it reports everything on stderr). */
function ffmpeg(args) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostdin", ...args], { encoding: "utf8", maxBuffer: 1 << 26 });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`ffmpeg failed (${args.join(" ")}):\n${r.stderr}`);
  return r.stderr;
}

/** The level of the loudest 50 ms, and the sample peak, of a file put through `chain` (both dBFS). */
function levels(file, chain) {
  const log = ffmpeg(["-i", file, "-af", `${chain},astats=metadata=0:reset=0:length=0.05`, "-f", "null", "-"]);
  const overall = log.slice(log.lastIndexOf("Overall"));
  const read = (label) => {
    const found = new RegExp(`${label}:\\s*(-?[\\d.]+)`).exec(overall);
    if (!found) throw new Error(`no ${label} for ${file}`);
    return Number(found[1]);
  };
  return { loudest: read("RMS peak dB"), peak: read("Peak level dB") };
}

mkdirSync(OUT, { recursive: true });
for (const file of readdirSync(OUT)) if (/^[a-z]+-\d+\.mp3$/.test(file)) rmSync(join(OUT, file));

const imports = [], table = [];
for (const [name, sound] of Object.entries(SOUNDS)) {
  const ids = [];
  sound.files.forEach((from, i) => {
    const source = join(PACK, from);
    const cut = sound.length ? `,atrim=0:${sound.length},afade=t=out:st=${(sound.length - 0.12).toFixed(3)}:d=0.12` : "";
    const chain = `aformat=channel_layouts=mono${cut}`;
    const { loudest, peak } = levels(source, chain);
    const gain = Math.min(sound.loud - loudest, CEILING - peak);
    const file = `${name}-${i + 1}.mp3`;
    ffmpeg([
      "-y", "-i", source, "-af", `${chain},volume=${gain.toFixed(2)}dB`,
      "-ac", "1", "-ar", "44100", "-c:a", "libmp3lame", "-q:a", "3", "-map_metadata", "-1", join(OUT, file),
    ]);
    const size = statSync(join(OUT, file)).size;
    console.log(`${file.padEnd(13)} ${from.padEnd(42)} loudest ${loudest.toFixed(1)} peak ${peak.toFixed(1)} → ${gain >= 0 ? "+" : ""}${gain.toFixed(1)} dB, ${size} B`);
    const id = `${name}${i + 1}`;
    imports.push(`import ${id} from "./${file}";`);
    ids.push(id);
  });
  table.push(`  ${name}: [${ids.join(", ")}],`);
}

/** A track, measured first and then levelled to the target loudness on the way through the encoder, written to OUT/file. */
function levelled(from, file) {
  const source = join(PACK, from);
  const settings = `I=${MUSIC.lufs}:TP=${MUSIC.peak}:LRA=11`;
  const heard = ffmpeg(["-i", source, "-af", `loudnorm=${settings}:print_format=json`, "-f", "null", "-"]);
  const measured = JSON.parse(heard.slice(heard.lastIndexOf("{"), heard.lastIndexOf("}") + 1));
  const known = `measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}`
    + `:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`;
  ffmpeg([
    "-y", "-i", source, "-af", `loudnorm=${settings}:${known}`,
    "-ar", "44100", "-c:a", "libmp3lame", "-b:a", MUSIC.bitrate, "-map_metadata", "-1", join(OUT, file),
  ]);
  const size = statSync(join(OUT, file)).size;
  console.log(`${file.padEnd(13)} ${from.padEnd(42)} ${Number(measured.input_i).toFixed(1)} LUFS → ${MUSIC.lufs} LUFS, ${(size / 1024 / 1024).toFixed(1)} MB`);
}

// Music, and the fight's track.
const tracks = [];
MUSIC.files.forEach((from, i) => {
  const file = `music-${i + 1}.mp3`;
  levelled(from, file);
  const id = `music${i + 1}`;
  imports.push(`import ${id} from "./${file}";`);
  tracks.push(id);
});
levelled(BATTLE, "battle-1.mp3");
imports.push(`import battle1 from "./battle-1.mp3";`);

writeFileSync(join(OUT, "index.ts"), `// Made by tools/sounds.mjs from the sound pack in sounds/. Edit the table there and run it again.
${imports.join("\n")}

/** Every sound's files. Playing one picks a file at random, so the same action never sounds quite the same twice. */
export const SOUND_FILES = {
${table.join("\n")}
};

export type SoundName = keyof typeof SOUND_FILES;

/** Background music, played one track after another in a shuffled order. */
export const MUSIC_TRACKS = [${tracks.join(", ")}];

/** The fight's music, looped while the player fights and faded in and out over the world's. */
export const BATTLE_TRACK = battle1;
`);
console.log(`${Object.keys(SOUNDS).length} sounds and ${tracks.length} tracks → ${OUT}`);
