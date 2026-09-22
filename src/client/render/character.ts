import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { BODY_B, LOOK } from "../../shared/look.ts";
import {
  BELT, CLOTH, EYE_PUPIL, EYE_WHITE, FOOTWEAR, HAIR, MOUTH, SKIN, UNDERSHIRT,
} from "../palette.ts";
import { at, ellipsoid, limb, MeshBuilder, shell } from "./meshkit.ts";

const material = new THREE.MeshLambertMaterial({ vertexColors: true });
const shadowGeometry = new THREE.CircleGeometry(0.34, 14).rotateX(-Math.PI / 2);
const shadowMaterial = new THREE.MeshBasicMaterial({
  color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
});

/** Skeleton measurements per body type (tile units; the character is about 1.6 tall). */
const FRAMES = [
  { shoulderX: 0.235, chest: 0.2, waist: 0.155, hip: 0.16, hipX: 0.088, scale: 1 },
  { shoulderX: 0.195, chest: 0.17, waist: 0.13, hip: 0.172, hipX: 0.09, scale: 0.96 },
];
const HIP_Y = 0.8;
const THIGH = 0.37;
const SHIN = 0.33;
const SHOULDER_Y = 1.22;
const UPPER_ARM = 0.28;
const FOREARM = 0.25;
const HEAD_Y = 1.47;

const shade = (hex: number, k: number) => new THREE.Color(hex).multiplyScalar(k).getHex();

/** The head: an egg with a narrower jaw, a chin pushed forward and a slightly flat face. */
let headGeometry: THREE.BufferGeometry | null = null;
function head(): THREE.BufferGeometry {
  if (headGeometry) return headGeometry;
  const g = mergeVertices(new THREE.SphereGeometry(1, 12, 10).deleteAttribute("uv").deleteAttribute("normal"));
  const p = g.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), z = p.getZ(i);
    const y = p.getY(i);
    if (y < 0) {
      const k = 1 - 0.24 * -y;
      x *= k;
      z = z * k + (z > 0 ? 0.1 * -y : 0);
    }
    if (z > 0.35) z = 0.35 + (z - 0.35) * 0.8;
    p.setXYZ(i, x * 0.112, y * 0.136, z * 0.124);
  }
  g.computeVertexNormals();
  return (headGeometry = g);
}

/**
 * A person built from rounded, smooth-shaded parts, with clothes as separate layers (a vest over a
 * shirt, trousers into boots) so they read at a distance. Faces +z with its feet at the origin, and
 * is animated by rotating the shoulder, elbow, hip and knee joints.
 */
export class CharacterModel {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly hips: THREE.Group[] = [];
  private readonly knees: THREE.Group[] = [];
  private readonly shoulders: THREE.Group[] = [];
  private readonly elbows: THREE.Group[] = [];
  private phase = 0;
  private motion = 0;
  private runBlend = 0;
  /** A long skirt shortens the stride so the legs stay inside it. */
  private stride = 1;
  private readonly geometries: THREE.BufferGeometry[] = [];

  /** Frees this model's own geometry (the shared materials and shadow stay). */
  dispose(): void {
    for (const g of this.geometries) g.dispose();
  }

  private mesh(builder: MeshBuilder): THREE.Mesh {
    const geometry = builder.build();
    this.geometries.push(geometry);
    return new THREE.Mesh(geometry, material);
  }

  constructor(look: number[]) {
    const pick = (list: number[], slot: number) => list[(look[slot] ?? 0) % list.length]!;
    const type = look[LOOK.body] === BODY_B ? 1 : 0;
    const f = FRAMES[type]!;
    const skin = pick(SKIN, LOOK.skin), hair = pick(HAIR, LOOK.hairColor), top = pick(CLOTH, LOOK.topColor);
    const legs = pick(CLOTH, LOOK.legsColor), feet = pick(FOOTWEAR, LOOK.feetColor);
    const torsoStyle = look[LOOK.torso] ?? 0, armStyle = look[LOOK.arms] ?? 0, handStyle = look[LOOK.hands] ?? 0;
    const legStyle = look[LOOK.legs] ?? 0, feetStyle = look[LOOK.feet] ?? 0;
    const vest = torsoStyle === 2, tunic = torsoStyle === 3, skirt = legStyle === 2;
    if (skirt) this.stride = 0.55;
    /** What the arms' sleeves are made of: the shirt under a vest, otherwise the top itself. */
    const sleeve = vest ? UNDERSHIRT : top;

    const b = new MeshBuilder();
    this.buildTorso(b, f, type, torsoStyle, top, legs, legStyle);
    this.buildHead(b, skin, hair, look[LOOK.hair] ?? 0, type === 0 ? look[LOOK.beard] ?? 0 : 0);
    if (tunic) {
      b.add(shell([[0.2, 0.62], [0.17, 0.74], [f.waist + 0.012, 0.87]], 12, 0.78), { color: top });
    }
    if (skirt) {
      b.add(shell([[0.3, 0.24], [0.27, 0.4], [0.21, 0.66], [f.waist + 0.016, 0.87]], 12, 0.8), { color: legs });
    }
    this.body.add(this.mesh(b));

    for (const side of [1, -1]) {
      // Arms: sleeves, bare skin or cuffs, and the hand.
      const upper = new MeshBuilder();
      upper.add(ellipsoid(0.072, 0.068, 0.07), { color: sleeve });
      if (armStyle === 0) {
        upper.add(limb(0.058, 0.05, UPPER_ARM), { color: skin });
        upper.add(new THREE.CylinderGeometry(0.068, 0.072, 0.18, 10, 1, true), { color: sleeve, matrix: at(0, -0.08, 0) });
      } else {
        upper.add(limb(0.062, 0.054, UPPER_ARM), { color: sleeve });
      }
      const fore = new MeshBuilder();
      fore.add(limb(0.052, 0.043, FOREARM), { color: armStyle === 0 ? skin : sleeve });
      if (armStyle === 2) fore.add(new THREE.CylinderGeometry(0.064, 0.06, 0.08, 10), { color: shade(sleeve, 0.75), matrix: at(0, -0.2, 0) });
      const handColor = handStyle === 1 ? feet : skin;
      fore.add(ellipsoid(0.046, 0.062, 0.052), { color: handColor, matrix: at(0, -FOREARM - 0.045, 0.005) });
      if (handStyle === 1) fore.add(new THREE.CylinderGeometry(0.056, 0.05, 0.06, 10), { color: shade(feet, 0.85), matrix: at(0, -FOREARM + 0.01, 0) });
      if (handStyle === 2) fore.add(new THREE.CylinderGeometry(0.052, 0.05, 0.05, 10), { color: feet, matrix: at(0, -FOREARM + 0.02, 0) });
      const elbow = joint(0, -UPPER_ARM, 0, this.mesh(fore));
      const shoulder = joint(side * f.shoulderX, SHOULDER_Y, 0, this.mesh(upper), elbow);
      this.shoulders.push(shoulder);
      this.elbows.push(elbow);

      // Legs: trousers or shorts (or bare under a skirt), then shoes or boots with a visible top.
      const thigh = new MeshBuilder();
      thigh.add(limb(0.086, 0.07, THIGH, 10), { color: skirt ? skin : legs });
      const shin = new MeshBuilder();
      const trousers = legStyle === 0;
      shin.add(limb(0.07, 0.058, SHIN, 10), { color: trousers ? legs : skin });
      if (trousers) shin.add(new THREE.CylinderGeometry(0.07, 0.078, 0.1, 10), { color: shade(legs, 0.9), matrix: at(0, -SHIN + 0.13, 0) });
      shin.add(ellipsoid(0.064, 0.045, 0.125), { color: feet, matrix: at(0, -SHIN - 0.045, 0.04) });
      if (feetStyle === 1) {
        shin.add(new THREE.CylinderGeometry(0.074, 0.07, 0.17, 10), { color: feet, matrix: at(0, -SHIN + 0.03, 0) });
        shin.add(new THREE.CylinderGeometry(0.08, 0.08, 0.035, 10), { color: shade(feet, 0.8), matrix: at(0, -SHIN + 0.12, 0) });
      }
      const knee = joint(0, -THIGH, 0, this.mesh(shin));
      const hip = joint(side * f.hipX, HIP_Y, 0, this.mesh(thigh), knee);
      this.hips.push(hip);
      this.knees.push(knee);
      this.body.add(shoulder, hip);
    }

    const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
    shadow.position.y = 0.02;
    shadow.renderOrder = -1;
    this.body.scale.setScalar(f.scale);
    this.root.add(this.body, shadow);
  }

  private buildTorso(b: MeshBuilder, f: (typeof FRAMES)[number], type: number, style: number, top: number, legs: number, legStyle: number): void {
    const torso: Array<[number, number]> = [
      [0, 0.84], [f.waist, 0.84], [f.waist + 0.004, 0.92], [f.waist + 0.018, 1.02], [f.chest, 1.12],
      [f.chest + 0.008, 1.19], [f.chest - 0.01, 1.25], [0.13, 1.29], [0.06, 1.31], [0, 1.31],
    ];
    const vest = style === 2;
    // Two-toned: a darker yoke over the chest and shoulders.
    if (style === 4) {
      b.add(shell([...torso.slice(0, 5), [0, 1.12]], 12, 0.62), { color: top });
      b.add(shell([[0, 1.12], ...torso.slice(4)], 12, 0.62), { color: shade(top, 0.7) });
    } else {
      b.add(shell(torso, 12, 0.62), { color: vest ? UNDERSHIRT : top });
    }
    if (vest) {
      // Open at the front, so a strip of shirt shows down the middle.
      const gap = 0.7;
      const panel = new THREE.LatheGeometry(
        torso.slice(1, 9).map(([r, y]) => new THREE.Vector2(r * 1.06, y + (y > 1.28 ? 0.006 : 0))), 12, gap / 2, Math.PI * 2 - gap,
      ).scale(1, 1, 0.64);
      b.add(panel, { color: top });
    }
    if (style === 1) {
      for (const y of [1.18, 1.08, 0.98]) b.add(ellipsoid(0.012, 0.012, 0.008), { color: shade(top, 0.45), matrix: at(0, y, f.chest * 0.62 + 0.004) });
      for (const s of [1, -1]) b.add(new THREE.BoxGeometry(0.075, 0.02, 0.05), { color: shade(top, 0.85), matrix: at(s * 0.05, 1.29, 0.07, 1, 0, 0, s * 0.35) });
    }
    if (type === 1) {
      for (const s of [1, -1]) b.add(ellipsoid(0.058, 0.055, 0.05), { color: style === 4 ? shade(top, 0.7) : top, matrix: at(s * 0.068, 1.13, 0.075) });
    }
    // Waistband or belt, then the hips in trouser colour (the tunic and skirt cover them anyway).
    const belt = style === 3 ? BELT : shade(legStyle === 2 ? top : legs, 0.72);
    b.add(new THREE.TorusGeometry(f.waist + 0.004, 0.018, 6, 16).rotateX(Math.PI / 2).scale(1, 1, 0.66), { color: belt, matrix: at(0, 0.87, 0) });
    if (style === 3) b.add(new THREE.BoxGeometry(0.045, 0.035, 0.02), { color: 0xc8a040, matrix: at(0, 0.87, f.waist * 0.66 + 0.012) });
    b.add(ellipsoid(f.hip, 0.1, 0.112), { color: legs, matrix: at(0, 0.82, 0) });
  }

  private buildHead(b: MeshBuilder, skin: number, hair: number, hairStyle: number, beard: number): void {
    const hy = HEAD_Y;
    b.add(new THREE.CylinderGeometry(0.052, 0.058, 0.12, 10), { color: skin, matrix: at(0, 1.31, 0) });
    b.add(head(), { color: skin, matrix: at(0, hy, 0.005) });
    for (const s of [1, -1]) {
      b.add(ellipsoid(0.02, 0.032, 0.025, 6, 5), { color: skin, matrix: at(s * 0.108, hy, -0.005) });
      b.add(ellipsoid(0.023, 0.014, 0.012, 6, 4), { color: EYE_WHITE, matrix: at(s * 0.042, hy + 0.018, 0.104) });
      b.add(ellipsoid(0.011, 0.012, 0.008, 6, 5), { color: EYE_PUPIL, matrix: at(s * 0.041, hy + 0.018, 0.114) });
      b.add(new THREE.BoxGeometry(0.048, 0.013, 0.016), { color: shade(hair, 0.8), matrix: at(s * 0.043, hy + 0.047, 0.106, 1, 0, 0, s * -0.18) });
    }
    b.add(new THREE.ConeGeometry(0.02, 0.05, 4).rotateX(Math.PI / 2 + 0.5), { color: shade(skin, 0.9), matrix: at(0, hy - 0.008, 0.122) });
    b.add(new THREE.BoxGeometry(0.042, 0.009, 0.01), { color: MOUTH, matrix: at(0, hy - 0.058, 0.108) });

    // Hair: a cap tipped back to show the forehead, plus whatever the style adds.
    const cap = () => b.add(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), {
      color: hair, matrix: at(0, hy + 0.012, -0.008, [0.121, 0.142, 0.132], 0, -0.3),
    });
    switch (hairStyle) {
      case 1: cap(); break;
      case 2:
        cap();
        b.add(ellipsoid(0.075, 0.03, 0.045), { color: hair, matrix: at(0.03, hy + 0.105, 0.075, 1, 0.3, 0, 0.25) });
        break;
      case 3:
        cap();
        b.add(ellipsoid(0.118, 0.17, 0.05), { color: hair, matrix: at(0, hy - 0.06, -0.09) });
        break;
      case 4:
        cap();
        for (let k = 0; k < 7; k++) {
          const a = (k / 7) * Math.PI * 2;
          b.add(new THREE.ConeGeometry(0.03, 0.09, 5), {
            color: hair, matrix: at(Math.cos(a) * 0.06, hy + 0.13, Math.sin(a) * 0.06 - 0.01, 1, -a, Math.sin(a) * 0.6, -Math.cos(a) * 0.6),
          });
        }
        break;
      case 5:
        cap();
        b.add(limb(0.035, 0.02, 0.2, 7), { color: hair, matrix: at(0, hy + 0.06, -0.12, 1, 0, 0.55) });
        break;
      case 6:
        cap();
        b.add(ellipsoid(0.058, 0.055, 0.055), { color: hair, matrix: at(0, hy + 0.12, -0.085) });
        break;
      case 7:
        for (let k = 0; k < 5; k++) {
          b.add(ellipsoid(0.02, 0.055, 0.035, 6, 5), { color: hair, matrix: at(0, hy + 0.125 - Math.abs(k - 1.5) * 0.02, 0.08 - k * 0.045) });
        }
        break;
      default:
        break;
    }

    // Facial hair: a moustache and/or a chin piece, or a shell over the whole jaw.
    const moustache = () => b.add(ellipsoid(0.05, 0.014, 0.02, 8, 5), { color: hair, matrix: at(0, hy - 0.04, 0.114) });
    const jaw = (scale: number) => b.add(new THREE.SphereGeometry(1, 12, 5, Math.PI * 0.08, Math.PI * 0.84, Math.PI * 0.52, Math.PI * 0.42), {
      color: hair, matrix: at(0, hy - 0.004, 0.008, [0.119 * scale, 0.142 * scale, 0.13 * scale]),
    });
    switch (beard) {
      case 1:
        moustache();
        b.add(ellipsoid(0.036, 0.055, 0.03), { color: hair, matrix: at(0, hy - 0.105, 0.098) });
        break;
      case 2:
        moustache();
        break;
      case 3:
        jaw(1.04);
        moustache();
        break;
      case 4:
        jaw(1.07);
        moustache();
        b.add(ellipsoid(0.07, 0.07, 0.06), { color: hair, matrix: at(0, hy - 0.115, 0.075) });
        break;
      case 5:
        jaw(1.07);
        moustache();
        b.add(new THREE.ConeGeometry(0.065, 0.22, 8).rotateX(Math.PI), { color: hair, matrix: at(0, hy - 0.2, 0.075) });
        break;
      default:
        break;
    }
  }

  /** `distance` is how far the character moved this frame, in tiles; it drives the stride. */
  animate(dt: number, distance: number, moving: boolean, running: boolean): void {
    const ease = (from: number, to: number, rate: number) => from + (to - from) * Math.min(1, dt * rate);
    this.motion = ease(this.motion, moving ? 1 : 0, 10);
    this.runBlend = ease(this.runBlend, running ? 1 : 0, 8);
    const stride = 1.15 + 0.55 * this.runBlend;
    this.phase = (this.phase + (distance / stride) * Math.PI * 2) % (Math.PI * 2);

    const a = this.motion, run = this.runBlend, s = Math.sin(this.phase), c = Math.cos(this.phase);
    const legSwing = (0.5 + 0.3 * run) * a * this.stride, armSwing = (0.4 + 0.45 * run) * a;
    this.hips[0]!.rotation.x = s * legSwing;
    this.hips[1]!.rotation.x = -s * legSwing;
    this.knees[0]!.rotation.x = Math.max(0, -c) * (0.7 + 0.5 * run) * a;
    this.knees[1]!.rotation.x = Math.max(0, c) * (0.7 + 0.5 * run) * a;
    this.shoulders[0]!.rotation.x = -s * armSwing;
    this.shoulders[1]!.rotation.x = s * armSwing;
    // Arms hang slightly out from the body, as they do at rest.
    this.shoulders[0]!.rotation.z = 0.08;
    this.shoulders[1]!.rotation.z = -0.08;
    this.elbows[0]!.rotation.x = this.elbows[1]!.rotation.x = -(0.12 + 1.0 * run) * a - 0.08;
    this.body.position.y = Math.abs(c) * 0.03 * a * (1 + run);
    this.body.rotation.x = 0.14 * run * a;
  }
}

function joint(x: number, y: number, z: number, ...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.add(...children);
  return g;
}
