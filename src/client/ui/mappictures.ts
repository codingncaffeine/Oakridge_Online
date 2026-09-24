// The pictures the radar and the world map draw from: one per region, rendered from the world itself
// (render/overhead.ts) the first time it is asked for, kept while it is near, and thrown away the
// moment anything in that region changes — a felled tree, a door swung open, a fire lit — so the map
// always shows the world as it is. The radar and the map share one set, because they are one map at
// two zooms.
import * as THREE from "three";
import { objectsIn, regionBox, regionId, regionOf, type Region, type WorldMap } from "../../shared/map.ts";
import { GROUND_LIGHT, SKY_INTENSITY, SKY_LIGHT, SUN_COLOR, SUN_FROM, SUN_INTENSITY } from "../palette.ts";
import { buildObjects } from "../render/objects.ts";
import { onMapLayer, Overhead } from "../render/overhead.ts";
import { Roofs } from "../render/roofs.ts";
import { buildTerrain } from "../render/terrain.ts";

/** Pixels a tile a picture is rendered at: enough for a wall to be a line and a person-sized thing a dot. */
export const PICTURE_SCALE = 8;
/** Rendered pictures kept, most recently used last. Each is a megabyte. */
const KEEP = 24;

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

export class MapPictures {
  private readonly overhead: Overhead;
  private readonly hooks: PictureHooks;
  private map: WorldMap;
  private readonly pictures = new Map<number, HTMLCanvasElement>();
  /** How many pictures were rendered, ever: the checks read it. */
  renders = 0;

  constructor(overhead: Overhead, map: WorldMap, hooks: PictureHooks) {
    this.overhead = overhead;
    this.map = map;
    this.hooks = hooks;
  }

  /** A set of its own, for a page with no game on it: it builds every region it pictures for the moment. */
  static standalone(map: WorldMap): MapPictures {
    const renderer = new THREE.WebGLRenderer({ canvas: document.createElement("canvas"), antialias: false });
    const scene = new THREE.Scene();
    const sun = new THREE.DirectionalLight(SUN_COLOR, SUN_INTENSITY);
    sun.position.set(...SUN_FROM);
    const sky = new THREE.HemisphereLight(SKY_LIGHT, GROUND_LIGHT, SKY_INTENSITY);
    onMapLayer(sun);
    onMapLayer(sky);
    scene.add(sun, sky);
    return new MapPictures(new Overhead(renderer, scene), map, { extrasFor: (region) => temporaryScene(map, region) });
  }

  /** A different plane: nothing pictured so far applies. */
  setMap(map: WorldMap): void {
    this.map = map;
    this.pictures.clear();
  }

  /** Whether a region's picture is ready, so a caller can spread renders over frames. */
  has(region: Region): boolean {
    return this.pictures.has(regionId(region.rx, region.ry));
  }

  /** The number of pictures kept right now. */
  get count(): number {
    return this.pictures.size;
  }

  /** The region's picture at PICTURE_SCALE pixels a tile, rendered now if it is not there. */
  at(region: Region): HTMLCanvasElement {
    const id = regionId(region.rx, region.ry);
    let picture = this.pictures.get(id);
    if (picture) {
      // Most recently used goes last, so the oldest is the one let go.
      this.pictures.delete(id);
      this.pictures.set(id, picture);
      return picture;
    }
    const extras = this.hooks.extrasFor(region);
    this.hooks.before?.();
    picture = this.overhead.picture(regionBox(region), PICTURE_SCALE, extras?.objects ?? []);
    this.hooks.after?.();
    extras?.dispose();
    this.renders++;
    this.pictures.set(id, picture);
    while (this.pictures.size > KEEP) this.pictures.delete(this.pictures.keys().next().value!);
    return picture;
  }

  /** The world changed on this tile: its region is pictured again the next time it is asked for. */
  invalidate(x: number, y: number): void {
    this.pictures.delete(regionId(regionOf(x), regionOf(y)));
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
