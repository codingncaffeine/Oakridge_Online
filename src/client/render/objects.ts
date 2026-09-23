import * as THREE from "three";
import { heightAt, isEdgeKind, openable, type MapObject, type ObjectKind, type TreeKind, type WorldMap } from "../../shared/map.ts";
import { mulberry32 } from "../../shared/rng.ts";
import {
  ANVIL_IRON, ASH, BARK, BERRY, BUSH_GREEN, CROP_GREEN, CUT_STONE, CUT_WOOD, DARK_STONE, DOOR_WOOD, EMBER, FENCE,
  FLAME, IRON_BAR, IRON_DARK, LEAF_TINT, OAK_TRUNK, ORE, PLASTER, REED_GREEN, ROCK, SACK_CLOTH, THORN, TIMBER,
  TRUNK, TRUNK_DARK, WALL_CAP, WALL_STONE,
} from "../palette.ts";
import { at, between, ellipsoid, MeshBuilder } from "./meshkit.ts";
import { leafTexture } from "./textures.ts";

const SHAPES_PER_KIND = 3;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** When a part shows: always, while the object stands, or once it has run out (a stump, an empty rock). */
type When = "always" | "standing" | "depleted";

interface Part {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  when?: When;
}

/** Every map object, drawn instanced, and ways to show one run out, standing again, open or shut. */
export interface WorldObjects {
  readonly group: THREE.Group;
  setDepleted(o: MapObject, depleted: boolean): void;
  /** Swings a door or gate on its hinge. Anything else ignores it. */
  setOpen(o: MapObject, open: boolean): void;
}

/** Where an object's copy sits in one instanced part, and the transform that draws it there. */
interface Placed {
  mesh: THREE.InstancedMesh;
  index: number;
  when: When;
  matrix: THREE.Matrix4;
  hidden: THREE.Matrix4;
  /** For a door: the same leaf swung back on its hinge. */
  swung?: THREE.Matrix4;
}

let materials: { flat: THREE.Material; smooth: THREE.Material; leaves: THREE.Material } | null = null;
function mats() {
  materials ??= {
    flat: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    smooth: new THREE.MeshLambertMaterial({ vertexColors: true }),
    // vertexColors is what makes a canopy's tint mean anything: without it the one leaf texture comes
    // out the same green on all eight trees, and the tint each `canopy` writes is never read.
    leaves: new THREE.MeshLambertMaterial({
      map: leafTexture(), vertexColors: true, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide, flatShading: true,
    }),
  };
  return materials;
}

/**
 * Every map object, drawn as instanced meshes: one per model shape and part. A tree has its standing
 * parts and a stump, an ore rock its veined and its empty self; the part that doesn't apply is drawn
 * at zero size until the object changes.
 */
export function buildObjects(map: WorldMap): WorldObjects {
  const group = new THREE.Group();
  const buckets = new Map<string, { parts: Part[]; items: MapObject[] }>();
  for (const o of map.objects) {
    // An edge object has no random shapes; a wall uses the slot to say how many storeys tall it is.
    const shape = isEdge(o.kind) ? Math.max(0, (o.tall ?? 1) - 1) : Math.floor(o.variant * SHAPES_PER_KIND);
    const key = `${o.kind}:${shape}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { parts: MODELS[o.kind](shape), items: [] };
      buckets.set(key, bucket);
    }
    bucket.items.push(o);
  }

  const placed = new Map<MapObject, Placed[]>();
  const q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0), tint = new THREE.Color(), none = new THREE.Vector3(0, 0, 0);
  for (const { parts, items } of buckets.values()) {
    for (const part of parts) {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, items.length);
      const when = part.when ?? "always";
      items.forEach((o, i) => {
        if (isEdge(o.kind)) {
          // Edge objects sit on the middle of the tile edge named by `side` (0 N, 1 E, 2 S, 3 W).
          const ex = o.x + (o.side === 1 ? 1 : o.side === 3 ? 0 : 0.5);
          const ey = o.y + (o.side === 0 ? 1 : o.side === 2 ? 0 : 0.5);
          p.set(ex, heightAt(map, ex, ey), -ey);
          q.setFromAxisAngle(up, o.side === 1 || o.side === 3 ? Math.PI / 2 : 0);
          s.set(1, 1, 1);
        } else {
          const cx = o.x + 0.5, cy = o.y + 0.5;
          p.set(cx, heightAt(map, cx, cy), -cy);
          q.setFromAxisAngle(up, fract(o.variant * 7.31) * Math.PI * 2);
          s.setScalar(0.88 + 0.24 * fract(o.variant * 13.7));
        }
        const matrix = new THREE.Matrix4().compose(p, q, s), hidden = new THREE.Matrix4().compose(p, q, none);
        // A door swings a right angle about the hinge at one end of its edge, so the leaf ends up
        // along the wall it was blocking rather than across the gap.
        let swung: THREE.Matrix4 | undefined;
        if (openable(o.kind)) {
          const hinge = new THREE.Vector3(-0.47, 0, 0).applyQuaternion(q);
          const turn = new THREE.Quaternion().setFromAxisAngle(up, -Math.PI / 2);
          swung = new THREE.Matrix4().compose(
            p.clone().add(hinge).sub(hinge.clone().applyQuaternion(turn)),
            q.clone().premultiply(turn),
            s.clone(),
          );
        }
        mesh.setMatrixAt(i, when === "depleted" ? hidden : matrix);
        mesh.setColorAt(i, tint.setScalar(0.9 + 0.2 * fract(o.variant * 29.3)));
        let list = placed.get(o);
        if (!list) placed.set(o, (list = []));
        list.push({ mesh, index: i, when, matrix, hidden, swung });
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      // Picking maps a hit's instanceId back to the map object it drew.
      mesh.userData.items = items;
      group.add(mesh);
    }
  }

  return {
    group,
    setDepleted(o, depleted) {
      for (const part of placed.get(o) ?? []) {
        if (part.when === "always") continue;
        const show = (part.when === "depleted") === depleted;
        part.mesh.setMatrixAt(part.index, show ? part.matrix : part.hidden);
        part.mesh.instanceMatrix.needsUpdate = true;
        part.mesh.computeBoundingSphere();
      }
    },
    setOpen(o, open) {
      for (const part of placed.get(o) ?? []) {
        if (!part.swung) continue;
        part.mesh.setMatrixAt(part.index, open ? part.swung : part.matrix);
        part.mesh.instanceMatrix.needsUpdate = true;
        part.mesh.computeBoundingSphere();
      }
    },
  };
}

const isEdge = isEdgeKind;

/** How high a kind stands and how far it spreads, for anything that has to frame or space it out. */
export function objectSize(kind: ObjectKind): { height: number; radius: number } {
  const spec = TREES[kind as TreeKind];
  if (!spec) return { height: kind === "wall" ? 1.1 : 0.6, radius: 0.5 };
  return {
    height: Math.max(spec.height, ...spec.tiers.map(([rimY, , , dome]) => rimY + dome)),
    radius: Math.max(...spec.tiers.map(([, radius, spread]) => radius + spread)) + spec.lean,
  };
}
/** The largest an object is ever drawn: `buildObjects` scales each copy by up to this much. */
export const MAX_OBJECT_SCALE = 1.12;

function fract(v: number): number {
  return v - Math.floor(v);
}

/**
 * An umbrella of foliage: a low dome whose skirt ends in the leaf texture's ragged fringe. The outline
 * wobbles per spoke so no two canopies are perfectly round.
 */
function canopy(
  b: MeshBuilder, cx: number, rimY: number, cz: number, radius: number, dome: number, skirt: number, seed: number,
  tint = 0xffffff,
): void {
  const radial = 9;
  const rings: Array<[number, number, number]> = [
    [0, dome, 1], [0.5, dome * 0.82, 0.87], [0.84, dome * 0.42, 0.66], [1, 0, 0.36], [0.94, -skirt, 0],
  ];
  const rand = mulberry32(seed);
  const wobble = Array.from({ length: radial }, () => 0.8 + rand() * 0.4);
  const lift = Array.from({ length: radial }, () => (rand() - 0.5) * 0.16);
  // Each spoke's hem hangs to its own depth, so the skirt's lower edge is uneven all the way round.
  const hang = Array.from({ length: radial }, () => 0.65 + rand() * 0.7);
  const uRepeat = Math.max(2, Math.round(radius * 3));
  const uShift = rand();
  const pos: number[] = [], uv: number[] = [], index: number[] = [];
  rings.forEach(([frac, h, v], ring) => {
    const last = ring === rings.length - 1;
    for (let k = 0; k <= radial; k++) {
      const a = (k / radial) * Math.PI * 2, r = radius * frac * wobble[k % radial]!;
      const y = last ? -skirt * hang[k % radial]! : h + (frac > 0 ? lift[k % radial]! : 0);
      pos.push(cx + Math.cos(a) * r, rimY + y, cz + Math.sin(a) * r);
      uv.push((k / radial) * uRepeat + uShift, v);
    }
  });
  const row = radial + 1;
  for (let i = 0; i < rings.length - 1; i++) {
    for (let k = 0; k < radial; k++) {
      const a = i * row + k, bb = a + 1, c = a + row + 1, d = a + row;
      index.push(a, c, d, a, bb, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  b.add(g, { color: tint });
}

/** A trunk from just below ground to `top`, flaring into four roots at its foot. */
function trunk(b: MeshBuilder, base: number, top: THREE.Vector3, topRadius: number, color: number, rand: () => number, rootColor = TRUNK_DARK): void {
  b.add(new THREE.CylinderGeometry(topRadius, base * 0.6, 1, 8, 3), { color, matrix: between(V(0, -0.2, 0), top) });
  for (let k = 0; k < 4; k++) {
    const a = (k + 0.15 + rand() * 0.3) * (Math.PI / 2);
    const reach = base * (2 + rand() * 0.6);
    b.add(new THREE.CylinderGeometry(0.015, base * 0.42, 1, 5), {
      color: rootColor, matrix: between(V(Math.cos(a) * base * 0.25, 0.34, Math.sin(a) * base * 0.25), V(Math.cos(a) * reach, -0.06, Math.sin(a) * reach)),
    });
  }
}

function branch(b: MeshBuilder, from: THREE.Vector3, to: THREE.Vector3, r0: number, r1: number, color: number): void {
  b.add(new THREE.CylinderGeometry(r1, r0, 1, 6), { color, matrix: between(from, to) });
}

/** What's left of a felled tree: a short flared trunk sawn flat, pale wood showing, with the tree's roots. */
function stump(base: number, color: number, seed: number, rootColor = TRUNK_DARK): Part {
  const b = new MeshBuilder(), rand = mulberry32(seed);
  const cut = 0.3, top = base * 0.8;
  trunk(b, base, V(0, cut, 0), top, color, rand, rootColor);
  b.add(new THREE.CylinderGeometry(top * 0.97, top * 0.97, 0.012, 10), { color: CUT_WOOD, matrix: at(0, cut + 0.004, 0) });
  b.add(new THREE.TorusGeometry(top * 0.5, 0.008, 4, 12).rotateX(Math.PI / 2), { color: shadeOf(CUT_WOOD, 0.8), matrix: at(0, cut + 0.012, 0) });
  return { geometry: b.build(), material: mats().smooth, when: "depleted" };
}

/** A lump of rock: one big faceted stone and a smaller one leaning on it. */
function rockBase(b: MeshBuilder, shape: number): void {
  b.add(new THREE.DodecahedronGeometry(0.42, 0), { color: ROCK[0]!, matrix: at(0, 0.16, 0, [1, 0.72, 1]), jitter: 0.14, shade: 0.12, seed: shape + 11 });
  b.add(new THREE.DodecahedronGeometry(0.22, 0), { color: ROCK[1]!, matrix: at(0.26, 0.08, 0.2 - shape * 0.12), jitter: 0.08, shade: 0.1, seed: shape + 21 });
}

/**
 * A rock with ore in it: the plain rock with nuggets of the ore's colour set into its upper faces. Mined
 * out, only the plain rock shows until the ore comes back. Up the ladder the nuggets grow and thin out,
 * so a starfall rock reads as a few big crystals where a copper one is a scatter of small ones.
 */
function oreRock(shape: number, ore: number, count = 6, size = 0.06): Part[] {
  const veined = new MeshBuilder(), empty = new MeshBuilder();
  rockBase(veined, shape);
  rockBase(empty, shape);
  const rand = mulberry32(900 + shape);
  for (let k = 0; k < count; k++) {
    // Spread round the big stone's upper half, sunk a little so each nugget is half buried.
    const a = (k / count) * Math.PI * 2 + rand() * 0.6, tilt = 0.45 + rand() * 0.6;
    const x = Math.cos(a) * Math.sin(tilt) * 0.38, z = Math.sin(a) * Math.sin(tilt) * 0.38, y = 0.16 + Math.cos(tilt) * 0.27;
    veined.add(new THREE.DodecahedronGeometry(size + rand() * size * 0.5, 0), { color: ore, matrix: at(x, y, z), jitter: 0.02, shade: 0.18, seed: k + shape * 7 });
  }
  return [
    { geometry: veined.build(), material: mats().flat, when: "standing" },
    { geometry: empty.build(), material: mats().flat, when: "depleted" },
  ];
}

/**
 * A coal seam: the same stone, but the coal is a broad dark band cut across its face rather than
 * nuggets, which is what tells it from an ore rock at a glance.
 */
function coalSeam(shape: number): Part[] {
  const veined = new MeshBuilder(), empty = new MeshBuilder();
  rockBase(veined, shape);
  rockBase(empty, shape);
  const rand = mulberry32(960 + shape);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + shape * 0.4;
    const lean = (rand() - 0.5) * 0.5;
    veined.add(new THREE.BoxGeometry(0.34, 0.09, 0.1), {
      color: ORE.coal, matrix: at(Math.cos(a) * 0.24, 0.17 + lean * 0.2, Math.sin(a) * 0.24, 1, -a, 0, lean), jitter: 0.03, shade: 0.22, seed: k + shape * 5,
    });
  }
  return [
    { geometry: veined.build(), material: mats().flat, when: "standing" },
    { geometry: empty.build(), material: mats().flat, when: "depleted" },
  ];
}

/**
 * One tier of the woodcutting ladder, as numbers. Every tree is the same tiered bell over a flared
 * trunk; what tells them apart is height, how wide the tiers are, the bark, and what the one leaf
 * texture is tinted with. The seeds are part of the shape: `tree` and `oak` keep theirs, so they draw
 * exactly as they did before the ladder existed.
 */
interface TreeSpec {
  seed: number;
  stumpSeed: number;
  canopySeed: number;
  /** Trunk: radius at the foot, how high it goes, radius at the top, and the bark's colour. */
  base: number;
  height: number;
  top: number;
  wood: number;
  /** Branches: how many, how much the model's shape turns them, their jitter, and their reach. */
  branches: { count: number; turn: number; jitter: number; from: number; to: number; reach: number; r0: number; r1: number };
  /** How far a tier may sit off the trunk's middle. */
  lean: number;
  /** Each tier: how high its rim is, its radius, how much that varies, its dome and its skirt. */
  tiers: ReadonlyArray<readonly [number, number, number, number, number]>;
  /** The roots and the stump's roots; a shade of the bark unless the tree says otherwise. */
  roots?: number;
  /** What the leaf texture is multiplied by, and the two trees that wear something of their own. */
  leaf?: number;
  berries?: boolean;
  thorns?: boolean;
}

function leafyTree(spec: TreeSpec, shape: number): Part[] {
  const rand = mulberry32(spec.seed + shape);
  const wood = new MeshBuilder(), leaves = new MeshBuilder();
  const roots = spec.roots ?? shadeOf(spec.wood, 0.84);
  trunk(wood, spec.base, V(0, spec.height, 0), spec.top, spec.wood, rand, roots);
  const br = spec.branches;
  for (let k = 0; k < br.count; k++) {
    const a = shape * br.turn + (k * Math.PI * 2) / br.count + rand() * br.jitter;
    branch(wood, V(0, br.from, 0), V(Math.cos(a) * br.reach, br.to, Math.sin(a) * br.reach), br.r0, br.r1, spec.wood);
  }
  const lean = () => (rand() - 0.5) * spec.lean;
  spec.tiers.forEach(([rimY, radius, spread, dome, skirt], i) => {
    canopy(leaves, lean(), rimY, lean(), radius + rand() * spread, dome, skirt, spec.canopySeed + i * 100 + shape, spec.leaf);
  });
  if (spec.berries) {
    // Bunches hung under the rim of each tier, which is the whole of what says "rowan".
    for (const [rimY, radius] of spec.tiers) {
      for (let k = 0; k < 5; k++) {
        const a = rand() * Math.PI * 2, r = radius * (0.6 + rand() * 0.35);
        for (let n = 0; n < 3; n++) {
          const off = 0.05;
          wood.add(new THREE.SphereGeometry(0.035, 5, 4), {
            color: BERRY, matrix: at(Math.cos(a) * r + (rand() - 0.5) * off, rimY - 0.12 - n * 0.05, Math.sin(a) * r + (rand() - 0.5) * off),
          });
        }
      }
    }
  }
  if (spec.thorns) {
    // Spikes on the clear trunk below the lowest skirt, angled up and reaching well clear of the bark.
    // Set any higher they sit inside the foliage where nothing can see them, and `between` stretches a
    // UNIT-height part, so the cone has to be built 1 tall or it comes out a fifth of its reach.
    const [rim, , , , skirt] = spec.tiers[0]!;
    const clear = Math.max(0.5, rim - skirt - 0.08);
    for (let k = 0; k < 11; k++) {
      const a = rand() * Math.PI * 2, y = 0.24 + rand() * (clear - 0.24);
      const from = spec.base * 0.55, out = spec.base + 0.2 + rand() * 0.12;
      wood.add(new THREE.ConeGeometry(0.028, 1, 4), {
        color: THORN,
        matrix: between(V(Math.cos(a) * from, y, Math.sin(a) * from), V(Math.cos(a) * out, y + 0.12 + rand() * 0.08, Math.sin(a) * out)),
      });
    }
  }
  return [
    { geometry: wood.build(), material: mats().smooth, when: "standing" },
    { geometry: leaves.build(), material: mats().leaves, when: "standing" },
    stump(spec.base, spec.wood, spec.stumpSeed + shape, roots),
  ];
}

/** The eight tiers of PLAN §8.2, worst to best. `tree` and `oak` are their original numbers, unchanged. */
const TREES: Record<TreeKind, TreeSpec> = {
  // A tall bell of three leafy tiers, each hem overlapping the tier below, over a flared trunk.
  tree: {
    seed: 100, stumpSeed: 150, canopySeed: 200, base: 0.19, height: 2.2, top: 0.07, wood: TRUNK, roots: TRUNK_DARK, lean: 0.14,
    branches: { count: 2, turn: 1.7, jitter: 0.8, from: 1.2, to: 1.75, reach: 0.45, r0: 0.06, r1: 0.03 },
    tiers: [[1.42, 1.02, 0.14, 0.45, 0.55], [1.95, 0.84, 0.12, 0.45, 0.58], [2.42, 0.56, 0.1, 0.52, 0.5]],
  },
  // Bigger and rounder: a wide skirt of foliage, then two tiers stacked on it.
  oak: {
    seed: 500, stumpSeed: 550, canopySeed: 600, base: 0.27, height: 2.4, top: 0.12, wood: OAK_TRUNK, roots: TRUNK_DARK, lean: 0.18,
    branches: { count: 3, turn: 1, jitter: 0.5, from: 1.25, to: 1.95, reach: 0.7, r0: 0.09, r1: 0.04 },
    tiers: [[1.8, 1.4, 0.16, 0.5, 0.62], [2.4, 1.14, 0.12, 0.5, 0.66], [2.9, 0.78, 0.1, 0.58, 0.55]],
  },
  // Waterside and drawn up narrow, looking for light: taller than a tree and half as wide.
  alder: {
    seed: 1100, stumpSeed: 1150, canopySeed: 1200, base: 0.2, height: 2.9, top: 0.08, wood: BARK.alder, lean: 0.12,
    branches: { count: 3, turn: 1.3, jitter: 0.6, from: 1.5, to: 2.2, reach: 0.4, r0: 0.05, r1: 0.025 },
    tiers: [[1.75, 0.82, 0.1, 0.4, 0.5], [2.3, 0.72, 0.1, 0.42, 0.52], [2.8, 0.5, 0.08, 0.46, 0.46]],
    leaf: LEAF_TINT.alder,
  },
  // Small, pale-barked and wide for its size, with bunches of red berries under every tier.
  rowan: {
    seed: 1500, stumpSeed: 1550, canopySeed: 1600, base: 0.17, height: 2, top: 0.07, wood: BARK.rowan, lean: 0.16,
    branches: { count: 4, turn: 0.9, jitter: 0.7, from: 1.1, to: 1.6, reach: 0.5, r0: 0.05, r1: 0.025 },
    tiers: [[1.4, 0.98, 0.12, 0.38, 0.5], [1.95, 0.74, 0.1, 0.42, 0.48]],
    leaf: LEAF_TINT.rowan, berries: true,
  },
  // Squat, black-barked and spreading, and covered in spikes: it does not want cutting.
  blackthorn: {
    seed: 1900, stumpSeed: 1950, canopySeed: 2000, base: 0.24, height: 1.7, top: 0.1, wood: BARK.blackthorn, lean: 0.22,
    branches: { count: 5, turn: 0.7, jitter: 0.9, from: 0.8, to: 1.35, reach: 0.72, r0: 0.06, r1: 0.025 },
    tiers: [[1.2, 1.26, 0.14, 0.3, 0.46], [1.68, 0.96, 0.12, 0.34, 0.44]],
    leaf: LEAF_TINT.blackthorn, thorns: true,
  },
  // A grey column that barely tapers, carrying a small crown a long way up.
  ironbark: {
    seed: 2300, stumpSeed: 2350, canopySeed: 2400, base: 0.3, height: 3.5, top: 0.21, wood: BARK.ironbark, lean: 0.1,
    branches: { count: 3, turn: 1.1, jitter: 0.5, from: 2.3, to: 2.95, reach: 0.44, r0: 0.07, r1: 0.03 },
    tiers: [[2.55, 0.86, 0.1, 0.4, 0.46], [3.05, 0.7, 0.08, 0.42, 0.44], [3.45, 0.48, 0.08, 0.46, 0.4]],
    leaf: LEAF_TINT.ironbark,
  },
  // The tallest thing growing: a near-black spire of four tiers on Mount Sear's slopes.
  sablewood: {
    seed: 2700, stumpSeed: 2750, canopySeed: 2800, base: 0.34, height: 4, top: 0.13, wood: BARK.sablewood, lean: 0.14,
    branches: { count: 4, turn: 1.2, jitter: 0.6, from: 1.8, to: 2.8, reach: 0.6, r0: 0.08, r1: 0.035 },
    tiers: [[2.1, 1.28, 0.14, 0.5, 0.66], [2.8, 1.06, 0.12, 0.5, 0.64], [3.4, 0.8, 0.1, 0.52, 0.56], [3.9, 0.52, 0.08, 0.56, 0.48]],
    leaf: LEAF_TINT.sablewood,
  },
  // Enormous and low-crowned, on a trunk two people could not reach round.
  heartoak: {
    seed: 3100, stumpSeed: 3150, canopySeed: 3200, base: 0.52, height: 3.1, top: 0.24, wood: BARK.heartoak, lean: 0.24,
    branches: { count: 5, turn: 0.8, jitter: 0.5, from: 1.5, to: 2.5, reach: 1.1, r0: 0.13, r1: 0.05 },
    tiers: [[2.2, 1.92, 0.2, 0.55, 0.78], [2.9, 1.62, 0.16, 0.55, 0.74], [3.5, 1.24, 0.12, 0.58, 0.64], [4, 0.82, 0.1, 0.6, 0.54]],
    leaf: LEAF_TINT.heartoak,
  },
};

const shadeOf = (hex: number, k: number) => new THREE.Color(hex).multiplyScalar(k).getHex();

const MODELS: Record<ObjectKind, (shape: number) => Part[]> = {
  // The eight trees: each tier's skirt reaches down over the dome of the one below, so no gaps show.
  tree: (shape) => leafyTree(TREES.tree, shape),
  oak: (shape) => leafyTree(TREES.oak, shape),
  alder: (shape) => leafyTree(TREES.alder, shape),
  rowan: (shape) => leafyTree(TREES.rowan, shape),
  blackthorn: (shape) => leafyTree(TREES.blackthorn, shape),
  ironbark: (shape) => leafyTree(TREES.ironbark, shape),
  sablewood: (shape) => leafyTree(TREES.sablewood, shape),
  heartoak: (shape) => leafyTree(TREES.heartoak, shape),
  rock(shape) {
    const b = new MeshBuilder();
    rockBase(b, shape);
    return [{ geometry: b.build(), material: mats().flat }];
  },
  // The eight rocks. Coal is a seam rather than nuggets; above it the pieces grow and thin out.
  copper_rock: (shape) => oreRock(shape, ORE.copper),
  tin_rock: (shape) => oreRock(shape, ORE.tin),
  iron_rock: (shape) => oreRock(shape, ORE.iron),
  coal_rock: (shape) => coalSeam(shape),
  silver_rock: (shape) => oreRock(shape, ORE.silver, 5, 0.07),
  coldiron_rock: (shape) => oreRock(shape, ORE.coldiron, 5, 0.075),
  gold_rock: (shape) => oreRock(shape, ORE.gold, 5, 0.075),
  emberite_rock: (shape) => oreRock(shape, ORE.emberite, 4, 0.09),
  starfall_rock: (shape) => oreRock(shape, ORE.starfall, 3, 0.11),
  fence() {
    const b = new MeshBuilder();
    for (const x of [-0.46, 0.46]) b.add(new THREE.CylinderGeometry(0.045, 0.05, 1, 6), { color: FENCE, matrix: at(x, 0.25, 0) });
    for (const y of [0.36, 0.62]) b.add(new THREE.BoxGeometry(1, 0.06, 0.045), { color: FENCE, matrix: at(0, y, 0) });
    return [{ geometry: b.build(), material: mats().smooth }];
  },
  /**
   * A stretch of village wall: plaster between the timbers, with a sill at the foot and a plate along
   * the top. The frame is what the window below cuts its opening into, so the two read as one building
   * rather than as a shed with a picture stuck on it.
   */
  wall(storeys) {
    const b = new MeshBuilder();
    for (let s = 0; s <= storeys; s++) plasterPanel(b, undefined, s * WALL_HEIGHT);
    return [{ geometry: b.build(), material: mats().flat }];
  },
  /** The ruin's bare stone, for walls with nothing behind them. */
  stone_wall() {
    const b = new MeshBuilder();
    b.add(new THREE.BoxGeometry(1.02, 1.35, 0.2), { color: WALL_STONE, matrix: at(0, 0.3, 0), shade: 0.1 });
    b.add(new THREE.BoxGeometry(1.06, 0.1, 0.26), { color: WALL_CAP, matrix: at(0, 1.0, 0), shade: 0.06 });
    return [{ geometry: b.build(), material: mats().flat }];
  },

  // --- The village (Phase 7) -----------------------------------------------------------------
  // Walls are plaster between timbers, in the style of §7.4's village. A window is the same wall with
  // a shuttered opening cut into its upper half; the plaster above and below carries the frame.
  wall_window(storeys) {
    const b = new MeshBuilder();
    // The same wall, with a shuttered opening in the upper half of every storey it has.
    for (let s = 0; s <= storeys; s++) {
      const base = s * WALL_HEIGHT;
      plasterPanel(b, { x: 0.24, y0: 0.62, y1: 1.22 }, base);
      b.add(new THREE.BoxGeometry(0.5, 0.62, 0.05), { color: IRON_DARK, matrix: at(0, base + 0.92, 0), shade: 0.04 });
      for (const x of [-0.3, 0.3]) b.add(new THREE.BoxGeometry(0.06, 0.66, 0.16), { color: TIMBER, matrix: at(x, base + 0.92, 0), shade: 0.1 });
      b.add(new THREE.BoxGeometry(0.62, 0.06, 0.18), { color: TIMBER, matrix: at(0, base + 1.26, 0), shade: 0.1 });
    }
    return [{ geometry: b.build(), material: mats().flat }];
  },
  door: () => [doorLeaf(DOOR_WOOD, 0.9)],
  gate: () => [doorLeaf(TIMBER, 1.15)],
  // A barred mouth and a sealed stair: both are walls that say plainly they are not opening yet.
  barred() {
    const b = new MeshBuilder();
    b.add(new THREE.BoxGeometry(1.02, 1.5, 0.22), { color: DARK_STONE, matrix: at(0, 0.36, 0), shade: 0.12 });
    // The opening, and the bars across it.
    b.add(new THREE.BoxGeometry(0.72, 0.95, 0.1), { color: 0x14100e, matrix: at(0, 0.44, 0.07), shade: 0 });
    for (const x of [-0.26, 0, 0.26]) b.add(new THREE.CylinderGeometry(0.035, 0.035, 0.95, 5), { color: IRON_BAR, matrix: at(x, 0.44, 0.08) });
    for (const y of [0.08, 0.86]) b.add(new THREE.BoxGeometry(0.74, 0.06, 0.07), { color: IRON_BAR, matrix: at(0, y, 0.08) });
    return [{ geometry: b.build(), material: mats().flat }];
  },
  sealed() {
    const b = new MeshBuilder();
    b.add(new THREE.BoxGeometry(1.1, 0.5, 1.1), { color: DARK_STONE, matrix: at(0, 0.18, 0), shade: 0.12 });
    b.add(new THREE.BoxGeometry(0.92, 0.16, 0.92), { color: CUT_STONE, matrix: at(0, 0.5, 0), shade: 0.06 });
    // The seam of the slab that covers it, and the iron ring nobody can shift.
    b.add(new THREE.BoxGeometry(0.06, 0.18, 0.92), { color: DARK_STONE, matrix: at(0, 0.52, 0), shade: 0.04 });
    b.add(new THREE.TorusGeometry(0.13, 0.03, 5, 10), { color: IRON_BAR, matrix: at(0.22, 0.6, 0, 1, 0, Math.PI / 2) });
    return [{ geometry: b.build(), material: mats().flat }];
  },
  // The bank's booth: a counter with a grille over it, which is how you know it from a shop counter.
  bank_booth() {
    const b = new MeshBuilder();
    b.add(new THREE.BoxGeometry(0.98, 0.78, 0.5), { color: TIMBER, matrix: at(0, 0.2, 0), shade: 0.1 });
    b.add(new THREE.BoxGeometry(1.04, 0.09, 0.62), { color: DOOR_WOOD, matrix: at(0, 0.63, 0), shade: 0.06 });
    for (const x of [-0.44, 0.44]) b.add(new THREE.BoxGeometry(0.08, 0.86, 0.1), { color: TIMBER, matrix: at(x, 1.1, -0.2), shade: 0.1 });
    b.add(new THREE.BoxGeometry(1.04, 0.09, 0.14), { color: TIMBER, matrix: at(0, 1.5, -0.2), shade: 0.1 });
    for (const x of [-0.3, -0.1, 0.1, 0.3]) {
      b.add(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 5), { color: IRON_BAR, matrix: at(x, 1.08, -0.2) });
    }
    return [{ geometry: b.build(), material: mats().flat }];
  },
  // A shop counter: the same bench, piled with goods instead of barred.
  counter() {
    const b = new MeshBuilder();
    b.add(new THREE.BoxGeometry(0.98, 0.72, 0.5), { color: TIMBER, matrix: at(0, 0.18, 0), shade: 0.1 });
    b.add(new THREE.BoxGeometry(1.04, 0.09, 0.64), { color: DOOR_WOOD, matrix: at(0, 0.59, 0), shade: 0.06 });
    b.add(new THREE.BoxGeometry(0.26, 0.2, 0.22), { color: SACK_CLOTH, matrix: at(-0.25, 0.73, 0.04), shade: 0.08 });
    b.add(new THREE.CylinderGeometry(0.1, 0.12, 0.22, 7), { color: 0x9a6a3a, matrix: at(0.22, 0.74, -0.02) });
    return [{ geometry: b.build(), material: mats().flat }];
  },
  stall: () => MODELS.counter(0),
  // The forge: a stone hood over a bed of coals, with the fire showing under it.
  furnace() {
    const b = new MeshBuilder();
    b.add(new THREE.BoxGeometry(1.1, 1.05, 1.1), { color: DARK_STONE, matrix: at(0, 0.36, 0), shade: 0.12 });
    b.add(new THREE.BoxGeometry(0.62, 0.42, 0.3), { color: 0x14100e, matrix: at(0, 0.38, 0.45), shade: 0 });
    b.add(new THREE.BoxGeometry(0.5, 0.2, 0.2), { color: EMBER, matrix: at(0, 0.26, 0.46), shade: 0 });
    b.add(new THREE.BoxGeometry(0.34, 0.22, 0.14), { color: FLAME, matrix: at(0, 0.42, 0.47), shade: 0 });
    b.add(new THREE.CylinderGeometry(0.2, 0.28, 0.9, 6), { color: CUT_STONE, matrix: at(0, 1.25, -0.16), shade: 0.08 });
    return [{ geometry: b.build(), material: mats().flat }];
  },
  // The anvil: an iron horn on a sawn block of oak.
  anvil() {
    const b = new MeshBuilder();
    b.add(new THREE.CylinderGeometry(0.34, 0.4, 0.42, 9), { color: OAK_TRUNK, matrix: at(0, 0.1, 0), shade: 0.08 });
    b.add(new THREE.BoxGeometry(0.66, 0.16, 0.34), { color: ANVIL_IRON, matrix: at(0, 0.38, 0), shade: 0.1 });
    b.add(new THREE.BoxGeometry(0.34, 0.16, 0.28), { color: ANVIL_IRON, matrix: at(0, 0.24, 0), shade: 0.1 });
    b.add(new THREE.ConeGeometry(0.11, 0.3, 7), { color: ANVIL_IRON, matrix: at(0.44, 0.4, 0, 1, 0, 0, Math.PI / 2) });
    return [{ geometry: b.build(), material: mats().flat }];
  },
  // A cooking range: a stone box with a hot plate and a flue.
  range() {
    const b = new MeshBuilder();
    b.add(new THREE.BoxGeometry(1.04, 0.72, 0.86), { color: CUT_STONE, matrix: at(0, 0.18, 0), shade: 0.1 });
    b.add(new THREE.BoxGeometry(1.08, 0.08, 0.9), { color: ANVIL_IRON, matrix: at(0, 0.58, 0), shade: 0.06 });
    b.add(new THREE.BoxGeometry(0.56, 0.3, 0.16), { color: EMBER, matrix: at(0, 0.2, 0.4), shade: 0 });
    b.add(new THREE.CylinderGeometry(0.14, 0.18, 0.7, 6), { color: DARK_STONE, matrix: at(0, 0.95, -0.28), shade: 0.08 });
    return [{ geometry: b.build(), material: mats().flat }];
  },
  // A fire on the ground: logs crossed over ash, with flame standing in them.
  fire(shape) {
    const b = new MeshBuilder();
    b.add(new THREE.CylinderGeometry(0.34, 0.36, 0.06, 9), { color: ASH, matrix: at(0, 0.02, 0), shade: 0.06 });
    for (let i = 0; i < 4; i++) {
      const a2 = (i / 4) * Math.PI + shape * 0.3;
      b.add(new THREE.CylinderGeometry(0.05, 0.06, 0.62, 5), {
        color: TRUNK_DARK, matrix: at(0, 0.1, 0, 1, a2, 0, Math.PI / 2.4), shade: 0.1,
      });
    }
    b.add(new THREE.ConeGeometry(0.22, 0.44, 6), { color: EMBER, matrix: at(0, 0.24, 0), shade: 0 });
    b.add(new THREE.ConeGeometry(0.13, 0.54, 5), { color: FLAME, matrix: at(0, 0.36, 0), shade: 0 });
    return [{ geometry: b.build(), material: mats().flat }];
  },
  millstone() {
    const b = new MeshBuilder();
    b.add(new THREE.CylinderGeometry(0.46, 0.46, 0.18, 12), { color: CUT_STONE, matrix: at(0, 0.09, 0), shade: 0.08 });
    b.add(new THREE.CylinderGeometry(0.42, 0.44, 0.16, 12), { color: DARK_STONE, matrix: at(0, 0.26, 0), shade: 0.08 });
    b.add(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 6), { color: TIMBER, matrix: at(0, 0.45, 0) });
    return [{ geometry: b.build(), material: mats().flat }];
  },
  grave(shape) {
    const b = new MeshBuilder();
    const lean = (shape - 1) * 0.12;
    b.add(new THREE.BoxGeometry(0.34, 0.52, 0.09), { color: CUT_STONE, matrix: at(0, 0.24, 0, 1, 0, 0, lean), shade: 0.1 });
    b.add(new THREE.CylinderGeometry(0.17, 0.17, 0.09, 9, 1, false, 0, Math.PI), {
      color: CUT_STONE, matrix: at(-Math.sin(lean) * 0.5, 0.48, 0, 1, 0, Math.PI / 2, lean), shade: 0.1,
    });
    b.add(new THREE.BoxGeometry(0.52, 0.06, 0.3), { color: DARK_STONE, matrix: at(0, 0.02, 0.2), shade: 0.06 });
    return [{ geometry: b.build(), material: mats().flat }];
  },
  sarcophagus() {
    const b = new MeshBuilder();
    b.add(new THREE.BoxGeometry(0.72, 0.44, 1.5), { color: DARK_STONE, matrix: at(0, 0.18, 0), shade: 0.1 });
    b.add(new THREE.BoxGeometry(0.8, 0.14, 1.6), { color: CUT_STONE, matrix: at(0, 0.45, 0), shade: 0.06 });
    b.add(new THREE.BoxGeometry(0.3, 0.05, 0.62), { color: DARK_STONE, matrix: at(0, 0.53, -0.2), shade: 0.05 });
    return [{ geometry: b.build(), material: mats().flat }];
  },
  table() {
    const b = new MeshBuilder();
    b.add(new THREE.BoxGeometry(0.9, 0.07, 0.62), { color: DOOR_WOOD, matrix: at(0, 0.54, 0), shade: 0.06 });
    for (const [x, z] of [[-0.36, -0.22], [0.36, -0.22], [-0.36, 0.22], [0.36, 0.22]] as const) {
      b.add(new THREE.BoxGeometry(0.08, 0.52, 0.08), { color: TIMBER, matrix: at(x, 0.26, z), shade: 0.08 });
    }
    return [{ geometry: b.build(), material: mats().flat }];
  },
  barrel() {
    const b = new MeshBuilder();
    b.add(new THREE.CylinderGeometry(0.28, 0.24, 0.64, 10), { color: DOOR_WOOD, matrix: at(0, 0.32, 0), shade: 0.08 });
    for (const y of [0.14, 0.5]) b.add(new THREE.CylinderGeometry(0.29, 0.29, 0.05, 10), { color: IRON_BAR, matrix: at(0, y, 0) });
    return [{ geometry: b.build(), material: mats().flat }];
  },
  crate() {
    const b = new MeshBuilder();
    b.add(new THREE.BoxGeometry(0.62, 0.56, 0.62), { color: TIMBER, matrix: at(0, 0.28, 0), shade: 0.1 });
    for (const z of [-0.32, 0.32]) b.add(new THREE.BoxGeometry(0.66, 0.08, 0.04), { color: DOOR_WOOD, matrix: at(0, 0.4, z), shade: 0.06 });
    return [{ geometry: b.build(), material: mats().flat }];
  },
  // A stair reads as a stair from every side: four steps and a rail.
  stairs() {
    const b = new MeshBuilder();
    for (let i = 0; i < 4; i++) {
      b.add(new THREE.BoxGeometry(0.86, 0.16, 0.9 - i * 0.2), {
        color: DOOR_WOOD, matrix: at(0, 0.08 + i * 0.16, 0.36 - i * 0.1), shade: 0.07,
      });
    }
    for (const x of [-0.44, 0.44]) b.add(new THREE.BoxGeometry(0.06, 0.78, 0.06), { color: TIMBER, matrix: at(x, 0.5, -0.3), shade: 0.08 });
    return [{ geometry: b.build(), material: mats().flat }];
  },
  ladder() {
    const b = new MeshBuilder();
    for (const x of [-0.16, 0.16]) b.add(new THREE.BoxGeometry(0.07, 1.6, 0.07), { color: DOOR_WOOD, matrix: at(x, 0.8, 0), shade: 0.08 });
    for (let i = 0; i < 6; i++) {
      b.add(new THREE.BoxGeometry(0.36, 0.05, 0.05), { color: TIMBER, matrix: at(0, 0.2 + i * 0.26, 0), shade: 0.06 });
    }
    return [{ geometry: b.build(), material: mats().flat }];
  },
  signpost() {
    const b = new MeshBuilder();
    b.add(new THREE.CylinderGeometry(0.06, 0.07, 1.5, 6), { color: TIMBER, matrix: at(0, 0.75, 0), shade: 0.08 });
    b.add(new THREE.BoxGeometry(0.66, 0.2, 0.05), { color: DOOR_WOOD, matrix: at(0.2, 1.3, 0), shade: 0.06 });
    b.add(new THREE.BoxGeometry(0.56, 0.18, 0.05), { color: DOOR_WOOD, matrix: at(-0.18, 1.02, 0, 1, Math.PI / 2), shade: 0.06 });
    return [{ geometry: b.build(), material: mats().flat }];
  },
  bush(shape) {
    const b = new MeshBuilder();
    const rand = mulberry32(900 + shape);
    for (let i = 0; i < 5; i++) {
      const a2 = rand() * Math.PI * 2, r = rand() * 0.2;
      b.add(ellipsoid(0.22 + rand() * 0.1, 0.18 + rand() * 0.08, 0.22 + rand() * 0.1, 7, 5), {
        color: BUSH_GREEN, matrix: at(Math.cos(a2) * r, 0.18 + rand() * 0.12, Math.sin(a2) * r), shade: 0.12,
      });
    }
    return [{ geometry: b.build(), material: mats().flat }];
  },
  reed(shape) {
    const b = new MeshBuilder();
    const rand = mulberry32(1300 + shape);
    for (let i = 0; i < 9; i++) {
      const a2 = rand() * Math.PI * 2, r = rand() * 0.28, h = 0.6 + rand() * 0.5;
      b.add(new THREE.CylinderGeometry(0.012, 0.022, h, 4), {
        color: REED_GREEN, matrix: at(Math.cos(a2) * r, h / 2, Math.sin(a2) * r, 1, 0, 0, (rand() - 0.5) * 0.3), shade: 0.14,
      });
    }
    return [{ geometry: b.build(), material: mats().flat }];
  },
  crop(shape) {
    const b = new MeshBuilder();
    const rand = mulberry32(1700 + shape);
    for (let i = 0; i < 6; i++) {
      const x = -0.3 + (i % 3) * 0.3, z = -0.2 + Math.floor(i / 3) * 0.4;
      const h = 0.3 + rand() * 0.16;
      b.add(new THREE.ConeGeometry(0.09, h, 5), { color: CROP_GREEN, matrix: at(x, h / 2, z), shade: 0.12 });
    }
    return [{ geometry: b.build(), material: mats().flat }];
  },
};

/** How tall a village wall stands, and how thick it is. The roof's eaves sit on top of this. */
export const WALL_HEIGHT = 1.62;
const WALL_THICK = 0.18;

/**
 * One panel of plaster in its timber frame: a post at each end, a sill at the foot, a plate along the
 * top, and the plaster filling what is left. `hole` leaves a gap for a window, given as a half-width
 * and the heights it spans.
 */
function plasterPanel(b: MeshBuilder, hole?: { x: number; y0: number; y1: number }, base = 0): void {
  const H = WALL_HEIGHT, T = WALL_THICK;
  const fill = (x: number, y: number, w: number, h: number) => {
    if (w <= 0.001 || h <= 0.001) return;
    b.add(new THREE.BoxGeometry(w, h, T), { color: PLASTER, matrix: at(x, base + y, 0), shade: 0.07 });
  };
  const inner = 0.44;
  if (hole) {
    fill(0, hole.y0 / 2, inner * 2, hole.y0);
    fill(0, (hole.y1 + H) / 2, inner * 2, H - hole.y1);
    const side = inner - hole.x;
    for (const sign of [-1, 1]) fill(sign * (hole.x + side / 2), (hole.y0 + hole.y1) / 2, side, hole.y1 - hole.y0);
  } else {
    fill(0, H / 2, inner * 2, H);
  }
  // The frame: a post at each end, a sill, and the plate the floor above (or the roof) sits on.
  for (const x of [-0.48, 0.48]) {
    b.add(new THREE.BoxGeometry(0.09, H, T + 0.04), { color: TIMBER, matrix: at(x, base + H / 2, 0), shade: 0.11 });
  }
  b.add(new THREE.BoxGeometry(1.04, 0.1, T + 0.05), { color: TIMBER, matrix: at(0, base + 0.05, 0), shade: 0.11 });
  b.add(new THREE.BoxGeometry(1.04, 0.11, T + 0.06), { color: TIMBER, matrix: at(0, base + H - 0.055, 0), shade: 0.11 });
}

/**
 * A door or a gate: a leaf of planks on the tile edge, hung a little in from the wall line so it is
 * plainly a door and not a stretch of wall. It swings on its hinge when it is opened.
 */
function doorLeaf(color: number, height: number): Part {
  const b = new MeshBuilder();
  b.add(new THREE.BoxGeometry(0.94, height, 0.12), { color, matrix: at(0, height / 2 - 0.08, 0), shade: 0.09 });
  for (const y of [height * 0.25, height * 0.75]) {
    b.add(new THREE.BoxGeometry(0.98, 0.08, 0.15), { color: IRON_BAR, matrix: at(0, y - 0.08, 0), shade: 0.05 });
  }
  b.add(new THREE.CylinderGeometry(0.035, 0.035, 0.1, 6), { color: IRON_BAR, matrix: at(0.3, height * 0.5 - 0.08, 0.08, 1, 0, Math.PI / 2) });
  return { geometry: b.build(), material: mats().flat };
}
