import { WS_PATH } from "../shared/constants.ts";
import { CLOSE_RESTART, type S2C } from "../shared/protocol.ts";
import { buildTestMap } from "../shared/testmap.ts";
import { Game } from "./game.ts";
import { Hud } from "./hud.ts";
import { Connection } from "./net.ts";
import { beacon, installErrorBeacon, runSelfTest } from "./selftest.ts";

// Self-test settings ride in the URL fragment, which never reaches the server (or its firewall).
const params = new URLSearchParams(location.hash.slice(1));
const selfTestName = params.get("selftest");
const beaconUrl = params.get("beacon");
if (selfTestName && beaconUrl) installErrorBeacon(beaconUrl);
/** Progress notes for the self-test; silent in normal play. */
const trace = (line: string) => { if (selfTestName && beaconUrl) beacon(beaconUrl, `TRACE ${line}`); };

const form = document.getElementById("start") as HTMLFormElement;
const nameInput = document.getElementById("name") as HTMLInputElement;
const message = document.getElementById("start-msg") as HTMLParagraphElement;
const playing = document.getElementById("start-online") as HTMLParagraphElement;
const hud = new Hud();

let game: Game | null = null;
let conn: Connection | null = null;
let name = "";
let welcomed = false;
let retries = 0;
let firstTries = 0;
let denied: string | null = null;

fetch("/status")
  .then((r) => r.json() as Promise<{ online: number }>)
  .then((s) => { playing.textContent = s.online === 1 ? "1 adventurer is out there now" : `${s.online} adventurers are out there now`; })
  .catch(() => {});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  join(nameInput.value);
});

function join(n: string): void {
  name = n.trim();
  denied = null;
  firstTries = 0;
  message.textContent = "Connecting…";
  connect();
}

function connect(): void {
  const c = new Connection(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${WS_PATH}`);
  conn = c;
  trace(`connecting to ${location.host}`);
  c.onOpen = () => {
    trace("socket open");
    c.send({ t: "hello", name });
  };
  c.onMessage = handle;
  c.onClose = (code) => {
    trace(`socket closed ${code}`);
    if (conn !== c) return;
    if (!welcomed) {
      // A first join can land on a restart; try a few more times before giving up.
      if (!denied && firstTries++ < 3) {
        setTimeout(connect, 1500);
        return;
      }
      message.textContent = denied ?? "Couldn't reach the world. Try again in a moment.";
      return;
    }
    hud.setBanner("Connection lost — reconnecting…");
    const delay = code === CLOSE_RESTART ? 1500 : Math.min(10000, 1000 * 2 ** retries++);
    setTimeout(connect, delay);
  };
}

function handle(msg: S2C): void {
  switch (msg.t) {
    case "denied":
      denied = msg.reason;
      conn?.close();
      break;
    case "welcome":
      trace("welcome");
      retries = 0;
      welcomed = true;
      hud.setBanner(null);
      if (!game) {
        game = new Game(document.getElementById("view")!, buildTestMap(msg.seed), (m) => conn?.send(m), hud);
        hud.onRunChange = (on) => conn?.send({ t: "run", on });
        hud.show();
        if (selfTestName && beaconUrl) void runSelfTest(game, beaconUrl);
      }
      game.welcome(msg);
      if (hud.running) conn?.send({ t: "run", on: true });
      break;
    case "tick":
      game?.applyTick(msg);
      break;
  }
}

if (selfTestName) join(selfTestName);
