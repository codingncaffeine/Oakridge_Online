// The NPC maker (#npcmaker): the character creator wearing what only the village's people wear (items
// by slot, an apron), with the person's key, name, examine line, dialogue, wander and shop beside it and
// the `villager(...)` line for shared/monsters.ts printed underneath, ready to copy. A new person is
// dressed by eye against the wiki's render and pasted straight into the bestiary, instead of being typed
// as thirteen numbers. Given a beacon it checks itself: every person already in the bestiary must come
// back out of the controls as the line they went in as, and dressing the preview must reach its pixels.
import { DIALOGUE } from "../shared/dialogue.ts";
import { ITEMS, VISIBLE_GEAR } from "../shared/items.ts";
import { STARTER_LOOK } from "../shared/look.ts";
import { VILLAGERS, type MonsterDef } from "../shared/monsters.ts";
import { SHOPS } from "../shared/shops.ts";
import { hex6, villagerCode, type VillagerLine } from "../shared/villagercode.ts";
import { personGear } from "./entity.ts";
import type { Designer } from "./ui/designer.ts";

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const option = (value: string, text: string) => Object.assign(document.createElement("option"), { value, textContent: text });

/** The slots a person may wear something in: the ones the model draws, which are the keys `wear` takes. */
type WearSlot = keyof NonNullable<MonsterDef["wear"]>;
const WEAR_SLOTS = VISIBLE_GEAR as WearSlot[];

/** Where "Blank" starts: a new player's own look, and a name to replace. */
const BLANK: VillagerLine = { key: "new_person", name: "New person", examine: "Someone new in town.", look: STARTER_LOOK, wander: 2 };

const person = (key: string): VillagerLine => VILLAGERS.find((v) => v.key === key) ?? BLANK;

export class NpcMaker {
  private readonly panel = byId("designer-npc");
  private readonly start = byId<HTMLSelectElement>("npc-start");
  private readonly key = byId<HTMLInputElement>("npc-key");
  private readonly name = byId<HTMLInputElement>("npc-name");
  private readonly examine = byId<HTMLInputElement>("npc-examine");
  private readonly talk = byId<HTMLInputElement>("npc-talk");
  private readonly wander = byId<HTMLInputElement>("npc-wander");
  private readonly shop = byId<HTMLSelectElement>("npc-shop");
  private readonly banker = byId<HTMLInputElement>("npc-banker");
  private readonly apronOn = byId<HTMLInputElement>("npc-apron-on");
  private readonly apron = byId<HTMLInputElement>("npc-apron");
  private readonly code = byId<HTMLTextAreaElement>("npc-code");
  private readonly copied = byId("npc-copied");
  private readonly wear = new Map<WearSlot, HTMLSelectElement>();
  private readonly designer: Designer;
  /** Whether Talk has been given a value of its own; until then it follows the key. */
  private talkTyped = false;

  constructor(designer: Designer) {
    this.designer = designer;
    this.start.append(option("", "Blank"), ...VILLAGERS.map((v) => option(v.key, `${v.name} (${v.key})`)));
    this.shop.append(option("", "None"), ...Object.entries(SHOPS).map(([key, def]) => option(key, def.name)));
    byId<HTMLDataListElement>("npc-talks").append(...Object.keys(DIALOGUE).map((k) => option(k, k)));
    const wearBox = byId("npc-wear");
    for (const slot of WEAR_SLOTS) {
      const select = document.createElement("select");
      select.id = `npc-wear-${slot}`;
      select.append(option("", "Nothing"), ...ITEMS.filter((i) => i.equip?.slot === slot).map((i) => option(i.key, i.name)));
      const label = document.createElement("label");
      label.append(slot[0]!.toUpperCase() + slot.slice(1), select);
      wearBox.append(label);
      this.wear.set(slot, select);
    }
    this.start.addEventListener("change", () => this.load(this.start.value ? person(this.start.value) : BLANK));
    this.key.addEventListener("input", () => {
      if (!this.talkTyped) this.talk.value = this.key.value;
      this.update();
    });
    this.talk.addEventListener("input", () => {
      this.talkTyped = this.talk.value !== this.key.value;
      this.update();
    });
    const inputs: HTMLElement[] = [this.name, this.examine, this.wander, this.shop, this.banker, this.apronOn, this.apron, ...this.wear.values()];
    for (const el of inputs) {
      el.addEventListener("input", () => this.update());
      el.addEventListener("change", () => this.update());
    }
    byId("npc-copy").addEventListener("click", () => void this.copy());
    designer.onChange = () => this.update();
  }

  /** Opens the creator as the maker, showing the guard: the most dressed person there is. */
  open(): void {
    this.designer.asMaker();
    this.panel.hidden = false;
    void this.designer.open(STARTER_LOOK);
    this.load(person("guard"));
  }

  /** Puts a person into every control and the preview. */
  load(def: VillagerLine): void {
    this.start.value = VILLAGERS.some((v) => v.key === def.key) ? def.key : "";
    this.key.value = def.key;
    this.name.value = def.name;
    this.examine.value = def.examine;
    this.talk.value = def.talk ?? "";
    this.talkTyped = def.talk !== undefined && def.talk !== def.key;
    this.wander.value = def.wander === undefined ? "" : String(def.wander);
    this.shop.value = def.shop ?? "";
    this.banker.checked = def.banker === true;
    for (const [slot, select] of this.wear) select.value = def.wear?.[slot] ?? "";
    this.apronOn.checked = def.apron !== undefined;
    if (def.apron !== undefined) this.apron.value = `#${hex6(def.apron).slice(2)}`;
    this.designer.setLook(def.look ?? STARTER_LOOK);
    this.update();
  }

  /** The person as the controls have them. */
  state(): VillagerLine {
    const def: VillagerLine = {
      key: this.key.value.trim(), name: this.name.value.trim(), examine: this.examine.value.trim(), look: this.designer.current(),
    };
    if (this.talk.value.trim()) def.talk = this.talk.value.trim();
    if (this.banker.checked) def.banker = true;
    if (this.shop.value) def.shop = this.shop.value;
    if (/^\d+$/.test(this.wander.value.trim())) def.wander = Number(this.wander.value);
    const wear: Partial<Record<WearSlot, string>> = {};
    for (const [slot, select] of this.wear) if (select.value) wear[slot] = select.value;
    if (Object.keys(wear).length) def.wear = wear;
    if (this.apronOn.checked) def.apron = parseInt(this.apron.value.slice(1), 16);
    return def;
  }

  /** Dresses the preview and prints the line. */
  private update(): void {
    const def = this.state();
    this.designer.dress(personGear(def), { apron: def.apron });
    this.code.value = villagerCode(def);
    this.copied.textContent = "";
  }

  private async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.code.value);
      this.copied.textContent = "Copied.";
    } catch {
      // No clipboard here (a plain-http page, or leave refused): leave the line selected to copy by hand.
      this.code.focus();
      this.code.select();
      this.copied.textContent = "Selected. Press Ctrl+C.";
    }
  }

  /**
   * The maker's own check, for the browser run. Every person in the bestiary goes through the controls
   * and back out: a control that cannot hold a field, or an item missing from a list, prints a different
   * line. Then the dressing must reach the pixels: the guard with and without his kit, the shopkeeper
   * with and without her apron, each pair snapped in one task so the preview cannot turn between the
   * two, and the same state snapped twice as the control that must not differ.
   */
  async check(beacon: (line: string) => Promise<void>): Promise<void> {
    await new Promise((r) => setTimeout(r, 600));
    const wrong: string[] = [];
    for (const def of VILLAGERS) {
      this.load(def);
      if (villagerCode(this.state()) !== villagerCode(def)) wrong.push(def.key);
    }
    const right = VILLAGERS.length - wrong.length;
    await beacon(`MAKER roundtrip ${wrong.length ? "FAIL" : "ok"}: ${right}/${VILLAGERS.length}${wrong.length ? ` wrong: ${wrong.join(" ")}` : ""}`);
    const gear = await this.differs(person("guard"), (d) => ({ ...d, wear: undefined }));
    const apron = await this.differs(person("shopkeeper_general"), (d) => ({ ...d, apron: undefined }));
    const verdict = (r: { changed: number; same: number }) => (r.changed > 0 && r.same === 0 ? "ok" : "FAIL");
    await beacon(`MAKER gear drawn ${verdict(gear)}: ${gear.changed} px differ with the kit off, ${gear.same} with nothing changed`);
    await beacon(`MAKER apron drawn ${verdict(apron)}: ${apron.changed} px differ with the apron off, ${apron.same} with nothing changed`);
    this.load(person("guard"));
    await beacon(`SHOT npcmaker_guard ${this.designer.snapshot()}`);
    this.load(person("shopkeeper_general"));
    await beacon(`SHOT npcmaker_keeper ${this.designer.snapshot()}`);
    await beacon("DONE");
  }

  /** Pixels that change when `strip` is applied to `def`, and pixels that change when nothing is. */
  private async differs(def: VillagerLine, strip: (d: VillagerLine) => VillagerLine): Promise<{ changed: number; same: number }> {
    this.load(def);
    const a = this.designer.snapshot();
    this.load(strip(def));
    const b = this.designer.snapshot();
    this.load(def);
    const c = this.designer.snapshot();
    return { changed: await pixelsDiffering(a, b), same: await pixelsDiffering(a, c) };
  }
}

/** How many pixels two snapshots of the same canvas disagree on. */
async function pixelsDiffering(a: string, b: string): Promise<number> {
  const [pa, pb] = await Promise.all([pixels(a), pixels(b)]);
  let n = 0;
  for (let i = 0; i < pa.length; i += 4) {
    if (pa[i] !== pb[i] || pa[i + 1] !== pb[i + 1] || pa[i + 2] !== pb[i + 2] || pa[i + 3] !== pb[i + 3]) n++;
  }
  return n;
}

function pixels(url: string): Promise<Uint8ClampedArray> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const g = canvas.getContext("2d")!;
      g.drawImage(img, 0, 0);
      resolve(g.getImageData(0, 0, canvas.width, canvas.height).data);
    };
    img.onerror = () => reject(new Error("a snapshot would not decode"));
    img.src = url;
  });
}
