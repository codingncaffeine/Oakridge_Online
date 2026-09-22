import { cleanName } from "../shared/protocol.ts";

/** Names nobody may take, so no one can pose as staff or the game itself. */
const RESERVED = new Set(["admin", "administrator", "mod", "moderator", "staff", "system", "server", "owner", "support", "oakridge", "gm", "dev"]);

// The word lists are base64 so the words don't sit in the source as plain text. To read or edit one:
//   node -e 'console.log(Buffer.from(process.argv[1], "base64").toString())' '<list>'
//   node -e 'console.log(Buffer.from(process.argv[1]).toString("base64"))' 'word,word'
const decode = (b64: string) => Buffer.from(b64, "base64").toString().split(",");
/** Blocked anywhere inside a name, however it's spelled. */
const ANYWHERE = decode(
  "ZnVjayxuaWdnZXIsbmlnZ2EsZmFnZ290LHJldGFyZCx3aG9yZSxyYXBpc3QsaGl0bGVyLGN1bnQsY2hpbmssdHJhbm55LGtpa2Usd2V0YmFjayxtb2xlc3QscGVkb3BoaWxlLHBhZWRvLGRpY2toZWFkLGRpY2t3YWQsamFja2FzcyxkdW1iYXNzLGFzc2hvbGUsYmFzdGFyZCxiaXRjaCxzbHV0LHR3YXQscGVuaXMsdmFnaW5hLGJvb2JzLGRpbGRvLHBvcm4saml6eixra2ssaHVnaGphc3MsbWlrZWh1bnQsYmVuZG92ZXIscGhhdGFzcyxzaGl0aGVhZCxidWxsc2hpdCxjb2Nrc3Vja2VyLHdhbmtlcixudXRzYWNrLGJhbGxzYWNrLHNjcm90dW0sY2xpdCxjdW1zaG90LGJsb3dqb2IsaGFuZGpvYixyaW1qb2IsdGl0dGllcyxob29rZXIsc2thbms=",
);
/** Blocked only as a whole word, because each also turns up inside innocent names (Dickens, Titan, Hancock). */
const WHOLE_WORD = decode(
  "c2hpdCxkaWNrLGNvY2ssZmFnLHJhcGUsc3BpYyxwZWRvLGFzcyx0aXRzLHRpdCxzZXgsc2V4eSxjdW0sYW5hbCxwaXNzLHB1c3N5LG5pZyxjb29uLGdvb2ssZHlrZSxob21vLGt5cyx3YW5rLGhvZSxob2VzLHRob3Qsc21lZ21hLG5hemk=",
).filter((w) => w !== "kys");
/** A size or verb glued in front of a whole-word entry makes it a name on its own, so these count too. */
const LEADS = ["big", "huge", "giant", "fat", "hairy", "wet", "tiny", "small", "my", "your", "ur", "suck", "eat", "lick", "smelly", "nice"];

/** What each letter may be written as: look-alike digits and sound-alike swaps. */
const LOOKS: Record<string, string> = {
  a: "a4", b: "b8", c: "ckq", e: "e3", g: "g69", i: "i1", k: "kcq", l: "l1", o: "o0", s: "s5z", t: "t7", u: "uv", y: "yi", z: "z2s",
};

/**
 * A word as a pattern. Each letter may appear in any of its look-alike forms and be stretched
 * ("helllooo"), but a doubled letter must stay at least doubled, so a word spelled with a double letter
 * never catches an innocent single-letter spelling (the country Niger, for one). "ck" may be written
 * k, q or x (a lone c is not enough, so Fuchs is fine), and f may be ph.
 */
function pattern(word: string): string {
  let out = "";
  for (let i = 0; i < word.length;) {
    if (word.startsWith("ck", i)) {
      out += "[ckqx]*[kqx][ckqx]*";
      i += 2;
      continue;
    }
    const ch = word[i]!;
    let run = 1;
    while (word[i + run] === ch) run++;
    const cls = ch === "f" ? "(?:f|ph)" : `[${LOOKS[ch] ?? ch}]`;
    out += run === 1 ? `${cls}+` : `${cls}{${run},}`;
    i += run;
  }
  return out;
}

const ANYWHERE_RE = new RegExp(ANYWHERE.map(pattern).join("|"));
const WHOLE_WORD_SRC = WHOLE_WORD.map(pattern).join("|");
const WHOLE_WORD_RE = new RegExp(`^(?:${WHOLE_WORD_SRC})$`);
const LED_RE = new RegExp(`^(?:${LEADS.join("|")})(?:${WHOLE_WORD_SRC})\\d*$`);
/** Hate codes written in digits, matched before any letter swaps. */
const RAW_CODES = /1488/;

/** A name's words: split at spaces, hyphens, underscores and lower-to-upper case changes ("BigBadWolf"). */
function words(name: string): string[] {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().split(/[\s_-]+/).filter(Boolean);
}

export function isOffensive(text: string): boolean {
  if (RAW_CODES.test(text)) return true;
  const squashed = text.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (ANYWHERE_RE.test(squashed) || LED_RE.test(squashed)) return true;
  // Whole words, also with trailing or leading numbers dropped (a blocked word with digits on the end).
  const candidates = [squashed, ...words(text)].flatMap((w) => [w, w.replace(/^\d+|\d+$/g, "")]);
  return candidates.some((w) => w.length > 0 && WHOLE_WORD_RE.test(w));
}

const stars = (word: string) => word.replace(/[^\s]/g, "*");

/**
 * Chat with offensive words starred out. Besides each word on its own, a run of three or more
 * single-character words is read joined up, so a word spelled out letter by letter is caught too.
 */
export function censor(text: string): string {
  const parts = text.split(/(\s+)/);
  const out = parts.map((p) => (/\S/.test(p) && isOffensive(p) ? stars(p) : p));
  const isLetter = (i: number) => parts[i] !== undefined && /^\S$/.test(parts[i]!);
  for (let i = 0; i < parts.length; i++) {
    if (!isLetter(i)) continue;
    let j = i;
    while (isLetter(j + 2)) j += 2;
    if (j - i >= 4) {
      const joined = parts.slice(i, j + 1).filter((_, k) => k % 2 === 0).join("");
      if (isOffensive(joined)) for (let k = i; k <= j; k += 2) out[k] = "*";
    }
    i = j;
  }
  return out.join("");
}

/** The key names are unique by: case and repeated spaces don't make a name different. */
export function nameKey(name: string): string {
  return name.toLowerCase();
}

export type NameCheck = { ok: true; name: string; key: string } | { ok: false; reason: string };

export function checkName(raw: string): NameCheck {
  const name = cleanName(raw);
  if (!name) return { ok: false, reason: "Names are 1–12 letters, numbers, spaces, hyphens or underscores." };
  const squashed = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (words(name).some((w) => RESERVED.has(w)) || RESERVED.has(squashed)) return { ok: false, reason: "That name is reserved." };
  if (isOffensive(name)) return { ok: false, reason: "Please choose a different name." };
  return { ok: true, name, key: nameKey(name) };
}
