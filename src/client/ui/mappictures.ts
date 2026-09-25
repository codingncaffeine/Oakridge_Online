// The pictures the radar and the world map draw from: one per region, rendered from the world itself
// (render/overhead.ts) the first time it is asked for, kept at every zoom the map draws at, and thrown
// away the moment anything in that region changes — a felled tree, a door swung open, a fire lit — so
// the map always shows the world as it is. The radar and the map share one set, because they are one
// map at several zooms.
//
// A render costs most of a frame (the region's ground and objects are built, drawn from above and read
// back), so a picture is rendered once and then kept at every scale the map draws at — 8, 4, 2 and 1
// pixels a tile, each half the one above — and a region is drawn from the scale it is shown at, one
// blit, nothing resampled. The small scales cost kilobytes and are kept for the whole world; the big
// ones keep at least what the last draw showed, so a map that is dragged is never rendering what it
// drew a moment ago. A draw asks with `request`, which renders at most one picture in a frame's time
// and answers null for the rest, so the map fills in over a few frames instead of freezing for them.
import * as THREE from "three";
import { objectsIn, regionBox, regionId, regionOf, type Region, type WorldMap } from "../../shared/map.ts";
import { GROUND_LIGHT, SKY_INTENSITY, SKY_LIGHT, SUN_COLOR, SUN_FROM, SUN_INTENSITY } from "../palette.ts";
import { buildObjects } from "../render/objects.ts";
import { onMapLayer, Overhead } from "../render/overhead.ts";
import { Roofs } from "../render/roofs.ts";
import { buildTerrain } from "../render/terrain.ts";

/** Pixels a tile a picture is rendered at: enough for a wall to be a line and a person-sized thing a dot. */
export const PICTURE_SCALE = 8;
/** The scales a picture is kept at: the rendered one and each half of it, down to a pixel a tile. */
export const SCALES = [8, 4, 2, 1] as const;
export type Scale = (typeof SCALES)[number];
/** Pictures kept at each scale when no draw has asked for more: a megabyte each at 8, a quarter of that a step down. */
const KEEP: Record<Scale, number> = { 8: 24, 4: 48, 2: 1024, 1: 1024 };
/** Kept over what a draw showed, so a drag that brings a row of regions in does not throw the last row out. */
const HEADROOM = 8;
/** The least time between two renders: at most one in a frame, and a slow one earns a longer rest. */
const RENDER_GAP_MS = 8;

/** Something rendered for a picture and thrown away after: the scene of a region the world does not hold. */
export interface TemporaryScene {
  objects: THREE.Object3D[];
  dispose(): void;
}

export interface PictureHooks {
  /** The scene of a region that is not up: null when the scene already holds it. */
  extrasFor(region: Region): TemporaryScene | null;
  /** Just before and after a render: where a lifted roof is put back for the picture. */
  before?(): void;
  after?(): void;
}

/** The pictures at one scale, most recently used last, holding at most `keep`. */
class Level {
  readonly scale: Scale;
  keep: number;
  readonly pictures = new Map<number, HTMLCanvasElement>();

  constructor(scale: Scale) {
    this.scale = scale;
    this.keep = KEEP[scale];
  }

  get(id: number): HTMLCanvasElement | undefined {
    const picture = this.pictures.get(id);
    if (picture) {
      this.pictures.delete(id);
      this.pictures.set(id, picture);
    }
    return picture;
  }

  set(id: number, picture: HTMLCanvasElement): void {
    this.pictures.delete(id);
    this.pictures.set(id, picture);
    while (this.pictures.size > this.keep) this.pictures.delete(this.pictures.keys().next().value!);
  }
}

export class MapPictures {
  private readonly overhead: Overhead;
  private readonly hooks: PictureHooks;
  private map: WorldMap;
  private readonly levels = new Map<Scale, Level>(SCALES.map((s) => [s, new Level(s)]));
  /** How many pictures were rendered, ever: the checks read it. */
  renders = 0;
  /** When the last render finished, so `request` renders at most once in a frame's time. */
  private lastRenderEnded = -Infinity;
  /** Renders whenever asked: for a page with no frame loop to keep smooth. */
  private eager = false;

  constructor(overhead: Overhead, map: WorldMap, hooks: PictureHooks) {
    this.overhead = overhead;
    this.map = map;
    this.hooks = hooks;
  }

  /** A set of its own, for a page with no game on it: it builds every region it pictures for the moment, and at once. */
  static standalone(map: WorldMap): MapPictures {
    const renderer = new THREE.WebGLRenderer({ canvas: document.createElement("canvas"), antialias: false });
    const scene = new THREE.Scene();
    const sun = new THREE.DirectionalLight(SUN_COLOR, SUN_INTENSITY);
    sun.position.set(...SUN_FROM);
    const sky = new THREE.HemisphereLight(SKY_LIGHT, GROUND_LIGHT, SKY_INTENSITY);
    onMapLayer(sun);
    onMapLayer(sky);
    scene.add(sun, sky);
    const pictures = new MapPictures(new Overhead(renderer, scene), map, { extrasFor: (region) => temporaryScene(map, region) });
    pictures.eager = true;
    return pictures;
  }

  /** A different plane: nothing pictured so far applies. */
  setMap(map: WorldMap): void {
    this.map = map;
    for (const level of this.levels.values()) level.pictures.clear();
  }

  /** Whether a region's picture is kept at a scale right now. */
  has(region: Region, scale: Scale = PICTURE_SCALE): boolean {
    return this.levels.get(scale)!.pictures.has(regionId(region.rx, region.ry));
  }

  /** The number of pictures kept right now at the rendered scale. */
  get count(): number {
    return this.levels.get(PICTURE_SCALE)!.pictures.size;
  }

  /** The number kept at a scale, and the most it will keep. */
  kept(scale: Scale): { count: number; keep: number } {
    const level = this.levels.get(scale)!;
    return { count: level.pictures.size, keep: level.keep };
  }

  /**
   * A draw is about to show `n` regions at `scale`: that scale keeps at least that many from now on,
   * so a map that is dragged never renders again what it drew a moment ago.
   */
  reserve(scale: Scale, n: number): void {
    const level = this.levels.get(scale)!;
    level.keep = Math.max(level.keep, n + HEADROOM);
  }

  /**
   * The region's picture at `scale` pixels a tile, rendered now if it is not kept — for a check, or a
   * page with no frame loop, that wants it whatever it costs.
   */
  at(region: Region, scale: Scale = PICTURE_SCALE): HTMLCanvasElement {
    return this.stored(region, scale) ?? this.render(region, scale);
  }

  /**
   * The region's picture at `scale` if it is kept (or can be made from a bigger one that is), else
   * rendered now if no render has finished within a frame's time; otherwise null, and the caller draws
   * again next frame, when it will be its turn.
   */
  request(region: Region, scale: Scale): HTMLCanvasElement | null {
    const kept = this.stored(region, scale);
    if (kept) return kept;
    if (!this.eager && performance.now() - this.lastRenderEnded < RENDER_GAP_MS) return null;
    return this.render(region, scale);
  }

  /** The world changed on this tile: its region is pictured again the next time it is asked for. */
  invalidate(x: number, y: number): void {
    const id = regionId(regionOf(x), regionOf(y));
    for (const level of this.levels.values()) level.pictures.delete(id);
  }

  /** The pixels of a region's picture around a tile, for a check that the map follows the world. */
  sample(x: number, y: number, radius: number): Uint8ClampedArray | null {
    const region = this.map.regions.get(regionId(regionOf(x), regionOf(y)));
    if (!region?.built) return null;
    const picture = this.at(region);
    const px = (x - region.x0 + 0.5) * PICTURE_SCALE, py = (region.y0 + 64 - y - 0.5) * PICTURE_SCALE;
    const r = radius * PICTURE_SCALE;
    const x0 = Math.max(0, Math.round(px - r)), y0 = Math.max(0, Math.round(py - r));
    const x1 = Math.min(picture.width, Math.round(px + r)), y1 = Math.min(picture.height, Math.round(py + r));
    return picture.getContext("2d")!.getImageData(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)).data;
  }

  /** The picture at `scale` if kept, or halved down from the nearest bigger one that is; null when it would take a render. */
  private stored(region: Region, scale: Scale): HTMLCanvasElement | null {
    const id = regionId(region.rx, region.ry);
    const own = this.levels.get(scale)!.get(id);
    if (own) return own;
    for (const bigger of SCALES.filter((s) => s > scale).reverse()) {
      let picture = this.levels.get(bigger)!.get(id);
      if (!picture) continue;
      for (let s = bigger; s > scale; s /= 2) {
        picture = halved(picture);
        this.levels.get(s / 2 as Scale)!.set(id, picture);
      }
      return picture;
    }
    return null;
  }

  /** Renders the region and keeps the picture at every scale; returns the one at `scale`. */
  private render(region: Region, scale: Scale): HTMLCanvasElement {
    const id = regionId(region.rx, region.ry);
    const extras = this.hooks.extrasFor(region);
    this.hooks.before?.();
    let picture = this.overhead.picture(regionBox(region), PICTURE_SCALE, extras?.objects ?? []);
    this.hooks.after?.();
    extras?.dispose();
    this.renders++;
    let wanted = picture;
    for (const s of SCALES) {
      if (s < PICTURE_SCALE) picture = halved(picture);
      this.levels.get(s)!.set(id, picture);
      if (s === scale) wanted = picture;
    }
    this.lastRenderEnded = performance.now();
    return wanted;
  }
}

/** The picture at half its size: at exactly half, the browser's smoothing averages each square of four pixels. */
function halved(picture: HTMLCanvasElement): HTMLCanvasElement {
  const half = document.createElement("canvas");
  half.width = Math.max(1, picture.width / 2);
  half.height = Math.max(1, picture.height / 2);
  const g = half.getContext("2d")!;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.drawImage(picture, 0, 0, half.width, half.height);
  return half;
}

/** The ground, objects and roofs of one region, built for a picture and freed after. */
export function temporaryScene(map: WorldMap, region: Region): TemporaryScene {
  const box = regionBox(region);
  const terrain = buildTerrain(map, box);
  const objects = buildObjects(map, objectsIn(map, box));
  const roofs = new Roofs(map, [box]);
  return {
    objects: [terrain, objects.group, roofs.group],
    dispose() {
      terrain.geometry.dispose();
      objects.dispose();
      roofs.dispose();
    },
  };
}
