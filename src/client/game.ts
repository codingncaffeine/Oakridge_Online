import * as THREE from "three";
import { RESOURCES } from "../shared/gathering.ts";
import { ITEM_BY_ID } from "../shared/items.ts";
import { heightAt, type MapObject, type WorldMap } from "../shared/map.ts";
import { findPathTo, type Tile } from "../shared/pathfind.ts";
import type { C2S, GroundItemView, S2C, SpotView } from "../shared/protocol.ts";
import { Entity } from "./entity.ts";
import type { Hud } from "./hud.ts";
import { itemExamine, objectInfo, SPOT_INFO } from "./info.ts";
import {
  ACTION_CROSS, FOG_COLOR, FOG_FAR, FOG_NEAR, GROUND_LIGHT, SKY_INTENSITY, SKY_LIGHT, SUN_COLOR, SUN_FROM, SUN_INTENSITY,
} from "./palette.ts";
import { OrbitCamera } from "./render/camera.ts";
import { Effects } from "./render/effects.ts";
import { groundGeometry, itemMaterial } from "./render/items.ts";
import { buildObjects, type WorldObjects } from "./render/objects.ts";
import { FishingSpots } from "./render/spots.ts";
import { buildTerrain } from "./render/terrain.ts";
import type { Chatbox } from "./ui/chatbox.ts";
import { hoverHtml, type ContextMenu, type MenuOption } from "./ui/menu.ts";
import { Minimap } from "./ui/minimap.ts";
import { Overheads } from "./ui/overheads.ts";
import type { Settings } from "./ui/panel.ts";

type Welcome = Extract<S2C, { t: "welcome" }>;
type TickMsg = Extract<S2C, { t: "tick" }>;

const LONG_PRESS_MS = 500;
/** At most this many items on one tile get their own menu options. */
const PILE_OPTIONS = 8;

interface GroundItem {
  view: GroundItemView;
  mesh: THREE.Mesh;
}

/** The running world on this page: scene, entities, camera, minimap and input. */
export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly view: OrbitCamera;
  readonly entities = new Map<number, Entity>();
  readonly map: WorldMap;
  readonly minimap: Minimap;
  localId = -1;
  lastTick = 0;
  /** Frames drawn so far (the self-test reads it). */
  frames = 0;
  /** Called before any click in the world acts: a pending inventory "Use" is let go. */
  onWorldAction: () => void = () => {};
  /** The inventory item chosen with "Use", waiting to be used on something in the world. */
  usingItem: () => { slot: number; name: string } | null = () => null;
  /** Map objects that have run out (felled trees, mined-out rocks), by id. */
  readonly depleted = new Set<number>();
  readonly spots: FishingSpots;
  private readonly terrain: THREE.Mesh;
  private readonly objects: WorldObjects;
  /** One-off effects such as level-up fireworks. */
  readonly effects = new Effects();
  private readonly send: (msg: C2S) => void;
  private readonly hud: Hud;
  private readonly chat: Chatbox;
  private readonly menu: ContextMenu;
  private readonly itemGroup = new THREE.Group();
  private readonly ground = new Map<number, GroundItem>();
  private readonly overheads = new Overheads();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly sky: THREE.HemisphereLight;
  private readonly sun: THREE.DirectionalLight;
  private pointerInside = false;
  private spawnFocus = new THREE.Vector3();
  private last = performance.now();

  constructor(container: HTMLElement, map: WorldMap, send: (msg: C2S) => void, hud: Hud, chat: Chatbox, menu: ContextMenu) {
    this.map = map;
    this.send = send;
    this.hud = hud;
    this.chat = chat;
    this.menu = menu;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.append(this.renderer.domElement);
    const canvas = this.renderer.domElement;
    this.view = new OrbitCamera(canvas);

    this.scene.background = new THREE.Color(FOG_COLOR);
    this.scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);
    this.sky = new THREE.HemisphereLight(SKY_LIGHT, GROUND_LIGHT, SKY_INTENSITY);
    this.sun = new THREE.DirectionalLight(SUN_COLOR, SUN_INTENSITY);
    this.sun.position.set(...SUN_FROM);
    this.scene.add(this.sky, this.sun);
    this.terrain = buildTerrain(map);
    this.objects = buildObjects(map);
    this.spots = new FishingSpots(map);
    this.scene.add(this.terrain, this.objects.group, this.spots.group, this.itemGroup);

    this.minimap = new Minimap(map);
    this.minimap.onWalk = (tile) => this.send({ t: "walk", x: tile.x, y: tile.y });
    this.minimap.onNorth = () => { this.view.yaw = 0; };

    const resize = () => {
      const w = container.clientWidth, h = container.clientHeight;
      this.renderer.setSize(w, h);
      this.view.resize(w, h);
    };
    new ResizeObserver(resize).observe(container);
    resize();

    canvas.addEventListener("pointermove", (e) => {
      this.setPointer(e.clientX, e.clientY);
      this.pointerInside = true;
    });
    canvas.addEventListener("pointerleave", () => {
      this.pointerInside = false;
      this.hud.setHover(null);
    });
    let press: { timer: number; x: number; y: number } | null = null;
    canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      if (e.pointerType === "touch") {
        // Touch: a long press opens the menu, a tap takes the default option.
        const x = e.clientX, y = e.clientY;
        press = { x, y, timer: window.setTimeout(() => { press = null; this.openMenu(x, y); }, LONG_PRESS_MS) };
        return;
      }
      this.menu.close();
      this.options(e.clientX, e.clientY)[0]?.run();
    });
    canvas.addEventListener("pointerup", (e) => {
      if (!press) return;
      clearTimeout(press.timer);
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < 12) this.options(press.x, press.y)[0]?.run();
      press = null;
    });
    canvas.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.openMenu(e.clientX, e.clientY);
    });

    requestAnimationFrame(this.frame);
  }

  applySettings(s: Settings): void {
    this.view.speed = s.cameraSpeed;
    this.sky.intensity = SKY_INTENSITY * s.brightness;
    this.sun.intensity = SUN_INTENSITY * s.brightness;
  }

  welcome(msg: Welcome): void {
    for (const e of this.entities.values()) this.drop(e);
    this.entities.clear();
    // The server sends everything in view again after a (re)join.
    this.itemGroup.clear();
    this.ground.clear();
    this.localId = msg.id;
    this.lastTick = msg.tick;
    this.spawnFocus.set(msg.x + 0.5, 1, -(msg.y + 0.5));
    this.view.snap();
    this.minimap.clearFlag();
  }

  /** On entering the world: which objects have run out, and where the fishing spots are. */
  worldState(depleted: number[], spots: SpotView[]): void {
    const now = new Set(depleted);
    for (const id of [...this.depleted]) if (!now.has(id)) this.setDepleted(id, false);
    for (const id of now) this.setDepleted(id, true);
    this.spots.set(spots);
  }

  private setDepleted(id: number, out: boolean): void {
    const o = this.map.objects[id];
    if (!o) return;
    if (out) this.depleted.add(id);
    else this.depleted.delete(id);
    this.objects.setDepleted(o, out);
  }

  applyTick(msg: TickMsg): void {
    this.lastTick = msg.n;
    this.hud.setOnline(msg.online);
    for (const u of msg.ents) {
      let e = this.entities.get(u.id);
      if (!e) {
        if (u.name === undefined || u.look === undefined) continue;
        e = new Entity(u.id, u.name, u.look, u.gear ?? [], u.x, u.y);
        this.entities.set(u.id, e);
        this.scene.add(e.model.root);
      } else {
        const restyled = u.look !== undefined || u.gear !== undefined;
        if (restyled) {
          // A new look or new gear: swap the model, keeping where it stands, faces and what it's doing.
          const old = e.restyle(u.look ?? e.look, u.gear ?? e.gear);
          this.scene.remove(old.root);
          old.dispose();
          this.scene.add(e.model.root);
        }
        if (u.steps) e.addSteps(u.steps);
        else if (!restyled) e.snapTo(u.x, u.y);
      }
      if (u.act !== undefined) e.setAct(u.act);
      if (u.fx === "levelup") this.effects.levelUp(e.model.root);
    }
    for (const [id, out] of msg.objs ?? []) this.setDepleted(id, out === 1);
    for (const s of msg.spots ?? []) this.spots.move(s);
    for (const id of msg.gone ?? []) {
      const e = this.entities.get(id);
      if (e) this.drop(e);
      this.entities.delete(id);
    }
    if (msg.items) {
      // Gone first: a stack that grew arrives as its old pile gone and a new one added.
      for (const uid of msg.items.gone ?? []) this.removeGroundItem(uid);
      for (const view of msg.items.add ?? []) this.addGroundItem(view);
    }
    const me = this.local;
    if (me) this.minimap.arrived(me.tileX, me.tileY);
  }

  /** Public chat: overhead text on the speaker and a line in the chatbox. */
  said(id: number, name: string, text: string): void {
    this.overheads.say(id, text);
    this.chat.said(name, text);
  }

  /** Ground items this client can see (the self-test reads them). */
  groundItems(): GroundItemView[] {
    return [...this.ground.values()].map((g) => g.view);
  }

  private addGroundItem(view: GroundItemView): void {
    if (this.ground.has(view.uid)) return;
    const mesh = new THREE.Mesh(groundGeometry(view.id), itemMaterial);
    mesh.userData.uid = view.uid;
    this.ground.set(view.uid, { view, mesh });
    this.itemGroup.add(mesh);
    this.arrangePile(view.x, view.y);
  }

  private removeGroundItem(uid: number): void {
    const g = this.ground.get(uid);
    if (!g) return;
    this.itemGroup.remove(g.mesh);
    this.ground.delete(uid);
    this.arrangePile(g.view.x, g.view.y);
  }

  /** Items sharing a tile spread out a little around its centre, each turned its own way. */
  private arrangePile(x: number, y: number): void {
    let i = 0;
    for (const g of this.ground.values()) {
      if (g.view.x !== x || g.view.y !== y) continue;
      const angle = i * 2.4, r = i === 0 ? 0 : 0.12 + 0.03 * i;
      const fx = x + 0.5 + Math.cos(angle) * r, fy = y + 0.5 + Math.sin(angle) * r;
      g.mesh.position.set(fx, heightAt(this.map, fx, fy) + 0.005, -fy);
      g.mesh.rotation.y = (g.view.uid * 2.3) % (Math.PI * 2);
      i++;
    }
  }

  private drop(e: Entity): void {
    this.scene.remove(e.model.root);
    e.model.dispose();
  }

  get local(): Entity | undefined {
    return this.entities.get(this.localId);
  }

  /**
   * Everything the cursor could act on at a screen point, default first. Each thing under it offers its
   * action, nearest first: chop the tree, mine the rock, net the spot, take the item, or use the item
   * chosen in the inventory on it. Then walking there, then examining each thing.
   */
  options(clientX: number, clientY: number): MenuOption[] {
    this.setPointer(clientX, clientY);
    this.raycaster.setFromCamera(this.pointer, this.view.camera);
    const ground = this.raycaster.intersectObject(this.terrain, false)[0];
    const tile = ground ? { x: Math.floor(ground.point.x), y: Math.floor(-ground.point.z) } : null;
    const using = this.usingItem();
    /** A click that acts on something: lets go of the chosen item and marks the spot with the red cross. */
    const act = (then: () => void) => () => {
      this.onWorldAction();
      this.hud.cross(clientX, clientY, ACTION_CROSS);
      then();
    };
    const things: Array<{ distance: number; action: MenuOption | null; examine: MenuOption }> = [];

    const seen = new Set<MapObject>();
    for (const hit of this.raycaster.intersectObjects(this.objects.group.children, false)) {
      const list = (hit.object.userData as { items?: MapObject[] }).items;
      const o = hit.instanceId !== undefined ? list?.[hit.instanceId] : undefined;
      if (!o || seen.has(o)) continue;
      seen.add(o);
      const out = this.depleted.has(o.id), info = objectInfo(o.kind, out), def = RESOURCES[o.kind];
      let action: MenuOption | null = null;
      if (using) {
        action = {
          verb: "Use", target: `${using.name} -> ${info.name}`, kind: "object",
          run: act(() => { this.flagWalkTo(o); this.send({ t: "use_object", slot: using.slot, x: o.x, y: o.y }); }),
        };
      } else if (def && !out) {
        action = { verb: def.verb, target: info.name, kind: "object", run: act(() => { this.flagWalkTo(o); this.send({ t: "object", x: o.x, y: o.y }); }) };
      }
      things.push({ distance: hit.distance, action, examine: { verb: "Examine", target: info.name, kind: "object", run: () => this.chat.game(info.examine) } });
    }

    for (const hit of this.raycaster.intersectObjects(this.spots.pickables, false)) {
      const s = this.spots.spotOf(hit.object);
      if (!s) continue;
      const action: MenuOption | null = using ? null : {
        verb: "Net", target: SPOT_INFO.name, kind: "npc", run: act(() => { this.flagWalkTo(s); this.send({ t: "spot", id: s.id }); }),
      };
      things.push({ distance: hit.distance, action, examine: { verb: "Examine", target: SPOT_INFO.name, kind: "npc", run: () => this.chat.game(SPOT_INFO.examine) } });
    }

    // Ground items: those whose model is under the cursor, then the rest of that tile's pile.
    const items: Array<{ g: GroundItem; distance: number }> = [];
    for (const hit of this.raycaster.intersectObjects(this.itemGroup.children, false)) {
      const g = this.ground.get(hit.object.userData.uid as number);
      if (g && !items.some((i) => i.g === g)) items.push({ g, distance: hit.distance });
    }
    if (tile) {
      for (const g of this.ground.values()) {
        if (g.view.x === tile.x && g.view.y === tile.y && !items.some((i) => i.g === g)) items.push({ g, distance: ground!.distance });
      }
    }
    for (const { g, distance } of items.slice(0, PILE_OPTIONS)) {
      const def = ITEM_BY_ID.get(g.view.id);
      if (!def) continue;
      const action: MenuOption | null = using ? null : {
        verb: "Take", target: def.name, kind: "item",
        run: act(() => { this.minimap.setFlag({ x: g.view.x, y: g.view.y }); this.send({ t: "take", uid: g.view.uid }); }),
      };
      things.push({ distance, action, examine: { verb: "Examine", target: def.name, kind: "item", run: () => this.chat.game(itemExamine(def, g.view.count)) } });
    }

    things.sort((a, b) => a.distance - b.distance);
    const out: MenuOption[] = things.flatMap((t) => (t.action ? [t.action] : []));
    if (tile && this.map.collision.inBounds(tile.x, tile.y)) {
      out.push({
        verb: "Walk here", target: "", run: () => {
          this.onWorldAction();
          this.hud.cross(clientX, clientY);
          this.minimap.setFlag(tile);
          this.send({ t: "walk", x: tile.x, y: tile.y });
        },
      });
    }
    out.push(...things.map((t) => t.examine));
    return out;
  }

  /** Puts the minimap flag where the walk up to a tile's object will end (the same search the server runs). */
  private flagWalkTo(t: { x: number; y: number }): void {
    const me = this.local;
    const end = me ? findPathTo(this.map.collision, me.tileX, me.tileY, { x: t.x, y: t.y, w: 1, h: 1 }).at(-1) : undefined;
    if (end) this.minimap.setFlag(end);
    else this.minimap.clearFlag();
  }

  private openMenu(clientX: number, clientY: number): void {
    const options = this.options(clientX, clientY);
    if (options.length) this.menu.show(clientX, clientY, options);
  }

  /** The tile under a screen point, or null when the point misses the ground. */
  pick(clientX: number, clientY: number): Tile | null {
    this.setPointer(clientX, clientY);
    this.raycaster.setFromCamera(this.pointer, this.view.camera);
    const hit = this.raycaster.intersectObject(this.terrain, false)[0];
    if (!hit) return null;
    const x = Math.floor(hit.point.x), y = Math.floor(-hit.point.z);
    return this.map.collision.inBounds(x, y) ? { x, y } : null;
  }

  /**
   * Renders one frame and returns it as a PNG data URL, for the self-test. With an orbit, the camera
   * looks at `target` from that yaw, pitch and distance; with null, it uses the normal game camera.
   */
  snapshot(orbit: { target: THREE.Vector3; yaw: number; pitch: number; distance: number } | null): string {
    const cam = this.view.camera;
    if (orbit) {
      const flat = Math.cos(orbit.pitch) * orbit.distance;
      cam.position.set(
        orbit.target.x - Math.sin(orbit.yaw) * flat,
        orbit.target.y + Math.sin(orbit.pitch) * orbit.distance,
        orbit.target.z + Math.cos(orbit.yaw) * flat,
      );
      cam.lookAt(orbit.target);
    }
    this.renderer.render(this.scene, cam);
    return this.renderer.domElement.toDataURL("image/png");
  }

  /** Screen position of a tile's centre (or, with `lift`, that far above it), for scripted clicks. */
  screenOf(tile: Tile, lift = 0): { x: number; y: number } {
    const p = new THREE.Vector3(tile.x + 0.5, 0, -(tile.y + 0.5));
    p.y = this.terrainHeight(p.x, -p.z) + lift;
    p.project(this.view.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  }

  private terrainHeight(fx: number, fy: number): number {
    this.raycaster.set(new THREE.Vector3(fx, 50, -fy), new THREE.Vector3(0, -1, 0));
    return this.raycaster.intersectObject(this.terrain, false)[0]?.point.y ?? 0;
  }

  private setPointer(clientX: number, clientY: number): void {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  }

  private hoverAt: { x: number; y: number } | null = null;

  private readonly frame = (now: number) => {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    for (const e of this.entities.values()) e.update(dt, this.map);
    this.spots.update(dt);
    this.effects.update(dt);
    const me = this.local;
    const focus = me ? me.model.root.position.clone().setY(me.model.root.position.y + 1) : this.spawnFocus;
    this.view.update(dt, focus);
    if (this.pointerInside && !this.menu.open) {
      const r = this.renderer.domElement.getBoundingClientRect();
      const x = ((this.pointer.x + 1) / 2) * r.width + r.left, y = ((1 - this.pointer.y) / 2) * r.height + r.top;
      if (this.frames % 3 === 0 || !this.hoverAt) {
        this.hud.setHover(hoverHtml(this.options(x, y)));
        this.hoverAt = { x, y };
      }
    }
    this.renderer.render(this.scene, this.view.camera);
    const size = this.renderer.domElement;
    this.overheads.update(this.view.camera, size.clientWidth, size.clientHeight, (id) => this.entities.get(id)?.model.root.position);
    if (me) {
      const others = [...this.entities.values()].filter((e) => e !== me).map((e) => ({ fx: e.fx, fy: e.fy }));
      this.minimap.draw(me.fx, me.fy, this.view.yaw, others);
    }
    this.frames++;
    requestAnimationFrame(this.frame);
  };
}
