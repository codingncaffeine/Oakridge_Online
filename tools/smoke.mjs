// Live check after a deploy: node tools/smoke.mjs <site-url>
// Joins over WebSocket, walks one tile, and confirms the server moved us on the next ticks.
const site = new URL(process.argv[2] ?? "https://oakridgeonline.emutastic.com/");
const ws = new WebSocket(`${site.protocol === "https:" ? "wss" : "ws"}://${site.host}/ws`);
const name = `Tester${Math.floor(Math.random() * 900 + 100)}`;
const fail = (why) => { console.error(`SMOKE FAIL: ${why}`); process.exit(1); };
const timer = setTimeout(() => fail("timed out"), 15000);
let me = null, walked = false, ticks = 0;

ws.onopen = () => ws.send(JSON.stringify({ t: "hello", name }));
ws.onerror = () => fail("socket error");
ws.onmessage = (e) => {
  const m = JSON.parse(String(e.data));
  if (m.t === "denied") fail(`denied: ${m.reason}`);
  if (m.t === "welcome") me = m;
  if (m.t !== "tick" || !me) return;
  ticks++;
  if (!walked) {
    // Any of the eight neighbours will do; the server pathfinds to the nearest reachable one.
    ws.send(JSON.stringify({ t: "walk", x: me.x + 1, y: me.y }));
    walked = true;
    return;
  }
  const self = m.ents.find((u) => u.id === me.id && u.steps);
  if (self) {
    clearTimeout(timer);
    console.log(`SMOKE OK: joined as ${name}, moved to ${self.x},${self.y} after ${ticks} ticks, ${m.online} online`);
    ws.close();
    setTimeout(() => process.exit(0), 100);
  } else if (ticks > 6) {
    fail("no movement within 6 ticks");
  }
};
