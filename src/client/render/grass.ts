// The grass (PLAN Phase 15): tufts of blades scattered where the ground meets something and thinly in
// the open, every tuft one copy of one small model, drawn instanced — one draw call a region, nothing
// on the CPU once it stands. Where each tuft goes is groundplan.ts's to say.
import * as THREE from "three";
import type { Box, WorldMap } from "../../shared/map.ts";
import { GRASS_ROOT, GRASS_TIP } from "../palette.ts";
import { grassPlan } from "./groundplan.ts";

/** Blades to a tuft, and how tall the tallest stands. */
const BLADES = 5;
const BLADE_HEIGHT = 0.3;

let tuft: THREE.BufferGeometry | null = null;
let tuftMaterial: THREE.Material | null = null;

/**
 * One tuft: five blades fanned round the middle, each a narrow triangle leaning outward, dark at the
 * root and light at the tip. Both faces draw, so a blade never vanishes edge-on from one side.
 */
function tuftGeometry(): THREE.BufferGeometry {
  if (tuft) return tuft;
  const positions: number[] = [], colors: number[] = [];
  const root = new THREE.Color(GRASS_ROOT), tip = new THREE.Color(GRASS_TIP);
  for (let i = 0; i < BLADES; i++) {
    const a = (i / BLADES) * Math.PI * 2 + 0.4, h = BLADE_HEIGHT * (0.6 + 0.4 * ((i * 0.618) % 1));
    const bx = Math.cos(a) * 0.03, bz = Math.sin(a) * 0.03;
    const lean = 0.09 + 0.05 * ((i * 0.381) % 1);
    const wx = -Math.sin(a) * 0.035, wz = Math.cos(a) * 0.035;
    positions.push(bx - wx, 0, bz - wz, bx + wx, 0, bz + wz, bx + Math.cos(a) * lean, h, bz + Math.sin(a) * lean);
    colors.push(root.r, root.g, root.b, root.r, root.g, root.b, tip.r, tip.g, tip.b);
  }
  tuft = new THREE.BufferGeometry();
  tuft.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  tuft.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  tuft.computeVertexNormals();
  return tuft;
}

function material(): THREE.Material {
  tuftMaterial ??= new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
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
