import * as THREE from "three";
import { RESOURCES } from "../shared/gathering.ts";
import { ITEM_BY_ID } from "../shared/items.ts";
import {
  climbable, heightAt, isTree, openable, planeOf, regionBox, regionId, regionOf, type MapObject, type Region, type WorldMap, type WorldStack,
} from "../shared/map.ts";
import { STATION_OF, STATION_VERB } from "../shared/stations.ts";
import { areaAt } from "../shared/oakridge.ts";
import { MONSTER_BY_KEY } from "../shared/monsters.ts";
import { findPathTo, type Tile } from "../shared/pathfind.ts";
import type { C2S, GroundItemView, S2C, SpotView } from "../shared/protocol.ts";
import type { Sound } from "./audio.ts";
import { Entity } from "./entity.ts";
import { Streamer } from "./streaming.ts";
import type { Hud } from "./hud.ts";
import { itemExamine, monsterInfo, objectInfo, SPOT_INFO } from "./info.ts";
import { ACTION_CROSS, FOG_COLOR, FOG_FAR, FOG_NEAR, GROUND_LIGHT, SKY_INTENSITY, SKY_LIGHT, SUN_COLOR, SUN_FROM, SUN_INTENSITY } from "./palette.ts";
import { OrbitCamera } from "./render/camera.ts";
import { Effects } from "./render/effects.ts";
import { Flames } from "./render/flames.ts";
import { buildGrass } from "./render/grass.ts";
import { groundGeometry, itemMaterial } from "./render/items.ts";
import { buildObjects, type WorldObjects } from "./render/objects.ts";
import { onMapLayer, Overhead } from "./render/overhead.ts";
import { Roofs } from "./render/roofs.ts";
import { Sky } from "./render/sky.ts";
import { MapPictures, temporaryScene } from "./ui/mappictures.ts";
import { WorldMapScreen } from "./ui/worldmap.ts";
import type { ActionName } from "./render/poses.ts";
import { FishingSpots } from "./render/spots.ts";
import { buildTerrain } from "./render/terrain.ts";
import type { Chatbox } from "./ui/chatbox.ts";
import { hoverHtml, type ContextMenu, type MenuOption } from "./ui/menu.ts";
import { Minimap, type Other } from "./ui/minimap.ts";
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

/** Whether `object` is `root` or hangs somewhere under it. */
function isInside(object: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = object; o; o = o.parent) if (o === root) return true;
  return false;
}

/** The running world on this page: scene, entities, camera, minimap and input. */
export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly view: OrbitCamera;
  readonly entities = new Map<number, Entity>();
  /** Every plane of the world; only the one the player stands on is ever drawn. */
  readonly stack: WorldStack;
  /** The plane being drawn, and its map. */
  plane = 0;
  map: WorldMap;
  /** Every object of the drawn plane by its id, including any the world added later (a lit fire). */
  private objectById = new Map<number, MapObject>();
  minimap: Minimap;
  /** The world from above, and the region pictures the radar and the world map draw from. */
  private readonly overhead: Overhead;
  readonly pictures: MapPictures;
  localId = -1;
  lastTick = 0;
  /** Frames drawn so far, and how often the view's container changed size (the self-test reads them). */
  frames = 0;
  resizes = 0;

  /** Called before any click in the world acts: a pending inventory "Use" is let go. */
  onWorldAction: () => void = () => {};
  /** The inventory item chosen with "Use", waiting to be used on something in the world. */
  usingItem: () => { slot: number; name: string } | null = () => null;
  /** Map objects that have run out (felled trees, mined-out rocks), by id. */
  readonly depleted = new Set<number>();
  spots: FishingSpots;
  /** The regions built around the player, each with its own ground mesh and its grass (Phase 12, region streaming; Phase 15). */
  private readonly regions = new Map<number, { region: Region; terrain: THREE.Mesh; grass: THREE.InstancedMesh | null }>();
  /** The flames on every fire, forge and range among the objects up (Phase 15). */
  private readonly flames = new Flames();
  /** The rule for which regions are up; its counts are what the self-test reads. */
  readonly streamer: Streamer;
  /** The ground meshes up right now, for picking. */
  private terrains: THREE.Mesh[] = [];
  /** The objects over the built regions, instanced once over all of them: instancing per region would multiply the draw calls. */
  private objects: WorldObjects;
  /** The buildings' roofs over the built regions, which lift away when the player steps under one. */
  private roofs: Roofs;
  /** Whether the built regions changed since the objects and roofs were last made over them. */
  private sceneStale = false;
  /** How many times the objects and roofs were made again (the self-test reads it). */
  rebuilds = 0;
  /** The world map, which draws the same map data from above. */
  readonly worldmap = new WorldMapScreen();
  /** Objects the world added after the map was built (fires), by plane, so a rebuild keeps them. */
  private readonly extras = new Map<number, MapObject[]>();
  /** One-off effects such as level-up fireworks. */
  readonly effects = new Effects();
  readonly sound: Sound;
  private readonly send: (msg: C2S) => void;
  private readonly hud: Hud;
  private readonly chat: Chatbox;
  private readonly menu: ContextMenu;
  private readonly itemGroup = new THREE.Group();
  private readonly ground = new Map<number, GroundItem>();
  private readonly overheads = new Overheads();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly hemi: THREE.HemisphereLight;
  private readonly sun: THREE.DirectionalLight;
  /** The sky over the world: the hour, the weather, the lights and the fog that follow them (PLAN Phase 16). */
  readonly sky: Sky;
  private pointerInside = false;
  private spawnFocus = new THREE.Vector3();
  private last = performance.now();

  constructor(container: HTMLElement, stack: WorldStack, send: (msg: C2S) => void, hud: Hud, chat: Chatbox, menu: ContextMenu, sound: Sound) {
    this.stack = stack;
    this.plane = stack.spawn.plane;
    const map = planeOf(stack, this.plane);
    this.map = map;
    this.send = send;
    this.sound = sound;
    this.hud = hud;
    this.chat = chat;
    this.menu = menu;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.append(this.renderer.domElement);
    const canvas = this.renderer.domElement;
    this.view = new OrbitCamera(canvas);

    this.scene.background = new THREE.Color(FOG_COLOR);
    const fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);
    this.scene.fog = fog;
    this.hemi = new THREE.HemisphereLight(SKY_LIGHT, GROUND_LIGHT, SKY_INTENSITY);
    this.sun = new THREE.DirectionalLight(SUN_COLOR, SUN_INTENSITY);
    this.sun.position.set(...SUN_FROM);
    this.scene.add(this.hemi, this.sun);
    // The lights shine on the map layer too, or a picture from above would come out black.
    onMapLayer(this.hemi);
    onMapLayer(this.sun);
    // The sky drives the lights and the fog from here on; its dome and rain stay off the map layer.
    this.sky = new Sky(this.scene, this.hemi, this.sun, fog);
    this.sky.onRain = (level) => this.sound.rain(level);
    this.sky.onThunder = (loudness) => this.sound.thunder(loudness);
    this.scene.add(this.sky.group);
    this.overhead = new Overhead(this.renderer, this.scene);
    this.pictures = new MapPictures(this.overhead, map, {
      // A region that is up is already in the scene; any other is built for the picture and freed.
      extrasFor: (region) => (this.regions.has(regionId(region.rx, region.ry)) ? null : temporaryScene(this.map, region)),
      // A picture is taken under plain noon light whatever the hour, or the radar would go dark at night.
      before: () => { this.roofs.reveal(); this.sky.lightForPicture(); },
      after: () => {
        const me = this.local;
        if (me) this.roofs.setViewer(me.tileX, me.tileY);
      },
    });
    this.streamer = new Streamer({
      built: (rx, ry) => this.map.regions.get(regionId(rx, ry))?.built === true,
      load: (rx, ry) => this.loadRegion(rx, ry),
      unload: (rx, ry) => this.unloadRegion(rx, ry),
    });
    // Nothing is built until the world says where the player is: `welcome` brings up the regions there.
    this.objects = buildObjects(map, []);
    this.spots = new FishingSpots(map);
    this.roofs = new Roofs(map, []);
    this.indexObjects();
    this.worldmap.setMap(map, this.pictures);
    this.scene.add(this.objects.group, this.spots.group, this.roofs.group, this.itemGroup, this.flames.group);

    this.minimap = new Minimap(map, this.pictures);
    this.minimap.onWalk = (tile) => this.send({ t: "walk", x: tile.x, y: tile.y });
    this.minimap.onNorth = () => { this.view.yaw = 0; };

    const resize = () => {
      const w = container.clientWidth, h = container.clientHeight;
      this.renderer.setSize(w, h);
      this.view.resize(w, h);
    };
    new ResizeObserver(() => {
      this.resizes++;
      resize();
    }).observe(container);
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
    this.sky.brightness = s.brightness;
  }

  welcome(msg: Welcome): void {
    for (const e of this.entities.values()) this.drop(e);
    this.entities.clear();
    // The server sends everything in view again after a (re)join.
    this.itemGroup.clear();
    this.ground.clear();
    this.localId = msg.id;
    this.lastTick = msg.tick;
    this.sky.syncClock(msg.now);
    this.setPlane(msg.plane, msg.x, msg.y);
    this.spawnFocus.set(msg.x + 0.5, 1, -(msg.y + 0.5));
    this.view.snap();
    this.minimap.clearFlag();
  }

  /**
   * A stair or a ladder has put the player on another plane. A plane is a whole separate scene, so
   * everything drawn from the map is thrown away and built again; the server re-sends the entities,
   * the ground items and the world view straight after, because it dropped what this client knew.
   */
  setPlane(plane: number, x: number, y: number): void {
    // Already here, and near: only the spawn focus needs moving. A landing on the same plane but in a
    // region that is not up (the ferry's far shore) is a whole new scene, and is built like one.
    const near = this.regions.has(regionId(regionOf(x), regionOf(y)));
    if (plane === this.plane && this.regions.size > 0 && this.map === planeOf(this.stack, plane) && near) {
      this.spawnFocus.set(x + 0.5, 1, -(y + 0.5));
      return;
    }
    this.plane = plane;
    this.map = planeOf(this.stack, plane);
    this.pictures.setMap(this.map);
    // Anything this plane gained since the map was built (a fire someone lit) goes back on it.
    const extras = this.extras.get(plane) ?? [];
    const known = new Set(this.map.objects.map((o) => o.id));
    for (const o of extras) if (!known.has(o.id)) this.map.objects.push(o);

    for (const e of this.entities.values()) this.drop(e);
    this.entities.clear();
    this.itemGroup.clear();
    this.ground.clear();
    this.depleted.clear();
    this.openDoors.clear();

    for (const id of [...this.regions.keys()]) this.unloadRegion(Math.floor(id / 256), id % 256);
    this.streamer.clear();
    this.scene.remove(this.spots.group);
    this.spots = new FishingSpots(this.map);
    this.scene.add(this.spots.group);
    this.indexObjects();
    // Everything near the arrival point comes up at once: nothing is on screen yet to keep smooth.
    this.stream(x, y, Infinity);
    this.roofs.setViewer(x, y);

    this.minimap.setMap(this.map);
    this.worldmap.setMap(this.map, this.pictures);
    this.minimap.arrived(x, y);
    this.spawnFocus.set(x + 0.5, 1, -(y + 0.5));
    this.view.snap();
  }

  /** Where the camera looks: the player's chest, or the spawn until the player is in. */
  private focusPoint(): THREE.Vector3 {
    const me = this.local;
    return me ? me.model.root.position.clone().setY(me.model.root.position.y + 1) : this.spawnFocus;
  }

  /** Draws the sky for this moment now, outside the frame loop: what a check does before a snapshot. */
  drawSkyNow(): void {
    this.sky.update(0, this.view.camera.position, this.focusPoint(), this.plane);
  }

  /** Brings a region up: its ground now, its objects and roofs with the next `rebuildScene`. */
  private loadRegion(rx: number, ry: number): void {
    const region = this.map.regions.get(regionId(rx, ry));
    if (!region?.built) return;
    const terrain = buildTerrain(this.map, regionBox(region));
    onMapLayer(terrain);
    // The region's grass comes up with its ground; the tufts stay off the map layer, which is for what the map draws.
    const grass = buildGrass(this.map, regionBox(region));
    this.regions.set(regionId(rx, ry), { region, terrain, grass });
    this.scene.add(terrain);
    if (grass) this.scene.add(grass);
    this.terrains = [...this.regions.values()].map((r) => r.terrain);
    this.sceneStale = true;
  }

  private unloadRegion(rx: number, ry: number): void {
    const id = regionId(rx, ry), up = this.regions.get(id);
    if (!up) return;
    this.scene.remove(up.terrain);
    up.terrain.geometry.dispose();
    if (up.grass) {
      this.scene.remove(up.grass);
      up.grass.dispose();
    }
    this.regions.delete(id);
    this.terrains = [...this.regions.values()].map((r) => r.terrain);
    this.sceneStale = true;
  }

  /**
   * Keeps the built regions following the player: one region's ground a frame, then the objects and
   * roofs made once over all of them when nothing near is still missing, so a crossing never lands its
   * whole cost on one frame.
   */
  private stream(x: number, y: number, budget = 1): void {
    this.streamer.step(x, y, budget);
    if (this.sceneStale && !this.streamer.pending(x, y)) this.rebuildScene();
  }

  /**
   * The objects and roofs over the regions that are up, made again: after a region came or went, or
   * after something was added to or taken off this plane.
   */
  private rebuildScene(): void {
    this.scene.remove(this.objects.group, this.roofs.group);
    this.objects.dispose();
    this.roofs.dispose();
    const up = (o: MapObject) => this.regions.has(regionId(regionOf(o.x), regionOf(o.y)));
    this.objects = buildObjects(this.map, this.map.objects.filter(up));
    this.roofs = new Roofs(this.map, [...this.regions.values()].map((r) => regionBox(r.region)));
    onMapLayer(this.objects.group);
    onMapLayer(this.roofs.group);
    this.indexObjects();
    this.scene.add(this.objects.group, this.roofs.group);
    this.flames.set(this.map, this.map.objects.filter(up));
    for (const id of this.depleted) {
      const o = this.objectById.get(id);
      if (o) this.objects.setDepleted(o, true);
    }
    for (const id of this.openDoors) {
      const o = this.objectById.get(id);
      if (o) this.objects.setOpen(o, true);
    }
    const me = this.local;
    if (me) this.roofs.setViewer(me.tileX, me.tileY);
    this.sceneStale = false;
    this.rebuilds++;
  }

  /** How many regions are up (the self-test reads it). */
  get regionsUp(): number {
    return this.regions.size;
  }

  /** How many tufts of grass stand over the regions up, and how many tongues of flame burn (the self-test reads them). */
  get grassCount(): number {
    let n = 0;
    for (const r of this.regions.values()) n += (r.grass?.userData.tufts as number | undefined) ?? 0;
    return n;
  }

  get flameCount(): number {
    return this.flames.count;
  }

  /** Doors and gates standing open, by object id. */
  private readonly openDoors = new Set<number>();

  /** The part of the district the player was last in, so a border is only crossed once. */
  private area = "";

  /** Tells the music which part of the world this is, the first frame after the player enters it. */
  private enteredArea(x: number, y: number): void {
    const now = areaAt(x, y, this.plane);
    if (now.key === this.area) return;
    this.area = now.key;
    this.sound.music.setArea(now.track);
  }

  /** What the district calls the ground the player is standing on, for the self-test and the plan. */
  get areaName(): string {
    return areaAt(Math.floor(this.local?.fx ?? 0), Math.floor(this.local?.fy ?? 0), this.plane).name;
  }

  private setDoorOpen(id: number, open: boolean): void {
    const o = this.objectById.get(id);
    if (!o) return;
    if (open) this.openDoors.add(id);
    else this.openDoors.delete(id);
    this.objects.setOpen(o, open);
    this.pictures.invalidate(o.x, o.y);
    // The client's own collision map has to follow, or the walk it works out for the minimap flag
    // still thinks the doorway is a wall — and every route it draws through a village is wrong.
    if (open) this.map.collision.removeWall(o.x, o.y, o.side);
    else this.map.collision.addWall(o.x, o.y, o.side);
  }

  private setOpenDoors(open: Set<number>): void {
    for (const id of [...this.openDoors]) if (!open.has(id)) this.setDoorOpen(id, false);
    for (const id of open) this.setDoorOpen(id, true);
  }

  /**
   * On entering the world, and again on every plane change: which objects have run out, which doors
   * stand open, what the world has added since the map was built, and where the fishing spots are.
   */
  worldState(depleted: number[], spots: SpotView[], opened: number[] = [], added: MapObject[] = []): void {
    const here = added.filter((o) => o.plane === this.plane);
    const known = new Set(this.map.objects.map((o) => o.id));
    const fresh = here.filter((o) => !known.has(o.id));
    if (fresh.length > 0) {
      this.extras.set(this.plane, [...(this.extras.get(this.plane) ?? []), ...fresh]);
      this.map.objects.push(...fresh);
      for (const o of fresh) this.pictures.invalidate(o.x, o.y);
      this.rebuildScene();
    }
    const now = new Set(depleted);
    for (const id of [...this.depleted]) if (!now.has(id)) this.setDepleted(id, false);
    for (const id of now) this.setDepleted(id, true);
    this.setOpenDoors(new Set(opened));
    this.spots.set(spots);
  }

  /** Every object of the drawn plane, by id: what an `objs` or `opens` change looks itself up in. */
  private indexObjects(): void {
    this.objectById = new Map(this.map.objects.map((o) => [o.id, o]));
  }

  private setDepleted(id: number, out: boolean): void {
    const o = this.objectById.get(id);
    if (!o) return;
    if (out) this.depleted.add(id);
    else this.depleted.delete(id);
    this.objects.setDepleted(o, out);
    this.pictures.invalidate(o.x, o.y);
  }

  /** Everyone else in view, as the radar and the map draw them. */
  private othersOf(me: Entity): Other[] {
    return [...this.entities.values()].filter((e) => e !== me).map((e) => ({ fx: e.fx, fy: e.fy, npc: e.npc !== null }));
  }

  applyTick(msg: TickMsg): void {
    this.lastTick = msg.n;
    this.hud.setOnline(msg.online);
    for (const u of msg.ents) {
      let e = this.entities.get(u.id);
      if (!e) {
        // A player needs a look; a creature needs its kind. Either way the name comes with the first sighting.
        if (u.name === undefined || (u.npc === undefined && u.look === undefined)) continue;
        e = new Entity(u.id, u.name, u.look ?? [], u.gear ?? [], u.x, u.y, u.npc ?? null);
        e.onImpact = (action) => this.heard(e!, action);
        this.entities.set(u.id, e);
        this.scene.add(e.model.root);
      } else {
        const restyled = e.npc === null && (u.look !== undefined || u.gear !== undefined);
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
      if (u.swing) e.swing();
      // An arrow or a bolt on its way (PLAN Phase 11): drawn crossing to whatever it was shot at.
      if (u.shot) {
        const target = this.entities.get(u.shot.to);
        if (target) this.effects.shot(e.model.root, target.model.root, u.shot.kind, Math.max(0.55, target.model.height) * 0.6);
      }
      const knewHp = e.hp !== null;
      if (u.hp) e.hp = u.hp;
      // The bar comes up for anything taking blows, hurt or not, and for anything already wounded when
      // its health changes. It never comes up merely because something walked into view whole.
      if (e.hp && (u.hits?.length || (knewHp && u.hp && u.hp[0] < u.hp[1]))) this.overheads.setHealth(u.id, e.hp[0], e.hp[1]);
      for (const damage of u.hits ?? []) {
        this.overheads.hit(u.id, damage);
        if (damage > 0) this.hurt(e);
      }
      if (u.dead === 1) e.die();
      else if (u.dead === 0) e.rise();
      if (u.fx === "levelup") {
        this.effects.levelUp(e.model.root);
        if (u.id === this.localId) this.sound.levelUp();
      }
    }
    // Objects the world added or took away: a fire lit, a fire burnt out.
    if (msg.added?.some((o) => o.plane === this.plane) || msg.removed?.length) {
      const removed = new Set(msg.removed ?? []);
      const fresh = (msg.added ?? []).filter((o) => o.plane === this.plane && !this.objectById.has(o.id));
      const kept = this.map.objects.filter((o) => !removed.has(o.id));
      if (fresh.length > 0 || kept.length !== this.map.objects.length) {
        for (const o of [...fresh, ...this.map.objects.filter((o) => removed.has(o.id))]) this.pictures.invalidate(o.x, o.y);
        this.map.objects.length = 0;
        this.map.objects.push(...kept, ...fresh);
        this.extras.set(this.plane, [...(this.extras.get(this.plane) ?? []).filter((o) => !removed.has(o.id)), ...fresh]);
        this.rebuildScene();
      }
    }
    for (const [id, out] of msg.objs ?? []) {
      this.setDepleted(id, out === 1);
      // A tree coming down is heard by everyone near it.
      const o = this.objectById.get(id), me = this.local;
      if (out === 1 && me && o && isTree(o.kind)) this.sound.area("fell", Math.hypot(o.x + 0.5 - me.fx, o.y + 0.5 - me.fy));
    }
    if (msg.opens) for (const [id, open] of msg.opens) this.setDoorOpen(id, open === 1);
    for (const s of msg.spots ?? []) this.spots.move(s);
    for (const id of msg.gone ?? []) {
      const e = this.entities.get(id);
      if (e) this.drop(e);
      this.entities.delete(id);
      this.overheads.forget(id);
    }
    if (msg.items) {
      // Gone first: a stack that grew arrives as its old pile gone and a new one added.
      for (const uid of msg.items.gone ?? []) this.removeGroundItem(uid);
      for (const view of msg.items.add ?? []) this.addGroundItem(view);
    }
    const me = this.local;
    if (me) {
      this.minimap.arrived(me.tileX, me.tileY);
      this.roofs.setViewer(me.tileX, me.tileY);
      this.worldmap.setViewer({ x: me.tileX, y: me.tileY }, this.othersOf(me));
    }
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
    const ground = this.raycaster.intersectObjects(this.terrains, false)[0];
    const tile = ground ? { x: Math.floor(ground.point.x), y: Math.floor(-ground.point.z) } : null;
    const using = this.usingItem();
    /** A click that acts on something: lets go of the chosen item and marks the spot with the red cross. */
    const act = (then: () => void) => () => {
      this.onWorldAction();
      this.hud.cross(clientX, clientY, ACTION_CROSS);
      then();
    };
    const things: Array<{ distance: number; action: MenuOption | null; more?: MenuOption[]; examine?: MenuOption; entity?: Entity }> = [];

    const seen = new Set<MapObject>();
    for (const hit of this.raycaster.intersectObjects(this.objects.group.children, false)) {
      const list = (hit.object.userData as { items?: MapObject[] }).items;
      const o = hit.instanceId !== undefined ? list?.[hit.instanceId] : undefined;
      if (!o || seen.has(o)) continue;
      seen.add(o);
      const out = this.depleted.has(o.id), info = objectInfo(o.kind, out, o.tag), def = RESOURCES[o.kind];
      let action: MenuOption | null = null;
      if (using) {
        action = {
          verb: "Use", target: `${using.name} -> ${info.name}`, kind: "object",
          run: act(() => { this.flagWalkTo(o); this.send({ t: "use_object", slot: using.slot, id: o.id }); }),
        };
      } else {
        // Whatever the object's own first option is: gather it, open it, climb it, or work at it.
        const verb = this.verbFor(o, out);
        if (verb) {
          action = { verb, target: info.name, kind: "object", run: act(() => { this.flagWalkTo(o); this.send({ t: "object", id: o.id }); }) };
        }
      }
      things.push({ distance: hit.distance, action, examine: { verb: "Examine", target: info.name, kind: "object", run: () => this.chat.game(info.examine) } });
    }

    // Creatures: the nearest part of one under the cursor offers a fight, and says what it is.
    const creatures = [...this.entities.values()].filter((e) => e.npc !== null && !e.dying);
    for (const hit of this.raycaster.intersectObjects(creatures.map((e) => e.model.root), true)) {
      const e = creatures.find((c) => isInside(hit.object, c.model.root));
      if (!e || things.some((t) => t.entity === e)) continue;
      const info = monsterInfo(e.npc!);
      const def = MONSTER_BY_KEY.get(e.npc!);
      // A person of the village is talked to, never swung at (PLAN §7.4).
      const action: MenuOption | null = using ? null : def?.person
        ? {
          verb: "Talk-to", target: info.name, kind: "npc",
          run: act(() => { this.flagWalkTo({ x: e.tileX, y: e.tileY }); this.send({ t: "talk", id: e.id }); }),
        }
        : {
          verb: "Attack", target: `${info.name} (level ${info.level})`, kind: "npc",
          run: act(() => { this.flagWalkTo({ x: e.tileX, y: e.tileY }); this.send({ t: "attack", id: e.id }); }),
        };
      const more: MenuOption[] = [];
      if (def?.shop) {
        more.push({
          verb: "Trade", target: info.name, kind: "npc",
          run: act(() => { this.flagWalkTo({ x: e.tileX, y: e.tileY }); this.send({ t: "talk", id: e.id }); }),
        });
      }
      things.push({
        distance: hit.distance, entity: e, action, more,
        examine: { verb: "Examine", target: info.name, kind: "npc", run: () => this.chat.game(info.examine) },
      });
    }

    // Other players (PLAN Phase 10): followed, or traded with. They have nothing to examine.
    const others = [...this.entities.values()].filter((e) => e.npc === null && e.id !== this.localId && !e.dying);
    for (const hit of this.raycaster.intersectObjects(others.map((e) => e.model.root), true)) {
      const e = others.find((o) => isInside(hit.object, o.model.root));
      if (!e || things.some((t) => t.entity === e)) continue;
      things.push({
        distance: hit.distance, entity: e,
        action: using ? null : { verb: "Follow", target: e.name, kind: "player", run: act(() => this.send({ t: "follow", id: e.id })) },
        more: [{ verb: "Trade with", target: e.name, kind: "player", run: act(() => { this.flagWalkTo({ x: e.tileX, y: e.tileY }); this.send({ t: "trade", id: e.id }); }) }],
      });
    }

    for (const hit of this.raycaster.intersectObjects(this.spots.pickables, false)) {
      const s = this.spots.spotOf(hit.object);
      if (!s) continue;
      const info = SPOT_INFO[s.method];
      const action: MenuOption | null = using ? null : {
        verb: info.verb, target: info.name, kind: "npc", run: act(() => { this.flagWalkTo(s); this.send({ t: "spot", id: s.id }); }),
      };
      things.push({ distance: hit.distance, action, examine: { verb: "Examine", target: info.name, kind: "npc", run: () => this.chat.game(info.examine) } });
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
    const out: MenuOption[] = things.flatMap((t) => [...(t.action ? [t.action] : []), ...(t.more ?? [])]);
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
    out.push(...things.flatMap((t) => (t.examine ? [t.examine] : [])));
    return out;
  }

  /**
   * The verb an object's own first option carries. Gathering objects take their method's verb; a door
   * says Open or Close depending on how it stands; a stair says which way it goes; a workbench says
   * what it is for. Anything with no option of its own gets none, and only Examine is offered.
   */
  private verbFor(o: MapObject, depleted: boolean): string | null {
    if (openable(o.kind)) return this.openDoors.has(o.id) ? "Close" : "Open";
    if (o.kind === "adit") return "Enter";
    if (climbable(o.kind)) return (o.to ?? o.plane) > o.plane ? "Climb-up" : "Climb-down";
    if (o.kind === "chest") return depleted ? null : "Search";
    const station = STATION_OF[o.kind];
    if (station) return STATION_VERB[station];
    const def = RESOURCES[o.kind];
    return def && !depleted ? def.verb : null;
  }

  /** A character landed its tool or its blow: your own is an effect, anyone else's an area sound. */
  private heard(e: Entity, action: ActionName): void {
    // Standing on guard makes no noise; every other action lands on something, and all four ways of
    // fishing break the water.
    const name = ({
      net: "splash", angle: "splash", trap: "splash", harpoon: "splash", strike: "hit", chop: "chop", mine: "mine",
      make: "hit", guard: null,
    } as const)[action];
    if (!name) return;
    const me = this.local;
    if (e.id === this.localId) this.sound.effect(name);
    else if (me) this.sound.area(name, Math.hypot(e.fx - me.fx, e.fy - me.fy));
  }

  /** Someone nearby took a blow: heard from where they stand, and from yourself as your own. */
  private hurt(e: Entity): void {
    if (e.npc !== null || e.id === this.localId) return;
    const me = this.local;
    if (me) this.sound.area("hurt", Math.hypot(e.fx - me.fx, e.fy - me.fy));
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
  /**
   * Sends what a click on something would have sent. The self-test uses it to reach what the camera
   * cannot see — a bank booth is inside a building, and the roof and the walls are between — while
   * every check that CAN be aimed at still goes through a real click on the real canvas.
   */
  tell(msg: C2S): void {
    this.send(msg);
  }

  /** The map object the cursor is over, if any: the same pick the menu makes, without the menu. */
  objectUnder(clientX: number, clientY: number): MapObject | null {
    this.setPointer(clientX, clientY);
    this.raycaster.setFromCamera(this.pointer, this.view.camera);
    for (const hit of this.raycaster.intersectObjects(this.objects.group.children, false)) {
      const list = (hit.object.userData as { items?: MapObject[] }).items;
      const o = hit.instanceId !== undefined ? list?.[hit.instanceId] : undefined;
      if (o) return o;
    }
    return null;
  }

  pick(clientX: number, clientY: number): Tile | null {
    this.setPointer(clientX, clientY);
    this.raycaster.setFromCamera(this.pointer, this.view.camera);
    const hit = this.raycaster.intersectObjects(this.terrains, false)[0];
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
    return this.raycaster.intersectObjects(this.terrains, false)[0]?.point.y ?? 0;
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
    this.flames.update(dt);
    const me = this.local;
    // The roof lifts as the player crosses the threshold, not a tick later, and the part of the world
    // they are standing in decides what is playing (PLAN Phase 7 / Phase 13).
    if (me) {
      this.stream(Math.floor(me.fx), Math.floor(me.fy));
      this.roofs.setViewer(Math.floor(me.fx), Math.floor(me.fy));
      this.enteredArea(Math.floor(me.fx), Math.floor(me.fy));
    }
    const focus = this.focusPoint();
    this.view.update(dt, focus);
    // The sky for this moment: the dome round the camera, the rain round the player, the lights and the fog.
    this.sky.update(dt, this.view.camera.position, focus, this.plane);
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
    this.overheads.update(this.view.camera, size.clientWidth, size.clientHeight, (id) => {
      const e = this.entities.get(id);
      return e ? { feet: e.model.root.position, height: e.overhead } : undefined;
    });
    if (me) this.minimap.draw(me.fx, me.fy, this.view.yaw, this.othersOf(me));
    this.frames++;
    requestAnimationFrame(this.frame);
  };
}
