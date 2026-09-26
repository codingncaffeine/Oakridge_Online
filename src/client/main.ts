import { WS_PATH } from "../shared/constants.ts";
import { item, ITEM_BY_ID } from "../shared/items.ts";
import { STAFF_ELEMENT } from "../shared/spells.ts";
import { STARTER_LOOK } from "../shared/look.ts";
import { levelForXp, xpForLevel, type SkillKey } from "../shared/skills.ts";
import { CLOSE_KICKED, CLOSE_RESTART, type C2S, type S2C } from "../shared/protocol.ts";
import { buildOakridge, GREEN, OAKRIDGE_SEED } from "../shared/oakridge.ts";
import { MapPictures } from "./ui/mappictures.ts";
import { WorldMapScreen } from "./ui/worldmap.ts";
import { startAnimationPreview } from "./animpreview.ts";
import { Sound } from "./audio.ts";
import { Game } from "./game.ts";
import { startResourcePreview } from "./resourcepreview.ts";
import { startSoundPreview } from "./soundpreview.ts";
import { startVillagePreview } from "./villagepreview.ts";
import { startCaldmoorPreview } from "./caldmoorpreview.ts";
import { startSitePreview } from "./sitepreview.ts";
import { startSkyPreview } from "./skypreview.ts";
import { startSpellPreview } from "./spellpreview.ts";
import { NpcMaker } from "./npcmaker.ts";
import { startStreamPreview } from "./streampreview.ts";
import { Hud } from "./hud.ts";
import { Connection, type Closed } from "./net.ts";
import { dropReport, readDrop, type Drop } from "./drops.ts";
import { beacon, checkHiddenBeforeLogin, installErrorBeacon, runSelfTest, selfTestAuth, snapshotCreator } from "./selftest.ts";
import { AuthScreen } from "./ui/auth.ts";
import { Chatbox } from "./ui/chatbox.ts";
import { CombatPanel } from "./ui/combat.ts";
import { Designer } from "./ui/designer.ts";
import { EquipmentPanel } from "./ui/equipment.ts";
import { InventoryPanel } from "./ui/inventory.ts";
import { Screens } from "./ui/screens.ts";
import { buyPrice, sellPrice, SHOPS } from "../shared/shops.ts";
import { ContextMenu } from "./ui/menu.ts";
import { FriendsPanel } from "./ui/friends.ts";
import { SidePanel } from "./ui/panel.ts";
import { PrayerPanel } from "./ui/prayers.ts";
import { SpellBook } from "./ui/spellbook.ts";
import { QuestsPanel } from "./ui/quests.ts";
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
/** A connection lost without asking, kept in this tab (a reload mid-outage keeps it) until the server is told. */
const DROP_KEY = "oakridge.drop";
let drop: Drop | null = readDrop((() => { try { return sessionStorage.getItem(DROP_KEY); } catch { return null; } })());
const keepDrop = (d: Drop | null) => {
  drop = d;
  try {
    if (d) sessionStorage.setItem(DROP_KEY, JSON.stringify(d));
    else sessionStorage.removeItem(DROP_KEY);
  } catch {
    // No session storage: the drop is still told, unless the page is reloaded first.
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
const screens = new Screens(play, menu);
const equipment = new EquipmentPanel(play, chatbox, menu);
const skills = new SkillsPanel();
const quests = new QuestsPanel();
const prayers = new PrayerPanel();
const friends = new FriendsPanel(menu);
const combat = new CombatPanel();
const spellbook = new SpellBook(menu);
friends.onAdd = (name) => conn?.send({ t: "friend_add", name });
friends.onRemove = (name) => conn?.send({ t: "friend_remove", name });
friends.onIgnore = (name) => conn?.send({ t: "ignore_add", name });
friends.onUnignore = (name) => conn?.send({ t: "ignore_remove", name });
friends.onMessage = (name) => chatbox.messageTo(name);
chatbox.onPm = (to, text) => conn?.send({ t: "pm", to, text });
// The self-test never reaches the speakers: its sound is built muted.
const sound = new Sound(Boolean(selfTestName));
const xpDrops = new XpDrops();
inventory.onHover = equipment.onHover = (html) => hud.setHover(html);
chatbox.onSend = (text) => conn?.send({ t: "chat", text });
combat.onStyle = (index) => conn?.send({ t: "style", index });
combat.onRetaliate = (on) => conn?.send({ t: "retaliate", on });
prayers.onToggle = (key, on) => conn?.send({ t: "pray", key, on });
spellbook.onAutocast = (key) => conn?.send({ t: "autocast", spell: key });
spellbook.onCastSelf = (key) => conn?.send({ t: "cast_self", spell: key });
inventory.castingOnItem = () => {
  const s = spellbook.chosenSpell();
  return s?.on === "item" ? s : null;
};
inventory.onCast = () => spellbook.letGo();
spellbook.onSay = (text) => chatbox.game(text);
spellbook.onHover = (html) => hud.setHover(html);
// A spell and an item chosen to "Use" are never waiting at once: choosing one lets go of the other.
spellbook.onChoose = () => inventory.letGo();
inventory.onChoose = () => spellbook.letGo();
panel.onSettings = (s) => {
  game?.applySettings(s);
  sound.setVolumes(s);
};
sound.setVolumes(panel.settings);
let game: Game | null = null;
let conn: Connection | null = null;
let opening: Promise<Connection> | null = null;
let inWorld = false;
/** From a lost connection until the world takes the player back: every failed try schedules the next. */
let reconnecting = false;
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
    c.onClose = (end) => {
      trace(`socket closed ${end.code}`);
      if (opening) {
        opening = null;
        reject(new Error("closed"));
      }
      if (conn === c) conn = null;
      closed(end);
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

function closed(end: Closed): void {
  if (end.code === CLOSE_KICKED) {
    inWorld = false;
    reconnecting = false;
    keepToken(null);
    return;
  }
  if (inWorld) {
    keepDrop({
      code: end.code, clean: end.clean, reason: end.reason, at: Date.now(), quiet: end.quiet,
      hidden: document.visibilityState === "hidden", offline: !navigator.onLine, tries: 0,
    });
  } else if (reconnecting) {
    // A try that failed: count it, and go again.
    if (drop) keepDrop({ ...drop, tries: drop.tries + 1 });
  } else {
    return;
  }
  inWorld = false;
  reconnecting = true;
  hud.setBanner("Connection lost — reconnecting…");
  const delay = end.code === CLOSE_RESTART ? 1500 : Math.min(10000, 1000 * 2 ** retries++);
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
      reconnecting = false;
      look = msg.look;
      hud.setBanner(null);
      if (drop) {
        conn?.send(dropReport(drop, Date.now()));
        keepDrop(null);
      }
      if (!game) {
        game = new Game(document.getElementById("view")!, buildOakridge(msg.seed), play, hud, chatbox, menu, sound);
        game.applySettings(panel.settings);
        game.onWorldAction = () => {
          inventory.letGo();
          spellbook.letGo();
        };
        game.usingItem = () => inventory.chosenItem();
        game.castingSpell = () => spellbook.chosenSpell();
        hud.onRunChange = (on) => conn?.send({ t: "run", on });
        // The world map: the button under the minimap, or M, as every game of this kind offers it.
        document.getElementById("map-open")!.addEventListener("click", () => game?.worldmap.toggle());
        window.addEventListener("keydown", (e) => {
          const typing = document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA";
          if (!typing && (e.key === "m" || e.key === "M")) game?.worldmap.toggle();
        });
        hud.show();
        // Music plays in the world, not on the login screen.
        sound.music.play(true);
        // The inventory starts open, except on a narrow screen where it would cover the view.
        panel.open(window.matchMedia("(max-width: 700px)").matches ? null : "inventory");
        if (selfTestName && beaconUrl) void runSelfTest(game, beaconUrl, params.has("shots"), send);
      }
      game.welcome(msg);
      chatbox.setName(msg.name);
      hud.setEnergy(msg.energy);
      hud.setRunning(msg.run);
      hud.setHealth(msg.hp, msg.maxHp);
      hud.setPrayer(msg.prayer, msg.maxPrayer);
      prayers.setPoints(msg.prayer, msg.maxPrayer);
      break;
    case "tick":
      game?.applyTick(msg);
      if (msg.you) {
        hud.setEnergy(msg.you.energy);
        hud.setRunning(msg.you.run);
        hud.setHealth(msg.you.hp, msg.you.maxHp);
        hud.setPrayer(msg.you.prayer, msg.you.maxPrayer);
        prayers.setPoints(msg.you.prayer, msg.you.maxPrayer);
      }
      break;
    case "world":
      game?.worldState(msg.depleted, msg.spots, msg.opened, msg.added);
      break;
    case "plane":
      game?.setPlane(msg.plane, msg.x, msg.y);
      break;
    case "bank":
      screens.showBank(msg.items);
      break;
    case "shop":
      screens.showShop(msg.name, msg.items);
      break;
    case "say":
      screens.showSay(msg.speaker, msg.lines, msg.options, msg.npc);
      break;
    case "quests":
      quests.set(msg.stages, msg.points);
      break;
    case "friends":
      friends.set(msg.friends, msg.ignores);
      break;
    case "pm":
      chatbox.pm(msg.from, msg.to, msg.text);
      break;
    case "trade":
      screens.showTrade(msg.with, msg.mine, msg.theirs, msg.stage, msg.accepted);
      break;
    case "make":
      screens.showMake(msg.title, msg.options);
      break;
    case "skills":
      skills.set(msg.xp);
      combat.setSkills(msg.xp);
      prayers.setLevel(levelForXp(msg.xp.prayer));
      spellbook.setLevel(levelForXp(msg.xp.magic));
      break;
    case "xp":
      xpDrops.show(msg.skill, skills.update(msg.skill, msg.xp));
      combat.updateSkill(msg.skill, msg.xp);
      if (msg.skill === "prayer") prayers.setLevel(levelForXp(msg.xp));
      if (msg.skill === "magic") spellbook.setLevel(levelForXp(msg.xp));
      break;
    case "combat":
      combat.set(msg.style, msg.retaliate, msg.autocast);
      spellbook.setAutocast(msg.autocast);
      break;
    case "prayers":
      prayers.set(msg.on);
      break;
    case "sound":
      sound.effect(msg.cue);
      break;
    case "inventory":
      inventory.set(msg.items);
      screens.setPack(msg.items);
      spellbook.setItems(msg.items);
      break;
    case "bags":
      inventory.setBags(msg.items);
      break;
    case "equipment":
      equipment.set(msg.items, msg.bonuses, msg.weight);
      combat.setWeapon(msg.items.weapon?.id ?? 0);
      {
        const held = ITEM_BY_ID.get(msg.items.weapon?.id ?? 0);
        spellbook.setWeapon(held?.equip?.weapon === "staff", held ? STAFF_ELEMENT[held.key] ?? null : null);
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
} else if (params.has("caldmoor")) {
  // Caldmoor's building style, put up for judging before any of Caldmoor is built (PLAN Wave 4).
  document.body.classList.add("preview");
  startCaldmoorPreview(document.getElementById("view")!, beaconUrl ? (line) => beacon(beaconUrl, line) : null);
} else if (params.has("village")) {
  // The people of the village in a row, with one building of each kind behind them.
  document.body.classList.add("preview");
  startVillagePreview(document.getElementById("view")!, beaconUrl ? (line) => beacon(beaconUrl, line) : null);
} else if (["stonecote", "thornbury", "wickstead", "brinehaven", "kilnhold", "adit", "tarhollow", "deepdelve", "ashbarrow", "harrow", "sandreach", "waterside", "sallowfen"].some((site) => params.has(site))) {
  // A site as built, three-quarters on, and the planes under it: the site judged without the walk.
  document.body.classList.add("preview");
  const site = ["stonecote", "thornbury", "wickstead", "brinehaven", "kilnhold", "adit", "tarhollow", "deepdelve", "ashbarrow", "harrow", "sandreach", "waterside", "sallowfen"].find((s) => params.has(s))!;
  startSitePreview(document.getElementById("view")!, site, params.get(site), beaconUrl ? (line) => beacon(beaconUrl, line) : null);
} else if (params.has("spellpreview")) {
  // A mage and a goblin and a button for every spell: each one's cast, flight and hit judged without a fight.
  document.body.classList.add("preview");
  startSpellPreview(document.getElementById("view")!, beaconUrl ? (line) => beacon(beaconUrl, line) : null);
} else if (params.has("skypreview")) {
  // The village under the sky at any hour and in any weather, so day, night and the weathers can be judged now.
  document.body.classList.add("preview");
  startSkyPreview(document.getElementById("view")!, params.get("skypreview"), beaconUrl ? (line) => beacon(beaconUrl, line) : null);
} else if (params.has("npcmaker")) {
  // The character creator with what only the village's people wear, and a "copy as code" button: a new
  // person is dressed against a reference, then the printed line is pasted into the bestiary.
  document.body.classList.add("preview");
  const maker = new NpcMaker(designer);
  maker.open();
  if (beaconUrl) void maker.check((line) => beacon(beaconUrl, line));
} else if (params.has("streampreview")) {
  // A wide world of nothing in particular, walked across at speed: region streaming in the real renderer.
  document.body.classList.add("preview");
  hud.show();
  startStreamPreview(document.getElementById("view")!, hud, chatbox, menu, sound, beaconUrl ? (line) => beacon(beaconUrl, line) : null);
} else if (params.has("sounds")) {
  // Every sound on a button, for listening to them without playing.
  startSoundPreview(sound);
} else if (params.has("creator")) {
  void designer.open(look);
} else if (params.has("setuppreview")) {
  // The authenticator setup screen with a made-up key, for checking its layout by screenshot.
  const key = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
  auth.showTotp(key, `otpauth://totp/Oakridge%20Online:Preview?secret=${key}&issuer=Oakridge%20Online`);
} else if (params.has("signuppreview")) {
  // The create-account tab, with email chosen when asked (#signuppreview=email), for checking its layout by screenshot.
  auth.show("signup");
  if (params.get("signuppreview") === "email") document.querySelector<HTMLInputElement>('input[name="method"][value="email"]')?.click();
} else if (params.has("backuppreview")) {
  // The backup codes step with made-up codes, for checking its layout by screenshot.
  auth.showBackup(["7KQ2-M9XD", "P4TW-8HNC", "Z3RB-6VYE", "D8LF-2QKA", "W5GJ-9TMR", "H6SN-4CXP", "B2VK-7RDW", "Y9EM-3FLQ"], "Preview");
} else if (params.has("hudpreview")) {
  // The interface laid out with sample content and no server, for checking layout by screenshot.
  hud.show();
  hud.setOnline(3);
  hud.setEnergy(76);
  hud.setRunning(true);
  hud.setHealth(21, 32);
  hud.setPrayer(12, 15);
  prayers.setPoints(12, 15);
  prayers.setLevel(6);
  chatbox.setName("Preview");
  chatbox.game("Welcome to Oakridge Online.");
  chatbox.said("Preview", "hello there");
  // Every item that has a model of its own, so the preview shows each icon as it really draws.
  const kit = [
    // The newest models first (the runes and the elemental staves, then Phase 11's staves and wool), so a preview shot shows them.
    "gale_rune", "tide_rune", "stone_rune", "ember_rune", "thought_rune", "wild_rune", "grave_rune", "fury_rune", "gale_staff", "ember_staff", "ash_staff", "oak_staff", "wool_robe", "wool_hood", "shortbow",
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
    crafting: xpForLevel(4) + 80, fletching: xpForLevel(8) + 15, ranged: xpForLevel(5) + 30, magic: xpForLevel(3) + 12, prayer: xpForLevel(6) + 44,
    runesmithing: xpForLevel(2) + 30,
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
  // `#hudpreview=bank` and its like show the screens that open over the world, filled with sample
  // content and no server behind them, so their layout can be read off a screenshot.
  const want = params.get("hudpreview") || "inventory";
  const price = (key: string, stock: number) => {
    const def = SHOPS.oakridge_general!;
    const id = item(key).id;
    const normal = def.stock.find((l) => l.id === id)?.count ?? stock;
    return { id, count: stock, buy: buyPrice(def, id, stock, normal), sell: sellPrice(def, id, stock, normal) };
  };
  if (want === "bank") {
    screens.setPack([...kit.slice(0, 10).map((key) => ({ id: item(key).id, count: 1 })), { id: item("coins").id, count: 4820 }]);
    screens.showBank([
      { id: item("coins").id, count: 128_400 }, { id: item("logs").id, count: 640 }, { id: item("oak_logs").id, count: 212 },
      { id: item("coal").id, count: 1_980 }, { id: item("iron_ore").id, count: 745 }, { id: item("steel_bar").id, count: 96 },
      { id: item("raw_sardine").id, count: 310 }, { id: item("sardine").id, count: 128 }, { id: item("bones").id, count: 1_440 },
      { id: item("steel_sword").id, count: 1 }, { id: item("iron_helm").id, count: 3 }, { id: item("cowhide").id, count: 87 },
    ]);
  } else if (want === "shop") {
    screens.setPack([{ id: item("coins").id, count: 4820 }, { id: item("cowhide").id, count: 12 }, { id: item("bones").id, count: 5 }]);
    screens.showShop("Oakridge General Store", [
      price("bread", 30), price("tinderbox", 10), price("leather_cap", 5), price("leather_boots", 5),
      price("red_cape", 3), price("wooden_shield", 5), price("bait", 300), price("logs", 4),
    ]);
  } else if (want === "bags") {
    // Two bags worn (Crafting, C2): the pack runs to 52 slots and scrolls, and the bag bar shows the two.
    const bagKeys = ["small_pouch", "large_pouch", "small_bag", "large_bag", "small_backpack", "large_backpack", "wool", "ball_of_wool", "wool_cloth", "shears"];
    inventory.setBags([{ id: item("large_backpack").id, count: 1 }, { id: item("small_pouch").id, count: 1 }, null, null, null]);
    inventory.set([...bagKeys, ...kit].slice(0, 52).map((key) => ({ id: item(key).id, count: 1 })));
  } else if (want === "say") {
    screens.showSay("Maud Tarrow", ["Morning. Odds, ends, and a bit of everything."], [
      "Let's see what you have.", "What's worth knowing around here?", "Just looking.",
    ]);
  } else if (want === "make") {
    screens.showMake("What to smelt", [
      { id: item("bronze_bar").id, each: 1, can: 14 },
      { id: item("iron_bar").id, each: 1, can: 9 },
      { id: item("silver_bar").id, each: 1, can: 0, note: "Smithing level 20 is needed to make a silver bar." },
      { id: item("steel_bar").id, each: 1, can: 0, note: "You haven't got what a steel bar takes." },
      { id: item("gold_bar").id, each: 1, can: 0, note: "Smithing level 40 is needed to make a gold bar." },
    ]);
  }
  if (want === "worldmap") {
    // The map draws the real district, so the preview builds it the same way the world does.
    const preview = new WorldMapScreen();
    const district = buildOakridge(OAKRIDGE_SEED).planes.get(0)!;
    preview.setMap(district, MapPictures.standalone(district));
    preview.setViewer({ x: GREEN.x, y: GREEN.y });
    preview.open();
  }
  panel.open(["bank", "shop", "say", "make", "worldmap", "bags"].includes(want) ? "inventory" : want);
  // On the skills tab, the hover box over the first skill shows too.
  document.querySelector(".skill")?.dispatchEvent(new PointerEvent("pointerenter"));
}
