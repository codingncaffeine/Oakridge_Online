import * as THREE from "three";
import { MONSTER_BY_KEY, type MonsterShape } from "../../shared/monsters.ts";
import { at, hash, MeshBuilder, post, taperedBox, tube, web } from "./meshkit.ts";
import type { ActionName } from "./poses.ts";

/**
 * Flat shading, on purpose. Every creature is cut from flat-faced blocks and tubes with few sides, so
 * the facets are the look rather than something to hide: a rat is a long wedge with a pointed snout,
 * not a stack of smooth balls.
 */
const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const shadowMaterial = new THREE.MeshBasicMaterial({
  color: 0x000000, transparent: true, opacity: 0.26, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
});

const EYE = 0x100d0a;
const BONE_DARK = 0x8a8168;
const shade = (hex: number, k: number) => new THREE.Color(hex).multiplyScalar(k).getHex();

/** Seconds a swing takes, and how far through it the blow lands. */
const SWING_PERIOD = 0.6;
const SWING_IMPACT = 0.45;

/**
 * The box the cursor picks a creature by. It is never drawn, only hit: a field rat stands a sixth of a
 * tile high, and without a box of its own nothing that small could be clicked at all.
 */
const PICK_MIN = 0.55;
const pickMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true, opacity: 0 });

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
 * A creature built in code from its entry in the bestiary: its shape, its size and its two colours.
 * Nothing is downloaded and nothing is generated; the shape names in shared/monsters.ts are the whole
 * vocabulary, and each is cut from flat blocks, tapered tubes and triangle webs.
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
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(this.rig.shadow * scale, 10).rotateX(-Math.PI / 2), shadowMaterial);
    this.geometries.push(shadow.geometry);
    shadow.position.y = 0.02;
    shadow.renderOrder = -1;
    // Something to aim at, whatever the creature's size.
    const across = Math.max(PICK_MIN, this.rig.shadow * scale * 2), tall = Math.max(PICK_MIN, this.height);
    const picker = new THREE.Mesh(new THREE.BoxGeometry(across, tall, across), pickMaterial);
    this.geometries.push(picker.geometry);
    picker.position.y = tall / 2;
    this.root.add(this.body, shadow, picker);
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

/** How much each facet's brightness varies, so flat faces read apart without needing more of them. */
const FACET = 0.05;

type Point = [number, number, number];

/**
 * Where a block placed at `from` and turned by `yaw` then `pitch` ends up, so the next block in a limb
 * can start exactly there. A block runs along +z, so only yaw and pitch aim it — rolling it turns the
 * block about its own length and moves nothing, which is how a set of legs ends up floating in the air.
 */
function tip(from: Point, yaw: number, pitch: number, length: number): Point {
  return [
    from[0] + Math.cos(pitch) * Math.sin(yaw) * length,
    from[1] - Math.sin(pitch) * length,
    from[2] + Math.cos(pitch) * Math.cos(yaw) * length,
  ];
}

/** A limb built as a chain: each segment starts where the last one ended. */
function chain(
  b: MeshBuilder, from: Point,
  links: Array<{ yaw: number; pitch: number; length: number; w1: number; h1: number; w2: number; h2: number; color: number }>,
): Point {
  let at0 = from;
  for (const l of links) {
    b.add(taperedBox(l.w1, l.h1, l.w2, l.h2, l.length), {
      color: l.color, shade: FACET, matrix: at(at0[0], at0[1], at0[2], 1, l.yaw, l.pitch),
    });
    at0 = tip(at0, l.yaw, l.pitch, l.length);
  }
  return at0;
}

interface FourLegs {
  /** Nose to rump, and how wide and deep the barrel is at the chest. */
  length: number;
  width: number;
  depth: number;
  /** Ground to the underside of the barrel. */
  standing: number;
  /** How thick a leg is, and how big a foot. */
  legWidth: number;
  /** Head block: how long the muzzle runs out in front. */
  snout: number;
  ears: "round" | "pointed" | "none";
  horns: "none" | "short" | "curled" | "tusks";
  /** A long thin whip, a short brush, or nothing. */
  tail: "whip" | "brush" | "none";
  /** How far the head is carried above the shoulder: a rat holds it low, a wolf level, a cow high. */
  carry: number;
}

/**
 * Four legs under a long low barrel. The barrel is three flat-sided blocks — haunch, belly, chest —
 * narrowing toward the tail, with a neck and a wedge head carried out in front, because what makes an
 * animal read at a glance is its side-on outline rather than how round it is.
 */
function quadruped(m: MonsterModel, main: number, second: number, o: FourLegs): Rig {
  const under = o.standing, back = under + o.depth;
  const rig = emptyRig(back + o.depth * 0.5 + o.carry, o.length * 0.42, 0.02);
  const dark = shade(main, 0.82), light = shade(main, 1.06);
  const body = new MeshBuilder();
  const half = o.length / 2;

  // Rump, belly and chest, laid nose-to-tail along +z and centred on the barrel's middle.
  body.add(taperedBox(o.width * 0.78, o.depth * 0.82, o.width * 0.98, o.depth * 0.98, o.length * 0.42), {
    color: main, shade: FACET, matrix: at(0, back - o.depth / 2, -half),
  });
  body.add(taperedBox(o.width * 0.98, o.depth * 0.98, o.width, o.depth, o.length * 0.3), {
    color: main, shade: FACET, matrix: at(0, back - o.depth / 2, -half + o.length * 0.42),
  });
  body.add(taperedBox(o.width, o.depth, o.width * 0.86, o.depth * 0.9, o.length * 0.28, o.depth * 0.06), {
    color: main, shade: FACET, matrix: at(0, back - o.depth / 2, -half + o.length * 0.72),
  });
  // A paler belly, as most of these animals have.
  body.add(taperedBox(o.width * 0.72, o.depth * 0.2, o.width * 0.6, o.depth * 0.18, o.length * 0.86), {
    color: light, shade: FACET, matrix: at(0, under + o.depth * 0.1, -half + o.length * 0.06),
  });
  m.trunk.add(m.mesh(body));

  // Neck and head, carried forward of the chest and angled down toward the muzzle.
  const headB = new MeshBuilder();
  const hw = o.width * 0.62, hh = o.depth * 0.6;
  headB.add(taperedBox(hw * 0.86, hh * 0.9, hw, hh, hw * 0.9), { color: main, shade: FACET, matrix: at(0, 0, -hw * 0.45) });
  headB.add(taperedBox(hw * 0.62, hh * 0.62, hw * 0.44, hh * 0.42, o.snout, -hh * 0.16), {
    color: dark, shade: FACET, matrix: at(0, 0, hw * 0.45),
  });
  headB.add(taperedBox(hw * 0.3, hh * 0.18, hw * 0.24, hh * 0.14, hw * 0.16), {
    color: second, shade: FACET, matrix: at(0, -hh * 0.2, hw * 0.45 + o.snout),
  });
  for (const side of [1, -1]) {
    headB.add(taperedBox(hw * 0.2, hh * 0.2, hw * 0.16, hh * 0.16, hw * 0.1), {
      color: EYE, matrix: at(side * hw * 0.38, hh * 0.18, hw * 0.78),
    });
    if (o.ears === "round") {
      headB.add(taperedBox(hw * 0.12, hh * 0.5, hw * 0.1, hh * 0.44, hw * 0.34), {
        color: light, shade: FACET, matrix: at(side * hw * 0.64, hh * 0.5, -hw * 0.1, 1, side * 0.5),
      });
    }
    if (o.ears === "pointed") {
      headB.add(taperedBox(hw * 0.28, hw * 0.26, 0.001, 0.001, hh * 0.95), {
        color: main, shade: FACET, matrix: at(side * hw * 0.44, hh * 0.52, -hw * 0.18, 1, 0, -1.35, side * 0.3),
      });
    }
    if (o.horns === "short") {
      headB.add(taperedBox(hw * 0.2, hw * 0.2, 0.001, 0.001, hw * 0.95), {
        color: second, shade: FACET, matrix: at(side * hw * 0.5, hh * 0.42, hw * 0.1, 1, 0, -0.5, side * 1.25),
      });
    }
    if (o.horns === "curled") {
      // Four blocks turning back and round, which reads as a curl without bending anything.
      for (let k = 0; k < 4; k++) {
        const a = 0.5 + k * 1.15, r = hw * (0.2 - k * 0.028);
        headB.add(taperedBox(r * 2, r * 2, r * 1.7, r * 1.7, hw * 0.3), {
          color: second, shade: FACET,
          matrix: at(side * hw * (0.56 + k * 0.02), hh * 0.44 - Math.sin(a) * hh * 0.5, hw * 0.1 - Math.cos(a) * hw * 0.5, 1, 0, a - 1.2, side * 1.2),
        });
      }
    }
    if (o.horns === "tusks") {
      headB.add(taperedBox(hw * 0.14, hw * 0.14, 0.001, 0.001, hh * 0.8), {
        color: second, shade: FACET, matrix: at(side * hw * 0.3, -hh * 0.3, hw * 0.5 + o.snout * 0.6, 1, 0, 1.15, side * 0.35),
      });
    }
  }
  const head = joint(0, back - o.depth * 0.1 + o.carry, half - o.length * 0.04, m.mesh(headB));
  head.rotation.x = -0.12;
  m.trunk.add(head);
  rig.head = head;
  // The neck, drawn between the chest and the head so it fills whatever gap the carry leaves.
  const neck = new MeshBuilder();
  neck.add(taperedBox(o.width * 0.6, o.depth * 0.6, hw * 0.9, hh * 0.9, Math.hypot(o.carry + o.depth * 0.4, o.length * 0.2)), {
    color: main, shade: FACET, matrix: at(0, back - o.depth * 0.55, half - o.length * 0.26, 1, 0, -Math.atan2(o.carry + o.depth * 0.4, o.length * 0.2)),
  });
  m.trunk.add(m.mesh(neck));

  // Legs: a thigh angled under the body, a shin straight down from where it ends, then a blunt foot.
  const lw = o.legWidth;
  for (const [front, side] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    const legB = new MeshBuilder();
    const upper = o.standing * 0.52, lower = o.standing * 0.48;
    const knee = chain(legB, [0, 0, 0], [
      { yaw: 0, pitch: Math.PI / 2 - front * 0.26, length: upper, w1: lw * 1.2, h1: lw * 1.35, w2: lw * 0.92, h2: lw * 1.0, color: main },
    ]);
    const ankle = chain(legB, knee, [
      { yaw: 0, pitch: Math.PI / 2, length: lower, w1: lw * 0.92, h1: lw * 1.0, w2: lw * 0.8, h2: lw * 0.84, color: dark },
    ]);
    // The hoof or paw sits at the ankle and reaches forward.
    legB.add(taperedBox(lw * 0.95, lw * 0.75, lw * 0.85, lw * 0.55, lw * 1.6), {
      color: second, shade: FACET, matrix: at(ankle[0], ankle[1] + lw * 0.34, ankle[2] - lw * 0.5),
    });
    const leg = joint(side * o.width * 0.42, back - o.depth * 0.7, front * o.length * 0.3, m.mesh(legB));
    m.trunk.add(leg);
    rig.legs.push(leg);
  }

  if (o.tail !== "none") {
    const tailB = new MeshBuilder();
    const long = o.tail === "whip" ? o.length * 0.55 : o.length * 0.2;
    const thick = o.tail === "whip" ? lw * 0.5 : lw * 1.2;
    // Two links, the second dropping further, so it trails behind rather than standing up like a stick.
    chain(tailB, [0, 0, 0], [
      { yaw: 0, pitch: -0.25, length: long * 0.5, w1: thick, h1: thick, w2: thick * 0.6, h2: thick * 0.6, color: o.tail === "whip" ? second : main },
      { yaw: 0, pitch: 0.45, length: long * 0.5, w1: thick * 0.6, h1: thick * 0.6, w2: thick * 0.15, h2: thick * 0.15, color: o.tail === "whip" ? second : main },
    ]);
    const tail = joint(0, back - o.depth * 0.35, -half, m.mesh(tailB));
    tail.rotation.y = Math.PI;
    m.trunk.add(tail);
    rig.tail = tail;
  }
  return rig;
}

/** A bird: a wedge body that tapers to a pointed tail, on two thin legs, with a beak out front. */
function bird(m: MonsterModel, main: number, second: number, o: { comb: boolean; head: number; feet: number }): Rig {
  const rig = emptyRig(0.95, 0.24, 0.02);
  const body = new MeshBuilder();
  // Breast to tail, the widest point just behind the neck.
  body.add(taperedBox(0.3, 0.34, 0.42, 0.4, 0.26, 0.02), { color: main, shade: FACET, matrix: at(0, 0.46, -0.3) });
  body.add(taperedBox(0.42, 0.4, 0.2, 0.22, 0.3, -0.04), { color: main, shade: FACET, matrix: at(0, 0.46, -0.04) });
  // Tail feathers: three flat blades fanned up and back.
  for (let i = -1; i <= 1; i++) {
    body.add(taperedBox(0.1, 0.03, 0.06, 0.02, 0.28), {
      color: shade(main, 0.84), shade: FACET, matrix: at(i * 0.07, 0.5, -0.34, 1, i * 0.22, 0.85),
    });
  }
  for (const side of [1, -1]) {
    body.add(taperedBox(0.05, 0.24, 0.04, 0.14, 0.3), {
      color: shade(main, 0.92), shade: FACET, matrix: at(side * 0.19, 0.48, -0.26),
    });
  }
  m.trunk.add(m.mesh(body));

  const headB = new MeshBuilder();
  headB.add(taperedBox(0.11, 0.11, 0.15, 0.16, 0.2), { color: o.head, shade: FACET, matrix: at(0, 0.04, -0.06, 1, 0, -0.5) });
  headB.add(taperedBox(0.17, 0.18, 0.15, 0.15, 0.17), { color: o.head, shade: FACET, matrix: at(0, 0.2, -0.05) });
  headB.add(taperedBox(0.09, 0.07, 0.02, 0.02, 0.14), { color: o.comb ? second : o.feet, shade: FACET, matrix: at(0, 0.2, 0.11) });
  if (o.comb) {
    for (let i = 0; i < 3; i++) {
      headB.add(taperedBox(0.03, 0.02, 0.02, 0.02, 0.09), { color: second, matrix: at(0, 0.29, 0.08 - i * 0.05, 1, 0, -1.1) });
    }
  }
  for (const side of [1, -1]) {
    headB.add(taperedBox(0.04, 0.04, 0.03, 0.03, 0.03), { color: EYE, matrix: at(side * 0.075, 0.25, 0.07) });
  }
  const head = joint(0, 0.48, 0.14, m.mesh(headB));
  m.trunk.add(head);
  rig.head = head;

  for (const side of [1, -1]) {
    const legB = new MeshBuilder();
    legB.add(post(0.026, 0.022, 0.22, 4), { color: o.feet, shade: FACET });
    for (let t = -1; t <= 1; t++) {
      legB.add(taperedBox(0.025, 0.018, 0.015, 0.012, 0.1), { color: o.feet, matrix: at(t * 0.03, -0.228, 0.01, 1, t * 0.5) });
    }
    const leg = joint(side * 0.1, 0.28, 0, m.mesh(legB));
    m.trunk.add(leg);
    rig.legs.push(leg);
  }
  return rig;
}

/**
 * Eight legs around a flat plated body, each bending up at a knee then down to the ground. A spider is
 * that and fangs; a scorpion adds pincers out front and a segmented tail arched over its back.
 */
function eightLegs(m: MonsterModel, main: number, second: number, sting: boolean): Rig {
  const rig = emptyRig(sting ? 0.58 : 0.44, 0.44, 0.008);
  const dark = shade(main, 0.8);
  const body = new MeshBuilder();
  // Abdomen and head plate, both flat six-sided slabs.
  body.add(tube(0.2, 0.27, 0.34, 6), { color: main, shade: FACET, matrix: at(0, 0.21, -0.36, [1, 0.62, 1], 0, Math.PI / 2) });
  body.add(tube(0.17, 0.13, 0.24, 6), { color: dark, shade: FACET, matrix: at(0, 0.2, 0.06, [1, 0.66, 1], 0, Math.PI / 2) });
  for (let i = 0; i < 3; i++) {
    body.add(taperedBox(0.1, 0.02, 0.07, 0.02, 0.09), { color: second, matrix: at(0, 0.32 - i * 0.012, -0.12 - i * 0.11) });
  }
  if (sting) {
    for (const side of [1, -1]) {
      body.add(taperedBox(0.06, 0.05, 0.05, 0.04, 0.2), { color: dark, shade: FACET, matrix: at(side * 0.12, 0.2, 0.2, 1, side * 0.42) });
      body.add(taperedBox(0.1, 0.07, 0.05, 0.05, 0.16), { color: second, shade: FACET, matrix: at(side * 0.2, 0.2, 0.36, 1, side * 0.5) });
      body.add(taperedBox(0.04, 0.04, 0.03, 0.03, 0.11), { color: second, matrix: at(side * 0.23, 0.23, 0.48, 1, side * 0.9) });
    }
    // The tail: back and up, then hooking forward over its own back, ending in a sting.
    const seg = (i: number) => ({ w1: 0.09 - i * 0.009, h1: 0.09 - i * 0.009, w2: 0.082 - i * 0.009, h2: 0.082 - i * 0.009, color: main });
    const sting = chain(body, [0, 0.3, -0.5], [
      { yaw: Math.PI, pitch: -1.05, length: 0.13, ...seg(0) },
      { yaw: Math.PI, pitch: -1.5, length: 0.13, ...seg(1) },
      { yaw: 0, pitch: -1.45, length: 0.13, ...seg(2) },
      { yaw: 0, pitch: -0.75, length: 0.13, ...seg(3) },
      { yaw: 0, pitch: 0.15, length: 0.11, ...seg(4) },
    ]);
    body.add(taperedBox(0.05, 0.05, 0.004, 0.004, 0.13), { color: second, matrix: at(sting[0], sting[1], sting[2], 1, 0, 1.35) });
  } else {
    for (const side of [1, -1]) {
      body.add(taperedBox(0.04, 0.05, 0.01, 0.01, 0.12), { color: second, matrix: at(side * 0.05, 0.14, 0.16, 1, 0, 0.9) });
    }
  }
  m.trunk.add(m.mesh(body));

  const headB = new MeshBuilder();
  for (const side of [1, -1]) {
    headB.add(taperedBox(0.05, 0.05, 0.04, 0.04, 0.03), { color: EYE, matrix: at(side * 0.07, 0.05, 0.1) });
    headB.add(taperedBox(0.032, 0.032, 0.026, 0.026, 0.025), { color: EYE, matrix: at(side * 0.12, 0.01, 0.06) });
  }
  const head = joint(0, 0.2, 0.14, m.mesh(headB));
  m.trunk.add(head);
  rig.head = head;

  // Legs: out and up to a knee, then down to the ground, each segment starting where the last ended.
  for (let i = 0; i < 8; i++) {
    const side = i % 2 === 0 ? 1 : -1, row = Math.floor(i / 2);
    const yaw = side * (Math.PI / 2 - (0.75 - row * 0.5));
    const legB = new MeshBuilder();
    const knee = chain(legB, [0, 0, 0], [
      { yaw, pitch: -0.75, length: 0.3, w1: 0.04, h1: 0.04, w2: 0.03, h2: 0.03, color: dark },
    ]);
    chain(legB, knee, [
      { yaw, pitch: 1.15, length: 0.36, w1: 0.03, h1: 0.03, w2: 0.014, h2: 0.014, color: dark },
    ]);
    const leg = joint(side * 0.1, 0.2, 0.1 - row * 0.09, m.mesh(legB));
    m.trunk.add(leg);
    rig.legs.push(leg);
  }
  return rig;
}

/** A lizard: a long low body flat to the ground, a wedge head, splayed legs and a tapering tail. */
function lizard(m: MonsterModel, main: number, second: number): Rig {
  const rig = emptyRig(0.4, 0.34, 0.008);
  const body = new MeshBuilder();
  body.add(taperedBox(0.16, 0.13, 0.22, 0.16, 0.34), { color: main, shade: FACET, matrix: at(0, 0.15, -0.3) });
  body.add(taperedBox(0.22, 0.16, 0.16, 0.13, 0.3), { color: main, shade: FACET, matrix: at(0, 0.15, 0.04) });
  for (let i = 0; i < 5; i++) {
    body.add(taperedBox(0.07, 0.02, 0.05, 0.02, 0.06), { color: second, matrix: at((i % 2 ? 1 : -1) * 0.05, 0.23, 0.16 - i * 0.1) });
  }
  m.trunk.add(m.mesh(body));

  const headB = new MeshBuilder();
  headB.add(taperedBox(0.14, 0.1, 0.1, 0.07, 0.2, -0.01), { color: main, shade: FACET });
  headB.add(taperedBox(0.1, 0.07, 0.06, 0.05, 0.07), { color: shade(main, 0.88), shade: FACET, matrix: at(0, -0.01, 0.2) });
  for (const side of [1, -1]) {
    headB.add(taperedBox(0.05, 0.05, 0.04, 0.04, 0.04), { color: shade(main, 1.14), shade: FACET, matrix: at(side * 0.07, 0.06, 0.04) });
    headB.add(taperedBox(0.025, 0.025, 0.02, 0.02, 0.02), { color: EYE, matrix: at(side * 0.075, 0.07, 0.07) });
  }
  const head = joint(0, 0.17, 0.32, m.mesh(headB));
  m.trunk.add(head);
  rig.head = head;

  const tailB = new MeshBuilder();
  tailB.add(taperedBox(0.13, 0.11, 0.015, 0.015, 0.46), { color: shade(main, 0.9), shade: FACET, matrix: at(0, 0, 0, 1, 0, 0.1) });
  const tail = joint(0, 0.16, -0.44, m.mesh(tailB));
  tail.rotation.y = Math.PI;
  m.trunk.add(tail);
  rig.tail = tail;

  // Legs splayed out to the sides, elbow out and up, then down to a flat foot: a lizard's crawl.
  for (let i = 0; i < 4; i++) {
    const side = i % 2 === 0 ? 1 : -1, front = i < 2 ? 1 : -1;
    const legB = new MeshBuilder();
    const elbow = chain(legB, [0, 0, 0], [
      { yaw: side * (1.2 + front * 0.3), pitch: -0.15, length: 0.13, w1: 0.045, h1: 0.04, w2: 0.034, h2: 0.032, color: shade(main, 0.84) },
    ]);
    const foot = chain(legB, elbow, [
      { yaw: side * 1.3, pitch: 1.2, length: 0.12, w1: 0.034, h1: 0.032, w2: 0.026, h2: 0.026, color: shade(main, 0.84) },
    ]);
    legB.add(taperedBox(0.07, 0.018, 0.05, 0.014, 0.08), { color: second, matrix: at(foot[0], foot[1] + 0.008, foot[2] - 0.03, 1, side * 0.4) });
    const leg = joint(side * 0.09, 0.15, front * 0.18, m.mesh(legB));
    m.trunk.add(leg);
    rig.legs.push(leg);
  }
  return rig;
}

/** A frog: a squat wedge with bulging eyes and big back legs folded high, ready to go. */
function hopper(m: MonsterModel, main: number, second: number): Rig {
  const rig = emptyRig(0.48, 0.3, 0.025);
  const body = new MeshBuilder();
  body.add(taperedBox(0.22, 0.14, 0.34, 0.24, 0.26, 0.04), { color: main, shade: FACET, matrix: at(0, 0.2, -0.26) });
  body.add(taperedBox(0.34, 0.24, 0.26, 0.18, 0.3, -0.03), { color: main, shade: FACET, matrix: at(0, 0.2, 0) });
  body.add(taperedBox(0.28, 0.08, 0.2, 0.07, 0.48), { color: second, shade: FACET, matrix: at(0, 0.09, -0.22) });
  for (let i = 0; i < 4; i++) {
    body.add(taperedBox(0.06, 0.03, 0.04, 0.02, 0.07), { color: second, matrix: at((i % 2 ? 1 : -1) * 0.13, 0.33 - (i >> 1) * 0.03, -0.04 - (i >> 1) * 0.14) });
  }
  m.trunk.add(m.mesh(body));

  const headB = new MeshBuilder();
  for (const side of [1, -1]) {
    headB.add(taperedBox(0.11, 0.11, 0.09, 0.09, 0.1), { color: shade(main, 1.1), shade: FACET, matrix: at(side * 0.1, 0.06, -0.02) });
    headB.add(taperedBox(0.05, 0.05, 0.04, 0.04, 0.03), { color: EYE, matrix: at(side * 0.1, 0.08, 0.07) });
  }
  headB.add(taperedBox(0.24, 0.03, 0.18, 0.025, 0.05), { color: shade(main, 0.7), matrix: at(0, -0.05, 0.08) });
  const head = joint(0, 0.22, 0.26, m.mesh(headB));
  m.trunk.add(head);
  rig.head = head;

  for (const side of [1, -1]) {
    // Back leg folded: thigh up and back, shin down and forward, then a long splayed foot on the ground.
    const backB = new MeshBuilder();
    // Thigh back and up to a high knee, then the shin down and forward to the heel.
    const knee = chain(backB, [0, 0, 0], [
      { yaw: Math.PI + side * 0.3, pitch: -0.55, length: 0.2, w1: 0.12, h1: 0.14, w2: 0.085, h2: 0.1, color: main },
    ]);
    const heel = chain(backB, knee, [
      { yaw: side * 0.3, pitch: 1.15, length: 0.26, w1: 0.085, h1: 0.1, w2: 0.06, h2: 0.07, color: shade(main, 0.9) },
    ]);
    backB.add(taperedBox(0.1, 0.03, 0.15, 0.025, 0.17), { color: second, shade: FACET, matrix: at(heel[0], heel[1] + 0.012, heel[2], 1, side * 0.3) });
    const back = joint(side * 0.17, 0.19, -0.1, m.mesh(backB));
    m.trunk.add(back);
    rig.legs.push(back);

    const frontB = new MeshBuilder();
    const paw = chain(frontB, [0, 0, 0], [
      { yaw: 0, pitch: Math.PI / 2 - 0.2, length: 0.17, w1: 0.055, h1: 0.055, w2: 0.042, h2: 0.042, color: shade(main, 0.9) },
    ]);
    frontB.add(taperedBox(0.07, 0.022, 0.1, 0.02, 0.11), { color: second, matrix: at(paw[0], paw[1] + 0.01, paw[2] - 0.02, 1, side * 0.35) });
    const front = joint(side * 0.12, 0.19, 0.16, m.mesh(frontB));
    m.trunk.add(front);
    rig.legs.push(front);
  }
  return rig;
}

/** A bat: a small body between two flat membranes stretched on finger bones. */
function flier(m: MonsterModel, main: number, second: number): Rig {
  const rig = emptyRig(0.5, 0.18, 0.05);
  const dark = shade(main, 0.82);
  const body = new MeshBuilder();
  body.add(taperedBox(0.14, 0.2, 0.1, 0.14, 0.2, 0.02), { color: main, shade: FACET, matrix: at(0, 0.3, -0.06, 1, 0, -1.3) });
  body.add(taperedBox(0.14, 0.13, 0.11, 0.1, 0.13), { color: main, shade: FACET, matrix: at(0, 0.48, -0.04) });
  for (const side of [1, -1]) {
    // Tall pointed ears, and small eyes.
    body.add(taperedBox(0.07, 0.06, 0.005, 0.005, 0.18), { color: second, shade: FACET, matrix: at(side * 0.06, 0.55, -0.03, 1, 0, -1.2, side * 0.3) });
    body.add(taperedBox(0.03, 0.03, 0.025, 0.025, 0.02), { color: 0xc23a2a, matrix: at(side * 0.04, 0.5, 0.07) });
    body.add(taperedBox(0.03, 0.03, 0.02, 0.02, 0.12), { color: dark, matrix: at(side * 0.05, 0.22, -0.02, 1, 0, Math.PI / 2 - 0.3) });
  }
  m.trunk.add(m.mesh(body));

  for (const side of [1, -1]) {
    const wingB = new MeshBuilder();
    // One membrane, cut as a fan from the shoulder out to the finger tips, with the bones drawn on it.
    const fingers: Array<[number, number, number]> = [
      [side * 0.14, 0.05, 0.2], [side * 0.4, 0.03, 0.12], [side * 0.54, -0.02, -0.05], [side * 0.42, -0.07, -0.2], [side * 0.12, -0.05, -0.18],
    ];
    wingB.add(web([0, 0, 0.05], fingers), { color: second, shade: FACET });
    // Drawn from the other face too, so the membrane is not invisible from behind.
    wingB.add(web([0, 0, 0.05], [...fingers].reverse()), { color: shade(second, 0.86) });
    for (const f of fingers.slice(1, 4)) {
      const dx = f[0], dy = f[1], dz = f[2] - 0.05;
      const len = Math.hypot(dx, dy, dz);
      wingB.add(taperedBox(0.018, 0.018, 0.008, 0.008, len), {
        color: dark, matrix: at(0, 0, 0.05, 1, Math.atan2(dx, dz), -Math.asin(dy / len)),
      });
    }
    const wing = joint(side * 0.07, 0.42, 0, m.mesh(wingB));
    m.trunk.add(wing);
    rig.wings.push(wing);
  }
  return rig;
}

/**
 * A body over two legs, with arms: people-shaped creatures, and the bones of them. The torso is a
 * trapezoid broad at the shoulders, the limbs are tapered blocks, and the head is a flat-faced wedge.
 * For the living, the two colours are skin and clothing, so a face always shows against what it wears;
 * for the dead, both are bone and the body is a rack of ribs.
 */
function biped(
  m: MonsterModel, main: number, second: number,
  o: { height: number; girth: number; skull: boolean; ribs: boolean; ears: boolean },
): Rig {
  const skin = main, cloth = o.ribs ? main : second;
  const rig = emptyRig(o.height, o.girth * 1.3, 0.03);
  const hip = o.height * 0.46, shoulder = o.height * 0.8, headY = o.height * 0.9;
  const g = o.girth;
  const body = new MeshBuilder();
  if (o.ribs) {
    body.add(taperedBox(g * 0.34, g * 0.3, g * 0.3, g * 0.26, shoulder - hip), {
      color: shade(main, 0.86), shade: FACET, matrix: at(0, hip, -g * 0.16, 1, 0, -Math.PI / 2),
    });
    for (let i = 0; i < 5; i++) {
      const y = hip + (shoulder - hip) * (0.18 + i * 0.17), w = g * (1.7 - i * 0.1);
      body.add(taperedBox(w, g * 0.14, w * 0.9, g * 0.12, g * 0.9), { color: main, shade: FACET, matrix: at(0, y, -g * 0.45) });
    }
    body.add(taperedBox(g * 1.9, g * 0.32, g * 1.5, g * 0.28, g * 0.9), { color: shade(main, 0.94), shade: FACET, matrix: at(0, shoulder - g * 0.12, -g * 0.45) });
    body.add(taperedBox(g * 1.5, g * 0.34, g * 1.3, g * 0.3, g * 0.8), { color: BONE_DARK, shade: FACET, matrix: at(0, hip, -g * 0.4) });
  } else {
    // Shoulders down to the waist, then the hips: two blocks, the way the reference cuts a torso.
    body.add(taperedBox(g * 1.55, g * 1.0, g * 1.9, g * 1.05, shoulder - hip - g * 0.1), {
      color: cloth, shade: FACET, matrix: at(0, hip + g * 0.1, 0, 1, 0, -Math.PI / 2),
    });
    body.add(taperedBox(g * 1.6, g * 1.05, g * 1.5, g * 1.0, g * 0.55), { color: shade(cloth, 0.88), shade: FACET, matrix: at(0, hip - g * 0.3, 0, 1, 0, -Math.PI / 2) });
    body.add(taperedBox(g * 1.68, g * 0.22, g * 1.68, g * 0.22, g * 1.1), { color: shade(cloth, 0.62), shade: FACET, matrix: at(0, hip + (shoulder - hip) * 0.2, -g * 0.55) });
  }
  m.trunk.add(m.mesh(body));

  const headB = new MeshBuilder();
  const hw = g * 0.62, hh = g * 0.76;
  if (o.skull) {
    headB.add(taperedBox(hw * 1.5, hh * 1.2, hw * 1.7, hh * 1.1, hw * 1.5, -hh * 0.06), { color: main, shade: FACET, matrix: at(0, 0, -hw * 0.75) });
    for (const side of [1, -1]) {
      headB.add(taperedBox(hw * 0.5, hh * 0.42, hw * 0.4, hh * 0.34, hw * 0.3), { color: EYE, matrix: at(side * hw * 0.42, hh * 0.14, hw * 0.6) });
    }
    headB.add(taperedBox(hw * 0.3, hh * 0.26, hw * 0.24, hh * 0.2, hw * 0.24), { color: EYE, matrix: at(0, -hh * 0.2, hw * 0.62) });
    for (let i = -2; i <= 2; i++) {
      headB.add(taperedBox(hw * 0.17, hh * 0.2, hw * 0.15, hh * 0.18, hw * 0.1), { color: shade(main, 1.08), matrix: at(i * hw * 0.2, -hh * 0.6, hw * 0.6) });
    }
  } else {
    headB.add(taperedBox(hw * 1.5, hh * 1.25, hw * 1.7, hh * 1.15, hw * 1.45, -hh * 0.04), { color: skin, shade: FACET, matrix: at(0, 0, -hw * 0.72) });
    // A brow ridge and a jaw, which is what makes a face out of a block.
    headB.add(taperedBox(hw * 1.6, hh * 0.22, hw * 1.5, hh * 0.18, hw * 0.2), { color: shade(skin, 0.84), shade: FACET, matrix: at(0, hh * 0.42, hw * 0.65) });
    headB.add(taperedBox(hw * 1.3, hh * 0.44, hw * 1.05, hh * 0.36, hw * 0.24), { color: shade(skin, 0.92), shade: FACET, matrix: at(0, -hh * 0.5, hw * 0.6) });
    headB.add(taperedBox(hw * 0.26, hh * 0.24, hw * 0.2, hh * 0.18, hw * 0.34), { color: shade(skin, 0.88), shade: FACET, matrix: at(0, -hh * 0.06, hw * 0.68) });
    for (const side of [1, -1]) {
      headB.add(taperedBox(hw * 0.4, hh * 0.2, hw * 0.34, hh * 0.16, hw * 0.06), { color: 0xf0ead8, matrix: at(side * hw * 0.52, hh * 0.2, hw * 0.71) });
      headB.add(taperedBox(hw * 0.16, hh * 0.14, hw * 0.13, hh * 0.12, hw * 0.05), { color: EYE, matrix: at(side * hw * 0.5, hh * 0.2, hw * 0.75) });
      if (o.ears) {
        headB.add(taperedBox(hw * 0.3, hh * 0.28, 0.001, 0.001, hw * 1.05), {
          color: shade(skin, 1.06), shade: FACET, matrix: at(side * hw * 0.78, hh * 0.28, -hw * 0.1, 1, 0, -0.5, side * 1.25),
        });
      }
    }
    headB.add(taperedBox(hw * 0.7, hh * 0.1, hw * 0.6, hh * 0.08, hw * 0.06), { color: shade(skin, 0.55), matrix: at(0, -hh * 0.5, hw * 0.72) });
  }
  const head = joint(0, headY, 0, m.mesh(headB));
  m.trunk.add(head);
  rig.head = head;

  const armLength = o.height * 0.36, legLength = hip;
  for (const side of [1, -1]) {
    const armB = new MeshBuilder();
    armB.add(taperedBox(g * 0.5, g * 0.5, g * 0.4, g * 0.42, armLength * 0.55), {
      color: o.ribs ? main : cloth, shade: FACET, matrix: at(0, 0, 0, 1, 0, Math.PI / 2),
    });
    armB.add(taperedBox(g * 0.4, g * 0.42, g * 0.36, g * 0.4, armLength * 0.45), {
      color: o.ribs ? main : shade(skin, 0.96), shade: FACET, matrix: at(0, -armLength * 0.55, 0, 1, 0, Math.PI / 2),
    });
    armB.add(taperedBox(g * 0.44, g * 0.5, g * 0.4, g * 0.42, g * 0.42), {
      color: o.ribs ? BONE_DARK : skin, shade: FACET, matrix: at(0, -armLength - g * 0.1, 0, 1, 0, Math.PI / 2),
    });
    const arm = joint(side * g * 0.95, shoulder - g * 0.18, 0, m.mesh(armB));
    m.trunk.add(arm);
    rig.arms.push(arm);

    const legB = new MeshBuilder();
    legB.add(taperedBox(g * 0.66, g * 0.66, g * 0.52, g * 0.54, legLength * 0.52), {
      color: o.ribs ? main : shade(cloth, 0.88), shade: FACET, matrix: at(0, 0, 0, 1, 0, Math.PI / 2),
    });
    legB.add(taperedBox(g * 0.52, g * 0.54, g * 0.44, g * 0.46, legLength * 0.48), {
      color: o.ribs ? main : shade(cloth, 0.8), shade: FACET, matrix: at(0, -legLength * 0.52, 0, 1, 0, Math.PI / 2),
    });
    // A blunt boot, wider than the shin and reaching forward.
    legB.add(taperedBox(g * 0.58, g * 0.34, g * 0.5, g * 0.26, g * 1.0), {
      color: shade(o.ribs ? BONE_DARK : cloth, 0.55), shade: FACET, matrix: at(0, -legLength + g * 0.16, -g * 0.3),
    });
    const leg = joint(side * g * 0.45, hip, 0, m.mesh(legB));
    m.trunk.add(leg);
    rig.legs.push(leg);
  }
  return rig;
}

const BUILDERS: Record<MonsterShape, Builder> = {
  rodent: (m, main, second) => quadruped(m, main, second, {
    length: 1.0, width: 0.34, depth: 0.3, standing: 0.18, legWidth: 0.055, snout: 0.26,
    ears: "round", horns: "none", tail: "whip", carry: 0.02,
  }),
  cattle: (m, main, second) => quadruped(m, main, second, {
    length: 1.35, width: 0.52, depth: 0.56, standing: 0.58, legWidth: 0.11, snout: 0.24,
    ears: "round", horns: "short", tail: "whip", carry: 0.12,
  }),
  woolly: (m, main, second) => quadruped(m, main, second, {
    length: 1.15, width: 0.52, depth: 0.54, standing: 0.44, legWidth: 0.09, snout: 0.18,
    ears: "round", horns: "curled", tail: "brush", carry: 0.04,
  }),
  boar: (m, main, second) => quadruped(m, main, second, {
    length: 1.15, width: 0.4, depth: 0.46, standing: 0.4, legWidth: 0.085, snout: 0.3,
    ears: "pointed", horns: "tusks", tail: "brush", carry: 0,
  }),
  canine: (m, main, second) => quadruped(m, main, second, {
    length: 1.25, width: 0.34, depth: 0.38, standing: 0.5, legWidth: 0.075, snout: 0.32,
    ears: "pointed", horns: "none", tail: "brush", carry: 0.1,
  }),
  humanoid: (m, main, second) => biped(m, main, second, { height: 1.6, girth: 0.26, skull: false, ribs: false, ears: true }),
  skeletal: (m, main, second) => biped(m, main, second, { height: 1.6, girth: 0.24, skull: true, ribs: true, ears: false }),
  fowl: (m, main, second) => bird(m, main, second, { comb: true, head: main, feet: second }),
  waterfowl: (m, main, second) => bird(m, main, second, { comb: false, head: second, feet: 0xd8a032 }),
  crawler: (m, main, second) => eightLegs(m, main, second, false),
  stinger: (m, main, second) => eightLegs(m, main, second, true),
  lizard,
  hopper,
  flier,
};
