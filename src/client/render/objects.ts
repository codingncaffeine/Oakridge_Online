import * as THREE from "three";
import { heightAt, type MapObject, type ObjectKind, type WorldMap } from "../../shared/map.ts";
import {
  FENCE, LEAVES, OAK_LEAVES, OAK_TRUNK, ROCK, TRUNK, WALL_CAP, WALL_STONE,
} from "../palette.ts";
import { at, ModelBuilder } from "./meshkit.ts";

const SHAPES_PER_KIND = 3;

/** Every map object, drawn as one instanced mesh per model shape. */
export function buildObjects(map: WorldMap): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const buckets = new Map<string, { geometry: THREE.BufferGeometry; items: MapObject[] }>();
  for (const o of map.objects) {
    const shape = isEdge(o.kind) ? 0 : Math.floor(o.variant * SHAPES_PER_KIND);
    const key = `${o.kind}:${shape}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { geometry: MODELS[o.kind](shape), items: [] };
      buckets.set(key, bucket);
    }
    bucket.items.push(o);
  }

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0), tint = new THREE.Color();
  for (const { geometry, items } of buckets.values()) {
    const mesh = new THREE.InstancedMesh(geometry, material, items.length);
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
        s.setScalar(0.85 + 0.3 * fract(o.variant * 13.7));
      }
      mesh.setMatrixAt(i, m.compose(p, q, s));
      mesh.setColorAt(i, tint.setScalar(0.9 + 0.2 * fract(o.variant * 29.3)));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
}

function isEdge(kind: ObjectKind): boolean {
  return kind === "fence" || kind === "wall";
}

function fract(v: number): number {
  return v - Math.floor(v);
}

const MODELS: Record<ObjectKind, (shape: number) => THREE.BufferGeometry> = {
  tree(shape) {
    const b = new ModelBuilder();
    b.add(new THREE.CylinderGeometry(0.08, 0.13, 1.35, 6), TRUNK, at(0, 0.47, 0), { shade: 0.06 });
    const lumps: Array<[number, number, number, number]> = [[0, 1.4, 0, 0.55], [0.2, 1.72, 0.06, 0.4], [-0.2, 1.58, -0.14, 0.38]];
    lumps.slice(0, 2 + (shape % 2)).forEach(([x, y, z, r], i) =>
      b.add(new THREE.IcosahedronGeometry(r, 0), LEAVES[i % 2]!, at(x, y + shape * 0.06, z), { jitter: 0.1, shade: 0.1, seed: shape * 5 + i }));
    return b.build();
  },
  oak(shape) {
    const b = new ModelBuilder();
    b.add(new THREE.CylinderGeometry(0.13, 0.21, 1.4, 7), OAK_TRUNK, at(0, 0.5, 0), { shade: 0.06 });
    b.add(new THREE.CylinderGeometry(0.05, 0.08, 0.7, 5), OAK_TRUNK, at(0.22, 1.2, 0, 1, 0, -0.8));
    b.add(new THREE.CylinderGeometry(0.05, 0.08, 0.6, 5), OAK_TRUNK, at(-0.2, 1.25, 0.05, 1, 0.4, 0.9));
    const lumps: Array<[number, number, number, number]> = [
      [0, 1.85, 0, 0.72], [0.48, 1.65, 0.12, 0.52], [-0.48, 1.7, -0.1, 0.54], [0.08, 2.2, -0.22, 0.5], [-0.14, 1.6, 0.48, 0.46],
    ];
    lumps.slice(0, 4 + (shape % 2)).forEach(([x, y, z, r], i) =>
      b.add(new THREE.IcosahedronGeometry(r, 0), OAK_LEAVES[(i + shape) % 3]!, at(x, y, z), { jitter: 0.12, shade: 0.1, seed: shape * 7 + i }));
    return b.build();
  },
  rock(shape) {
    const b = new ModelBuilder();
    b.add(new THREE.DodecahedronGeometry(0.42, 0), ROCK[0]!, new THREE.Matrix4().makeScale(1, 0.72, 1).setPosition(0, 0.16, 0),
      { jitter: 0.14, shade: 0.12, seed: shape + 11 });
    b.add(new THREE.DodecahedronGeometry(0.22, 0), ROCK[1]!, at(0.26, 0.08, 0.2 - shape * 0.12), { jitter: 0.08, shade: 0.1, seed: shape + 21 });
    return b.build();
  },
  fence() {
    const b = new ModelBuilder();
    for (const x of [-0.46, 0.46]) b.add(new THREE.BoxGeometry(0.09, 0.95, 0.09), FENCE, at(x, 0.2, 0), { shade: 0.08 });
    for (const y of [0.34, 0.6]) b.add(new THREE.BoxGeometry(1, 0.07, 0.05), FENCE, at(0, y, 0), { shade: 0.08 });
    return b.build();
  },
  wall() {
    const b = new ModelBuilder();
    b.add(new THREE.BoxGeometry(1.02, 1.35, 0.2), WALL_STONE, at(0, 0.3, 0), { shade: 0.1 });
    b.add(new THREE.BoxGeometry(1.06, 0.1, 0.26), WALL_CAP, at(0, 1.0, 0), { shade: 0.06 });
    return b.build();
  },
};
