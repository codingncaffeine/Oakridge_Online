// Live check after a deploy: node tools/smoke.mjs <site-url>
// Logs the "Smoke" test account in, walks one tile, and confirms the server moved it on the next ticks.
import { play } from "./accounts.mjs";

const site = process.argv[2] ?? "https://oakridgeonline.emutastic.com/";
const fail = (why) => { console.error(`SMOKE FAIL: ${why}`); process.exit(1); };
setTimeout(() => fail("timed out"), 20000).unref();

try {
  const s = await play(site, "Smoke");
  const me = s.welcome;
  // Any neighbour will do: the server walks to the nearest reachable one.
  s.send({ t: "walk", x: me.x + 1, y: me.y });
  // The predicate must stay free of side effects: next() re-tests every queued message on each poll.
  const moved = await s.next((m) => m.t === "tick" && m.ents.some((u) => u.id === me.id && u.steps), 6000).catch(() => null);
  if (!moved) fail("no movement within 6 s (10 ticks)");
  const at = moved.ents.find((u) => u.id === me.id);
  console.log(`SMOKE OK: Smoke logged in, moved to ${at.x},${at.y} after ${moved.n - me.tick} ticks, ${moved.online} online`);
  s.send({ t: "logout" });
  await s.next((m) => m.t === "logged_out", 3000).catch(() => {});
  process.exit(0);
} catch (err) {
  fail(err.message);
}
