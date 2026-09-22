// Are all players in ONE world? node tools/crowd.mjs <site-url> [count]
// Connects `count` players at once; each must see everyone else in the same "online" count.
// Two server processes would split them into two worlds with smaller counts.
const site = new URL(process.argv[2] ?? "https://oakridgeonline.emutastic.com/");
const count = Number(process.argv[3] ?? 12);
const url = `${site.protocol === "https:" ? "wss" : "ws"}://${site.host}/ws`;
const tag = Math.floor(Math.random() * 90 + 10);

const player = (i) => new Promise((resolve) => {
  const ws = new WebSocket(url);
  let best = 0, seen = new Set();
  const done = () => { ws.close(); resolve({ i, best, seen: seen.size }); };
  const timer = setTimeout(done, 12000);
  ws.onopen = () => ws.send(JSON.stringify({ t: "hello", name: `Crowd${tag}_${i}` }));
  ws.onerror = () => { clearTimeout(timer); resolve({ i, best: -1, seen: 0 }); };
  ws.onmessage = (e) => {
    const m = JSON.parse(String(e.data));
    if (m.t !== "tick") return;
    best = Math.max(best, m.online);
    for (const u of m.ents) if (u.name?.startsWith(`Crowd${tag}_`)) seen.add(u.name);
    if (seen.size >= count) { clearTimeout(timer); setTimeout(done, 700); }
  };
});

const results = await Promise.all(Array.from({ length: count }, (_, i) => player(i)));
const everyoneSawEveryone = results.every((r) => r.seen === count);
console.log(results.map((r) => `${r.i}:${r.seen}/${r.best}`).join(" "));
console.log(everyoneSawEveryone ? `ONE WORLD: all ${count} players saw all ${count}` : "SPLIT OR LOSS: not every player saw every other");
process.exit(everyoneSawEveryone ? 0 : 1);
