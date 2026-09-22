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
};

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

writeFileSync(join(OUT, "index.ts"), `// Made by tools/sounds.mjs from the sound pack in sounds/. Edit the table there and run it again.
${imports.join("\n")}

/** Every sound's files. Playing one picks a file at random, so the same action never sounds quite the same twice. */
export const SOUND_FILES = {
${table.join("\n")}
};

export type SoundName = keyof typeof SOUND_FILES;
`);
console.log(`${Object.keys(SOUNDS).length} sounds → ${OUT}`);
