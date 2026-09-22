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

/**
 * A box that tapers along +z: `w1` by `h1` at z = 0, `w2` by `h2` at z = `length`, with the far face
 * shifted by `lift`. Six flat quads and nothing else — the shape the era's creatures are made of, and
 * what a body, a snout, a shin or a hoof is cut from. `slant` leans the far face without turning it.
 */
export function taperedBox(
  w1: number, h1: number, w2: number, h2: number, length: number, lift = 0, slant = 0,
): THREE.BufferGeometry {
  const a = w1 / 2, b = h1 / 2, c = w2 / 2, d = h2 / 2;
  // Near face (z = 0), then far face (z = length), both listed anticlockwise seen from +z.
  const near: Array<[number, number, number]> = [[-a, -b, 0], [a, -b, 0], [a, b, 0], [-a, b, 0]];
  const far: Array<[number, number, number]> = [
    [-c + slant, -d + lift, length], [c + slant, -d + lift, length], [c + slant, d + lift, length], [-c + slant, d + lift, length],
  ];
  const quad = (p: Array<[number, number, number]>, ...i: number[]) =>
    [p[i[0]!]!, p[i[1]!]!, p[i[2]!]!, p[i[0]!]!, p[i[2]!]!, p[i[3]!]!];
  // The four sides run near-to-near then out to far, so each winds anticlockwise seen from outside.
  // Wound the other way they face inward, and a Lambert material then lights them from inside: the
  // block comes out black on every side and only its two end caps look right.
  const side = (i: number, j: number) => [near[i]!, near[j]!, far[j]!, near[i]!, far[j]!, far[i]!];
  const tris = [
    ...quad(far, 0, 1, 2, 3),
    ...quad(near, 3, 2, 1, 0),
    ...side(0, 1), ...side(1, 2), ...side(2, 3), ...side(3, 0),
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(tris.flat(), 3));
  g.computeVertexNormals();
  return g;
}

/** One ring of a loft: half-width, half-height, and how far along the length it sits. */
export type Ring = [halfWidth: number, halfHeight: number, along: number];

/**
 * A hull lofted through a run of rings along +z. Each ring is an ellipse drawn with `sides` points, and
 * consecutive rings are joined by flat quads, so the surface is faceted but round in section and free
 * to swell and taper along its length.
 *
 * This is the shape most living things are made of here. A sphere gives every creature the same smooth
 * blob; a box gives every creature the same square slab; a lofted hull of six or eight sides gives a
 * back that rises over the shoulder and falls to the tail, which is what says what the animal is.
 * A ring of zero size closes the end to a point, for a snout or a tail tip.
 */
export function loft(rings: Ring[], sides = 8, offsets: Array<[number, number]> = []): THREE.BufferGeometry {
  const ringPoints = rings.map(([w, h, z], r) => {
    const [dx, dy] = offsets[r] ?? [0, 0];
    return Array.from({ length: sides }, (_, k) => {
      const a = (k / sides) * Math.PI * 2;
      return [dx + w * Math.sin(a), dy + h * Math.cos(a), z] as [number, number, number];
    });
  });
  const tris: number[] = [];
  const push = (...p: Array<[number, number, number]>) => { for (const v of p) tris.push(...v); };
  // A ring of no size is a single point, so the quads against it collapse to one triangle each.
  const isPoint = (r: number) => Math.abs(rings[r]![0]) < 1e-6 && Math.abs(rings[r]![1]) < 1e-6;
  for (let r = 0; r < ringPoints.length - 1; r++) {
    const a = ringPoints[r]!, b = ringPoints[r + 1]!;
    const aPoint = isPoint(r), bPoint = isPoint(r + 1);
    for (let k = 0; k < sides; k++) {
      const j = (k + 1) % sides;
      // Anticlockwise seen from outside, so the face looks away from the axis.
      if (!bPoint) push(a[k]!, b[k]!, b[j]!);
      if (!aPoint) push(a[k]!, b[j]!, a[j]!);
    }
  }
  // Flat caps on each end, unless that ring has already closed to a point.
  const cap = (points: Array<[number, number, number]>, forward: boolean) => {
    const [w, h] = [Math.abs(points[0]![0] - points[sides >> 1]![0]), Math.abs(points[0]![1] - points[sides >> 1]![1])];
    if (w < 1e-6 && h < 1e-6) return;
    const middle: [number, number, number] = [
      points.reduce((s, p) => s + p[0], 0) / sides, points.reduce((s, p) => s + p[1], 0) / sides, points[0]![2],
    ];
    for (let k = 0; k < sides; k++) {
      const j = (k + 1) % sides;
      // Points run clockwise seen from +z, so the far cap keeps that order and the near cap reverses it.
      if (forward) push(middle, points[j]!, points[k]!);
      else push(middle, points[k]!, points[j]!);
    }
  };
  cap(ringPoints[0]!, false);
  cap(ringPoints.at(-1)!, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(tris, 3));
  g.computeVertexNormals();
  return g;
}

/** One cross-section of a hull: its points in order around the outline. */
export type Section = Array<[number, number, number]>;

/**
 * A closed hull through a run of cross-sections stacked bottom to top, each with the same number of
 * points, joined by flat quads and capped at both ends.
 *
 * Where `loft` draws each ring as an ellipse, here the caller places every point, so the shape can be
 * flat across the front, widest at one side and narrow at the bottom — a head, which no ellipse is.
 *
 * List the sections from the bottom up, and the points of each so they turn from +x round through +z:
 * wound the other way every face is lit from inside and the whole thing renders black.
 */
export function hull(sections: Section[]): THREE.BufferGeometry {
  const tris: number[] = [];
  const push = (...p: Array<[number, number, number]>) => { for (const v of p) tris.push(...v); };
  const sides = sections[0]!.length;
  for (let s = 0; s < sections.length - 1; s++) {
    const a = sections[s]!, b = sections[s + 1]!;
    for (let k = 0; k < sides; k++) {
      const j = (k + 1) % sides;
      push(a[k]!, b[k]!, b[j]!);
      push(a[k]!, b[j]!, a[j]!);
    }
  }
  const cap = (points: Section, up: boolean) => {
    const middle: [number, number, number] = [0, 1, 2].map(
      (i) => points.reduce((s, p) => s + p[i]!, 0) / sides,
    ) as [number, number, number];
    for (let k = 0; k < sides; k++) {
      const j = (k + 1) % sides;
      // The same order that faces outward on the walls puts the bottom cap's normal down and the top's up.
      if (up) push(middle, points[j]!, points[k]!);
      else push(middle, points[k]!, points[j]!);
    }
  };
  cap(sections[0]!, false);
  cap(sections.at(-1)!, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(tris, 3));
  g.computeVertexNormals();
  return g;
}

/** A tapered tube lying along +z, with `sides` flats around it: angular where a capsule would be smooth. */
export function tube(r1: number, r2: number, length: number, sides = 6): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(r2, r1, length, sides).rotateX(Math.PI / 2).translate(0, 0, length / 2);
}

/** The same, hanging down from the origin along -y: a leg bone or a neck. */
export function post(r1: number, r2: number, length: number, sides = 5): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(r1, r2, length, sides).translate(0, -length / 2, 0);
}

/** A flat triangle fan from `tip` out through `rim`, for a wing membrane or a fin. */
export function web(tip: [number, number, number], rim: Array<[number, number, number]>): THREE.BufferGeometry {
  const tris: number[] = [];
  for (let i = 0; i < rim.length - 1; i++) tris.push(...tip, ...rim[i]!, ...rim[i + 1]!);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(tris, 3));
  g.computeVertexNormals();
  return g;
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
