import * as THREE from "three";
import { ITEM_BY_ID, VISIBLE_GEAR, type EquipSlot } from "../../shared/items.ts";
import { BODY_B, LOOK } from "../../shared/look.ts";
import {
  BELT, CLOTH, EYE_PUPIL, EYE_WHITE, FOOTWEAR, HAIR, MOUTH, SKIN, UNDERSHIRT,
} from "../palette.ts";
import { CAPE_LENGTH, heldGeometry, itemGeometry, itemMaterial } from "./items.ts";
import { at, loft, MeshBuilder, taperedBox } from "./meshkit.ts";
import { ACTIONS, CH, CHANNELS, samplePose, type ActionName, type Pose } from "./poses.ts";

/**
 * Flat shading, to match the creatures. A person is lofted through rings of six or eight sides, so the
 * limbs are round in section and faceted on the surface, and the torso draws in at the waist and out
 * at the chest. Neither a stack of smooth balls nor a stack of square slabs.
 */
const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
/** How much each facet's brightness varies, so flat faces read apart without needing more of them. */
const FACET = 0.045;
/** Pitches for a tapered box, which runs along its own +z: UP stands it on end, DOWN hangs it. */
const UP = -Math.PI / 2;
const DOWN = Math.PI / 2;
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
/** Where the upper body pivots to bend and twist. */
const WAIST_Y = 0.86;
const SHOULDER_Y = 1.22;
const UPPER_ARM = 0.28;
const FOREARM = 0.25;
/** From the elbow to the middle of the hand. */
const HAND_REACH = FOREARM + 0.045;
const HEAD_Y = 1.47;
const NECK_Y = 1.3;
/** Which way the left elbow points when that hand holds a tool: out to the side, down and a little back. */
const LEFT_POLE = new THREE.Vector3(1, -0.5, -0.2).normalize();

const shade = (hex: number, k: number) => new THREE.Color(hex).multiplyScalar(k).getHex();
const clamp = THREE.MathUtils.clamp;

/** Half-width, half-height and half-depth of the skull block, before the jaw and the face go on. */
const SKULL = { w: 0.112, h: 0.12, d: 0.118 };

/** How far the pelvis must drop for the lower foot to stay on the ground with the legs bent like this. */
function legDrop(p: Pose): number {
  const foot = (hip: number, knee: number) => THIGH * Math.cos(hip) + SHIN * Math.cos(hip + knee);
  return THIGH + SHIN - Math.max(foot(p[CH.hipL]!, p[CH.kneeL]!), foot(p[CH.hipR]!, p[CH.kneeR]!));
}

// Scratch space for the left-hand grip, shared by every model (it runs to completion each call).
const vTarget = new THREE.Vector3(), vDir = new THREE.Vector3(), vPerp = new THREE.Vector3(), vUpper = new THREE.Vector3();
const vElbow = new THREE.Vector3(), vFore = new THREE.Vector3(), vX = new THREE.Vector3(), vY = new THREE.Vector3(), vZ = new THREE.Vector3();
const mBasis = new THREE.Matrix4(), qGrip = new THREE.Quaternion();

/**
 * A person cut from flat-faced blocks, with clothes as separate layers (a vest over a shirt, trousers
 * flaring over boots) so they read at a distance. Faces +z with its feet at the origin.
 *
 * The rig: the pelvis carries the legs (hip and knee joints) and the waist, where the upper body bends
 * and twists; the upper body carries the shoulders and elbows, and the right hand has a wrist that
 * angles whatever it holds. Walking is procedural; skill actions are keyframed poses (render/poses.ts)
 * blended in while standing, with the left hand solved onto the tool's shaft for a two-handed grip.
 */
export class CharacterModel {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly waist = new THREE.Group();
  private readonly upper = new THREE.Group();
  private readonly hips: THREE.Group[] = [];
  private readonly knees: THREE.Group[] = [];
  private readonly shoulders: THREE.Group[] = [];
  private readonly elbows: THREE.Group[] = [];
  private readonly wrist = new THREE.Group();
  private readonly cape: THREE.Group | null = null;
  private readonly scale: number;
  /** The wielded weapon's item id (0 for none), and whether a shield is worn. */
  private readonly weapon: number;
  private readonly shielded: boolean;
  private heldId = 0;
  private heldMesh: THREE.Mesh | null = null;
  private phase = 0;
  private motion = 0;
  private runBlend = 0;
  /** A long skirt shortens the stride so the legs stay inside it. */
  private stride = 1;
  private action: ActionName | null = null;
  private tool = 0;
  /** An action playing once over the standing one. */
  private oneShot: ActionName | null = null;
  /** The action whose pose is showing (it outlasts `action` while blending out). */
  private shown: ActionName | null = null;
  private actionTime = 0;
  /** How far through the action loop the last frame was, for spotting the tool landing. */
  private lastPhase = 0;
  private actionBlend = 0;
  private frozenAt: number | null = null;
  private readonly pose: Pose = new Float64Array(CHANNELS);
  private readonly actionPose: Pose = new Float64Array(CHANNELS);
  private readonly geometries: THREE.BufferGeometry[] = [];

  /** Frees this model's own geometry (the shared materials, item models and shadow stay). */
  dispose(): void {
    for (const g of this.geometries) g.dispose();
  }

  private mesh(builder: MeshBuilder): THREE.Mesh {
    const geometry = builder.build();
    this.geometries.push(geometry);
    return new THREE.Mesh(geometry, material);
  }

  /** `gear` lists worn item ids in VISIBLE_GEAR order (0 for none). */
  constructor(look: number[], gear: number[] = []) {
    const pick = (list: number[], slot: number) => list[(look[slot] ?? 0) % list.length]!;
    const worn = (slot: EquipSlot) => ITEM_BY_ID.get(gear[VISIBLE_GEAR.indexOf(slot)] ?? 0);
    // Worn armour paints over the character's own colours: a jerkin shows as a vest, gloves and boots as themselves.
    const tint = (part: "top" | "legs" | "hands" | "feet", slot: EquipSlot) => worn(slot)?.equip?.tint?.[part];
    const type = look[LOOK.body] === BODY_B ? 1 : 0;
    const f = FRAMES[type]!;
    this.scale = f.scale;
    const skin = pick(SKIN, LOOK.skin), hair = pick(HAIR, LOOK.hairColor);
    const top = tint("top", "body") ?? pick(CLOTH, LOOK.topColor);
    const legs = tint("legs", "legs") ?? pick(CLOTH, LOOK.legsColor);
    const feet = tint("feet", "feet") ?? pick(FOOTWEAR, LOOK.feetColor);
    const gloves = tint("hands", "hands");
    const torsoStyle = tint("top", "body") !== undefined ? 2 : look[LOOK.torso] ?? 0;
    const armStyle = look[LOOK.arms] ?? 0, handStyle = gloves !== undefined ? 1 : look[LOOK.hands] ?? 0;
    const legStyle = tint("legs", "legs") !== undefined ? 0 : look[LOOK.legs] ?? 0;
    const feetStyle = tint("feet", "feet") !== undefined ? 1 : look[LOOK.feet] ?? 0;
    const vest = torsoStyle === 2, tunic = torsoStyle === 3, skirt = legStyle === 2;
    if (skirt) this.stride = 0.55;
    /** What the arms' sleeves are made of: the shirt under a vest, otherwise the top itself. */
    const sleeve = vest ? UNDERSHIRT : top;

    // The body is two meshes: the pelvis (hips, belt, skirt or tunic hem) and the upper body above the waist.
    const upper = new MeshBuilder(), pelvis = new MeshBuilder();
    this.buildTorso(upper, pelvis, f, type, torsoStyle, top, legs, legStyle);
    this.buildHead(upper, skin, hair, look[LOOK.hair] ?? 0, type === 0 ? look[LOOK.beard] ?? 0 : 0);
    if (tunic) pelvis.add(taperedBox(f.waist * 2.1, f.waist * 1.6, 0.42, 0.33, 0.25), { color: top, shade: FACET, matrix: at(0, 0.87, 0, 1, 0, Math.PI / 2) });
    if (skirt) pelvis.add(taperedBox(f.waist * 2.2, f.waist * 1.8, 0.62, 0.5, 0.63), { color: legs, shade: FACET, matrix: at(0, 0.87, 0, 1, 0, Math.PI / 2) });
    this.body.add(this.mesh(pelvis), this.waist);
    this.waist.position.y = WAIST_Y;
    this.waist.add(this.upper);
    // The upper body keeps body coordinates: its group undoes the waist's height.
    this.upper.position.y = -WAIST_Y;
    this.upper.add(this.mesh(upper));

    for (const side of [1, -1]) {
      // Arms: a shoulder cap, the upper arm (sleeved or bare), the forearm, then a blocky hand.
      const upperArm = new MeshBuilder();
      upperArm.add(loft([[0.072, 0.07, 0], [0.064, 0.064, 0.08]], 6), { color: sleeve, shade: FACET, matrix: at(0, 0.03, 0, 1, 0, DOWN) });
      if (armStyle === 0) {
        // A short sleeve over the top of a bare arm.
        upperArm.add(loft([[0.058, 0.058, 0], [0.05, 0.05, UPPER_ARM]], 6), { color: skin, shade: FACET, matrix: at(0, 0, 0, 1, 0, DOWN) });
        upperArm.add(loft([[0.066, 0.065, 0], [0.06, 0.059, 0.16]], 6), { color: sleeve, shade: FACET, matrix: at(0, 0, 0, 1, 0, DOWN) });
      } else {
        upperArm.add(loft([[0.062, 0.061, 0], [0.052, 0.052, UPPER_ARM]], 6), { color: sleeve, shade: FACET, matrix: at(0, 0, 0, 1, 0, DOWN) });
      }
      const fore = new MeshBuilder();
      fore.add(loft([[0.052, 0.052, 0], [0.043, 0.044, FOREARM]], 6), {
        color: armStyle === 0 ? skin : sleeve, shade: FACET, matrix: at(0, 0, 0, 1, 0, DOWN),
      });
      if (armStyle === 2) fore.add(loft([[0.063, 0.061, 0], [0.058, 0.057, 0.08]], 6), { color: shade(sleeve, 0.75), shade: FACET, matrix: at(0, -FOREARM + 0.08, 0, 1, 0, DOWN) });
      const gloveColor = gloves ?? feet;
      const handColor = handStyle === 1 ? gloveColor : skin;
      // A mitt: squarer than the wrist and a little deeper, which is what reads as a hand at this size.
      fore.add(loft([[0.043, 0.045, 0], [0.046, 0.05, 0.045], [0.038, 0.04, 0.095]], 6), { color: handColor, shade: FACET, matrix: at(0, -FOREARM - 0.002, 0.004, 1, 0, DOWN) });
      if (handStyle === 1) fore.add(loft([[0.054, 0.052, 0], [0.049, 0.048, 0.055]], 6), { color: shade(gloveColor, 0.85), shade: FACET, matrix: at(0, -FOREARM + 0.03, 0, 1, 0, DOWN) });
      if (handStyle === 2) fore.add(loft([[0.05, 0.049, 0], [0.047, 0.046, 0.045]], 6), { color: feet, shade: FACET, matrix: at(0, -FOREARM + 0.022, 0, 1, 0, DOWN) });
      const elbow = joint(0, -UPPER_ARM, 0, this.mesh(fore));
      const shoulder = joint(side * f.shoulderX, SHOULDER_Y, 0, this.mesh(upperArm), elbow);
      this.shoulders.push(shoulder);
      this.elbows.push(elbow);
      this.upper.add(shoulder);

      // Legs: trousers or shorts (or bare under a skirt), then shoes or boots with a visible top.
      const thigh = new MeshBuilder();
      thigh.add(loft([[0.088, 0.086, 0], [0.084, 0.082, THIGH * 0.45], [0.07, 0.07, THIGH]], 6), { color: skirt ? skin : legs, shade: FACET, matrix: at(0, 0, 0, 1, 0, DOWN) });
      const shin = new MeshBuilder();
      const trousers = legStyle === 0;
      shin.add(loft([[0.07, 0.07, 0], [0.062, 0.063, SHIN * 0.5], [0.058, 0.059, SHIN]], 6), { color: trousers ? legs : skin, shade: FACET, matrix: at(0, 0, 0, 1, 0, DOWN) });
      // Trousers flare a little over the boot, as the reference cut does.
      if (trousers) shin.add(loft([[0.07, 0.07, 0], [0.081, 0.08, 0.11]], 6), { color: shade(legs, 0.9), shade: FACET, matrix: at(0, -SHIN + 0.11, 0, 1, 0, DOWN) });
      // A blunt boot, wider than the shin and reaching forward over the toes.
      shin.add(loft([[0.066, 0.044, 0], [0.064, 0.042, 0.12], [0.056, 0.033, 0.19]], 6), { color: feet, shade: FACET, matrix: at(0, -SHIN - 0.046, -0.05) });
      if (feetStyle === 1) {
        shin.add(loft([[0.076, 0.074, 0], [0.07, 0.069, 0.17]], 6), { color: feet, shade: FACET, matrix: at(0, -SHIN + 0.17, 0, 1, 0, DOWN) });
        shin.add(loft([[0.083, 0.081, 0], [0.081, 0.079, 0.035]], 6), { color: shade(feet, 0.8), shade: FACET, matrix: at(0, -SHIN + 0.175, 0, 1, 0, DOWN) });
      }
      const knee = joint(0, -THIGH, 0, this.mesh(shin));
      const hip = joint(side * f.hipX, HIP_Y, 0, this.mesh(thigh), knee);
      this.hips.push(hip);
      this.knees.push(knee);
      this.body.add(hip);
    }

    // Held and worn items. Shoulders and elbows are [left, right]: the right hand's wrist holds the weapon
    // (or the tool of a skill action), the shield rides the left forearm, a hat sits on the head and a cape
    // hangs from the collar.
    this.wrist.position.set(0, -FOREARM - 0.05, 0.03);
    this.elbows[1]!.add(this.wrist);
    this.weapon = worn("weapon")?.id ?? 0;
    const shield = worn("shield"), hat = worn("head"), cape = worn("cape");
    this.shielded = shield !== undefined;
    if (shield) this.elbows[0]!.add(placed(shield.id, 0.075, -FOREARM * 0.55, 0.02));
    if (hat) this.upper.add(placed(hat.id, 0, HEAD_Y + 0.04, -0.005, -0.12, 0, 1.06));
    if (cape) {
      // Pivoting at the collar lets the hem swing back when running and hang when bending over.
      this.cape = joint(0, NECK_Y, 0, placed(cape.id, 0, -CAPE_LENGTH, 0, 0, Math.PI));
      this.upper.add(this.cape);
    }

    const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
    shadow.position.y = 0.02;
    shadow.renderOrder = -1;
    this.body.scale.setScalar(f.scale);
    this.root.add(this.body, shadow);
    this.animate(0, 0, false, false);
  }

  private buildTorso(
    upper: MeshBuilder, pelvis: MeshBuilder, f: (typeof FRAMES)[number], type: number, style: number, top: number, legs: number, legStyle: number,
  ): void {
    const vest = style === 2;
    const shirt = vest ? UNDERSHIRT : top;
    const waistW = f.waist * 2, chestW = f.chest * 2, shoulderW = f.chest * 2.08;
    const deep = 0.64;
    // Waist to chest, chest to shoulders, then the shoulder line squared off: three blocks. What says
    // "person" from across a field is the shoulder line, not how round the barrel is.
    // Waist, chest and shoulders in one hull: it draws in above the belt and out again at the chest,
    // which is what a torso does and what a stack of blocks cannot.
    upper.add(loft([
      [waistW / 2, waistW * deep / 2, 0],
      [waistW * 0.53, waistW * deep * 0.54, 0.05],
      [chestW * 0.5, chestW * deep * 0.52, 0.28],
      [shoulderW * 0.5, shoulderW * deep * 0.5, 0.43],
      [shoulderW * 0.34, shoulderW * deep * 0.36, 0.49],
    ], 8), { color: style === 4 ? shade(top, 0.7) : shirt, shade: FACET, matrix: at(0, 0.82, 0, 1, 0, UP) });
    // A darker yoke over the chest for the two-toned style.
    if (style === 4) {
      upper.add(loft([[chestW * 0.5, chestW * deep * 0.52, 0], [shoulderW * 0.5, shoulderW * deep * 0.5, 0.15]], 8), {
        color: top, shade: FACET, matrix: at(0, 1.1, 0, 1, 0, UP),
      });
    }
    if (vest) {
      // A vest over the shirt: the same blocks a shade wider, open down the middle.
      for (const s of [1, -1]) {
        upper.add(loft([
          [waistW * 0.25, waistW * deep * 0.55, 0],
          [chestW * 0.26, chestW * deep * 0.54, 0.28],
          [shoulderW * 0.25, shoulderW * deep * 0.52, 0.42],
        ], 6, [[s * waistW * 0.26, 0], [s * chestW * 0.26, 0], [s * shoulderW * 0.26, 0]]), {
          color: top, shade: FACET, matrix: at(0, 0.84, 0, 1, 0, UP),
        });
      }
    }
    if (style === 1) {
      for (const y of [1.18, 1.08, 0.98]) {
        upper.add(taperedBox(0.024, 0.024, 0.018, 0.018, 0.012), { color: shade(top, 0.45), matrix: at(0, y, chestW * deep * 0.5) });
      }
      for (const s of [1, -1]) {
        upper.add(taperedBox(0.08, 0.022, 0.06, 0.02, 0.055), { color: shade(top, 0.85), matrix: at(s * 0.05, 1.28, 0.01, 1, 0, 0.25) });
      }
    }
    if (type === 1) {
      for (const s of [1, -1]) {
        upper.add(taperedBox(0.105, 0.1, 0.075, 0.07, 0.065), {
          color: style === 4 ? shade(top, 0.7) : shirt, shade: FACET, matrix: at(s * 0.06, 1.1, chestW * deep * 0.44),
        });
      }
    }
    // Waistband or belt, then the hips in trouser colour (the tunic and skirt cover them anyway).
    const belt = style === 3 ? BELT : shade(legStyle === 2 ? top : legs, 0.72);
    pelvis.add(loft([[waistW * 0.54, waistW * deep * 0.55, 0], [waistW * 0.54, waistW * deep * 0.55, 0.042]], 8), {
      color: belt, shade: FACET, matrix: at(0, 0.85, 0, 1, 0, UP),
    });
    if (style === 3) pelvis.add(loft([[0.022, 0.018, 0], [0.019, 0.015, 0.018]], 4), { color: 0xc8a040, matrix: at(0, 0.868, waistW * deep * 0.56) });
    pelvis.add(loft([[f.hip * 0.9, f.hip * 0.66, 0], [f.hip * 1.02, f.hip * 0.73, 0.09], [f.hip * 0.96, f.hip * 0.7, 0.14]], 8), {
      color: legs, shade: FACET, matrix: at(0, 0.73, 0, 1, 0, UP),
    });
  }

  private buildHead(b: MeshBuilder, skin: number, hair: number, hairStyle: number, beard: number): void {
    const hy = HEAD_Y, k = SKULL;
    b.add(loft([[0.055, 0.052, 0], [0.05, 0.048, 0.14]], 6), { color: skin, shade: FACET, matrix: at(0, 1.24, -0.004, 1, 0, UP) });
    // The skull, slightly narrower at the front, then a jaw hung under its front half and a brow over it.
    b.add(loft([
      [k.w * 0.74, k.h * 0.72, 0], [k.w * 0.98, k.h * 0.95, k.d * 0.6],
      [k.w * 0.96, k.h * 0.92, k.d * 1.3], [k.w * 0.8, k.h * 0.76, k.d * 2],
    ], 7), { color: skin, shade: FACET, matrix: at(0, hy + k.h * 0.18, -k.d) });
    b.add(loft([[k.w * 0.8, k.h * 0.4, 0], [k.w * 0.74, k.h * 0.34, k.d * 0.8], [k.w * 0.6, k.h * 0.26, k.d * 1.3]], 6,
      [[0, 0], [0, -k.h * 0.06], [0, -k.h * 0.14]]), { color: skin, shade: FACET, matrix: at(0, hy - k.h * 0.44, -k.d * 0.48) });
    b.add(loft([[k.w * 0.9, k.h * 0.14, 0], [k.w * 0.84, k.h * 0.11, k.d * 0.2]], 5), {
      color: shade(skin, 0.9), shade: FACET, matrix: at(0, hy + k.h * 0.4, k.d * 0.72),
    });
    for (const s of [1, -1]) {
      b.add(loft([[k.w * 0.13, k.h * 0.24, 0], [k.w * 0.1, k.h * 0.2, k.d * 0.28]], 5), { color: skin, shade: FACET, matrix: at(s * k.w * 0.94, hy, -k.d * 0.2, 1, s * 1.4) });
      b.add(loft([[0.021, 0.01, 0], [0.018, 0.009, 0.012]], 5), { color: EYE_WHITE, matrix: at(s * 0.042, hy + 0.016, k.d * 0.74) });
      b.add(loft([[0.009, 0.0085, 0], [0.0075, 0.007, 0.01]], 4), { color: EYE_PUPIL, matrix: at(s * 0.041, hy + 0.016, k.d * 0.79) });
      b.add(loft([[0.025, 0.007, 0], [0.021, 0.006, 0.012]], 4), { color: shade(hair, 0.8), matrix: at(s * 0.043, hy + 0.046, k.d * 0.76, 1, 0, -0.2) });
    }
    b.add(loft([[0.016, 0.014, 0], [0.011, 0.024, 0.042]], 5), { color: shade(skin, 0.92), shade: FACET, matrix: at(0, hy - 0.004, k.d * 0.62) });
    b.add(loft([[0.023, 0.0055, 0], [0.019, 0.0045, 0.012]], 4), { color: MOUTH, matrix: at(0, hy - 0.056, k.d * 0.7) });

    // Hair: a slab cap over the crown and down the back, tipped to leave the forehead showing.
    const cap = () => {
      b.add(loft([[k.w * 1.02, k.d * 1.04, 0], [k.w * 0.96, k.d * 0.98, k.h * 0.36], [k.w * 0.72, k.d * 0.74, k.h * 0.62]], 7), {
        color: hair, shade: FACET, matrix: at(0, hy + k.h * 0.5, 0.004, 1, 0, UP),
      });
      b.add(loft([[k.w * 0.98, k.h * 0.6, 0], [k.w * 0.9, k.h * 0.5, k.d * 0.3]], 6), {
        color: hair, shade: FACET, matrix: at(0, hy + k.h * 0.16, -k.d * 1.0),
      });
    };
    switch (hairStyle) {
      case 1: cap(); break;
      case 2:
        cap();
        b.add(taperedBox(0.1, 0.05, 0.07, 0.035, 0.1), { color: hair, shade: FACET, matrix: at(0.02, hy + 0.1, 0.02, 1, 0.3, -0.5) });
        break;
      case 3:
        cap();
        b.add(taperedBox(0.22, 0.09, 0.19, 0.08, 0.3), { color: hair, shade: FACET, matrix: at(0, hy + 0.09, -0.1, 1, 0, UP) });
        break;
      case 4:
        cap();
        for (let k = 0; k < 7; k++) {
          const a = (k / 7) * Math.PI * 2;
          b.add(taperedBox(0.05, 0.05, 0.006, 0.006, 0.1), {
            color: hair, matrix: at(Math.cos(a) * 0.055, hy + 0.12, Math.sin(a) * 0.055 - 0.01, 1, a + Math.PI / 2, UP + 0.5),
          });
        }
        break;
      case 5:
        cap();
        b.add(taperedBox(0.07, 0.07, 0.03, 0.03, 0.24), { color: hair, shade: FACET, matrix: at(0, hy + 0.08, -0.11, 1, 0, 1.15) });
        break;
      case 6:
        cap();
        b.add(taperedBox(0.12, 0.11, 0.1, 0.09, 0.11), { color: hair, shade: FACET, matrix: at(0, hy + 0.07, -0.14, 1, 0, UP) });
        break;
      case 7:
        for (let k = 0; k < 5; k++) {
          b.add(taperedBox(0.042, 0.07, 0.03, 0.05, 0.11), { color: hair, shade: FACET, matrix: at(0, hy + 0.08 - Math.abs(k - 1.5) * 0.02, 0.08 - k * 0.045, 1, 0, UP) });
        }
        break;
      default:
        break;
    }

    // Facial hair: a moustache and/or a chin piece, or a shell over the whole jaw.
    const moustache = () => b.add(taperedBox(0.09, 0.028, 0.075, 0.022, 0.024), { color: hair, shade: FACET, matrix: at(0, hy - 0.038, SKULL.d * 0.7) });
    const jaw = (scale: number) => b.add(
      taperedBox(SKULL.w * 1.86 * scale, SKULL.h * 0.96 * scale, SKULL.w * 1.56 * scale, SKULL.h * 0.76 * scale, SKULL.d * 1.55 * scale, -SKULL.h * 0.1),
      { color: hair, shade: FACET, matrix: at(0, hy - SKULL.h * 0.44, -SKULL.d * 0.44) },
    );
    switch (beard) {
      case 1:
        moustache();
        b.add(taperedBox(0.06, 0.05, 0.045, 0.04, 0.09), { color: hair, shade: FACET, matrix: at(0, hy - 0.07, 0.08, 1, 0, 1.15) });
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
        b.add(taperedBox(0.13, 0.11, 0.1, 0.09, 0.1), { color: hair, shade: FACET, matrix: at(0, hy - 0.08, 0.055, 1, 0, 1.3) });
        break;
      case 5:
        jaw(1.07);
        moustache();
        b.add(taperedBox(0.12, 0.1, 0.02, 0.02, 0.24), { color: hair, shade: FACET, matrix: at(0, hy - 0.08, 0.05, 1, 0, 1.45) });
        break;
      default:
        break;
    }
  }

  /**
   * Starts (or with null, ends) a looping skill action, with `tool` (an item id) in the right hand while
   * it plays. It shows while the character stands still, and blends in and out over a moment.
   */
  act(action: ActionName | null, tool = 0): void {
    this.action = action;
    this.tool = tool;
  }

  /** Plays a blow once, over whatever is running, then hands back to the standing action. */
  swing(): void {
    this.oneShot = "strike";
  }

  /** How tall this character stands, in tiles: where anything drawn over its head goes. */
  get height(): number {
    return 1.62 * this.scale;
  }

  /** Called each time the tool lands, for whoever plays the sound of it. */
  onImpact: ((action: ActionName) => void) | null = null;

  /** For previews and snapshots: holds the action at `t` (0–1 through its loop), fully blended in. Null lets it run. */
  freeze(t: number | null): void {
    this.frozenAt = t;
  }

  /** `distance` is how far the character moved this frame, in tiles; it drives the stride. */
  animate(dt: number, distance: number, moving: boolean, running: boolean): void {
    const ease = (from: number, to: number, rate: number) => from + (to - from) * Math.min(1, dt * rate);
    this.motion = ease(this.motion, moving ? 1 : 0, 10);
    this.runBlend = ease(this.runBlend, running ? 1 : 0, 8);
    const stride = 1.15 + 0.55 * this.runBlend;
    this.phase = (this.phase + (distance / stride) * Math.PI * 2) % (Math.PI * 2);

    // Walking (or standing): legs and arms swing in opposition. A wielded weapon is carried with the
    // forearm raised and the blade forward, so that arm hardly swings; a shield arm is bent a little.
    const p = this.pose;
    p.fill(0);
    const a = this.motion, run = this.runBlend, s = Math.sin(this.phase), c = Math.cos(this.phase);
    const legSwing = (0.5 + 0.3 * run) * a * this.stride, armSwing = (0.4 + 0.45 * run) * a;
    const armed = this.weapon !== 0;
    p[CH.hipL] = s * legSwing;
    p[CH.hipR] = -s * legSwing;
    p[CH.kneeL] = Math.max(0, -c) * (0.7 + 0.5 * run) * a;
    p[CH.kneeR] = Math.max(0, c) * (0.7 + 0.5 * run) * a;
    p[CH.shLx] = -s * armSwing;
    p[CH.shRx] = armed ? s * armSwing * 0.35 - 0.22 : s * armSwing;
    // Arms hang slightly out from the body, as they do at rest.
    p[CH.shLz] = 0.08;
    p[CH.shRz] = -0.08;
    p[CH.elL] = -(0.12 + 1.0 * run) * a - 0.08 - (this.shielded ? 0.4 : 0);
    p[CH.elR] = armed ? -1.05 - 0.3 * run * a : -(0.12 + 1.0 * run) * a - 0.08;
    p[CH.wrist] = armed ? 1.15 : Math.PI / 2;
    p[CH.lift] = Math.abs(c) * 0.03 * a * (1 + run);
    p[CH.lean] = 0.14 * run * a;

    // A one-shot (a blow) runs on top until it has played through, then hands back to the standing action.
    if (this.oneShot !== null && this.shown === this.oneShot && this.actionTime >= ACTIONS[this.oneShot].period) this.oneShot = null;
    // A skill action takes over while standing still, blending in over a moment and out again.
    const standing = this.action !== null && (this.frozenAt !== null || !moving) ? this.action : null;
    const wanted = this.oneShot ?? standing;
    const acting = wanted !== null;
    if (acting && this.shown !== wanted) {
      this.shown = wanted;
      this.actionTime = 0;
      this.lastPhase = 0;
    }
    this.actionBlend = this.frozenAt !== null ? (acting ? 1 : 0) : ease(this.actionBlend, acting ? 1 : 0, 7);
    if (acting) this.actionTime += dt;
    if (this.shown && this.actionBlend > 0.001) {
      const def = ACTIONS[this.shown];
      samplePose(def, this.frozenAt ?? this.actionTime / def.period, this.actionPose);
      // Each loop passes the point where the tool lands exactly once.
      const phase = this.actionTime / def.period;
      if (this.frozenAt === null && this.actionBlend > 0.5 && Math.floor(phase - def.impact) > Math.floor(this.lastPhase - def.impact)) {
        this.onImpact?.(this.shown);
      }
      this.lastPhase = phase;
      this.actionPose[CH.lift] = -legDrop(this.actionPose) * this.scale;
      const w = this.actionBlend;
      for (let i = 0; i < CHANNELS; i++) p[i] = p[i]! * (1 - w) + this.actionPose[i]! * w;
    } else {
      this.shown = null;
    }
    this.hold(this.shown && this.actionBlend > 0.5 ? this.tool : this.weapon);

    this.body.position.y = p[CH.lift]!;
    this.body.rotation.x = p[CH.lean]!;
    this.waist.rotation.set(p[CH.bend]!, p[CH.twist]!, 0);
    this.hips[0]!.rotation.x = p[CH.hipL]!;
    this.hips[1]!.rotation.x = p[CH.hipR]!;
    this.knees[0]!.rotation.x = p[CH.kneeL]!;
    this.knees[1]!.rotation.x = p[CH.kneeR]!;
    this.shoulders[0]!.rotation.set(p[CH.shLx]!, p[CH.shLy]!, p[CH.shLz]!);
    this.shoulders[1]!.rotation.set(p[CH.shRx]!, p[CH.shRy]!, p[CH.shRz]!);
    this.elbows[0]!.rotation.x = p[CH.elL]!;
    this.elbows[1]!.rotation.x = p[CH.elR]!;
    this.wrist.rotation.x = p[CH.wrist]!;
    // The hem swings back when running and partly hangs straight when the back bends.
    if (this.cape) this.cape.rotation.x = 0.06 + 0.35 * run * a - 0.4 * p[CH.bend]!;
    if (p[CH.grip]! > 0.01 && this.heldMesh && this.shown) this.gripLeft(p[CH.grip]!, ACTIONS[this.shown].leftHand);
  }

  /** Puts `id` (an item, or 0 for nothing) in the right hand. */
  private hold(id: number): void {
    if (id === this.heldId) return;
    if (this.heldMesh) this.wrist.remove(this.heldMesh);
    this.heldMesh = id ? new THREE.Mesh(heldGeometry(id), itemMaterial) : null;
    if (this.heldMesh) this.wrist.add(this.heldMesh);
    this.heldId = id;
  }

  /**
   * Moves the left hand onto the held tool, `along` its shaft from the right hand, by `weight` (0–1).
   * Two-bone IK in the upper body's frame: the shoulder turns the arm toward the grip, and the elbow bends
   * by the law of cosines, pointing out to the side.
   */
  private gripLeft(weight: number, along: number): void {
    this.root.updateMatrixWorld(true);
    const target = this.upper.worldToLocal(this.heldMesh!.localToWorld(vTarget.set(0, along, 0)));
    const shoulder = this.shoulders[0]!, elbow = this.elbows[0]!;
    const toTarget = vDir.copy(target).sub(shoulder.position);
    const d = clamp(toTarget.length(), 0.08, UPPER_ARM + HAND_REACH - 0.001);
    const dir = toTarget.normalize();
    const perp = vPerp.copy(LEFT_POLE).addScaledVector(dir, -LEFT_POLE.dot(dir)).normalize();
    const atShoulder = Math.acos(clamp((UPPER_ARM ** 2 + d * d - HAND_REACH ** 2) / (2 * UPPER_ARM * d), -1, 1));
    const upperDir = vUpper.copy(dir).multiplyScalar(Math.cos(atShoulder)).addScaledVector(perp, Math.sin(atShoulder));
    const elbowAt = vElbow.copy(shoulder.position).addScaledVector(upperDir, UPPER_ARM);
    const foreDir = vFore.copy(target).sub(elbowAt).normalize();
    // The arm's own frame: it hangs along -y and its elbow folds the forearm toward +z.
    const y = vY.copy(upperDir).negate();
    const z = vZ.copy(foreDir).addScaledVector(upperDir, -foreDir.dot(upperDir));
    if (z.lengthSq() < 1e-8) z.copy(perp);
    z.normalize();
    mBasis.makeBasis(vX.crossVectors(y, z), y, z);
    qGrip.setFromRotationMatrix(mBasis);
    shoulder.quaternion.slerp(qGrip, weight);
    const inner = Math.acos(clamp((UPPER_ARM ** 2 + HAND_REACH ** 2 - d * d) / (2 * UPPER_ARM * HAND_REACH), -1, 1));
    elbow.rotation.x += (-(Math.PI - inner) - elbow.rotation.x) * weight;
  }
}

function joint(x: number, y: number, z: number, ...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.add(...children);
  return g;
}

/** An item's model placed on a body part (shared geometry, so the model's dispose leaves it alone). */
function placed(id: number, x: number, y: number, z: number, rx = 0, ry = 0, scale = 1): THREE.Mesh {
  const m = new THREE.Mesh(itemGeometry(id), itemMaterial);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, 0);
  m.scale.setScalar(scale);
  return m;
}
