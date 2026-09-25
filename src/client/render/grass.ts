// The grass (PLAN Phase 15): tufts of blades scattered where the ground meets something and thinly in
// the open, every tuft one copy of one small model, drawn instanced — one draw call a region, nothing
// on the CPU once it stands. Where each tuft goes is groundplan.ts's to say.
import * as THREE from "three";
import type { Box, WorldMap } from "../../shared/map.ts";
import { GRASS_ROOT, GRASS_TIP } from "../palette.ts";
import { grassPlan } from "./groundplan.ts";

/** Blades to a tuft, how tall the tallest stands, a blade's half-width at the root, and how far a tip curls out. */
export const BLADES = 7;
export const BLADE_HEIGHT = 0.45;
export const BLADE_WIDTH = 0.024;
export const BLADE_LEAN = 0.2;
/** Where along a blade its one joint is, and how wide it still is there. */
const JOINT = 0.55;
const JOINT_WIDTH = 0.75;

let tuft: THREE.BufferGeometry | null = null;
let tuftMaterial: THREE.Material | null = null;

/**
 * One tuft: seven blades fanned out from the middle, each a thin strip that rises, bends outward and
 * curls over at the tip — a root, a joint past halfway and a point, so it bows the way a blade does
 * rather than standing as a spike — dark at the root and light at the tip. Every normal points straight
 * up, so a blade takes the light the ground under it takes and has no shaded side to read as a solid,
 * and each face is wound both ways, so a blade never vanishes edge-on from either side.
 */
export function tuftGeometry(): THREE.BufferGeometry {
  if (tuft) return tuft;
  const positions: number[] = [], colors: number[] = [];
  const root = new THREE.Color(GRASS_ROOT), tip = new THREE.Color(GRASS_TIP), joint = root.clone().lerp(tip, 0.45);
  for (let i = 0; i < BLADES; i++) {
    const f1 = (i * 0.618) % 1, f2 = (i * 0.381 + 0.5) % 1;
    const a = (i / BLADES) * Math.PI * 2 + 0.7 * f2;
    const h = BLADE_HEIGHT * (0.7 + 0.3 * f1), lean = BLADE_LEAN * (0.6 + 0.4 * f2);
    // Out along the blade's own direction, and across it.
    const ox = Math.cos(a), oz = Math.sin(a), cx = -oz, cz = ox;
    // The point `t` of the way up the blade and `side` half-widths across it. The bow is a curve: the
    // blade leans more the higher it goes, and stoops a little at the top.
    const at = (t: number, side: number, w: number): number[] => {
      const out = 0.02 + lean * t * t, across = w * side;
      return [ox * out + cx * across, h * t * (1 - 0.12 * t), oz * out + cz * across];
    };
    const r0 = at(0, -1, BLADE_WIDTH), r1 = at(0, 1, BLADE_WIDTH);
    const j0 = at(JOINT, -1, BLADE_WIDTH * JOINT_WIDTH), j1 = at(JOINT, 1, BLADE_WIDTH * JOINT_WIDTH);
    const top = at(1, 0, 0);
    const faces = [[r0, r1, j1], [r0, j1, j0], [j0, j1, top]];
    const tints = [[root, root, joint], [root, joint, joint], [joint, joint, tip]];
    faces.forEach((face, k) => {
      const [p, q, s] = face as [number[], number[], number[]];
      const [cp, cq, cs] = tints[k] as [THREE.Color, THREE.Color, THREE.Color];
      // Wound both ways, so the blade shows from either side.
      positions.push(...p, ...q, ...s, ...p, ...s, ...q);
      for (const c of [cp, cq, cs, cp, cs, cq]) colors.push(c.r, c.g, c.b);
    });
  }
  tuft = new THREE.BufferGeometry();
  tuft.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  tuft.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  tuft.setAttribute("normal", new THREE.Float32BufferAttribute(positions.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  return tuft;
}

function material(): THREE.Material {
  tuftMaterial ??= new THREE.MeshLambertMaterial({ vertexColors: true });
  return tuftMaterial;
}

/** The grass of a box of tiles as one instanced mesh, or null where none grows. `userData.tufts` says how many. */
export function buildGrass(map: WorldMap, box: Box): THREE.InstancedMesh | null {
  const plan = grassPlan(map, box);
  if (plan.length === 0) return null;
  const mesh = new THREE.InstancedMesh(tuftGeometry(), material(), plan.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
  plan.forEach((t, i) => {
    p.set(t.x, t.h, -t.y);
    q.setFromAxisAngle(up, t.turn);
    s.setScalar(t.scale);
    mesh.setMatrixAt(i, m.compose(p, q, s));
    mesh.setColorAt(i, c.setScalar(t.tint));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.name = "grass";
  mesh.userData.tufts = plan.length;
  return mesh;
}
