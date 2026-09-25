// Live check after a deploy: node tools/smoke.mjs <site-url>
// Logs the "Smoke" test account in, walks one tile, and confirms the server moved it on the next ticks.
import { play } from "./accounts.mjs";

const site = process.argv[2] ?? "https://oakridgeonline.emutastic.com/";
const fail = (why) => { console.error(`SMOKE FAIL: ${why}`); process.exit(1); };
setTimeout(() => fail("timed out"), 20000).unref();

try {
  const s = await play(site, "Smoke");
  const me = s.welcome;
  /**
   * Each neighbour in turn until one of them moves. The account keeps where the last deploy left it,
   * so always walking east stops working the moment it reaches the map's east edge — which it does,
   * because this check is what walks it there. Any direction proves the same thing.
   */
  let moved = null;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    s.send({ t: "walk", x: me.x + dx, y: me.y + dy });
    // The predicate must stay free of side effects: next() re-tests every queued message on each poll.
    moved = await s.next((m) => m.t === "tick" && m.ents.some((u) => u.id === me.id && u.steps), 2500).catch(() => null);
    if (moved) break;
  }
  if (!moved) fail(`no movement in any direction from ${me.x},${me.y} (four tries, 2.5 s each)`);
  const at = moved.ents.find((u) => u.id === me.id);
  console.log(`SMOKE OK: Smoke logged in, moved to ${at.x},${at.y} after ${moved.n - me.tick} ticks, ${moved.online} online`);
  s.send({ t: "logout" });
  await s.next((m) => m.t === "logged_out", 3000).catch(() => {});
  // Hang up properly: the server logs a connection closed without a close as a cut one.
  await new Promise((r) => {
    s.ws.onclose = r;
    s.ws.close(1000);
    setTimeout(r, 2000);
  });
  process.exit(0);
} catch (err) {
  fail(err.message);
}
