import * as THREE from "three";

export interface PartOptions {
  /** Moves each vertex up to this far, keyed on its position so shared corners stay joined. */
  jitter?: number;
  /** Varies each triangle's brightness by up to this fraction, for the faceted per-face look. */
  shade?: number;
  seed?: number;
}

/** Merges coloured parts into one non-indexed geometry with per-vertex colours. */
export class ModelBuilder {
  private readonly positions: number[] = [];
  private readonly colors: number[] = [];

  add(geometry: THREE.BufferGeometry, color: number, matrix?: THREE.Matrix4, options: PartOptions = {}): this {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    const pos = flat.getAttribute("position") as THREE.BufferAttribute;
    const base = new THREE.Color(color), c = new THREE.Color();
    const v = new THREE.Vector3();
    const seed = options.seed ?? 1;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      if (options.jitter) jitterVertex(v, options.jitter, seed);
      if (matrix) v.applyMatrix4(matrix);
      this.positions.push(v.x, v.y, v.z);
      if (i % 3 === 0) c.copy(base).multiplyScalar(1 + (options.shade ?? 0) * (hash(i * 0.37 + seed * 3.1) * 2));
      this.colors.push(c.r, c.g, c.b);
    }
    return this;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    g.computeVertexNormals();
    return g;
  }
}

/** A box whose top and bottom have their own width and depth; its base sits at y = 0. */
export function taperedBox(wBottom: number, wTop: number, height: number, dBottom: number, dTop: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, 1, 1);
  const p = g.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const top = p.getY(i) > 0;
    p.setXYZ(i, p.getX(i) * (top ? wTop : wBottom), (p.getY(i) + 0.5) * height, p.getZ(i) * (top ? dTop : dBottom));
  }
  return g;
}

/** Translation (and optional uniform scale) as a matrix, for ModelBuilder.add. */
export function at(x: number, y: number, z: number, scale = 1, rotY = 0, rotZ = 0): THREE.Matrix4 {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, rotZ));
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(scale, scale, scale));
}

/** Deterministic value in [-0.5, 0.5). */
function hash(a: number): number {
  const s = Math.sin(a * 12.9898) * 43758.5453;
  return s - Math.floor(s) - 0.5;
}

function jitterVertex(v: THREE.Vector3, amount: number, seed: number): void {
  const k = v.x * 7.13 + v.y * 3.71 + v.z * 5.29 + seed * 0.618;
  v.x += hash(k) * amount;
  v.y += hash(k + 1.7) * amount;
  v.z += hash(k + 3.1) * amount;
}
