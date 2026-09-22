import * as THREE from "three";
import type { WorldMap } from "../shared/map.ts";
import type { Tile } from "../shared/pathfind.ts";
import type { C2S, S2C } from "../shared/protocol.ts";
import { Entity } from "./entity.ts";
import type { Hud } from "./hud.ts";
import {
  FOG_COLOR, FOG_FAR, FOG_NEAR, GROUND_LIGHT, SKY_INTENSITY, SKY_LIGHT, SUN_COLOR, SUN_FROM, SUN_INTENSITY,
} from "./palette.ts";
import { OrbitCamera } from "./render/camera.ts";
import { buildObjects } from "./render/objects.ts";
import { buildTerrain } from "./render/terrain.ts";

type Welcome = Extract<S2C, { t: "welcome" }>;
type TickMsg = Extract<S2C, { t: "tick" }>;

/** The running world on this page: scene, entities, camera and input. */
export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly view: OrbitCamera;
  readonly entities = new Map<number, Entity>();
  readonly map: WorldMap;
  localId = -1;
  lastTick = 0;
  /** Frames drawn so far (the self-test reads it). */
  frames = 0;
  private readonly terrain: THREE.Mesh;
  private readonly send: (msg: C2S) => void;
  private readonly hud: Hud;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private pointerInside = false;
  private spawnFocus = new THREE.Vector3();
  private last = performance.now();

  constructor(container: HTMLElement, map: WorldMap, send: (msg: C2S) => void, hud: Hud) {
    this.map = map;
    this.send = send;
    this.hud = hud;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.append(this.renderer.domElement);
    const canvas = this.renderer.domElement;
    this.view = new OrbitCamera(canvas);

    this.scene.background = new THREE.Color(FOG_COLOR);
    this.scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);
    this.scene.add(new THREE.HemisphereLight(SKY_LIGHT, GROUND_LIGHT, SKY_INTENSITY));
    const sun = new THREE.DirectionalLight(SUN_COLOR, SUN_INTENSITY);
    sun.position.set(...SUN_FROM);
    this.scene.add(sun);
    this.terrain = buildTerrain(map);
    this.scene.add(this.terrain, buildObjects(map));

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
    canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const tile = this.pick(e.clientX, e.clientY);
      if (!tile) return;
      this.hud.cross(e.clientX, e.clientY);
      this.send({ t: "walk", x: tile.x, y: tile.y });
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    requestAnimationFrame(this.frame);
  }

  welcome(msg: Welcome): void {
    for (const e of this.entities.values()) this.scene.remove(e.model.root);
    this.entities.clear();
    this.localId = msg.id;
    this.lastTick = msg.tick;
    this.spawnFocus.set(msg.x + 0.5, 1, -(msg.y + 0.5));
    this.view.snap();
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
      } else if (u.steps) {
        e.addSteps(u.steps);
      } else {
        e.snapTo(u.x, u.y);
      }
    }
    for (const id of msg.gone ?? []) {
      const e = this.entities.get(id);
      if (e) this.scene.remove(e.model.root);
      this.entities.delete(id);
    }
  }

  get local(): Entity | undefined {
    return this.entities.get(this.localId);
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

  private readonly frame = (now: number) => {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    for (const e of this.entities.values()) e.update(dt, this.map);
    const me = this.local;
    const focus = me ? me.model.root.position.clone().setY(me.model.root.position.y + 1) : this.spawnFocus;
    this.view.update(dt, focus);
    if (this.pointerInside) {
      this.raycaster.setFromCamera(this.pointer, this.view.camera);
      this.hud.setHover(this.raycaster.intersectObject(this.terrain, false).length ? "Walk here" : null);
    }
    this.renderer.render(this.scene, this.view.camera);
    this.frames++;
    requestAnimationFrame(this.frame);
  };
}
