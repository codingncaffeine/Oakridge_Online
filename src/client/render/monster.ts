import * as THREE from "three";
import { MONSTER_BY_KEY, type MonsterShape } from "../../shared/monsters.ts";
import { at, ellipsoid, hash, limb, MeshBuilder, shell } from "./meshkit.ts";
import type { ActionName } from "./poses.ts";

const material = new THREE.MeshLambertMaterial({ vertexColors: true });
const shadowMaterial = new THREE.MeshBasicMaterial({
  color: 0x000000, transparent: true, opacity: 0.26, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
});

const EYE = 0x100d0a;
const BONE_DARK = 0x8a8168;
const shade = (hex: number, k: number) => new THREE.Color(hex).multiplyScalar(k).getHex();

/** Seconds a swing takes, and how far through it the blow lands. */
const SWING_PERIOD = 0.6;
const SWING_IMPACT = 0.45;

/** A joint: a group at a point that its parts hang from. */
function joint(x: number, y: number, z: number, ...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.add(...children);
  return g;
}

/** What a shape's builder hands back: the pieces the animation moves. */
interface Rig {
  /** Height of the creature, in tiles, for the name and health bar above it. */
  height: number;
  /** Radius of the shadow it casts. */
  shadow: number;
  /** Legs, in walking order: they swing in opposition, odd against even. */
  legs: THREE.Group[];
  /** Arms (humanoids), which swing with the legs and throw the blow. */
  arms: THREE.Group[];
  /** The head, which dips as the creature lunges. */
  head: THREE.Group | null;
  /** A tail, which sways. */
  tail: THREE.Group | null;
  /** Wings, which beat instead of legs. */
  wings: THREE.Group[];
  /** How far the body rises and falls as it moves, in tiles. */
  bob: number;
}

/**
 * A creature built out of the same rounded, smooth-shaded parts the people are, from its entry in the
 * bestiary: its shape, its size and its two colours. Nothing is downloaded and nothing is generated;
 * the shape names in shared/monsters.ts are the whole vocabulary.
 *
 * It faces +z with its feet at the origin, as a CharacterModel does, and answers the same calls, so an
 * Entity can carry either without knowing which.
 */
export class MonsterModel {
  readonly root = new THREE.Group();
  /** How tall it stands, for anything drawn over its head. */
  readonly height: number;
  private readonly body = new THREE.Group();
  private readonly rig: Rig;
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly seed: number;
  private phase = 0;
  private motion = 0;
  /** Seconds into the swing being thrown, or null between blows. */
  private swingAt: number | null = null;
  private lastSwingPhase = 0;
  private frozenAt: number | null = null;

  /** Called when the blow lands, for whoever plays the sound of it. */
  onImpact: ((action: ActionName) => void) | null = null;

  constructor(key: string) {
    const def = MONSTER_BY_KEY.get(key);
    const shape: MonsterShape = def?.shape ?? "rodent";
    const [main, second] = def?.colors ?? [0x808080, 0x404040];
    const scale = def?.scale ?? 0.5;
    this.seed = hash(key.length * 7.3 + (key.charCodeAt(0) || 1));
    this.rig = BUILDERS[shape](this, main, second);
    this.body.scale.setScalar(scale);
    this.height = this.rig.height * scale;
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(this.rig.shadow * scale, 14).rotateX(-Math.PI / 2), shadowMaterial);
    this.geometries.push(shadow.geometry);
    shadow.position.y = 0.02;
    shadow.renderOrder = -1;
    this.root.add(this.body, shadow);
    this.animate(0, 0, false, false);
  }

  /** The group everything hangs from; a shape's builder adds its parts here. */
  get trunk(): THREE.Group {
    return this.body;
  }

  /** Builds one mesh out of a builder's parts and keeps its geometry for disposal. */
  mesh(builder: MeshBuilder): THREE.Mesh {
    const geometry = builder.build();
    this.geometries.push(geometry);
    return new THREE.Mesh(geometry, material);
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
  }

  /** Matches CharacterModel: a creature carries no tools, so the stance is all this means to it. */
  act(action: ActionName | null, _tool = 0): void {
    if (action === null && this.swingAt !== null && this.swingAt > SWING_PERIOD) this.swingAt = null;
  }

  /** Throws one blow: a lunge that plays once. */
  swing(): void {
    this.swingAt = 0;
    this.lastSwingPhase = 0;
  }

  /** For previews: holds the swing at `t` (0–1 through it). Null lets it run. */
  freeze(t: number | null): void {
    this.frozenAt = t;
    if (t !== null) this.swingAt = t * SWING_PERIOD;
  }

  animate(dt: number, distance: number, moving: boolean, running: boolean): void {
    const ease = (from: number, to: number, rate: number) => from + (to - from) * Math.min(1, dt * rate);
    this.motion = ease(this.motion, moving ? 1 : 0, 10);
    const stride = 0.55 + 0.25 * (running ? 1 : 0);
    this.phase = (this.phase + (distance / stride) * Math.PI * 2) % (Math.PI * 2);
    const a = this.motion, s = Math.sin(this.phase), c = Math.cos(this.phase);
    const r = this.rig;

    // Legs swing in opposition, alternating down the line, so a four-legged walk reads as a trot.
    r.legs.forEach((leg, i) => {
      leg.rotation.x = (i % 2 === 0 ? s : -s) * 0.7 * a;
    });
    // Wings beat whether or not the creature is going anywhere: it is in the air either way.
    const beat = this.frozenAt ?? (performance.now() / 1000);
    r.wings.forEach((wing, i) => {
      wing.rotation.z = (i === 0 ? 1 : -1) * (0.5 + 0.7 * Math.sin(beat * 9));
    });
    // Breathing while still, a bob while moving.
    const breathe = Math.sin(beat * 1.6 + this.seed * 6) * 0.01;
    this.body.position.y = Math.abs(c) * r.bob * a + breathe * (1 - a);
    if (r.tail) r.tail.rotation.y = Math.sin(beat * 2.4 + this.seed * 3) * 0.18 + s * 0.25 * a;

    // A blow: the body drives forward, the head dips and the arms come over.
    let lunge = 0;
    if (this.swingAt !== null) {
      this.swingAt += dt;
      const t = Math.min(1, this.swingAt / SWING_PERIOD);
      if (this.frozenAt === null && this.lastSwingPhase < SWING_IMPACT && t >= SWING_IMPACT) this.onImpact?.("strike");
      this.lastSwingPhase = t;
      // Out fast, back slowly.
      lunge = t < SWING_IMPACT ? t / SWING_IMPACT : Math.max(0, 1 - (t - SWING_IMPACT) / (1 - SWING_IMPACT));
      if (t >= 1 && this.frozenAt === null) this.swingAt = null;
    }
    this.body.position.z = lunge * 0.14;
    this.body.rotation.x = -lunge * 0.18;
    if (r.head) r.head.rotation.x = lunge * 0.4;
    r.arms.forEach((arm, i) => {
      arm.rotation.x = (i % 2 === 0 ? s : -s) * 0.5 * a * (1 - lunge) - lunge * 1.9;
    });
  }
}

/** Each shape's builder: it hangs parts on the model's trunk and reports what moves. */
type Builder = (m: MonsterModel, main: number, second: number) => Rig;

const emptyRig = (height: number, shadow: number, bob: number): Rig =>
  ({ height, shadow, legs: [], arms: [], head: null, tail: null, wings: [], bob });

/** Four legs under a barrel body: the frame every animal on all fours is built on. */
function quadruped(
  m: MonsterModel, main: number, second: number,
  o: {
    length: number; girth: number; standing: number; legWidth: number; snout: number;
    ears: "round" | "pointed" | "none"; horns: "none" | "short" | "curled" | "tusks";
  },
): Rig {
  const rig = emptyRig(o.standing + o.girth * 1.4, o.length * 0.5, 0.022);
  const body = new MeshBuilder();
  const back = o.standing + o.girth;
  // Barrel: an ellipsoid stretched along the creature's length, heavier at the shoulder.
  body.add(ellipsoid(o.girth, o.girth * 0.92, o.length * 0.5, 12, 9), { color: main, matrix: at(0, back, 0) });
  body.add(ellipsoid(o.girth * 1.04, o.girth * 0.96, o.girth * 0.9, 10, 8), { color: main, matrix: at(0, back + o.girth * 0.06, o.length * 0.22) });
  m.trunk.add(m.mesh(body));

  // Head on a short neck, with a snout, eyes and whatever it wears on top. It is carried clear of the
  // barrel and a little in front of it, or the whole animal reads as one blob from the front.
  const headB = new MeshBuilder();
  const hr = o.girth * 0.68;
  headB.add(limb(o.girth * 0.42, o.girth * 0.34, o.girth * 0.7, 8), { color: shade(main, 0.95), matrix: at(0, 0, -o.girth * 0.3, 1, 0, 0.9) });
  headB.add(ellipsoid(hr, hr * 0.95, hr * 1.05, 10, 8), { color: main });
  headB.add(ellipsoid(hr * 0.52, hr * 0.46, o.snout, 8, 6), { color: shade(main, 0.9), matrix: at(0, -hr * 0.22, hr * 0.85 + o.snout * 0.55) });
  headB.add(ellipsoid(hr * 0.22, hr * 0.17, hr * 0.15, 6, 5), { color: second, matrix: at(0, -hr * 0.18, hr * 0.85 + o.snout * 1.3) });
  for (const side of [1, -1]) {
    headB.add(ellipsoid(hr * 0.16, hr * 0.16, hr * 0.13, 6, 5), { color: EYE, matrix: at(side * hr * 0.46, hr * 0.18, hr * 0.78) });
    if (o.ears === "round") headB.add(ellipsoid(hr * 0.36, hr * 0.36, hr * 0.1, 8, 6), { color: shade(main, 1.12), matrix: at(side * hr * 0.78, hr * 0.66, -hr * 0.08) });
    if (o.ears === "pointed") {
      headB.add(new THREE.ConeGeometry(hr * 0.32, hr * 0.78, 5), { color: main, matrix: at(side * hr * 0.55, hr * 0.92, -hr * 0.12, 1, 0, 0, side * 0.25) });
    }
    // Horns sit forward on the brow, where they show head-on: a cow's stick out sideways, a ram's curl
    // back around the ear, and a boar's come up out of the jaw.
    if (o.horns === "short") {
      headB.add(new THREE.ConeGeometry(hr * 0.2, hr * 1.15, 6), { color: second, matrix: at(side * hr * 0.72, hr * 0.62, hr * 0.12, 1, 0, 0.5, side * 1.35) });
    }
    if (o.horns === "curled") {
      for (let k = 0; k < 4; k++) {
        const a = 0.6 + k * 1.1;
        headB.add(ellipsoid(hr * (0.19 - k * 0.025), hr * (0.19 - k * 0.025), hr * (0.19 - k * 0.025), 7, 6), {
          color: second, matrix: at(side * hr * (0.82 + k * 0.03), hr * (0.62 - Math.sin(a) * 0.3), hr * (0.2 - Math.cos(a) * 0.42)),
        });
      }
    }
    if (o.horns === "tusks") {
      headB.add(new THREE.ConeGeometry(hr * 0.12, hr * 0.7, 5), { color: second, matrix: at(side * hr * 0.34, -hr * 0.34, hr * 0.78 + o.snout * 0.5, 1, 0, -0.9, side * 0.4) });
    }
  }
  const head = joint(0, back + o.girth * 0.34, o.length * 0.5 + hr * 0.7, m.mesh(headB));
  m.trunk.add(head);
  rig.head = head;

  // Four legs, front pair then back pair.
  for (const [lz, side] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    const legB = new MeshBuilder();
    legB.add(limb(o.legWidth, o.legWidth * 0.72, o.standing, 7), { color: shade(main, 0.88) });
    legB.add(ellipsoid(o.legWidth * 0.9, o.legWidth * 0.5, o.legWidth * 1.15, 7, 5), { color: second, matrix: at(0, -o.standing - o.legWidth * 0.3, o.legWidth * 0.2) });
    const leg = joint(side * o.girth * 0.62, back - o.girth * 0.2, lz * o.length * 0.3, m.mesh(legB));
    m.trunk.add(leg);
    rig.legs.push(leg);
  }

  const tailB = new MeshBuilder();
  tailB.add(limb(o.girth * 0.16, o.girth * 0.07, o.length * 0.5, 6), { color: shade(main, 0.85) });
  const tail = joint(0, back + o.girth * 0.35, -o.length * 0.5, m.mesh(tailB));
  tail.rotation.x = -0.5;
  m.trunk.add(tail);
  rig.tail = tail;
  return rig;
}

/**
 * A body over two legs, with arms: people-shaped creatures, and the bones of them. For the living, the
 * two colours are skin and clothing, so a face always shows against what it wears; for the dead, both
 * are bone, and the body is a rack of ribs instead.
 */
function biped(
  m: MonsterModel, main: number, second: number,
  o: { height: number; girth: number; skull: boolean; ribs: boolean; ears: boolean },
): Rig {
  const skin = main, cloth = o.ribs ? main : second;
  const rig = emptyRig(o.height, o.girth * 1.3, 0.03);
  const hip = o.height * 0.46, shoulder = o.height * 0.8, headY = o.height * 0.9;
  const body = new MeshBuilder();
  if (o.ribs) {
    // A rack of ribs around a spine, rather than a filled torso.
    body.add(limb(o.girth * 0.18, o.girth * 0.16, shoulder - hip, 6), { color: shade(main, 0.86), matrix: at(0, shoulder, -o.girth * 0.18) });
    for (let i = 0; i < 5; i++) {
      const y = hip + (shoulder - hip) * (0.18 + i * 0.17), r = o.girth * (0.85 - i * 0.05);
      body.add(new THREE.TorusGeometry(r, o.girth * 0.07, 5, 12, Math.PI * 1.25).rotateX(Math.PI / 2).rotateY(Math.PI * 0.375), {
        color: main, matrix: at(0, y, 0, [1, 1, 0.66]),
      });
    }
    body.add(ellipsoid(o.girth * 0.92, o.girth * 0.34, o.girth * 0.62, 10, 6), { color: shade(main, 0.94), matrix: at(0, shoulder - o.girth * 0.1, 0) });
    body.add(ellipsoid(o.girth * 0.78, o.girth * 0.3, o.girth * 0.55, 10, 6), { color: BONE_DARK, matrix: at(0, hip, 0) });
  } else {
    body.add(shell([
      [0, hip - 0.02], [o.girth * 0.78, hip], [o.girth * 0.86, hip + (shoulder - hip) * 0.4],
      [o.girth, shoulder - o.girth * 0.2], [o.girth * 0.82, shoulder], [0, shoulder + o.girth * 0.06],
    ], 12, 0.68), { color: cloth });
    // A belt or a strap of the second colour, which reads at a distance.
    body.add(new THREE.TorusGeometry(o.girth * 0.84, o.girth * 0.1, 6, 14).rotateX(Math.PI / 2).scale(1, 1, 0.7), {
      color: shade(cloth, 0.72), matrix: at(0, hip + (shoulder - hip) * 0.18, 0),
    });
  }
  m.trunk.add(m.mesh(body));

  const headB = new MeshBuilder();
  const hr = o.girth * 0.66;
  if (o.skull) {
    headB.add(ellipsoid(hr, hr * 1.02, hr * 1.06, 10, 8), { color: main });
    headB.add(ellipsoid(hr * 0.56, hr * 0.42, hr * 0.42, 8, 6), { color: shade(main, 0.93), matrix: at(0, -hr * 0.5, hr * 0.62) });
    for (const side of [1, -1]) {
      headB.add(ellipsoid(hr * 0.26, hr * 0.24, hr * 0.2, 7, 6), { color: EYE, matrix: at(side * hr * 0.4, hr * 0.1, hr * 0.72) });
    }
    // A row of teeth across the jaw.
    for (let i = -2; i <= 2; i++) {
      headB.add(new THREE.BoxGeometry(hr * 0.11, hr * 0.16, hr * 0.08), { color: shade(main, 1.06), matrix: at(i * hr * 0.15, -hr * 0.62, hr * 0.78) });
    }
  } else {
    headB.add(ellipsoid(hr, hr * 1.08, hr, 10, 8), { color: skin });
    headB.add(new THREE.ConeGeometry(hr * 0.26, hr * 0.6, 6).rotateX(Math.PI / 2 + 0.4), { color: shade(skin, 0.92), matrix: at(0, -hr * 0.08, hr * 0.86) });
    for (const side of [1, -1]) {
      headB.add(ellipsoid(hr * 0.24, hr * 0.14, hr * 0.12, 7, 5), { color: 0xf0ead8, matrix: at(side * hr * 0.38, hr * 0.22, hr * 0.76) });
      headB.add(ellipsoid(hr * 0.1, hr * 0.1, hr * 0.08, 6, 5), { color: EYE, matrix: at(side * hr * 0.37, hr * 0.22, hr * 0.84) });
      if (o.ears) {
        headB.add(new THREE.ConeGeometry(hr * 0.24, hr * 0.9, 5).rotateZ(-side * 1.2), { color: shade(skin, 1.05), matrix: at(side * hr * 0.9, hr * 0.3, -hr * 0.05) });
      }
    }
    headB.add(new THREE.BoxGeometry(hr * 0.5, hr * 0.09, hr * 0.1), { color: shade(skin, 0.6), matrix: at(0, -hr * 0.46, hr * 0.8) });
  }
  const head = joint(0, headY, 0, m.mesh(headB));
  m.trunk.add(head);
  rig.head = head;

  const armLength = o.height * 0.36, legLength = hip;
  for (const side of [1, -1]) {
    const armB = new MeshBuilder();
    armB.add(limb(o.girth * 0.24, o.girth * 0.18, armLength, 7), { color: o.ribs ? main : cloth });
    armB.add(ellipsoid(o.girth * 0.24, o.girth * 0.24, o.girth * 0.22, 7, 6), { color: o.ribs ? BONE_DARK : skin, matrix: at(0, -armLength - o.girth * 0.14, 0) });
    const arm = joint(side * o.girth * 0.92, shoulder - o.girth * 0.16, 0, m.mesh(armB));
    m.trunk.add(arm);
    rig.arms.push(arm);

    const legB = new MeshBuilder();
    legB.add(limb(o.girth * 0.3, o.girth * 0.22, legLength, 7), { color: o.ribs ? main : shade(cloth, 0.88) });
    legB.add(ellipsoid(o.girth * 0.3, o.girth * 0.16, o.girth * 0.46, 7, 5), { color: shade(o.ribs ? BONE_DARK : cloth, 0.6), matrix: at(0, -legLength - o.girth * 0.1, o.girth * 0.16) });
    const leg = joint(side * o.girth * 0.42, hip, 0, m.mesh(legB));
    m.trunk.add(leg);
    rig.legs.push(leg);
  }
  return rig;
}

/**
 * Eight legs around a low body. A spider is that and no more; a scorpion adds pincers reaching forward
 * and a tail arched over its back with a sting on the end.
 */
function eightLegs(m: MonsterModel, main: number, second: number, sting: boolean): Rig {
  const rig = emptyRig(sting ? 0.52 : 0.42, 0.44, 0.008);
  const body = new MeshBuilder();
  body.add(ellipsoid(0.26, 0.17, 0.3, 11, 8), { color: main, matrix: at(0, 0.2, -0.14) });
  body.add(ellipsoid(0.17, 0.13, 0.17, 9, 7), { color: shade(main, 0.9), matrix: at(0, 0.19, 0.2) });
  for (let i = 0; i < 3; i++) body.add(ellipsoid(0.055, 0.03, 0.05, 6, 5), { color: second, matrix: at(0, 0.34 - i * 0.01, -0.02 - i * 0.12) });
  if (sting) {
    for (const side of [1, -1]) {
      body.add(limb(0.032, 0.026, 0.16, 6), { color: shade(main, 0.86), matrix: at(side * 0.13, 0.26, 0.3, 1, side * 0.45, 1.5) });
      body.add(ellipsoid(0.05, 0.035, 0.07, 7, 5), { color: second, matrix: at(side * 0.19, 0.19, 0.42, 1, side * 0.4) });
    }
    body.add(limb(0.045, 0.028, 0.24, 7), { color: main, matrix: at(0, 0.44, -0.4, 1, 0, 2.4) });
    body.add(limb(0.032, 0.022, 0.18, 6), { color: main, matrix: at(0, 0.62, -0.2, 1, 0, 3.7) });
    body.add(new THREE.ConeGeometry(0.032, 0.1, 6).rotateX(2.2), { color: second, matrix: at(0, 0.54, -0.06) });
  } else {
    // A spider's fangs, under the front of its body.
    for (const side of [1, -1]) {
      body.add(new THREE.ConeGeometry(0.022, 0.08, 5).rotateX(-2.4), { color: second, matrix: at(side * 0.05, 0.13, 0.3) });
    }
  }
  m.trunk.add(m.mesh(body));

  const headB = new MeshBuilder();
  for (const side of [1, -1]) {
    headB.add(ellipsoid(0.035, 0.035, 0.03, 6, 5), { color: EYE, matrix: at(side * 0.07, 0.04, 0.12) });
    headB.add(ellipsoid(0.022, 0.022, 0.02, 5, 4), { color: EYE, matrix: at(side * 0.11, 0, 0.08) });
  }
  const head = joint(0, 0.19, 0.2, m.mesh(headB));
  m.trunk.add(head);
  rig.head = head;

  // Eight legs, splayed out and down in four rows.
  for (let i = 0; i < 8; i++) {
    const side = i % 2 === 0 ? 1 : -1, row = Math.floor(i / 2);
    const legB = new MeshBuilder();
    legB.add(limb(0.028, 0.016, 0.3, 5), { color: shade(main, 0.8) });
    const leg = joint(side * 0.18, 0.22, 0.14 - row * 0.13, m.mesh(legB));
    leg.rotation.z = side * (0.95 + row * 0.06);
    leg.rotation.y = side * (0.5 - row * 0.32);
    m.trunk.add(leg);
    rig.legs.push(leg);
  }
  return rig;
}

/** A bird: a plump body on two legs, with a tail fan. A hen wears a comb; a duck wears its own colours. */
function bird(m: MonsterModel, main: number, second: number, o: { comb: boolean; head: number; feet: number }): Rig {
  const rig = emptyRig(0.95, 0.24, 0.02);
  const body = new MeshBuilder();
  body.add(ellipsoid(0.24, 0.26, 0.3, 11, 9), { color: main, matrix: at(0, 0.46, 0) });
  // Tail feathers, fanned up and back.
  for (let i = -1; i <= 1; i++) {
    body.add(ellipsoid(0.05, 0.16, 0.03, 6, 5), { color: shade(main, 0.82), matrix: at(i * 0.07, 0.58, -0.3, 1, 0, -0.9, i * 0.2) });
  }
  for (const side of [1, -1]) body.add(ellipsoid(0.07, 0.18, 0.22, 7, 6), { color: shade(main, 0.9), matrix: at(side * 0.21, 0.48, 0.02) });
  m.trunk.add(m.mesh(body));

  const headB = new MeshBuilder();
  headB.add(limb(0.07, 0.08, 0.16, 7), { color: o.head, matrix: at(0, 0.18, 0.04) });
  headB.add(ellipsoid(0.11, 0.12, 0.11, 9, 7), { color: o.head, matrix: at(0, 0.22, 0.06) });
  headB.add(new THREE.ConeGeometry(0.05, 0.14, 5).rotateX(Math.PI / 2), { color: o.comb ? second : o.feet, matrix: at(0, 0.2, 0.2) });
  if (o.comb) for (let i = 0; i < 3; i++) headB.add(ellipsoid(0.02, 0.045, 0.03, 6, 5), { color: second, matrix: at(0, 0.32, 0.1 - i * 0.05) });
  for (const side of [1, -1]) headB.add(ellipsoid(0.026, 0.026, 0.02, 6, 5), { color: EYE, matrix: at(side * 0.075, 0.245, 0.135) });
  const head = joint(0, 0.5, 0.16, m.mesh(headB));
  m.trunk.add(head);
  rig.head = head;

  for (const side of [1, -1]) {
    const legB = new MeshBuilder();
    legB.add(limb(0.028, 0.024, 0.22, 6), { color: o.feet });
    for (let t = -1; t <= 1; t++) {
      legB.add(ellipsoid(0.012, 0.012, 0.055, 5, 4), { color: o.feet, matrix: at(t * 0.03, -0.235, 0.04, 1, t * 0.5) });
    }
    const leg = joint(side * 0.1, 0.26, 0, m.mesh(legB));
    m.trunk.add(leg);
    rig.legs.push(leg);
  }
  return rig;
}

const BUILDERS: Record<MonsterShape, Builder> = {
  rodent: (m, main, second) => quadruped(m, main, second, {
    length: 0.95, girth: 0.3, standing: 0.24, legWidth: 0.07, snout: 0.26, ears: "round", horns: "none",
  }),
  cattle: (m, main, second) => quadruped(m, main, second, {
    length: 1.3, girth: 0.45, standing: 0.62, legWidth: 0.13, snout: 0.2, ears: "round", horns: "short",
  }),
  woolly: (m, main, second) => quadruped(m, main, second, {
    length: 1.1, girth: 0.42, standing: 0.5, legWidth: 0.11, snout: 0.16, ears: "round", horns: "curled",
  }),
  boar: (m, main, second) => quadruped(m, main, second, {
    length: 1.15, girth: 0.4, standing: 0.46, legWidth: 0.1, snout: 0.28, ears: "pointed", horns: "tusks",
  }),
  canine: (m, main, second) => quadruped(m, main, second, {
    length: 1.15, girth: 0.32, standing: 0.6, legWidth: 0.09, snout: 0.3, ears: "pointed", horns: "none",
  }),
  humanoid: (m, main, second) => biped(m, main, second, { height: 1.6, girth: 0.26, skull: false, ribs: false, ears: true }),
  skeletal: (m, main, second) => biped(m, main, second, { height: 1.6, girth: 0.24, skull: true, ribs: true, ears: false }),

  fowl: (m, main, second) => bird(m, main, second, { comb: true, head: main, feet: second }),
  waterfowl: (m, main, second) => bird(m, main, second, { comb: false, head: second, feet: 0xd8a032 }),

  crawler: (m, main, second) => eightLegs(m, main, second, false),
  stinger: (m, main, second) => eightLegs(m, main, second, true),

  lizard: (m, main, second) => {
    const rig = emptyRig(0.45, 0.36, 0.01);
    const body = new MeshBuilder();
    body.add(ellipsoid(0.16, 0.12, 0.34, 11, 8), { color: main, matrix: at(0, 0.17, -0.02) });
    // Spots down the spine.
    for (let i = 0; i < 4; i++) {
      body.add(ellipsoid(0.038, 0.02, 0.04, 6, 5), { color: second, matrix: at((i % 2 ? 1 : -1) * 0.06, 0.28, 0.12 - i * 0.11) });
    }
    m.trunk.add(m.mesh(body));

    const headB = new MeshBuilder();
    headB.add(ellipsoid(0.12, 0.09, 0.16, 9, 7), { color: main });
    headB.add(ellipsoid(0.06, 0.05, 0.07, 7, 5), { color: shade(main, 0.9), matrix: at(0, -0.02, 0.16) });
    for (const side of [1, -1]) {
      headB.add(ellipsoid(0.035, 0.035, 0.03, 6, 5), { color: shade(main, 1.15), matrix: at(side * 0.08, 0.06, 0.05) });
      headB.add(ellipsoid(0.02, 0.02, 0.018, 5, 4), { color: EYE, matrix: at(side * 0.085, 0.07, 0.08) });
    }
    headB.add(new THREE.BoxGeometry(0.11, 0.012, 0.03), { color: shade(main, 0.65), matrix: at(0, -0.05, 0.16) });
    const head = joint(0, 0.19, 0.3, m.mesh(headB));
    m.trunk.add(head);
    rig.head = head;

    // A long tapering tail that sways as it walks.
    const tailB = new MeshBuilder();
    tailB.add(limb(0.08, 0.012, 0.42, 7), { color: shade(main, 0.9), matrix: at(0, 0, 0, 1, 0, 1.62) });
    const tail = joint(0, 0.17, -0.34, m.mesh(tailB));
    m.trunk.add(tail);
    rig.tail = tail;

    // Four legs, splayed out to the sides as a lizard's are.
    for (let i = 0; i < 4; i++) {
      const side = i % 2 === 0 ? 1 : -1, front = i < 2;
      const legB = new MeshBuilder();
      legB.add(limb(0.028, 0.02, 0.16, 6), { color: shade(main, 0.84) });
      legB.add(ellipsoid(0.04, 0.014, 0.05, 6, 4), { color: shade(main, 0.75), matrix: at(0, -0.17, 0.02) });
      const leg = joint(side * 0.13, 0.17, front ? 0.18 : -0.18, m.mesh(legB));
      leg.rotation.z = side * 0.85;
      m.trunk.add(leg);
      rig.legs.push(leg);
    }
    return rig;
  },

  hopper: (m, main, second) => {
    const rig = emptyRig(0.5, 0.3, 0.03);
    const body = new MeshBuilder();
    body.add(ellipsoid(0.24, 0.2, 0.28, 11, 8), { color: main, matrix: at(0, 0.24, -0.02) });
    body.add(ellipsoid(0.2, 0.15, 0.13, 9, 7), { color: shade(main, 0.95), matrix: at(0, 0.22, 0.22) });
    body.add(ellipsoid(0.16, 0.1, 0.18, 9, 6), { color: second, matrix: at(0, 0.1, 0.06) });
    for (let i = 0; i < 4; i++) {
      body.add(ellipsoid(0.04, 0.025, 0.04, 6, 5), { color: second, matrix: at((i % 2 ? 1 : -1) * 0.14, 0.4 - (i >> 1) * 0.04, -0.06 - (i >> 1) * 0.14) });
    }
    m.trunk.add(m.mesh(body));

    const headB = new MeshBuilder();
    for (const side of [1, -1]) {
      headB.add(ellipsoid(0.07, 0.07, 0.07, 8, 6), { color: shade(main, 1.08), matrix: at(side * 0.11, 0.09, 0.02) });
      headB.add(ellipsoid(0.035, 0.035, 0.03, 6, 5), { color: EYE, matrix: at(side * 0.12, 0.1, 0.06) });
    }
    headB.add(new THREE.BoxGeometry(0.2, 0.02, 0.04), { color: shade(main, 0.7), matrix: at(0, -0.04, 0.12) });
    const head = joint(0, 0.26, 0.2, m.mesh(headB));
    m.trunk.add(head);
    rig.head = head;

    // Back legs folded high, front legs short and propping it up.
    for (const side of [1, -1]) {
      const backB = new MeshBuilder();
      backB.add(ellipsoid(0.08, 0.13, 0.09, 8, 6), { color: main });
      backB.add(limb(0.04, 0.03, 0.2, 6), { color: shade(main, 0.9), matrix: at(0, -0.06, -0.02) });
      backB.add(ellipsoid(0.05, 0.02, 0.09, 6, 5), { color: second, matrix: at(0, -0.27, 0.05) });
      const back = joint(side * 0.2, 0.26, -0.12, m.mesh(backB));
      m.trunk.add(back);
      rig.legs.push(back);

      const frontB = new MeshBuilder();
      frontB.add(limb(0.032, 0.024, 0.18, 6), { color: shade(main, 0.9) });
      frontB.add(ellipsoid(0.04, 0.02, 0.06, 6, 5), { color: second, matrix: at(0, -0.19, 0.03) });
      const front = joint(side * 0.13, 0.2, 0.16, m.mesh(frontB));
      m.trunk.add(front);
      rig.legs.push(front);
    }
    return rig;
  },

  flier: (m, main, second) => {
    const rig = emptyRig(0.5, 0.18, 0.05);
    const body = new MeshBuilder();
    body.add(ellipsoid(0.1, 0.15, 0.11, 9, 7), { color: main, matrix: at(0, 0.36, 0) });
    body.add(ellipsoid(0.09, 0.09, 0.09, 8, 6), { color: shade(main, 1.06), matrix: at(0, 0.5, 0.03) });
    for (const side of [1, -1]) {
      body.add(new THREE.ConeGeometry(0.05, 0.16, 5), { color: second, matrix: at(side * 0.06, 0.6, -0.01, 1, 0, 0, side * 0.3) });
      body.add(ellipsoid(0.022, 0.022, 0.018, 6, 5), { color: 0xc23a2a, matrix: at(side * 0.038, 0.51, 0.08) });
      // Back legs, hanging.
      body.add(limb(0.018, 0.012, 0.1, 5), { color: shade(main, 0.8), matrix: at(side * 0.05, 0.26, -0.02) });
    }
    m.trunk.add(m.mesh(body));

    // Wings: a membrane on three fingers, hinged at the shoulder.
    for (const side of [1, -1]) {
      const wingB = new MeshBuilder();
      for (let f = 0; f < 3; f++) {
        const spread = 0.16 + f * 0.13, drop = -0.02 - f * 0.05;
        wingB.add(ellipsoid(spread * 0.55, 0.012, 0.075 + f * 0.02, 6, 4), {
          color: second, matrix: at(side * spread * 0.55, drop * 0.5, -f * 0.045),
        });
      }
      wingB.add(limb(0.014, 0.008, 0.42, 5), { color: shade(second, 1.2), matrix: at(0, 0, 0.02, 1, 0, 0, -side * Math.PI / 2) });
      const wing = joint(side * 0.08, 0.42, 0, m.mesh(wingB));
      m.trunk.add(wing);
      rig.wings.push(wing);
    }
    return rig;
  },
};
