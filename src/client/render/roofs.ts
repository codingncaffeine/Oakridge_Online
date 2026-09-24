import * as THREE from "three";
import {
  builtBounds, cornerHeight, indoorsAt, roofAt, ROOF_KEEP, ROOF_SLATE, ROOF_THATCH, tileIndex, type Box, type WorldMap,
} from "../../shared/map.ts";
import { STOREY } from "../../shared/worldgen.ts";
import { FASCIA, LEADS, RIDGE_CAP } from "../palette.ts";
import { at, MeshBuilder } from "./meshkit.ts";
import { MERLON, MERLON_HEIGHT, WALL_THICK } from "./objects.ts";
import { slab, surfaces } from "./surfaces.ts";

/** The roof's underside sits just over the wall's coping. */
const EAVES = 0.02;
/** The tangent of the pitch: the reference's roofs rise at about 32°. The rise is capped so a hall grows no spire. */
const PITCH = 0.62;
const MAX_RISE = 2.6;
/** How far the roof oversails its walls. */
const OVERHANG = 0.32;
/** The board along the eaves: how far it hangs below them, and how thick it is. */
const FASCIA_DROP = 0.14;
const FASCIA_THICK = 0.06;

/** One building: the tiles it covers, how many storeys of wall it stands on, and what covers it. */
interface Footprint {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  storeys: number;
  style: number;
}

interface Roof extends Footprint {
  group: THREE.Group;
}

/**
 * The roofs of every building on a plane. A roof lifts away the moment the player steps under it — the
 * classic's rule, and the only way an interior is readable from a camera outside it. Each building's
 * footprint is a run of tiles the map marked indoors, bounded by its walls, so a roof covers exactly
 * its own building even when the next stands wall to wall with it.
 */
export class Roofs {
  readonly group = new THREE.Group();
  private readonly roofs: Roof[] = [];
  /** The roof the player is under, kept so a step that changes nothing costs nothing. */
  private under: Roof | null = null;

  /** The roofs of the buildings standing in `within`: the loaded regions when the world streams, or everything built. */
  constructor(map: WorldMap, within: Box[] | null = null) {
    this.group.name = "roofs";
    const built = builtBounds(map);
    for (const box of footprints(map, within ?? (built ? [built] : []))) {
      const group = box.style === ROOF_KEEP ? keep(map, box) : hipped(map, box);
      this.roofs.push({ ...box, group });
      this.group.add(group);
    }
  }

  /** Where the player stands now: the roof over that tile goes, and any other comes back. */
  setViewer(x: number, y: number): void {
    const now = this.roofs.find((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) ?? null;
    if (now === this.under) return;
    if (this.under) this.under.group.visible = true;
    if (now) now.group.visible = false;
    this.under = now;
  }

  /** Every roof back on, for a picture from above; the next `setViewer` lifts the player's again. */
  reveal(): void {
    if (this.under) this.under.group.visible = true;
    this.under = null;
  }

  dispose(): void {
    for (const r of this.roofs) {
      r.group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) mesh.geometry.dispose();
      });
    }
  }
}

/**
 * The buildings on a plane, as boxes: runs of indoor tiles grown outward from each one not yet
 * claimed, never across a wall. Every building this game puts up is a rectangle, so a flood fill's
 * bounding box is its footprint — and stopping at walls is what keeps a tower that stands against a
 * church, or a turret on a keep's corner, from being swallowed into one roof over both.
 */
function footprints(map: WorldMap, within: Box[]): Footprint[] {
  const seen = new Set<number>();
  const out: Footprint[] = [];
  for (const box of within) {
    for (let y = box.y0; y <= box.y1; y++) {
      for (let x = box.x0; x <= box.x1; x++) {
        const start = tileIndex(map, x, y);
        if (start < 0 || indoorsAt(map, x, y) === 0 || seen.has(start)) continue;
        let x0 = x, x1 = x, y0 = y, y1 = y;
        let storeys = indoorsAt(map, x, y);
        const style = roofAt(map, x, y);
        // The fill follows the building wherever it goes, past the box's edge too: a building that
        // straddles two regions gets one whole roof, found from whichever side is loaded.
        const queue = [{ x, y }];
        seen.add(start);
        while (queue.length > 0) {
          const { x: cx, y: cy } = queue.pop()!;
          storeys = Math.max(storeys, indoorsAt(map, cx, cy));
          x0 = Math.min(x0, cx);
          x1 = Math.max(x1, cx);
          y0 = Math.min(y0, cy);
          y1 = Math.max(y1, cy);
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const nx = cx + dx, ny = cy + dy, n = tileIndex(map, nx, ny);
            if (n < 0 || indoorsAt(map, nx, ny) === 0 || seen.has(n)) continue;
            if (map.collision.wallBetween(cx, cy, dx, dy)) continue;
            seen.add(n);
            queue.push({ x: nx, y: ny });
          }
        }
        out.push({ x0, y0, x1, y1, storeys, style });
      }
    }
  }
  return out;
}

/** The height of the top of a building's walls: above the highest ground it stands on, so a roof never cuts into a slope. */
function wallTop(map: WorldMap, box: Footprint): number {
  let ground = -Infinity;
  for (let cy = box.y0; cy <= box.y1 + 1; cy++) {
    for (let cx = box.x0; cx <= box.x1 + 1; cx++) ground = Math.max(ground, cornerHeight(map, cx, cy));
  }
  return ground + Math.max(1, box.storeys) * STOREY;
}

/** A vertex of a roof face: where it is, and where on the texture it is. */
type Corner = [x: number, y: number, z: number, u: number, v: number];

/**
 * A hipped roof over a box: four slopes at one pitch meeting at a ridge along the building's longer
 * axis (an apex, on a square one), tiled in clay, slate or thatch, with a board along the eaves and a
 * cap on the ridge. The texture runs in world units — u along the eaves, v up the slope — so the rows
 * of tiles stay level and meet at the hips. Every face is wound anticlockwise seen from outside, or
 * the light would fall on it from underneath.
 */
function hipped(map: WorldMap, box: Footprint): THREE.Group {
  const w = box.x1 - box.x0 + 1, h = box.y1 - box.y0 + 1;
  const eaves = wallTop(map, box) + EAVES;
  const x0 = box.x0 - OVERHANG, x1 = box.x1 + 1 + OVERHANG;
  // z is south, so a tile's y becomes -y in the scene: z0 is the south eave, z1 the north.
  const z0 = -(box.y0 - OVERHANG), z1 = -(box.y1 + 1 + OVERHANG);
  const half = Math.min(w, h) / 2 + OVERHANG;
  const rise = Math.min(half * PITCH, MAX_RISE);
  const ridge = eaves + rise;
  const slope = Math.hypot(half, rise);
  const alongX = w >= h;
  const midX = (x0 + x1) / 2, midZ = (z0 + z1) / 2;

  const pos: number[] = [], uv: number[] = [];
  const tri = (a: Corner, b: Corner, c: Corner) => {
    for (const [x, y, z, u, v] of [a, b, c]) {
      pos.push(x, y, z);
      uv.push(u, v);
    }
  };
  // A square building's ridge has no length, so its long faces are triangles to an apex: a pyramid.
  const quad = (a: Corner, b: Corner, c: Corner, d: Corner) => {
    tri(a, b, c);
    if (Math.hypot(c[0] - d[0], c[2] - d[2]) > 1e-6) tri(a, c, d);
  };
  if (alongX) {
    const rx0 = x0 + half, rx1 = x1 - half;
    // The south slope, seen from the south; the north slope, seen from the north; then the two hips.
    quad([x0, eaves, z0, x0, 0], [x1, eaves, z0, x1, 0], [rx1, ridge, midZ, rx1, slope], [rx0, ridge, midZ, rx0, slope]);
    quad([x1, eaves, z1, x1, 0], [x0, eaves, z1, x0, 0], [rx0, ridge, midZ, rx0, slope], [rx1, ridge, midZ, rx1, slope]);
    tri([x0, eaves, z1, z1, 0], [x0, eaves, z0, z0, 0], [rx0, ridge, midZ, midZ, slope]);
    tri([x1, eaves, z0, z0, 0], [x1, eaves, z1, z1, 0], [rx1, ridge, midZ, midZ, slope]);
  } else {
    const rz0 = z0 - half, rz1 = z1 + half;
    quad([x0, eaves, z1, z1, 0], [x0, eaves, z0, z0, 0], [midX, ridge, rz0, rz0, slope], [midX, ridge, rz1, rz1, slope]);
    quad([x1, eaves, z0, z0, 0], [x1, eaves, z1, z1, 0], [midX, ridge, rz1, rz1, slope], [midX, ridge, rz0, rz0, slope]);
    tri([x0, eaves, z0, x0, 0], [x1, eaves, z0, x1, 0], [midX, ridge, rz0, midX, slope]);
    tri([x1, eaves, z1, x1, 0], [x0, eaves, z1, x0, 0], [midX, ridge, rz1, midX, slope]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(pos.length).fill(1), 3));
  g.computeVertexNormals();
  const kind = box.style === ROOF_SLATE ? "slate" : box.style === ROOF_THATCH ? "thatch" : "clay";
  const slopes = new THREE.Mesh(g, surfaces()[kind]);
  slopes.name = "roof";

  // The trim: a board along every eave, hanging a little below them, and a cap along the ridge.
  const trim = new MeshBuilder();
  const boardY = eaves - FASCIA_DROP / 2 + 0.01;
  for (const z of [z0, z1]) trim.add(new THREE.BoxGeometry(x1 - x0 + FASCIA_THICK, FASCIA_DROP, FASCIA_THICK), { color: FASCIA, matrix: at(midX, boardY, z) });
  for (const x of [x0, x1]) trim.add(new THREE.BoxGeometry(FASCIA_THICK, FASCIA_DROP, z0 - z1 + FASCIA_THICK), { color: FASCIA, matrix: at(x, boardY, midZ) });
  const ridgeLength = (alongX ? x1 - x0 : z0 - z1) - 2 * half;
  if (ridgeLength > 0.05) {
    trim.add(new THREE.BoxGeometry(alongX ? ridgeLength + 0.12 : 0.14, 0.08, alongX ? 0.14 : ridgeLength + 0.12), { color: RIDGE_CAP[kind], matrix: at(midX, ridge, midZ) });
  }
  const group = new THREE.Group();
  group.add(slopes, new THREE.Mesh(trim.build(), surfaces().trim));
  return group;
}

/**
 * A flat roof behind a parapet: the leads, a floor of darker stone at the top of the walls, and a
 * battlement round the edge — a merlon on the middle of every tile along every wall, a block on each
 * corner, all standing on the wall line. The keep, its turrets, the bell tower and the gatehouse wear it.
 */
function keep(map: WorldMap, box: Footprint): THREE.Group {
  const top = wallTop(map, box) + EAVES;
  const w = box.x1 - box.x0 + 1, h = box.y1 - box.y0 + 1;
  const b = new MeshBuilder();
  // The leads stop inside the wall line: run out to it, their edge shares a plane with the coping and
  // the two flicker against each other.
  b.add(slab(w - WALL_THICK, 0.1, h - WALL_THICK, box.x0, 0), { color: LEADS, matrix: at(box.x0 + w / 2, top - 0.05, -(box.y0 + h / 2)) });
  const put = (x: number, z: number) => b.add(slab(MERLON, MERLON_HEIGHT, MERLON, x, top), { color: 0xffffff, matrix: at(x, top + MERLON_HEIGHT / 2, z) });
  for (let x = box.x0; x <= box.x1; x++) {
    put(x + 0.5, -box.y0);
    put(x + 0.5, -(box.y1 + 1));
  }
  for (let y = box.y0; y <= box.y1; y++) {
    put(box.x0, -(y + 0.5));
    put(box.x1 + 1, -(y + 0.5));
  }
  for (const x of [box.x0, box.x1 + 1]) for (const z of [-box.y0, -(box.y1 + 1)]) put(x, z);
  const mesh = new THREE.Mesh(b.build(), surfaces().stone);
  mesh.name = "roof";
  const group = new THREE.Group();
  group.add(mesh);
  return group;
}
