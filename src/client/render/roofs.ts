import * as THREE from "three";
import {
  builtBounds, cornerHeight, indoorsAt, roofAt, ROOF_GABLE, ROOF_KEEP, ROOF_SLATE, ROOF_THATCH, tileIndex, type Box, type WorldMap,
} from "../../shared/map.ts";
import { STOREY } from "../../shared/worldgen.ts";
import { FASCIA, IRON_BAR, LEADS, RIDGE_CAP, WALL_CAP } from "../palette.ts";
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
      const group = box.style === ROOF_KEEP ? keep(map, box) : box.style === ROOF_GABLE ? gabled(map, box) : hipped(map, box);
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

/** Caldmoor's roofs: steeper than Aldermarch's (about 46°, for the snow), oversailing the long walls but stopping at the gables. */
const GABLE_PITCH = 1.05;
const MAX_GABLE_RISE = 3.6;
const GABLE_OVERHANG = 0.22;
/** About how tall a crow-step is. */
const CROW_STEP = 0.42;

/**
 * A gabled roof, Caldmoor's: two steep slate slopes meeting at a ridge along the building's longer axis,
 * between two stone gables that stand up through the roof and climb its slope in crow-steps, the top step
 * at the ridge carrying a chimney on the far gable. Built in the roof's own frame — `a` along the ridge
 * between the gable walls' lines, `b` across it, 0 at the ridge — and the slopes wound as the hipped
 * roof's are, which is right whichever way the ridge runs.
 */
function gabled(map: WorldMap, box: Footprint): THREE.Group {
  const w = box.x1 - box.x0 + 1, h = box.y1 - box.y0 + 1;
  const alongX = w >= h;
  const eaves = wallTop(map, box) + EAVES;
  // z is south: a tile's y becomes -y in the scene.
  const a0 = alongX ? box.x0 : -box.y0, a1 = alongX ? box.x1 + 1 : -(box.y1 + 1);
  const mid = alongX ? -(box.y0 + h / 2) : box.x0 + w / 2;
  const P = (a: number, y: number, b: number): [number, number, number] => (alongX ? [a, y, mid + b] : [mid + b, y, a]);
  const halfIn = (alongX ? h : w) / 2, half = halfIn + GABLE_OVERHANG;
  const rise = Math.min(half * GABLE_PITCH, MAX_GABLE_RISE);
  const ridge = eaves + rise;
  const slope = Math.hypot(half, rise);

  const pos: number[] = [], uv: number[] = [];
  const quad = (c: Array<[number, number, number, number, number]>) => {
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const [x, y, z, u, v] = c[i]!;
      pos.push(x, y, z);
      uv.push(u, v);
    }
  };
  const corner = (a: number, y: number, b: number, v: number): [number, number, number, number, number] => [...P(a, y, b), a, v];
  quad([corner(a0, eaves, half, 0), corner(a1, eaves, half, 0), corner(a1, ridge, 0, slope), corner(a0, ridge, 0, slope)]);
  quad([corner(a1, eaves, -half, 0), corner(a0, eaves, -half, 0), corner(a0, ridge, 0, slope), corner(a1, ridge, 0, slope)]);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(pos.length).fill(1), 3));
  g.computeVertexNormals();
  const slopes = new THREE.Mesh(g, surfaces().slate);
  slopes.name = "roof";

  // The gables: stone blocks stacked a step at a time, each as wide as the roof is at its foot, so its
  // head stands proud of the slope — the crow-steps — and a last block over the ridge.
  const thick = WALL_THICK + 0.04;
  const stone = new MeshBuilder();
  const block = (a: number, y: number, bWidth: number, height: number) => {
    const geometry = alongX ? slab(thick, height, bWidth, mid, y) : slab(bWidth, height, thick, mid, y);
    stone.add(geometry, { color: 0xffffff, matrix: at(...P(a, y + height / 2, 0)) });
  };
  const steps = Math.max(3, Math.round(rise / CROW_STEP));
  const step = rise / steps;
  for (const a of [a0, a1]) {
    for (let k = 0; k < steps; k++) {
      const foot = eaves - 0.04 + k * step;
      const across = Math.min(halfIn + WALL_THICK / 2, half * (1 - (k * step) / rise));
      block(a, foot, 2 * across, step + 0.04);
    }
    block(a, ridge - 0.04, 0.5, 0.3);
  }
  const gables = new THREE.Mesh(stone.build(), surfaces().stone);
  gables.name = "gable";

  // The chimney on the far gable's head, its cap, and two pots; a board along each eave; a cap on the ridge.
  const trim = new MeshBuilder();
  const stack = alongX ? slab(thick + 0.26, 1.1, 0.8, mid, ridge) : slab(0.8, 1.1, thick + 0.26, mid, ridge);
  const chimney = new MeshBuilder().add(stack, { color: 0xffffff, matrix: at(...P(a1, ridge + 0.5, 0)) });
  trim.add(new THREE.BoxGeometry(alongX ? thick + 0.4 : 0.94, 0.09, alongX ? 0.94 : thick + 0.4), { color: WALL_CAP, matrix: at(...P(a1, ridge + 1.08, 0)) });
  for (const o of [-0.2, 0.2]) {
    const [x, , z] = P(a1, 0, o);
    trim.add(new THREE.CylinderGeometry(0.08, 0.1, 0.3, 8), { color: IRON_BAR, matrix: at(x, ridge + 1.26, z) });
  }
  const boardY = eaves - FASCIA_DROP / 2 + 0.01;
  for (const side of [half, -half]) {
    const [x, , z] = P((a0 + a1) / 2, 0, side);
    const length = Math.abs(a1 - a0);
    trim.add(new THREE.BoxGeometry(alongX ? length : FASCIA_THICK, FASCIA_DROP, alongX ? FASCIA_THICK : length), { color: FASCIA, matrix: at(x, boardY, z) });
  }
  const [rx, , rz] = P((a0 + a1) / 2, 0, 0);
  const length = Math.abs(a1 - a0);
  trim.add(new THREE.BoxGeometry(alongX ? length : 0.14, 0.08, alongX ? 0.14 : length), { color: RIDGE_CAP.slate, matrix: at(rx, ridge, rz) });
  const group = new THREE.Group();
  group.add(slopes, gables, new THREE.Mesh(chimney.build(), surfaces().stone), new THREE.Mesh(trim.build(), surfaces().trim));
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
