// Are all players in ONE world? node tools/crowd.mjs <site-url> [count]
// Logs `count` test accounts in at once (Crowd01, Crowd02, …); each must see all the others. Two server
// processes would split them into two worlds.
import { play } from "./accounts.mjs";

const site = process.argv[2] ?? "https://oakridgeonline.emutastic.com/";
const count = Number(process.argv[3] ?? 12);
const names = Array.from({ length: count }, (_, i) => `Crowd${String(i + 1).padStart(2, "0")}`);

const sessions = await Promise.all(names.map((n) => play(site, n)));
const seen = await Promise.all(sessions.map(async (s) => {
  const ids = new Set();
  const want = new Set(sessions.map((o) => o.welcome.name));
  await s.next((m) => {
    if (m.t === "tick") for (const u of m.ents) if (u.name && want.has(u.name)) ids.add(u.name);
    return ids.size >= count;
  }, 12000).catch(() => {});
  return ids.size;
}));
for (const s of sessions) s.send({ t: "logout" });
await new Promise((r) => setTimeout(r, 500));
const ok = seen.every((n) => n === count);
console.log(seen.map((n, i) => `${names[i]}:${n}`).join(" "));
console.log(ok ? `ONE WORLD: all ${count} players saw all ${count}` : "SPLIT OR LOSS: not every player saw every other");
process.exit(ok ? 0 : 1);
