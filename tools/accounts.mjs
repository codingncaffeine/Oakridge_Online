// Test accounts for checks against a running site. Their authenticator secrets stay on this machine in
// tools/.test-accounts.json (gitignored), keyed by site host and name.
//   node tools/accounts.mjs secret <site-url> <name>   prints the account's secret, signing it up first if needed
import { createHmac } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const FILE = fileURLToPath(new URL("./.test-accounts.json", import.meta.url));
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
/** The starter look (shared/look.ts STARTER_LOOK). */
const LOOK = [0, 1, 1, 2, 0, 0, 0, 1, 1, 0, 6, 3, 1];

function decode(secret) {
  const out = [];
  let bits = 0, value = 0;
  for (const ch of secret.toUpperCase()) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** The authenticator code for `secret`, `offset` 30-second steps from now. */
export function totp(secret, offset = 0) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offset));
  const h = createHmac("sha1", decode(secret)).update(msg).digest();
  const off = h[19] & 15;
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 1_000_000).padStart(6, "0");
}

const load = () => (existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {});
const keep = (all) => writeFileSync(FILE, `${JSON.stringify(all, null, 2)}\n`, { mode: 0o600 });
const keyOf = (site, name) => `${site.host}/${name.toLowerCase()}`;

/** A socket whose `next(pred)` resolves with (and removes) the first message matching `pred`. */
function open(site) {
  const ws = new WebSocket(`${site.protocol === "https:" ? "wss" : "ws"}://${site.host}/ws`);
  const inbox = [];
  ws.onmessage = (e) => inbox.push(JSON.parse(String(e.data)));
  const next = async (pred, ms = 8000) => {
    const end = Date.now() + ms;
    for (;;) {
      const i = inbox.findIndex(pred);
      if (i >= 0) return inbox.splice(i, 1)[0];
      if (Date.now() > end) throw new Error(`timed out; inbox: ${JSON.stringify(inbox.slice(-2))}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  };
  return new Promise((resolve, reject) => {
    ws.onopen = () => resolve({ ws, inbox, next, send: (m) => ws.send(JSON.stringify(m)) });
    ws.onerror = () => reject(new Error("socket error"));
  });
}

const authReply = (m) => ["authed", "auth_error", "signup_done", "signup_totp"].includes(m.t);

async function signUp(s, site, name) {
  s.send({ t: "signup", name, method: "totp" });
  const setup = await s.next(authReply);
  if (setup.t !== "signup_totp") throw new Error(`sign-up ${name}: ${setup.reason}`);
  s.send({ t: "signup_confirm", code: totp(setup.secret) });
  const done = await s.next(authReply);
  if (done.t !== "signup_done") throw new Error(`sign-up ${name}: ${done.reason}`);
  const all = load();
  all[keyOf(site, name)] = { secret: setup.secret, backup: done.backupCodes };
  keep(all);
}

async function logIn(s, site, name) {
  const secret = load()[keyOf(site, name)].secret;
  // The current step's code may already have been used by a quick re-run; the next step's is still valid.
  for (const offset of [0, 1]) {
    s.send({ t: "login", name, code: totp(secret, offset) });
    const r = await s.next(authReply);
    if (r.t === "authed") return;
    if (!/already used/.test(r.reason)) throw new Error(`login ${name}: ${r.reason}`);
  }
  throw new Error(`login ${name}: both codes already used; wait 30 s`);
}

/** Logs `name` in (signing up first if this machine has no secret for it) and enters the world. */
export async function play(siteUrl, name) {
  const site = new URL(siteUrl);
  const s = await open(site);
  if (load()[keyOf(site, name)]) await logIn(s, site, name);
  else await signUp(s, site, name);
  s.send({ t: "enter", look: LOOK });
  const welcome = await s.next((m) => m.t === "welcome" || m.t === "auth_error");
  if (welcome.t !== "welcome") throw new Error(`enter ${name}: ${welcome.reason}`);
  return { ...s, welcome };
}

/** The account's secret, signing it up (then logging out) if this machine doesn't have one yet. */
export async function secretFor(siteUrl, name) {
  const site = new URL(siteUrl);
  if (!load()[keyOf(site, name)]) {
    const s = await open(site);
    await signUp(s, site, name);
    s.send({ t: "logout" });
    await s.next((m) => m.t === "logged_out").catch(() => {});
    s.ws.close();
  }
  return load()[keyOf(site, name)].secret;
}

if (process.argv[2] === "secret") {
  const [, , , site, name] = process.argv;
  console.log(await secretFor(site, name));
  process.exit(0);
}
