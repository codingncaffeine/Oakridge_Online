import * as THREE from "three";
import { MONSTER_BY_KEY, type MonsterShape } from "../../shared/monsters.ts";
import { at, hash, loft, MeshBuilder, taperedBox, web, type Ring } from "./meshkit.ts";
import type { ActionName } from "./poses.ts";

/**
 * Flat shading, on purpose. A creature is lofted through rings of six to eight sides, so it is round in
 * section and faceted on the surface, and its outline is free to swell over the shoulder and fall away
 * to the tail. Spheres make every animal the same blob; square blocks make every animal the same slab.
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
 *
 * Its underside is held clear of the ground. Items lie flat on their tile, so a box that reached all
 * the way down would sit between the camera and anything lying there, and a hen wandering over a
 * dropped axe would swallow the click meant for the axe.
 */
const PICK_MIN = 0.55;
const PICK_FLOOR = 0.14;
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
    const across = Math.max(PICK_MIN, this.rig.shadow * scale * 2);
    const top = Math.max(PICK_MIN, this.height), tall = Math.max(0.2, top - PICK_FLOOR);
    const picker = new THREE.Mesh(new THREE.BoxGeometry(across, tall, across), pickMaterial);
    this.geometries.push(picker.geometry);
    picker.position.y = PICK_FLOOR + tall / 2;
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
 * Where a part placed at `from` and turned by `yaw` then `pitch` ends up, so the next one in a limb can
 * start exactly there. A part runs along +z, so only yaw and pitch aim it — rolling it turns the part
 * about its own length and moves nothing, which is how a set of legs ends up floating in the air.
 */
function tip(from: Point, yaw: number, pitch: number, length: number): Point {
  return [
    from[0] + Math.cos(pitch) * Math.sin(yaw) * length,
    from[1] - Math.sin(pitch) * length,
    from[2] + Math.cos(pitch) * Math.cos(yaw) * length,
  ];
}

interface Link {
  yaw: number;
  pitch: number;
  length: number;
  /** Radius where it starts and where it ends. A limb is round in section, not square. */
  r1: number;
  r2: number;
  color: number;
  sides?: number;
}

/**
 * A limb built as a chain of lofted segments, each starting where the last one ended. Round in section
 * with few sides, so it is faceted without being a stack of little boxes.
 */
function chain(b: MeshBuilder, from: Point, links: Link[]): Point {
  let at0 = from;
  for (const l of links) {
    b.add(loft([[l.r1, l.r1, 0], [l.r2, l.r2, l.length]], l.sides ?? 5), {
      color: l.color, shade: FACET, matrix: at(at0[0], at0[1], at0[2], 1, l.yaw, l.pitch),
    });
    at0 = tip(at0, l.yaw, l.pitch, l.length);
  }
  return at0;
}

/** A hull placed along +z at a point, turned by yaw and pitch: the body, neck or head of a creature. */
function hull(b: MeshBuilder, rings: Ring[], o: {
  color: number; at: Point; sides?: number; yaw?: number; pitch?: number; offsets?: Array<[number, number]>;
}): void {
  b.add(loft(rings, o.sides ?? 7, o.offsets), {
    color: o.color, shade: FACET, matrix: at(o.at[0], o.at[1], o.at[2], 1, o.yaw ?? 0, o.pitch ?? 0),
  });
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
  const dark = shade(main, 0.82);
  const body = new MeshBuilder();
  const half = o.length / 2, W = o.width / 2, H = o.depth / 2, L = o.length;

  // One hull from tail to shoulder: narrow at the rump, swelling over the haunch, drawn in at the
  // waist, deepest at the chest. The rise and fall of that line is what says which animal it is.
  hull(body, [
    [W * 0.26, H * 0.3, 0],
    [W * 0.82, H * 0.84, L * 0.12],
    [W * 0.96, H * 0.94, L * 0.3],
    [W * 0.88, H * 0.86, L * 0.52],
    [W * 0.98, H * 1.0, L * 0.76],
    [W * 0.86, H * 0.92, L * 0.94],
    [W * 0.62, H * 0.7, L],
  ], {
    color: main, at: [0, back - H, -half], sides: 8,
    // The back rides a little higher over the shoulder than over the loin.
    offsets: [[0, H * 0.1], [0, H * 0.04], [0, 0], [0, -H * 0.04], [0, H * 0.02], [0, H * 0.06], [0, H * 0.08]],
  });
  m.trunk.add(m.mesh(body));

  // Neck and head, carried forward of the chest and angled down toward the muzzle.
  const headB = new MeshBuilder();
  const hw = o.width * 0.34, hh = o.depth * 0.32;
  // Skull swelling behind the eyes, then a muzzle drawn out and down to a blunt nose.
  hull(headB, [
    [hw * 0.55, hh * 0.6, 0],
    [hw * 1.0, hh * 1.0, hw * 0.6],
    [hw * 0.92, hh * 0.9, hw * 1.15],
    [hw * 0.58, hh * 0.56, hw * 1.15 + o.snout * 0.55],
    [hw * 0.44, hh * 0.4, hw * 1.15 + o.snout],
  ], {
    color: main, at: [0, 0, -hw * 0.7], sides: 7,
    offsets: [[0, 0], [0, 0], [0, -hh * 0.06], [0, -hh * 0.18], [0, -hh * 0.26]],
  });
  headB.add(loft([[hw * 0.3, hh * 0.2, 0], [hw * 0.22, hh * 0.15, hw * 0.14]], 6), {
    color: second, shade: FACET, matrix: at(0, -hh * 0.26, hw * 0.45 + o.snout),
  });
  for (const side of [1, -1]) {
    headB.add(loft([[hw * 0.16, hh * 0.16, 0], [hw * 0.1, hh * 0.1, hw * 0.1]], 5), {
      color: EYE, matrix: at(side * hw * 0.5, hh * 0.3, hw * 0.95),
    });
    if (o.ears === "round") {
      headB.add(loft([[hw * 0.1, hh * 0.32, 0], [hw * 0.08, hh * 0.26, hw * 0.4]], 5), {
        color: shade(main, 1.08), shade: FACET, matrix: at(side * hw * 0.78, hh * 0.62, -hw * 0.1, 1, side * 0.9, -0.5),
      });
    }
    if (o.ears === "pointed") {
      headB.add(loft([[hw * 0.2, hw * 0.16, 0], [0, 0, hh * 1.15]], 5), {
        color: shade(main, 1.05), shade: FACET, matrix: at(side * hw * 0.62, hh * 0.6, -hw * 0.2, 1, side * 0.35, -1.25),
      });
    }
    if (o.horns === "short") {
      headB.add(loft([[hw * 0.17, hw * 0.17, 0], [0, 0, hw * 1.15]], 6), {
        color: second, shade: FACET, matrix: at(side * hw * 0.6, hh * 0.5, hw * 0.55, 1, side * 1.15, -0.45),
      });
    }
    if (o.horns === "curled") {
      // Four blocks turning back and round, which reads as a curl without bending anything.
      for (let k = 0; k < 4; k++) {
        const a = 0.5 + k * 1.15, r = hw * (0.22 - k * 0.03);
        headB.add(loft([[r, r, 0], [r * 0.86, r * 0.86, hw * 0.36]], 6), {
          color: second, shade: FACET,
          matrix: at(side * hw * (0.66 + k * 0.03), hh * 0.5 - Math.sin(a) * hh * 0.55, hw * 0.5 - Math.cos(a) * hw * 0.5, 1, side * 1.25, a - 1.3),
        });
      }
    }
    if (o.horns === "tusks") {
      headB.add(loft([[hw * 0.12, hw * 0.12, 0], [0, 0, hh * 0.95]], 5), {
        color: second, shade: FACET, matrix: at(side * hw * 0.34, -hh * 0.36, hw * 0.9 + o.snout * 0.6, 1, side * 0.3, 1.15),
      });
    }
  }
  const head = joint(0, back - o.depth * 0.1 + o.carry, half - o.length * 0.04, m.mesh(headB));
  head.rotation.x = -0.12;
  m.trunk.add(head);
  rig.head = head;
  // The neck, running from the chest up to wherever the head is carried.
  const rise = o.carry + o.depth * 0.34, reach = o.length * 0.2;
  const neck = new MeshBuilder();
  neck.add(loft([[o.width * 0.3, o.depth * 0.3, 0], [hw * 0.72, hh * 0.78, Math.hypot(rise, reach)]], 7), {
    color: main, shade: FACET, matrix: at(0, back - o.depth * 0.5, half - o.length * 0.26, 1, 0, -Math.atan2(rise, reach)),
  });
  m.trunk.add(m.mesh(neck));

  // Legs: a thigh angled under the body, a shin down from where it ends, then a hoof or paw.
  const lw = o.legWidth;
  for (const [front, side] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    const legB = new MeshBuilder();
    const upper = o.standing * 0.52, lower = o.standing * 0.48;
    const knee = chain(legB, [0, 0, 0], [
      { yaw: 0, pitch: Math.PI / 2 - front * 0.26, length: upper, r1: lw * 1.25, r2: lw * 0.92, color: main, sides: 6 },
    ]);
    const ankle = chain(legB, knee, [
      { yaw: 0, pitch: Math.PI / 2, length: lower, r1: lw * 0.92, r2: lw * 0.78, color: dark, sides: 6 },
    ]);
    // The hoof or paw sits at the ankle and reaches forward.
    legB.add(loft([[lw * 0.82, lw * 0.7, 0], [lw * 0.74, lw * 0.5, lw * 1.5]], 6), {
      color: second, shade: FACET, matrix: at(ankle[0], ankle[1] + lw * 0.32, ankle[2] - lw * 0.45),
    });
    const leg = joint(side * o.width * 0.42, back - o.depth * 0.7, front * o.length * 0.3, m.mesh(legB));
    m.trunk.add(leg);
    rig.legs.push(leg);
  }

  if (o.tail !== "none") {
    const tailB = new MeshBuilder();
    const long = o.tail === "whip" ? o.length * 0.55 : o.length * 0.2;
    const thick = o.tail === "whip" ? lw * 0.55 : lw * 1.3;
    const colour = o.tail === "whip" ? second : main;
    // Two links, the second dropping further, so it trails behind rather than standing up like a stick.
    chain(tailB, [0, 0, 0], [
      { yaw: 0, pitch: -0.25, length: long * 0.5, r1: thick, r2: thick * 0.6, color: colour, sides: 5 },
      { yaw: 0, pitch: 0.45, length: long * 0.5, r1: thick * 0.6, r2: 0, color: colour, sides: 5 },
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
  // One hull from the pointed tail forward to the breast, deepest just behind the neck.
  hull(body, [
    [0.02, 0.02, 0],
    [0.14, 0.12, 0.12],
    [0.2, 0.2, 0.3],
    [0.21, 0.22, 0.48],
    [0.16, 0.17, 0.62],
  ], { color: main, at: [0, 0.44, -0.34], sides: 8, offsets: [[0, 0.06], [0, 0.03], [0, 0], [0, -0.01], [0, 0.01]] });
  // Tail feathers: three narrow blades fanned up and back.
  for (let i = -1; i <= 1; i++) {
    body.add(loft([[0.05, 0.02, 0], [0.03, 0.012, 0.26]], 4), {
      color: shade(main, 0.84), shade: FACET, matrix: at(i * 0.05, 0.48, -0.32, 1, i * 0.3, 0.9),
    });
  }
  // Folded wings, lying along each flank.
  for (const side of [1, -1]) {
    body.add(loft([[0.035, 0.1, 0], [0.03, 0.12, 0.18], [0.02, 0.05, 0.34]], 5), {
      color: shade(main, 0.92), shade: FACET, matrix: at(side * 0.18, 0.47, -0.26),
    });
  }
  m.trunk.add(m.mesh(body));

  const headB = new MeshBuilder();
  // Neck up from the breast, then a small round head and a beak tapering to a point.
  headB.add(loft([[0.07, 0.07, 0], [0.075, 0.08, 0.17]], 6), { color: o.head, shade: FACET, matrix: at(0, 0.02, -0.04, 1, 0, -1.25) });
  headB.add(loft([[0.06, 0.07, 0], [0.09, 0.095, 0.09], [0.07, 0.075, 0.17]], 7), { color: o.head, shade: FACET, matrix: at(0, 0.14, -0.08) });
  headB.add(loft([[0.045, 0.04, 0], [0, 0, 0.14]], 5), { color: o.comb ? second : o.feet, shade: FACET, matrix: at(0, 0.2, 0.07) });
  if (o.comb) {
    for (let i = 0; i < 3; i++) {
      headB.add(loft([[0.02, 0.016, 0], [0, 0, 0.075]], 4), { color: second, matrix: at(0, 0.27, 0.07 - i * 0.045, 1, 0, -1.2) });
    }
  }
  for (const side of [1, -1]) {
    headB.add(loft([[0.022, 0.022, 0], [0.014, 0.014, 0.025]], 5), { color: EYE, matrix: at(side * 0.062, 0.235, 0.06) });
  }
  const head = joint(0, 0.48, 0.14, m.mesh(headB));
  m.trunk.add(head);
  rig.head = head;

  for (const side of [1, -1]) {
    const legB = new MeshBuilder();
    legB.add(loft([[0.026, 0.026, 0], [0.02, 0.02, 0.22]], 5), { color: o.feet, shade: FACET, matrix: at(0, 0, 0, 1, 0, Math.PI / 2) });
    for (let t = -1; t <= 1; t++) {
      legB.add(loft([[0.017, 0.012, 0], [0.008, 0.007, 0.095]], 4), { color: o.feet, matrix: at(t * 0.022, -0.226, 0.005, 1, t * 0.5) });
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
  hull(body, [[0.09, 0.06, 0], [0.24, 0.16, 0.14], [0.27, 0.18, 0.3], [0.16, 0.11, 0.42]], { color: main, at: [0, 0.21, -0.5], sides: 8 });
  hull(body, [[0.12, 0.09, 0], [0.18, 0.13, 0.12], [0.13, 0.1, 0.26]], { color: dark, at: [0, 0.2, -0.04], sides: 7 });
  for (let i = 0; i < 3; i++) {
    body.add(loft([[0.05, 0.012, 0], [0.035, 0.01, 0.09]], 4), { color: second, matrix: at(0, 0.33 - i * 0.012, -0.12 - i * 0.11) });
  }
  if (sting) {
    for (const side of [1, -1]) {
      body.add(loft([[0.032, 0.028, 0], [0.026, 0.024, 0.2]], 5), { color: dark, shade: FACET, matrix: at(side * 0.12, 0.2, 0.18, 1, side * 0.42) });
      body.add(loft([[0.03, 0.026, 0], [0.055, 0.042, 0.08], [0.03, 0.028, 0.17]], 6), { color: second, shade: FACET, matrix: at(side * 0.2, 0.2, 0.36, 1, side * 0.5) });
      body.add(loft([[0.024, 0.022, 0], [0, 0, 0.1]], 4), { color: second, matrix: at(side * 0.235, 0.225, 0.47, 1, side * 0.95) });
    }
    // The tail: back and up, then hooking forward over its own back, ending in a sting.
    const seg = (i: number) => ({ r1: 0.062 - i * 0.007, r2: 0.056 - i * 0.007, color: main, sides: 6 });
    const sting = chain(body, [0, 0.3, -0.5], [
      { yaw: Math.PI, pitch: -1.05, length: 0.13, ...seg(0) },
      { yaw: Math.PI, pitch: -1.5, length: 0.13, ...seg(1) },
      { yaw: 0, pitch: -1.45, length: 0.13, ...seg(2) },
      { yaw: 0, pitch: -0.75, length: 0.13, ...seg(3) },
      { yaw: 0, pitch: 0.15, length: 0.11, ...seg(4) },
    ]);
    body.add(loft([[0.04, 0.04, 0], [0, 0, 0.13]], 5), { color: second, matrix: at(sting[0], sting[1], sting[2], 1, 0, 1.35) });
  } else {
    for (const side of [1, -1]) {
      body.add(loft([[0.026, 0.03, 0], [0, 0, 0.12]], 4), { color: second, matrix: at(side * 0.05, 0.15, 0.16, 1, 0, 0.9) });
    }
  }
  m.trunk.add(m.mesh(body));

  const headB = new MeshBuilder();
  for (const side of [1, -1]) {
    headB.add(loft([[0.032, 0.032, 0], [0.02, 0.02, 0.035]], 5), { color: EYE, matrix: at(side * 0.06, 0.05, 0.08) });
    headB.add(loft([[0.02, 0.02, 0], [0.012, 0.012, 0.028]], 4), { color: EYE, matrix: at(side * 0.1, 0.01, 0.05) });
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
      { yaw, pitch: -0.75, length: 0.3, r1: 0.032, r2: 0.024, color: dark, sides: 5 },
    ]);
    chain(legB, knee, [
      { yaw, pitch: 1.15, length: 0.36, r1: 0.024, r2: 0.01, color: dark, sides: 5 },
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
  hull(body, [[0.05, 0.04, 0], [0.1, 0.075, 0.2], [0.115, 0.085, 0.42], [0.095, 0.07, 0.6], [0.07, 0.055, 0.68]], { color: main, at: [0, 0.15, -0.34], sides: 7 });
  for (let i = 0; i < 5; i++) {
    body.add(loft([[0.032, 0.012, 0], [0.022, 0.009, 0.06]], 4), { color: second, matrix: at((i % 2 ? 1 : -1) * 0.045, 0.225, 0.16 - i * 0.1) });
  }
  m.trunk.add(m.mesh(body));

  const headB = new MeshBuilder();
  hull(headB, [[0.055, 0.04, 0], [0.075, 0.055, 0.07], [0.06, 0.042, 0.17], [0.035, 0.026, 0.25]], { color: main, at: [0, 0, 0], sides: 6, offsets: [[0, 0], [0, 0], [0, -0.008], [0, -0.016]] });
  for (const side of [1, -1]) {
    headB.add(loft([[0.032, 0.032, 0], [0.024, 0.024, 0.035]], 5), { color: shade(main, 1.14), shade: FACET, matrix: at(side * 0.055, 0.045, 0.05) });
    headB.add(loft([[0.018, 0.018, 0], [0.012, 0.012, 0.02]], 4), { color: EYE, matrix: at(side * 0.062, 0.05, 0.075) });
  }
  const head = joint(0, 0.17, 0.32, m.mesh(headB));
  m.trunk.add(head);
  rig.head = head;

  const tailB = new MeshBuilder();
  tailB.add(loft([[0.055, 0.045, 0], [0.03, 0.026, 0.24], [0, 0, 0.48]], 5), { color: shade(main, 0.9), shade: FACET, matrix: at(0, 0, 0, 1, 0, 0.12) });
  const tail = joint(0, 0.16, -0.44, m.mesh(tailB));
  tail.rotation.y = Math.PI;
  m.trunk.add(tail);
  rig.tail = tail;

  // Legs splayed out to the sides, elbow out and up, then down to a flat foot: a lizard's crawl.
  for (let i = 0; i < 4; i++) {
    const side = i % 2 === 0 ? 1 : -1, front = i < 2 ? 1 : -1;
    const legB = new MeshBuilder();
    const elbow = chain(legB, [0, 0, 0], [
      { yaw: side * (1.2 + front * 0.3), pitch: -0.15, length: 0.13, r1: 0.03, r2: 0.024, color: shade(main, 0.84) },
    ]);
    const foot = chain(legB, elbow, [
      { yaw: side * 1.3, pitch: 1.2, length: 0.12, r1: 0.024, r2: 0.019, color: shade(main, 0.84) },
    ]);
    legB.add(loft([[0.032, 0.01, 0], [0.024, 0.008, 0.075]], 4), { color: second, matrix: at(foot[0], foot[1] + 0.006, foot[2] - 0.025, 1, side * 0.4) });
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
  hull(body, [[0.08, 0.05, 0], [0.16, 0.12, 0.16], [0.18, 0.13, 0.34], [0.13, 0.1, 0.5]], { color: main, at: [0, 0.19, -0.28], sides: 7, offsets: [[0, 0.02], [0, 0], [0, -0.01], [0, 0]] });
  hull(body, [[0.1, 0.035, 0], [0.13, 0.04, 0.2], [0.09, 0.03, 0.42]], { color: second, at: [0, 0.1, -0.24], sides: 6 });
  for (let i = 0; i < 4; i++) {
    body.add(loft([[0.028, 0.014, 0], [0.018, 0.01, 0.07]], 4), { color: second, matrix: at((i % 2 ? 1 : -1) * 0.11, 0.3 - (i >> 1) * 0.03, -0.04 - (i >> 1) * 0.14) });
  }
  m.trunk.add(m.mesh(body));

  const headB = new MeshBuilder();
  for (const side of [1, -1]) {
    headB.add(loft([[0.05, 0.05, 0], [0.062, 0.062, 0.05], [0.04, 0.04, 0.1]], 6), { color: shade(main, 1.1), shade: FACET, matrix: at(side * 0.09, 0.05, -0.03) });
    headB.add(loft([[0.032, 0.032, 0], [0.02, 0.02, 0.03]], 5), { color: EYE, matrix: at(side * 0.09, 0.07, 0.055) });
  }
  headB.add(loft([[0.11, 0.014, 0], [0.085, 0.011, 0.05]], 4), { color: shade(main, 0.7), matrix: at(0, -0.04, 0.06) });
  const head = joint(0, 0.22, 0.26, m.mesh(headB));
  m.trunk.add(head);
  rig.head = head;

  for (const side of [1, -1]) {
    // Back leg folded: thigh up and back, shin down and forward, then a long splayed foot on the ground.
    const backB = new MeshBuilder();
    // Thigh back and up to a high knee, then the shin down and forward to the heel.
    const knee = chain(backB, [0, 0, 0], [
      { yaw: Math.PI + side * 0.3, pitch: -0.55, length: 0.2, r1: 0.075, r2: 0.05, color: main, sides: 6 },
    ]);
    const heel = chain(backB, knee, [
      { yaw: side * 0.3, pitch: 1.15, length: 0.26, r1: 0.05, r2: 0.035, color: shade(main, 0.9), sides: 6 },
    ]);
    backB.add(loft([[0.04, 0.014, 0], [0.07, 0.012, 0.16]], 4), { color: second, shade: FACET, matrix: at(heel[0], heel[1] + 0.01, heel[2], 1, side * 0.3) });
    const back = joint(side * 0.17, 0.19, -0.1, m.mesh(backB));
    m.trunk.add(back);
    rig.legs.push(back);

    const frontB = new MeshBuilder();
    const paw = chain(frontB, [0, 0, 0], [
      { yaw: 0, pitch: Math.PI / 2 - 0.2, length: 0.17, r1: 0.04, r2: 0.03, color: shade(main, 0.9), sides: 5 },
    ]);
    frontB.add(loft([[0.03, 0.011, 0], [0.048, 0.01, 0.1]], 4), { color: second, matrix: at(paw[0], paw[1] + 0.008, paw[2] - 0.02, 1, side * 0.35) });
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
  hull(body, [[0.04, 0.04, 0], [0.075, 0.08, 0.1], [0.06, 0.065, 0.22]], { color: main, at: [0, 0.26, -0.04], sides: 6, pitch: -1.3 });
  hull(body, [[0.055, 0.055, 0], [0.072, 0.07, 0.07], [0.05, 0.05, 0.14]], { color: main, at: [0, 0.46, -0.06], sides: 6 });
  for (const side of [1, -1]) {
    // Tall pointed ears, and small eyes.
    body.add(loft([[0.035, 0.03, 0], [0, 0, 0.19]], 4), { color: second, shade: FACET, matrix: at(side * 0.055, 0.55, -0.04, 1, side * 0.3, -1.2) });
    body.add(loft([[0.02, 0.02, 0], [0.012, 0.012, 0.022]], 4), { color: 0xc23a2a, matrix: at(side * 0.035, 0.5, 0.055) });
    body.add(loft([[0.016, 0.016, 0], [0.008, 0.008, 0.12]], 4), { color: dark, matrix: at(side * 0.045, 0.24, -0.02, 1, 0, Math.PI / 2 - 0.3) });
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
      wingB.add(loft([[0.014, 0.014, 0], [0.006, 0.006, len]], 4), {
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
    body.add(loft([[g * 0.16, g * 0.15, 0], [g * 0.14, g * 0.13, shoulder - hip]], 5), {
      color: shade(main, 0.86), shade: FACET, matrix: at(0, hip, -g * 0.16, 1, 0, -Math.PI / 2),
    });
    for (let i = 0; i < 5; i++) {
      const y = hip + (shoulder - hip) * (0.18 + i * 0.17), w = g * (0.85 - i * 0.05);
      body.add(loft([[w * 0.8, g * 0.07, 0], [w, g * 0.075, g * 0.45], [w * 0.8, g * 0.07, g * 0.9]], 6), { color: main, shade: FACET, matrix: at(0, y, -g * 0.45) });
    }
    body.add(loft([[g * 0.9, g * 0.16, 0], [g * 0.95, g * 0.17, g * 0.45], [g * 0.75, g * 0.14, g * 0.9]], 6), { color: shade(main, 0.94), shade: FACET, matrix: at(0, shoulder - g * 0.12, -g * 0.45) });
    body.add(loft([[g * 0.7, g * 0.17, 0], [g * 0.78, g * 0.18, g * 0.4], [g * 0.65, g * 0.15, g * 0.8]], 6), { color: BONE_DARK, shade: FACET, matrix: at(0, hip, -g * 0.4) });
  } else {
    // Shoulders down to the waist, then the hips: two blocks, the way the reference cuts a torso.
    // Hips, waist, chest, shoulders: a hull that draws in and out the way a body does.
    body.add(loft([
      [g * 0.82, g * 0.5, 0], [g * 0.74, g * 0.46, (shoulder - hip) * 0.3],
      [g * 0.92, g * 0.54, (shoulder - hip) * 0.72], [g * 0.98, g * 0.56, (shoulder - hip) * 0.95],
      [g * 0.8, g * 0.46, shoulder - hip + g * 0.1],
    ], 8), { color: cloth, shade: FACET, matrix: at(0, hip - g * 0.36, 0, 1, 0, -Math.PI / 2) });
    body.add(loft([[g * 0.86, g * 0.5, 0], [g * 0.86, g * 0.5, g * 0.16]], 8), { color: shade(cloth, 0.62), shade: FACET, matrix: at(0, hip + (shoulder - hip) * 0.22, 0, 1, 0, -Math.PI / 2) });
  }
  m.trunk.add(m.mesh(body));

  const headB = new MeshBuilder();
  const hw = g * 0.62, hh = g * 0.76;
  if (o.skull) {
    headB.add(loft([[hw * 0.68, hh * 0.5, 0], [hw * 0.86, hh * 0.62, hw * 0.55], [hw * 0.8, hh * 0.56, hw * 1.2], [hw * 0.6, hh * 0.44, hw * 1.5]], 7), { color: main, shade: FACET, matrix: at(0, 0, -hw * 0.75) });
    for (const side of [1, -1]) {
      headB.add(loft([[hw * 0.24, hh * 0.2, 0], [hw * 0.18, hh * 0.15, hw * 0.28]], 5), { color: EYE, matrix: at(side * hw * 0.36, hh * 0.14, hw * 0.5) });
    }
    headB.add(loft([[hw * 0.14, hh * 0.12, 0], [hw * 0.1, hh * 0.09, hw * 0.22]], 4), { color: EYE, matrix: at(0, -hh * 0.2, hw * 0.55) });
    for (let i = -2; i <= 2; i++) {
      headB.add(loft([[hw * 0.08, hh * 0.09, 0], [hw * 0.07, hh * 0.08, hw * 0.1]], 4), { color: shade(main, 1.08), matrix: at(i * hw * 0.18, -hh * 0.52, hw * 0.55) });
    }
  } else {
    headB.add(
      loft(
        [[hw * 0.7, hh * 0.54, 0], [hw * 0.88, hh * 0.66, hw * 0.5], [hw * 0.84, hh * 0.62, hw * 1.1], [hw * 0.66, hh * 0.5, hw * 1.45]], 7,
        [[0, 0], [0, 0], [0, -hh * 0.04], [0, -hh * 0.1]],
      ),
      { color: skin, shade: FACET, matrix: at(0, 0, -hw * 0.72) },
    );
    // A brow ridge and a jaw, which is what makes a face out of a block.
    headB.add(loft([[hw * 0.76, hh * 0.1, 0], [hw * 0.7, hh * 0.08, hw * 0.16]], 5), { color: shade(skin, 0.84), shade: FACET, matrix: at(0, hh * 0.38, hw * 0.6) });
    headB.add(loft([[hw * 0.6, hh * 0.2, 0], [hw * 0.48, hh * 0.16, hw * 0.2]], 5), { color: shade(skin, 0.92), shade: FACET, matrix: at(0, -hh * 0.44, hw * 0.56) });
    headB.add(loft([[hw * 0.12, hh * 0.1, 0], [hw * 0.08, hh * 0.16, hw * 0.28]], 4), { color: shade(skin, 0.88), shade: FACET, matrix: at(0, -hh * 0.04, hw * 0.62) });
    for (const side of [1, -1]) {
      headB.add(loft([[hw * 0.19, hh * 0.1, 0], [hw * 0.16, hh * 0.08, hw * 0.06]], 4), { color: 0xf0ead8, matrix: at(side * hw * 0.44, hh * 0.18, hw * 0.66) });
      headB.add(loft([[hw * 0.08, hh * 0.07, 0], [hw * 0.06, hh * 0.06, hw * 0.05]], 4), { color: EYE, matrix: at(side * hw * 0.43, hh * 0.18, hw * 0.7) });
      if (o.ears) {
        headB.add(loft([[hw * 0.14, hh * 0.15, 0], [0, 0, hw * 1.05]], 4), {
          color: shade(skin, 1.06), shade: FACET, matrix: at(side * hw * 0.68, hh * 0.24, -hw * 0.12, 1, side * 1.2, -0.45),
        });
      }
    }
    headB.add(loft([[hw * 0.3, hh * 0.05, 0], [hw * 0.26, hh * 0.04, hw * 0.06]], 4), { color: shade(skin, 0.55), matrix: at(0, -hh * 0.46, hw * 0.66) });
  }
  const head = joint(0, headY, 0, m.mesh(headB));
  m.trunk.add(head);
  rig.head = head;

  const armLength = o.height * 0.36, legLength = hip;
  for (const side of [1, -1]) {
    const armB = new MeshBuilder();
    const wrist = chain(armB, [0, 0, 0], [
      { yaw: 0, pitch: Math.PI / 2, length: armLength * 0.55, r1: g * 0.25, r2: g * 0.2, color: o.ribs ? main : cloth, sides: 6 },
      { yaw: 0, pitch: Math.PI / 2, length: armLength * 0.45, r1: g * 0.2, r2: g * 0.18, color: o.ribs ? main : shade(skin, 0.96), sides: 6 },
    ]);
    armB.add(loft([[g * 0.22, g * 0.25, 0], [g * 0.19, g * 0.21, g * 0.4]], 6), {
      color: o.ribs ? BONE_DARK : skin, shade: FACET, matrix: at(wrist[0], wrist[1], wrist[2], 1, 0, Math.PI / 2),
    });
    const arm = joint(side * g * 0.95, shoulder - g * 0.18, 0, m.mesh(armB));
    m.trunk.add(arm);
    rig.arms.push(arm);

    const legB = new MeshBuilder();
    const ankle = chain(legB, [0, 0, 0], [
      { yaw: 0, pitch: Math.PI / 2, length: legLength * 0.52, r1: g * 0.33, r2: g * 0.26, color: o.ribs ? main : shade(cloth, 0.88), sides: 6 },
      { yaw: 0, pitch: Math.PI / 2, length: legLength * 0.48, r1: g * 0.26, r2: g * 0.22, color: o.ribs ? main : shade(cloth, 0.8), sides: 6 },
    ]);
    // A blunt boot, wider than the shin and reaching forward.
    legB.add(loft([[g * 0.29, g * 0.17, 0], [g * 0.26, g * 0.13, g * 0.95]], 6), {
      color: shade(o.ribs ? BONE_DARK : cloth, 0.55), shade: FACET, matrix: at(ankle[0], ankle[1] + g * 0.15, ankle[2] - g * 0.3),
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
