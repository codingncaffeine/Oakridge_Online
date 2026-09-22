import * as THREE from "three";
import type { MapObject, WorldMap } from "../shared/map.ts";
import type { Tile } from "../shared/pathfind.ts";
import type { C2S, S2C } from "../shared/protocol.ts";
import { Entity } from "./entity.ts";
import type { Hud } from "./hud.ts";
import { OBJECT_INFO } from "./info.ts";
import {
  FOG_COLOR, FOG_FAR, FOG_NEAR, GROUND_LIGHT, SKY_INTENSITY, SKY_LIGHT, SUN_COLOR, SUN_FROM, SUN_INTENSITY,
} from "./palette.ts";
import { OrbitCamera } from "./render/camera.ts";
import { CharacterModel } from "./render/character.ts";
import { buildObjects } from "./render/objects.ts";
import { buildTerrain } from "./render/terrain.ts";
import type { Chatbox } from "./ui/chatbox.ts";
import { ContextMenu, hoverHtml, type MenuOption } from "./ui/menu.ts";
import { Minimap } from "./ui/minimap.ts";
import { Overheads } from "./ui/overheads.ts";
import type { Settings } from "./ui/panel.ts";

type Welcome = Extract<S2C, { t: "welcome" }>;
type TickMsg = Extract<S2C, { t: "tick" }>;

const LONG_PRESS_MS = 500;

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
  private readonly terrain: THREE.Mesh;
  private readonly objects: THREE.Group;
  private readonly send: (msg: C2S) => void;
  private readonly hud: Hud;
  private readonly chat: Chatbox;
  private readonly menu = new ContextMenu();
  private readonly overheads = new Overheads();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly sky: THREE.HemisphereLight;
  private readonly sun: THREE.DirectionalLight;
  private pointerInside = false;
  private spawnFocus = new THREE.Vector3();
  private last = performance.now();

  constructor(container: HTMLElement, map: WorldMap, send: (msg: C2S) => void, hud: Hud, chat: Chatbox) {
    this.map = map;
    this.send = send;
    this.hud = hud;
    this.chat = chat;
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
    this.scene.add(this.terrain, this.objects);

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
    this.localId = msg.id;
    this.lastTick = msg.tick;
    this.spawnFocus.set(msg.x + 0.5, 1, -(msg.y + 0.5));
    this.view.snap();
    this.minimap.clearFlag();
  }

  applyTick(msg: TickMsg): void {
    this.lastTick = msg.n;
    this.hud.setOnline(msg.online);
    for (const u of msg.ents) {
      let e = this.entities.get(u.id);
      if (!e) {
        if (u.name === undefined || u.look === undefined) continue;
        e = new Entity(u.id, u.name, u.look, u.x, u.y);
        this.entities.set(u.id, e);
        this.scene.add(e.model.root);
        continue;
      }
      if (u.look) {
        // A new look: swap the model, keeping where it stands and faces.
        const old = e.model;
        e.model = new CharacterModel(u.look);
        e.model.root.position.copy(old.root.position);
        e.model.root.rotation.copy(old.root.rotation);
        this.scene.remove(old.root);
        old.dispose();
        this.scene.add(e.model.root);
      }
      if (u.steps) e.addSteps(u.steps);
      else if (!u.look) e.snapTo(u.x, u.y);
    }
    for (const id of msg.gone ?? []) {
      const e = this.entities.get(id);
      if (e) this.drop(e);
      this.entities.delete(id);
    }
    const me = this.local;
    if (me) this.minimap.arrived(me.tileX, me.tileY);
  }

  /** Public chat: overhead text on the speaker and a line in the chatbox. */
  said(id: number, name: string, text: string): void {
    this.overheads.say(id, text);
    this.chat.said(name, text);
  }

  private drop(e: Entity): void {
    this.scene.remove(e.model.root);
    e.model.dispose();
  }

  get local(): Entity | undefined {
    return this.entities.get(this.localId);
  }

  /** Everything the cursor could act on at a screen point, default first: walk, then examine each thing hit. */
  options(clientX: number, clientY: number): MenuOption[] {
    this.setPointer(clientX, clientY);
    this.raycaster.setFromCamera(this.pointer, this.view.camera);
    const out: MenuOption[] = [];
    const ground = this.raycaster.intersectObject(this.terrain, false)[0];
    const tile = ground ? { x: Math.floor(ground.point.x), y: Math.floor(-ground.point.z) } : null;
    if (tile && this.map.collision.inBounds(tile.x, tile.y)) {
      out.push({
        verb: "Walk here", target: "", run: () => {
          this.hud.cross(clientX, clientY);
          this.minimap.setFlag(tile);
          this.send({ t: "walk", x: tile.x, y: tile.y });
        },
      });
    }
    const seen = new Set<MapObject>();
    for (const hit of this.raycaster.intersectObjects(this.objects.children, false)) {
      const items = (hit.object.userData as { items?: MapObject[] }).items;
      const o = hit.instanceId !== undefined ? items?.[hit.instanceId] : undefined;
      if (!o || seen.has(o)) continue;
      seen.add(o);
      const info = OBJECT_INFO[o.kind];
      out.push({ verb: "Examine", target: info.name, kind: "object", run: () => this.chat.game(info.examine) });
    }
    return out;
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

  /** Screen position of a tile's centre, for scripted clicks. */
  screenOf(tile: Tile): { x: number; y: number } {
    const p = new THREE.Vector3(tile.x + 0.5, 0, -(tile.y + 0.5));
    p.y = this.terrainHeight(p.x, -p.z);
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
