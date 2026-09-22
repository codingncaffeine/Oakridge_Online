import { WS_PATH } from "../shared/constants.ts";
import { STARTER_LOOK } from "../shared/look.ts";
import { CLOSE_KICKED, CLOSE_RESTART, type C2S, type S2C } from "../shared/protocol.ts";
import { buildTestMap } from "../shared/testmap.ts";
import { Game } from "./game.ts";
import { Hud } from "./hud.ts";
import { Connection } from "./net.ts";
import { beacon, installErrorBeacon, runSelfTest, selfTestAuth, snapshotCreator } from "./selftest.ts";
import { AuthScreen } from "./ui/auth.ts";
import { Chatbox } from "./ui/chatbox.ts";
import { Designer } from "./ui/designer.ts";
import { SidePanel } from "./ui/panel.ts";

// Self-test settings ride in the URL fragment, which never reaches the server (or its firewall).
const params = new URLSearchParams(location.hash.slice(1));
const selfTestName = params.get("selftest");
const beaconUrl = params.get("beacon");
if (selfTestName && beaconUrl) installErrorBeacon(beaconUrl);
/** Progress notes for the self-test; silent in normal play. */
const trace = (line: string) => { if (selfTestName && beaconUrl) beacon(beaconUrl, `TRACE ${line}`); };

/** The session token lets a dropped connection back in without a new code; it lives only in this tab. */
const TOKEN_KEY = "oakridge.session";
const storedToken = () => { try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; } };
const keepToken = (t: string | null) => {
  try {
    if (t) sessionStorage.setItem(TOKEN_KEY, t);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // No session storage: a reconnect then asks for a new code.
  }
};

const hud = new Hud();
const auth = new AuthScreen();
const designer = new Designer();
const chatbox = new Chatbox();
const panel = new SidePanel();
chatbox.onSend = (text) => conn?.send({ t: "chat", text });
panel.onSettings = (s) => game?.applySettings(s);
let game: Game | null = null;
let conn: Connection | null = null;
let opening: Promise<Connection> | null = null;
let inWorld = false;
let retries = 0;
let look: number[] = STARTER_LOOK.slice();
let pendingSelfTest: ((msg: S2C) => void) | null = null;

fetch("/status")
  .then((r) => r.json() as Promise<{ online: number }>)
  .then((s) => auth.setOnline(s.online))
  .catch(() => {});

/** An open connection, opening one if needed. */
function connection(): Promise<Connection> {
  if (conn && conn.open) return Promise.resolve(conn);
  opening ??= new Promise<Connection>((resolve, reject) => {
    const c = new Connection(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${WS_PATH}`);
    trace(`connecting to ${location.host}`);
    c.onOpen = () => {
      trace("socket open");
      conn = c;
      opening = null;
      resolve(c);
    };
    c.onMessage = handle;
    c.onClose = (code) => {
      trace(`socket closed ${code}`);
      if (opening) {
        opening = null;
        reject(new Error("closed"));
      }
      if (conn === c) conn = null;
      closed(code);
    };
  });
  return opening;
}

async function send(msg: C2S): Promise<void> {
  try {
    (await connection()).send(msg);
  } catch {
    auth.message("Couldn't reach the world. Try again in a moment.", true);
  }
}

function closed(code: number): void {
  if (code === CLOSE_KICKED) {
    inWorld = false;
    keepToken(null);
    return;
  }
  if (!inWorld) return;
  inWorld = false;
  hud.setBanner("Connection lost — reconnecting…");
  const delay = code === CLOSE_RESTART ? 1500 : Math.min(10000, 1000 * 2 ** retries++);
  setTimeout(resume, delay);
}

/** Back in with the stored session token (after a reload or a dropped connection). */
function resume(): void {
  const token = storedToken();
  if (!token) {
    if (game) location.reload();
    return;
  }
  send({ t: "resume", token }).catch(() => {});
}

async function designThenEnter(): Promise<void> {
  look = await designer.open(look);
  send({ t: "enter", look });
}

function handle(msg: S2C): void {
  pendingSelfTest?.(msg);
  switch (msg.t) {
    case "signup_totp":
      auth.showTotp(msg.secret, msg.uri);
      break;
    case "signup_email":
      auth.showEmailSent(msg.to);
      break;
    case "email_sent":
      auth.message(`We emailed a code to ${msg.to}. It expires in 10 minutes.`);
      break;
    case "signup_done":
      keepToken(msg.token);
      auth.showBackup(msg.backupCodes, msg.name);
      break;
    case "authed":
      keepToken(msg.token);
      if (msg.backupLeft >= 0 && msg.backupLeft <= 3) auth.message(`Only ${msg.backupLeft} backup code(s) left.`);
      if (msg.hasCharacter) send({ t: "enter" });
      else void designThenEnter();
      break;
    case "auth_error":
      if (!inWorld && game) {
        // A resume after a dropped connection failed: the session ended.
        keepToken(null);
        location.reload();
        return;
      }
      auth.message(msg.reason, true);
      break;
    case "welcome":
      trace("welcome");
      retries = 0;
      inWorld = true;
      look = msg.look;
      hud.setBanner(null);
      if (!game) {
        game = new Game(document.getElementById("view")!, buildTestMap(msg.seed), (m) => conn?.send(m), hud, chatbox);
        game.applySettings(panel.settings);
        hud.onRunChange = (on) => conn?.send({ t: "run", on });
        hud.show();
        if (selfTestName && beaconUrl) void runSelfTest(game, beaconUrl, params.has("shots"));
      }
      game.welcome(msg);
      chatbox.setName(msg.name);
      hud.setEnergy(msg.energy);
      hud.setRunning(msg.run);
      break;
    case "tick":
      game?.applyTick(msg);
      if (msg.you) {
        hud.setEnergy(msg.you.energy);
        hud.setRunning(msg.you.run);
      }
      break;
    case "chat":
      game?.said(msg.id, msg.name, msg.text);
      break;
    case "game":
      chatbox.game(msg.text);
      break;
    case "kicked":
      inWorld = false;
      keepToken(null);
      hud.setBanner(`${msg.reason} Reload the page to play here.`);
      break;
    case "logged_out":
      keepToken(null);
      location.reload();
      break;
    case "denied":
      auth.message(msg.reason, true);
      break;
  }
}

auth.onLogin = (name, code) => { auth.message("Checking…"); void send({ t: "login", name, code }); };
auth.onEmailMe = (name) => { auth.message("Sending…"); void send({ t: "login_email", name }); };
auth.onSignup = (name, method, email) => {
  auth.message(method === "email" ? "Sending your code…" : "");
  void send(method === "email" ? { t: "signup", name, method, email } : { t: "signup", name, method });
};
auth.onConfirm = (code) => { auth.message("Checking…"); void send({ t: "signup_confirm", code }); };
auth.onBackupDone = () => void designThenEnter();

document.getElementById("logout")!.addEventListener("click", () => conn?.send({ t: "logout" }));
document.getElementById("appearance")!.addEventListener("click", () => {
  void designer.open(look).then((chosen) => {
    look = chosen;
    conn?.send({ t: "look", look: chosen });
  });
});

if (selfTestName && beaconUrl) {
  void (async () => {
    if (params.has("shots")) await snapshotCreator(designer, beaconUrl, STARTER_LOOK);
    pendingSelfTest = selfTestAuth(selfTestName, params.get("secret"), beaconUrl, send, (next) => { pendingSelfTest = next; });
  })();
} else if (storedToken()) {
  resume();
} else if (params.has("creator")) {
  void designer.open(look);
} else if (params.has("hudpreview")) {
  // The interface laid out with sample content and no server, for checking layout by screenshot.
  hud.show();
  hud.setOnline(3);
  hud.setEnergy(76);
  hud.setRunning(true);
  chatbox.setName("Preview");
  chatbox.game("Welcome to Oakridge Online.");
  chatbox.said("Preview", "hello there");
  panel.open(params.get("hudpreview") || "settings");
}
