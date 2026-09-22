import * as THREE from "three";
import { EYES, FEET, HAIR, LEGS, SKIN, TOP } from "../palette.ts";
import { taperedBox } from "./meshkit.ts";

const materials = new Map<number, THREE.MeshLambertMaterial>();
function material(color: number): THREE.MeshLambertMaterial {
  let m = materials.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true });
    materials.set(color, m);
  }
  return m;
}

const shadowGeometry = new THREE.CircleGeometry(0.34, 12).rotateX(-Math.PI / 2);
const shadowMaterial = new THREE.MeshBasicMaterial({
  color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
});

/** A box hung from its top face, so the parent group is its joint. */
function limb(w: number, h: number, d: number, color: number, y = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color));
  mesh.position.y = y - h / 2;
  return mesh;
}

function joint(x: number, y: number, z: number, ...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.add(...children);
  return g;
}

/**
 * A low-poly person about 1.55 tiles tall, facing +z, feet at the origin. Animated by rotating its
 * joints: legs and arms swing opposite each other, knees and elbows bend, and the body bobs.
 */
export class CharacterModel {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly hips: [THREE.Group, THREE.Group];
  private readonly knees: [THREE.Group, THREE.Group];
  private readonly shoulders: [THREE.Group, THREE.Group];
  private readonly elbows: [THREE.Group, THREE.Group];
  private phase = 0;
  private motion = 0;
  private runBlend = 0;

  constructor(look: number[]) {
    const pick = (list: number[], i: number) => list[(look[i] ?? 0) % list.length]!;
    const skin = pick(SKIN, 0), hair = pick(HAIR, 1), top = pick(TOP, 2), legs = pick(LEGS, 3), feet = pick(FEET, 4);

    const leg = (side: number) => {
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.07, 0.24), material(feet));
      foot.position.set(0, -0.325, 0.04);
      const knee = joint(0, -0.36, 0, limb(0.13, 0.3, 0.15, legs), foot);
      return { hip: joint(side * 0.1, 0.76, 0, limb(0.15, 0.37, 0.17, legs), knee), knee };
    };
    const arm = (side: number) => {
      const hand = limb(0.09, 0.09, 0.1, skin, -0.25);
      const elbow = joint(0, -0.28, 0, limb(0.1, 0.25, 0.11, top), hand);
      return { shoulder: joint(side * 0.28, 1.14, 0, limb(0.11, 0.3, 0.12, top), elbow), elbow };
    };
    const l = leg(1), r = leg(-1), la = arm(1), ra = arm(-1);
    this.hips = [l.hip, r.hip];
    this.knees = [l.knee, r.knee];
    this.shoulders = [la.shoulder, ra.shoulder];
    this.elbows = [la.elbow, ra.elbow];

    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.2), material(legs));
    pelvis.position.y = 0.78;
    const torso = new THREE.Mesh(taperedBox(0.34, 0.46, 0.44, 0.2, 0.24), material(top));
    torso.position.y = 0.78;
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.09, 0.11), material(skin));
    neck.position.y = 1.25;

    const face = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.28, 0.26), material(skin));
    face.position.y = 0.14;
    const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.1, 0.29), material(hair));
    hairTop.position.y = 0.3;
    const hairBack = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.2, 0.07), material(hair));
    hairBack.position.set(0, 0.2, -0.12);
    const eyes = [-0.06, 0.06].map((x) => {
      const e = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.035, 0.01), material(EYES));
      e.position.set(x, 0.17, 0.131);
      return e;
    });
    const head = joint(0, 1.27, 0, face, hairTop, hairBack, ...eyes);

    this.body.add(pelvis, torso, neck, head, l.hip, r.hip, la.shoulder, ra.shoulder);
    const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
    shadow.position.y = 0.02;
    shadow.renderOrder = -1;
    this.root.add(this.body, shadow);
  }

  /** `distance` is how far the character moved this frame, in tiles; it drives the stride. */
  animate(dt: number, distance: number, moving: boolean, running: boolean): void {
    const ease = (from: number, to: number, rate: number) => from + (to - from) * Math.min(1, dt * rate);
    this.motion = ease(this.motion, moving ? 1 : 0, 10);
    this.runBlend = ease(this.runBlend, running ? 1 : 0, 8);
    const stride = 1.15 + 0.55 * this.runBlend;
    this.phase = (this.phase + (distance / stride) * Math.PI * 2) % (Math.PI * 2);

    const a = this.motion, run = this.runBlend, s = Math.sin(this.phase), c = Math.cos(this.phase);
    const legSwing = (0.55 + 0.3 * run) * a, armSwing = (0.45 + 0.45 * run) * a;
    this.hips[0].rotation.x = s * legSwing;
    this.hips[1].rotation.x = -s * legSwing;
    this.knees[0].rotation.x = Math.max(0, -c) * (0.7 + 0.5 * run) * a;
    this.knees[1].rotation.x = Math.max(0, c) * (0.7 + 0.5 * run) * a;
    this.shoulders[0].rotation.x = -s * armSwing;
    this.shoulders[1].rotation.x = s * armSwing;
    this.elbows[0].rotation.x = this.elbows[1].rotation.x = -(0.15 + 1.0 * run) * a;
    this.body.position.y = Math.abs(c) * 0.035 * a * (1 + run);
    this.body.rotation.x = 0.14 * run * a;
  }
}
