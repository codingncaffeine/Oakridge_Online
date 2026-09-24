// Fire (PLAN Phase 15): a few flat tongues of flame on every campfire, forge and range, each scaling
// and swaying on its own beat, drawn instanced and unlit so they glow the same at night. The light is
// left as it is; where the tongues stand is groundplan.ts's to say.
import * as THREE from "three";
import type { MapObject, WorldMap } from "../../shared/map.ts";
import { EMBER, FLAME, FLAME_TIP } from "../palette.ts";
import { flamePlan, type Tongue } from "./groundplan.ts";

let leaf: THREE.BufferGeometry | null = null;
let leafMaterial: THREE.Material | null = null;

/** One tongue: a flat leaf a unit tall, ember at the foot, flame in the middle, pale at the tip. */
function tongueGeometry(): THREE.BufferGeometry {
  if (leaf) return leaf;
  const ember = new THREE.Color(EMBER), flame = new THREE.Color(FLAME), tip = new THREE.Color(FLAME_TIP);
  const points = [[0, 0, 0], [0.15, 0.34, 0], [0, 1, 0], [-0.15, 0.34, 0]];
  const shades = [ember, flame, tip, flame];
  const order = [0, 1, 2, 0, 2, 3];
  const positions: number[] = [], colors: number[] = [];
  for (const i of order) {
    positions.push(...points[i]!);
    colors.push(shades[i]!.r, shades[i]!.g, shades[i]!.b);
  }
  leaf = new THREE.BufferGeometry();
  leaf.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  leaf.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  leaf.computeVertexNormals();
  return leaf;
}

function material(): THREE.Material {
  leafMaterial ??= new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  return leafMaterial;
}

export class Flames {
  readonly group = new THREE.Group();
  private mesh: THREE.InstancedMesh | null = null;
  private tongues: Tongue[] = [];
  private time = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);

  /** The fires among these objects, replacing whatever burned before. */
  set(map: WorldMap, objects: MapObject[]): void {
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.dispose();
      this.mesh = null;
    }
    this.tongues = flamePlan(map, objects);
    if (this.tongues.length === 0) return;
    this.mesh = new THREE.InstancedMesh(tongueGeometry(), material(), this.tongues.length);
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
    this.update(0);
  }

  /** How many tongues burn right now (the checks read it). */
  get count(): number {
    return this.tongues.length;
  }

  /** Every tongue leans, stretches and turns a little on its own beat. */
  update(dt: number): void {
    this.time += dt;
    const mesh = this.mesh;
    if (!mesh) return;
    const t = this.time;
    this.tongues.forEach((tongue, i) => {
      const beat = t * 6 + tongue.seed;
      const height = tongue.size * (0.55 + 0.25 * Math.sin(beat * 1.7 + tongue.index * 2.1) + 0.1 * Math.sin(beat * 3.3 + tongue.index));
      const width = tongue.size * 0.42;
      const sway = 0.07 * tongue.size;
      this.p.set(tongue.x + Math.sin(beat + tongue.index) * sway, tongue.y, tongue.z + Math.cos(beat * 1.3 + tongue.index) * sway);
      this.q.setFromAxisAngle(this.up, (tongue.index / tongue.of) * Math.PI * 2 + 0.3 * Math.sin(beat * 0.9 + tongue.index));
      this.s.set(width, Math.max(0.05, height), width);
      mesh.setMatrixAt(i, this.m.compose(this.p, this.q, this.s));
    });
    mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh?.dispose();
    this.mesh = null;
    this.tongues = [];
  }
}
