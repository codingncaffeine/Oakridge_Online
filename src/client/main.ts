import { WS_PATH } from "../shared/constants.ts";
import { item } from "../shared/items.ts";
import { STARTER_LOOK } from "../shared/look.ts";
import { xpForLevel, type SkillKey } from "../shared/skills.ts";
import { CLOSE_KICKED, CLOSE_RESTART, type C2S, type S2C } from "../shared/protocol.ts";
import { buildOakridge } from "../shared/oakridge.ts";
import { startAnimationPreview } from "./animpreview.ts";
import { Sound } from "./audio.ts";
import { Game } from "./game.ts";
import { startResourcePreview } from "./resourcepreview.ts";
import { startSoundPreview } from "./soundpreview.ts";
import { Hud } from "./hud.ts";
import { Connection } from "./net.ts";
import { beacon, checkHiddenBeforeLogin, installErrorBeacon, runSelfTest, selfTestAuth, snapshotCreator } from "./selftest.ts";
import { AuthScreen } from "./ui/auth.ts";
import { Chatbox } from "./ui/chatbox.ts";
import { CombatPanel } from "./ui/combat.ts";
import { Designer } from "./ui/designer.ts";
import { EquipmentPanel } from "./ui/equipment.ts";
import { InventoryPanel } from "./ui/inventory.ts";
import { ContextMenu } from "./ui/menu.ts";
import { SidePanel } from "./ui/panel.ts";
import { SkillsPanel, XpDrops } from "./ui/skills.ts";
import { applySkin } from "./ui/skin.ts";

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

applySkin();
const hud = new Hud();
const auth = new AuthScreen();
const designer = new Designer();
const chatbox = new Chatbox();
const panel = new SidePanel();
const menu = new ContextMenu();
const play = (m: C2S) => conn?.send(m);
const inventory = new InventoryPanel(play, chatbox, menu);
const equipment = new EquipmentPanel(play, chatbox, menu);
const skills = new SkillsPanel();
const combat = new CombatPanel();
// The self-test never reaches the speakers: its sound is built muted.
const sound = new Sound(Boolean(selfTestName));
const xpDrops = new XpDrops();
inventory.onHover = equipment.onHover = (html) => hud.setHover(html);
chatbox.onSend = (text) => conn?.send({ t: "chat", text });
combat.onStyle = (index) => conn?.send({ t: "style", index });
combat.onRetaliate = (on) => conn?.send({ t: "retaliate", on });
panel.onSettings = (s) => {
  game?.applySettings(s);
  sound.setVolumes(s);
};
sound.setVolumes(panel.settings);
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
        game = new Game(document.getElementById("view")!, buildOakridge(msg.seed), play, hud, chatbox, menu, sound);
        game.applySettings(panel.settings);
        game.onWorldAction = () => inventory.letGo();
        game.usingItem = () => inventory.chosenItem();
        hud.onRunChange = (on) => conn?.send({ t: "run", on });
        hud.show();
        // Music plays in the world, not on the login screen.
        sound.music.play(true);
        // The inventory starts open, except on a narrow screen where it would cover the view.
        panel.open(window.matchMedia("(max-width: 700px)").matches ? null : "inventory");
        if (selfTestName && beaconUrl) void runSelfTest(game, beaconUrl, params.has("shots"));
      }
      game.welcome(msg);
      chatbox.setName(msg.name);
      hud.setEnergy(msg.energy);
      hud.setRunning(msg.run);
      hud.setHealth(msg.hp, msg.maxHp);
      break;
    case "tick":
      game?.applyTick(msg);
      if (msg.you) {
        hud.setEnergy(msg.you.energy);
        hud.setRunning(msg.you.run);
        hud.setHealth(msg.you.hp, msg.you.maxHp);
      }
      break;
    case "world":
      game?.worldState(msg.depleted, msg.spots);
      break;
    case "skills":
      skills.set(msg.xp);
      combat.setSkills(msg.xp);
      break;
    case "xp":
      xpDrops.show(msg.skill, skills.update(msg.skill, msg.xp));
      combat.updateSkill(msg.skill, msg.xp);
      break;
    case "combat":
      combat.set(msg.style, msg.retaliate);
      break;
    case "sound":
      sound.effect(msg.cue);
      break;
    case "inventory":
      inventory.set(msg.items);
      break;
    case "equipment":
      equipment.set(msg.items, msg.bonuses, msg.weight);
      combat.setWeapon(msg.items.weapon?.id ?? 0);
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
  checkHiddenBeforeLogin();
  void (async () => {
    if (params.has("shots")) await snapshotCreator(designer, beaconUrl, STARTER_LOOK);
    pendingSelfTest = selfTestAuth(selfTestName, params.get("secret"), beaconUrl, send, (next) => { pendingSelfTest = next; }, params.has("shots"));
  })();
} else if (storedToken()) {
  resume();
} else if (params.has("animations")) {
  // Every animation side by side, for judging the look without playing.
  document.body.classList.add("preview");
  startAnimationPreview(document.getElementById("view")!, beaconUrl ? (line) => beacon(beaconUrl, line) : null);
} else if (params.has("resources")) {
  // Every rung of the three ladders side by side, for judging them without walking a map to find them.
  document.body.classList.add("preview");
  startResourcePreview(document.getElementById("view")!, beaconUrl ? (line) => beacon(beaconUrl, line) : null);
} else if (params.has("sounds")) {
  // Every sound on a button, for listening to them without playing.
  startSoundPreview(sound);
} else if (params.has("creator")) {
  void designer.open(look);
} else if (params.has("setuppreview")) {
  // The authenticator setup screen with a made-up key, for checking its layout by screenshot.
  const key = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
  auth.showTotp(key, `otpauth://totp/Oakridge%20Online:Preview?secret=${key}&issuer=Oakridge%20Online`);
} else if (params.has("hudpreview")) {
  // The interface laid out with sample content and no server, for checking layout by screenshot.
  hud.show();
  hud.setOnline(3);
  hud.setEnergy(76);
  hud.setRunning(true);
  hud.setHealth(21, 32);
  chatbox.setName("Preview");
  chatbox.game("Welcome to Oakridge Online.");
  chatbox.said("Preview", "hello there");
  // Every item that has a model of its own, so the preview shows each icon as it really draws.
  const kit = [
    "bronze_axe", "bronze_pickaxe", "fishing_net", "tinderbox", "logs", "oak_logs", "copper_ore", "tin_ore", "iron_ore",
    "raw_sardine", "bread", "bones", "bronze_sword", "iron_sword", "iron_dagger", "bronze_mace", "bronze_helm", "iron_helm",
    "bronze_shield", "raw_beef", "raw_fowl", "cowhide", "wolf_pelt", "feather", "spider_silk",
  ];
  inventory.set([
    ...kit.map((key) => ({ id: item(key).id, count: 1 })), { id: item("coins").id, count: 25 }, { id: item("coins").id, count: 250_000 },
    { id: item("coins").id, count: 12_000_000 },
  ].slice(0, 28));
  const worn = { head: "leather_cap", cape: "red_cape", weapon: "bronze_dagger", body: "leather_jerkin", shield: "wooden_shield" } as const;
  equipment.set(Object.fromEntries(Object.entries(worn).map(([slot, key]) => [slot, { id: item(key).id, count: 1 }])), [5, 2, -3, -1, -2, 11, 13, 9, 0, 11, 3, 0], 4.5);
  const sample: Record<SkillKey, number> = {
    attack: xpForLevel(11) + 400, strength: xpForLevel(13) + 90, defence: xpForLevel(9) + 20, hitpoints: xpForLevel(12) + 1200,
    woodcutting: xpForLevel(14) + 5125, mining: xpForLevel(7) + 380, fishing: 110,
    firemaking: xpForLevel(9) + 60, cooking: xpForLevel(12) + 340, smithing: xpForLevel(6) + 25,
    crafting: xpForLevel(4) + 80, fletching: xpForLevel(8) + 15,
  };
  skills.set(sample);
  combat.setSkills(sample);
  combat.setWeapon(item("bronze_sword").id);
  combat.set(1, true);
  // An XP drop held part way up, so a screenshot catches it.
  const drop = xpDrops.show("woodcutting", 36);
  if (drop) {
    drop.style.animationDelay = "-0.7s";
    drop.style.animationPlayState = "paused";
  }
  panel.open(params.get("hudpreview") || "inventory");
  // On the skills tab, the hover box over the first skill shows too.
  document.querySelector(".skill")?.dispatchEvent(new PointerEvent("pointerenter"));
}
