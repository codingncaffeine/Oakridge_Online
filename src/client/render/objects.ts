import * as THREE from "three";
import { heightAt, type MapObject, type ObjectKind, type WorldMap } from "../../shared/map.ts";
import { mulberry32 } from "../../shared/rng.ts";
import {
  FENCE, OAK_TRUNK, ROCK, TRUNK, TRUNK_DARK, WALL_CAP, WALL_STONE,
} from "../palette.ts";
import { at, between, MeshBuilder } from "./meshkit.ts";
import { leafTexture } from "./textures.ts";

const SHAPES_PER_KIND = 3;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

interface Part {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

let materials: { flat: THREE.Material; smooth: THREE.Material; leaves: THREE.Material } | null = null;
function mats() {
  materials ??= {
    flat: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    smooth: new THREE.MeshLambertMaterial({ vertexColors: true }),
    leaves: new THREE.MeshLambertMaterial({
      map: leafTexture(), alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide, flatShading: true,
    }),
  };
  return materials;
}

/** Every map object, drawn as instanced meshes: one per model shape and part. */
export function buildObjects(map: WorldMap): THREE.Group {
  const group = new THREE.Group();
  const buckets = new Map<string, { parts: Part[]; items: MapObject[] }>();
  for (const o of map.objects) {
    const shape = isEdge(o.kind) ? 0 : Math.floor(o.variant * SHAPES_PER_KIND);
    const key = `${o.kind}:${shape}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { parts: MODELS[o.kind](shape), items: [] };
      buckets.set(key, bucket);
    }
    bucket.items.push(o);
  }

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0), tint = new THREE.Color();
  for (const { parts, items } of buckets.values()) {
    for (const part of parts) {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, items.length);
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
        mesh.setMatrixAt(i, m.compose(p, q, s));
        mesh.setColorAt(i, tint.setScalar(0.9 + 0.2 * fract(o.variant * 29.3)));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      // Picking maps a hit's instanceId back to the map object it drew.
      mesh.userData.items = items;
      group.add(mesh);
    }
  }
  return group;
}

function isEdge(kind: ObjectKind): boolean {
  return kind === "fence" || kind === "wall";
}

function fract(v: number): number {
  return v - Math.floor(v);
}

/**
 * An umbrella of foliage: a low dome whose skirt ends in the leaf texture's ragged fringe. The outline
 * wobbles per spoke so no two canopies are perfectly round.
 */
function canopy(b: MeshBuilder, cx: number, rimY: number, cz: number, radius: number, dome: number, skirt: number, seed: number): void {
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
  b.add(g, { color: 0xffffff });
}

/** A trunk from just below ground to `top`, flaring into four roots at its foot. */
function trunk(b: MeshBuilder, base: number, top: THREE.Vector3, topRadius: number, color: number, rand: () => number): void {
  b.add(new THREE.CylinderGeometry(topRadius, base * 0.6, 1, 8, 3), { color, matrix: between(V(0, -0.2, 0), top) });
  for (let k = 0; k < 4; k++) {
    const a = (k + 0.15 + rand() * 0.3) * (Math.PI / 2);
    const reach = base * (2 + rand() * 0.6);
    b.add(new THREE.CylinderGeometry(0.015, base * 0.42, 1, 5), {
      color: TRUNK_DARK, matrix: between(V(Math.cos(a) * base * 0.25, 0.34, Math.sin(a) * base * 0.25), V(Math.cos(a) * reach, -0.06, Math.sin(a) * reach)),
    });
  }
}

function branch(b: MeshBuilder, from: THREE.Vector3, to: THREE.Vector3, r0: number, r1: number, color: number): void {
  b.add(new THREE.CylinderGeometry(r1, r0, 1, 6), { color, matrix: between(from, to) });
}

const MODELS: Record<ObjectKind, (shape: number) => Part[]> = {
  // A tall bell of three leafy tiers, each hem overlapping the tier below, over a flared trunk.
  tree(shape) {
    const rand = mulberry32(100 + shape);
    const wood = new MeshBuilder(), leaves = new MeshBuilder();
    trunk(wood, 0.19, V(0, 2.2, 0), 0.07, TRUNK, rand);
    for (let k = 0; k < 2; k++) {
      const a = shape * 1.7 + k * Math.PI + rand() * 0.8;
      branch(wood, V(0, 1.2, 0), V(Math.cos(a) * 0.45, 1.75, Math.sin(a) * 0.45), 0.06, 0.03, TRUNK);
    }
    // Each tier's skirt reaches down over the dome of the tier below, so no gaps show between them.
    const lean = () => (rand() - 0.5) * 0.14;
    canopy(leaves, lean(), 1.42, lean(), 1.02 + rand() * 0.14, 0.45, 0.55, 200 + shape);
    canopy(leaves, lean(), 1.95, lean(), 0.84 + rand() * 0.12, 0.45, 0.58, 300 + shape);
    canopy(leaves, lean(), 2.42, lean(), 0.56 + rand() * 0.1, 0.52, 0.5, 400 + shape);
    return [{ geometry: wood.build(), material: mats().smooth }, { geometry: leaves.build(), material: mats().leaves }];
  },
  // Bigger and rounder: a wide skirt of foliage, then two tiers stacked on it.
  oak(shape) {
    const rand = mulberry32(500 + shape);
    const wood = new MeshBuilder(), leaves = new MeshBuilder();
    trunk(wood, 0.27, V(0, 2.4, 0), 0.12, OAK_TRUNK, rand);
    for (let k = 0; k < 3; k++) {
      const a = shape + (k * Math.PI * 2) / 3 + rand() * 0.5;
      branch(wood, V(0, 1.25, 0), V(Math.cos(a) * 0.7, 1.95, Math.sin(a) * 0.7), 0.09, 0.04, OAK_TRUNK);
    }
    const lean = () => (rand() - 0.5) * 0.18;
    canopy(leaves, lean(), 1.8, lean(), 1.4 + rand() * 0.16, 0.5, 0.62, 600 + shape);
    canopy(leaves, lean(), 2.4, lean(), 1.14 + rand() * 0.12, 0.5, 0.66, 700 + shape);
    canopy(leaves, lean(), 2.9, lean(), 0.78 + rand() * 0.1, 0.58, 0.55, 800 + shape);
    return [{ geometry: wood.build(), material: mats().smooth }, { geometry: leaves.build(), material: mats().leaves }];
  },
  rock(shape) {
    const b = new MeshBuilder();
    b.add(new THREE.DodecahedronGeometry(0.42, 0), { color: ROCK[0]!, matrix: at(0, 0.16, 0, [1, 0.72, 1]), jitter: 0.14, shade: 0.12, seed: shape + 11 });
    b.add(new THREE.DodecahedronGeometry(0.22, 0), { color: ROCK[1]!, matrix: at(0.26, 0.08, 0.2 - shape * 0.12), jitter: 0.08, shade: 0.1, seed: shape + 21 });
    return [{ geometry: b.build(), material: mats().flat }];
  },
  fence() {
    const b = new MeshBuilder();
    for (const x of [-0.46, 0.46]) b.add(new THREE.CylinderGeometry(0.045, 0.05, 1, 6), { color: FENCE, matrix: at(x, 0.25, 0) });
    for (const y of [0.36, 0.62]) b.add(new THREE.BoxGeometry(1, 0.06, 0.045), { color: FENCE, matrix: at(0, y, 0) });
    return [{ geometry: b.build(), material: mats().smooth }];
  },
  wall() {
    const b = new MeshBuilder();
    b.add(new THREE.BoxGeometry(1.02, 1.35, 0.2), { color: WALL_STONE, matrix: at(0, 0.3, 0), shade: 0.1 });
    b.add(new THREE.BoxGeometry(1.06, 0.1, 0.26), { color: WALL_CAP, matrix: at(0, 1.0, 0), shade: 0.06 });
    return [{ geometry: b.build(), material: mats().flat }];
  },
};
