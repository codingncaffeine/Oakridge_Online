import * as THREE from "three";

export interface PartOptions {
  color: number;
  matrix?: THREE.Matrix4;
  /** Varies each triangle's brightness by up to this fraction, for a faceted per-face look. */
  shade?: number;
  /** Moves each vertex up to this far, keyed on its position so shared corners stay joined. */
  jitter?: number;
  seed?: number;
}

/**
 * Merges coloured parts into one geometry with per-vertex colours. Each part keeps its own normals, so
 * smooth parts stay smooth after merging; flat-shaded materials ignore normals anyway. UVs are kept
 * when every part has them.
 */
export class MeshBuilder {
  private readonly pos: number[] = [];
  private readonly nrm: number[] = [];
  private readonly col: number[] = [];
  private readonly uv: number[] = [];
  private allHaveUv = true;

  add(geometry: THREE.BufferGeometry, o: PartOptions): this {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (!g.getAttribute("normal")) g.computeVertexNormals();
    const p = g.getAttribute("position") as THREE.BufferAttribute;
    const n = g.getAttribute("normal") as THREE.BufferAttribute;
    const t = g.getAttribute("uv") as THREE.BufferAttribute | undefined;
    if (!t) this.allHaveUv = false;
    const m = o.matrix ?? new THREE.Matrix4();
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    const base = new THREE.Color(o.color), c = new THREE.Color();
    const v = new THREE.Vector3(), nv = new THREE.Vector3();
    const seed = o.seed ?? 1;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      if (o.jitter) jitterVertex(v, o.jitter, seed);
      v.applyMatrix4(m);
      this.pos.push(v.x, v.y, v.z);
      nv.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
      this.nrm.push(nv.x, nv.y, nv.z);
      if (i % 3 === 0) c.copy(base).multiplyScalar(1 + (o.shade ?? 0) * hash(i * 0.37 + seed * 3.1) * 2);
      this.col.push(c.r, c.g, c.b);
      if (t) this.uv.push(t.getX(i), t.getY(i));
      else this.uv.push(0, 0);
    }
    return this;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    if (this.allHaveUv) g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    return g;
  }
}

/** Position, turn (radians about y, then x, then z) and scale as a matrix. */
export function at(x: number, y: number, z: number, scale: number | [number, number, number] = 1, rotY = 0, rotX = 0, rotZ = 0): THREE.Matrix4 {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, rotZ, "YXZ"));
  const s = typeof scale === "number" ? new THREE.Vector3(scale, scale, scale) : new THREE.Vector3(...scale);
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, s);
}

/** A matrix that stretches a unit-height, y-up part from `from` to `to`. */
export function between(from: THREE.Vector3, to: THREE.Vector3): THREE.Matrix4 {
  const dir = to.clone().sub(from);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  return new THREE.Matrix4().compose(from.clone().add(to).multiplyScalar(0.5), q, new THREE.Vector3(1, dir.length(), 1));
}

/** Smooth tapered capsule hanging down from the origin: radius r1 at the top, r2 at the bottom. */
export function limb(r1: number, r2: number, length: number, radial = 8): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const cap = 3;
  for (let i = cap; i >= 0; i--) {
    const a = (Math.PI / 2) * (i / cap);
    pts.push(new THREE.Vector2(Math.cos(a) * r2, -length - Math.sin(a) * r2));
  }
  for (let i = 0; i <= cap; i++) {
    const a = (Math.PI / 2) * (i / cap);
    pts.push(new THREE.Vector2(Math.cos(a) * r1, Math.sin(a) * r1));
  }
  return new THREE.LatheGeometry(pts, radial);
}

/** Smooth ellipsoid centred on the origin. */
export function ellipsoid(rx: number, ry: number, rz: number, w = 10, h = 8): THREE.BufferGeometry {
  return new THREE.SphereGeometry(1, w, h).scale(rx, ry, rz);
}

/** A solid of revolution from [radius, y] pairs listed bottom to top, squashed front-to-back by `depth`. */
export function shell(profile: Array<[number, number]>, radial: number, depth = 1): THREE.BufferGeometry {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), radial).scale(1, 1, depth);
}

/** Deterministic value in [-0.5, 0.5). */
export function hash(a: number): number {
  const s = Math.sin(a * 12.9898) * 43758.5453;
  return s - Math.floor(s) - 0.5;
}

function jitterVertex(v: THREE.Vector3, amount: number, seed: number): void {
  const k = v.x * 7.13 + v.y * 3.71 + v.z * 5.29 + seed * 0.618;
  v.x += hash(k) * amount;
  v.y += hash(k + 1.7) * amount;
  v.z += hash(k + 3.1) * amount;
}
