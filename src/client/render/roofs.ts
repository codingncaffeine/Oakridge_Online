import * as THREE from "three";
import { cornerHeight, tileIndex, type WorldMap } from "../../shared/map.ts";
import { ROOF_TILE, THATCH, TIMBER } from "../palette.ts";
import { STOREY } from "../../shared/worldgen.ts";

/**
 * Where the eaves sit — on top of the wall the objects draw — and how steeply the roof rises from
 * them. The pitch is a share of the building's half-depth, so a wide house gets a tall roof and a
 * narrow one a short one, which is what makes a row of them read as a village rather than a terrace of
 * flat boxes. The rise is capped so a hall does not grow a spire.
 */
// Just clear of the wall's top plate (WALL_HEIGHT in render/objects.ts), or the plate pokes through
// the roof at the eaves.
const EAVES = 1.72;
const PITCH = 0.42;
const MAX_RISE = 2.1;
/** How far the roof oversails its walls. */
const OVERHANG = 0.32;

/** One building's roof: the tiles it covers, and the mesh over them. */
interface Roof {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  mesh: THREE.Mesh;
}

/**
 * The roofs of every building on a plane. A roof lifts away the moment the player steps under it — the
 * classic's rule, and the only way an interior is readable from a camera outside it. Each building's
 * footprint is the run of tiles the map marked indoors, so a roof covers exactly its own walls.
 */
export class Roofs {
  readonly group = new THREE.Group();
  private readonly roofs: Roof[] = [];
  /** The roof the player is under, kept so a step that changes nothing costs nothing. */
  private under: Roof | null = null;

  constructor(map: WorldMap) {
    this.group.name = "roofs";
    for (const box of footprints(map)) {
      const mesh = gable(map, box);
      this.roofs.push({ ...box, mesh });
      this.group.add(mesh);
    }
  }

  /** Where the player stands now: the roof over that tile goes, and any other comes back. */
  setViewer(x: number, y: number): void {
    const now = this.roofs.find((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) ?? null;
    if (now === this.under) return;
    if (this.under) this.under.mesh.visible = true;
    if (now) now.mesh.visible = false;
    this.under = now;
  }

  dispose(): void {
    for (const r of this.roofs) r.mesh.geometry.dispose();
  }
}

/**
 * The buildings on a plane, as boxes: runs of indoor tiles grown outward from each one not yet claimed.
 * Every building this game puts up is a rectangle, so a flood fill's bounding box is its footprint.
 */
function footprints(map: WorldMap): Array<{ x0: number; y0: number; x1: number; y1: number; storeys: number }> {
  const seen = new Uint8Array(map.width * map.height);
  const out: Array<{ x0: number; y0: number; x1: number; y1: number; storeys: number }> = [];
  for (let ly = 0; ly < map.height; ly++) {
    for (let lx = 0; lx < map.width; lx++) {
      const start = ly * map.width + lx;
      if (map.indoors[start] === 0 || seen[start] === 1) continue;
      let x0 = lx, x1 = lx, y0 = ly, y1 = ly;
      let storeys = map.indoors[start]!;
      const queue = [start];
      seen[start] = 1;
      while (queue.length > 0) {
        const i = queue.pop()!;
        const cx = i % map.width, cy = (i - (i % map.width)) / map.width;
        storeys = Math.max(storeys, map.indoors[i]!);
        x0 = Math.min(x0, cx);
        x1 = Math.max(x1, cx);
        y0 = Math.min(y0, cy);
        y1 = Math.max(y1, cy);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
          const n = ny * map.width + nx;
          if (map.indoors[n] === 0 || seen[n] === 1) continue;
          seen[n] = 1;
          queue.push(n);
        }
      }
      out.push({ x0: x0 + map.originX, y0: y0 + map.originY, x1: x1 + map.originX, y1: y1 + map.originY, storeys });
    }
  }
  return out;
}

/**
 * A gabled roof over a box: two sloping faces meeting at a ridge along the building's longer axis, with
 * a triangle closing each end and a ridge beam along the top. Thatch on a small building, tile on a
 * large one, which is how a village reads as having more than one kind of house in it.
 */
function gable(map: WorldMap, box: { x0: number; y0: number; x1: number; y1: number; storeys: number }): THREE.Mesh {
  const w = box.x1 - box.x0 + 1, h = box.y1 - box.y0 + 1;
  // The eaves sit above the highest ground the building stands on, so a roof never cuts into a slope.
  let ground = -Infinity;
  for (let cy = box.y0; cy <= box.y1 + 1; cy++) {
    for (let cx = box.x0; cx <= box.x1 + 1; cx++) ground = Math.max(ground, cornerHeight(map, cx, cy));
  }
  const half = Math.min(w, h) / 2;
  // A two-storey house wears its roof a storey higher, or the upper floor would be inside it.
  const eaves = ground + EAVES + (Math.max(1, box.storeys) - 1) * STOREY;
  const ridge = eaves + Math.min(half * PITCH, MAX_RISE);
  const x0 = box.x0 - OVERHANG, x1 = box.x1 + 1 + OVERHANG;
  const y0 = box.y0 - OVERHANG, y1 = box.y1 + 1 + OVERHANG;
  // z is south, so a tile's y becomes -y in the scene.
  const z0 = -y0, z1 = -y1;
  const alongX = w >= h;
  const midX = (x0 + x1) / 2, midZ = (z0 + z1) / 2;

  const pos: number[] = [], index: number[] = [];
  const v = (x: number, y: number, z: number) => {
    pos.push(x, y, z);
    return pos.length / 3 - 1;
  };
  const quad = (a: number, b: number, c: number, d: number) => index.push(a, b, c, a, c, d);
  const tri = (a: number, b: number, c: number) => index.push(a, b, c);

  if (alongX) {
    // The ridge runs east-west; the two slopes face north and south.
    const a = v(x0, eaves, z0), b = v(x1, eaves, z0), c = v(x1, ridge, midZ), d = v(x0, ridge, midZ);
    const e = v(x0, eaves, z1), f = v(x1, eaves, z1);
    quad(a, b, c, d);
    quad(f, e, d, c);
    tri(a, d, e);
    tri(b, f, c);
  } else {
    const a = v(x0, eaves, z0), b = v(midX, ridge, z0), c = v(midX, ridge, z1), d = v(x0, eaves, z1);
    const e = v(x1, eaves, z0), f = v(x1, eaves, z1);
    quad(a, b, c, d);
    quad(e, f, c, b);
    tri(a, d, b);
    tri(e, b, f);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  // A big roof is tiled, a small one thatched: the village then reads as more than one kind of house.
  const color = w * h >= 60 ? ROOF_TILE : w * h >= 30 ? THATCH : TIMBER;
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, flatShading: true }));
  mesh.name = "roof";
  return mesh;
}

/** Whether a tile is under a roof on this plane, for anything that needs to know without the meshes. */
export function indoorsAt(map: WorldMap, x: number, y: number): boolean {
  const i = tileIndex(map, x, y);
  return i >= 0 && map.indoors[i] === 1;
}
