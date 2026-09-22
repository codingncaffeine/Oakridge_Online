import * as THREE from "three";
import { heightAt, OVERLAY_WATER, type WorldMap } from "../../shared/map.ts";
import type { SpotView } from "../../shared/protocol.ts";

/** Rings spreading from each spot at once, and seconds for one ring to spread and fade. */
const RINGS = 3;
const RING_PERIOD = 2.2;
const BUBBLES = 7;
/** How far (tiles) a spot's ripples sit off its tile's middle, away from the bank. */
const SHORE_NUDGE = 0.25;

const ringGeometry = new THREE.RingGeometry(0.72, 1, 32).rotateX(-Math.PI / 2);
const bubbleGeometry = new THREE.SphereGeometry(0.036, 6, 4);
const bubbleMaterial = new THREE.MeshBasicMaterial({ color: 0xf4fbff, transparent: true, opacity: 0.9 });
/** Churned water at the middle of a spot: a pale patch that swells and settles. */
const foamGeometry = new THREE.CircleGeometry(0.16, 16).rotateX(-Math.PI / 2);
/** The part the cursor picks: a disc over the tile, never drawn. */
const pickGeometry = new THREE.CircleGeometry(0.5, 12).rotateX(-Math.PI / 2);
const pickMaterial = new THREE.MeshBasicMaterial({ visible: false });

interface Shown {
  view: SpotView;
  root: THREE.Group;
  rings: Array<THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>>;
  bubbles: THREE.Mesh[];
  foam: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  seed: number;
}

/**
 * Fishing spots on the water: rings spreading out one after another, and small bubbles breaking the
 * surface, so a spot shows from a distance. Each sits over an unseen disc the cursor can pick.
 */
export class FishingSpots {
  readonly group = new THREE.Group();
  private readonly map: WorldMap;
  private readonly shown = new Map<number, Shown>();
  private time = 0;

  constructor(map: WorldMap) {
    this.map = map;
  }

  /** Every spot, replacing what was there (on entering the world). */
  set(list: SpotView[]): void {
    for (const s of this.shown.values()) {
      s.root.removeFromParent();
      for (const r of s.rings) r.material.dispose();
      s.foam.material.dispose();
    }
    this.shown.clear();
    for (const view of list) this.add(view);
  }

  /** A spot that moved. */
  move(view: SpotView): void {
    const s = this.shown.get(view.id);
    if (!s) return this.add(view);
    s.view = view;
    this.place(s);
  }

  /** The spot whose picking disc a ray hit, if any. */
  spotOf(object: THREE.Object3D): SpotView | undefined {
    const id = object.userData.spot as number | undefined;
    return id === undefined ? undefined : this.shown.get(id)?.view;
  }

  get pickables(): THREE.Object3D[] {
    return [...this.shown.values()].map((s) => s.root.children[0]!);
  }

  get list(): SpotView[] {
    return [...this.shown.values()].map((s) => s.view);
  }

  update(dt: number): void {
    this.time += dt;
    for (const s of this.shown.values()) {
      s.rings.forEach((ring, i) => {
        const phase = (this.time / RING_PERIOD + i / RINGS + s.seed) % 1;
        ring.scale.setScalar(0.1 + 0.36 * phase);
        ring.material.opacity = 0.85 * (1 - phase) * Math.min(1, phase * 6);
      });
      const swell = 0.5 + 0.5 * Math.sin(this.time * 3.1 + s.seed * 9);
      s.foam.scale.setScalar(0.8 + 0.35 * swell);
      s.foam.material.opacity = 0.28 + 0.2 * swell;
      s.bubbles.forEach((b, i) => {
        // Each bubble rises a little, then breaks and starts again somewhere else near the middle.
        const cycle = (this.time * (0.9 + 0.23 * i) + s.seed * 7 + i * 0.37) % 1;
        const where = Math.floor(this.time * (0.9 + 0.23 * i) + s.seed * 7 + i * 0.37);
        const a = where * 2.39996 + i, r = 0.08 + 0.14 * ((where * 0.618) % 1);
        b.position.set(Math.cos(a) * r, 0.01 + cycle * 0.05, Math.sin(a) * r);
        b.scale.setScalar(cycle < 0.85 ? 0.6 + cycle : 0.01);
      });
    }
  }

  private add(view: SpotView): void {
    const root = new THREE.Group();
    const pick = new THREE.Mesh(pickGeometry, pickMaterial);
    pick.userData.spot = view.id;
    root.add(pick);
    const rings = Array.from({ length: RINGS }, () => {
      const ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ color: 0xf2fbff, transparent: true, depthWrite: false }));
      ring.renderOrder = 1;
      root.add(ring);
      return ring;
    });
    const bubbles = Array.from({ length: BUBBLES }, () => {
      const b = new THREE.Mesh(bubbleGeometry, bubbleMaterial);
      root.add(b);
      return b;
    });
    const foam = new THREE.Mesh(foamGeometry, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }));
    foam.renderOrder = 1;
    root.add(foam);
    const s: Shown = { view, root, rings, bubbles, foam, seed: ((view.id * 0.618) % 1) };
    this.shown.set(view.id, s);
    this.group.add(root);
    this.place(s);
  }

  /** Over its tile, nudged away from the bank so the rings spread on open water rather than the shore. */
  private place(s: Shown): void {
    const { x, y } = s.view, map = this.map;
    let ox = 0, oy = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height || map.overlay[ny * map.width + nx] !== OVERLAY_WATER) {
        ox -= dx;
        oy -= dy;
      }
    }
    const len = Math.hypot(ox, oy), push = len > 0 ? SHORE_NUDGE / len : 0;
    const cx = x + 0.5 + ox * push, cy = y + 0.5 + oy * push;
    s.root.position.set(cx, heightAt(map, cx, cy) + 0.03, -cy);
  }
}
