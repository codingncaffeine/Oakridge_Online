import * as THREE from "three";
import { ITEM_BY_ID, VISIBLE_GEAR, type EquipSlot } from "../../shared/items.ts";
import { BODY_B, LOOK } from "../../shared/look.ts";
import {
  BELT, CLOTH, EYE_PUPIL, EYE_WHITE, FOOTWEAR, HAIR, MOUTH, SKIN, UNDERSHIRT,
} from "../palette.ts";
import { CAPE_LENGTH, heldGeometry, itemGeometry, itemMaterial } from "./items.ts";
import { at, MeshBuilder, taperedBox } from "./meshkit.ts";
import { ACTIONS, CH, CHANNELS, samplePose, type ActionName, type Pose } from "./poses.ts";

/**
 * Flat shading, to match the creatures: a person is cut from flat-faced blocks, and the facets down an
 * arm or a shin are the look rather than something to smooth away.
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
      upperArm.add(taperedBox(0.145, 0.14, 0.128, 0.128, 0.08), { color: sleeve, shade: FACET, matrix: at(0, 0.03, 0, 1, 0, DOWN) });
      if (armStyle === 0) {
        // A short sleeve over the top of a bare arm.
        upperArm.add(taperedBox(0.115, 0.115, 0.1, 0.1, UPPER_ARM), { color: skin, shade: FACET, matrix: at(0, 0, 0, 1, 0, DOWN) });
        upperArm.add(taperedBox(0.132, 0.13, 0.12, 0.118, 0.16), { color: sleeve, shade: FACET, matrix: at(0, 0, 0, 1, 0, DOWN) });
      } else {
        upperArm.add(taperedBox(0.124, 0.122, 0.104, 0.104, UPPER_ARM), { color: sleeve, shade: FACET, matrix: at(0, 0, 0, 1, 0, DOWN) });
      }
      const fore = new MeshBuilder();
      fore.add(taperedBox(0.104, 0.104, 0.086, 0.088, FOREARM), {
        color: armStyle === 0 ? skin : sleeve, shade: FACET, matrix: at(0, 0, 0, 1, 0, DOWN),
      });
      if (armStyle === 2) fore.add(taperedBox(0.126, 0.122, 0.116, 0.114, 0.08), { color: shade(sleeve, 0.75), shade: FACET, matrix: at(0, -FOREARM + 0.08, 0, 1, 0, DOWN) });
      const gloveColor = gloves ?? feet;
      const handColor = handStyle === 1 ? gloveColor : skin;
      // A mitt: squarer than the wrist and a little deeper, which is what reads as a hand at this size.
      fore.add(taperedBox(0.086, 0.09, 0.076, 0.08, 0.095), { color: handColor, shade: FACET, matrix: at(0, -FOREARM - 0.002, 0.004, 1, 0, DOWN) });
      if (handStyle === 1) fore.add(taperedBox(0.108, 0.104, 0.098, 0.096, 0.055), { color: shade(gloveColor, 0.85), shade: FACET, matrix: at(0, -FOREARM + 0.03, 0, 1, 0, DOWN) });
      if (handStyle === 2) fore.add(taperedBox(0.1, 0.098, 0.094, 0.092, 0.045), { color: feet, shade: FACET, matrix: at(0, -FOREARM + 0.022, 0, 1, 0, DOWN) });
      const elbow = joint(0, -UPPER_ARM, 0, this.mesh(fore));
      const shoulder = joint(side * f.shoulderX, SHOULDER_Y, 0, this.mesh(upperArm), elbow);
      this.shoulders.push(shoulder);
      this.elbows.push(elbow);
      this.upper.add(shoulder);

      // Legs: trousers or shorts (or bare under a skirt), then shoes or boots with a visible top.
      const thigh = new MeshBuilder();
      thigh.add(taperedBox(0.172, 0.168, 0.14, 0.14, THIGH), { color: skirt ? skin : legs, shade: FACET, matrix: at(0, 0, 0, 1, 0, DOWN) });
      const shin = new MeshBuilder();
      const trousers = legStyle === 0;
      shin.add(taperedBox(0.14, 0.14, 0.116, 0.118, SHIN), { color: trousers ? legs : skin, shade: FACET, matrix: at(0, 0, 0, 1, 0, DOWN) });
      // Trousers flare a little over the boot, as the reference cut does.
      if (trousers) shin.add(taperedBox(0.148, 0.148, 0.166, 0.162, 0.11), { color: shade(legs, 0.9), shade: FACET, matrix: at(0, -SHIN + 0.11, 0, 1, 0, DOWN) });
      // A blunt boot, wider than the shin and reaching forward over the toes.
      shin.add(taperedBox(0.132, 0.086, 0.118, 0.07, 0.19), { color: feet, shade: FACET, matrix: at(0, -SHIN - 0.048, -0.05) });
      if (feetStyle === 1) {
        shin.add(taperedBox(0.152, 0.148, 0.14, 0.138, 0.17), { color: feet, shade: FACET, matrix: at(0, -SHIN + 0.17, 0, 1, 0, DOWN) });
        shin.add(taperedBox(0.166, 0.162, 0.162, 0.158, 0.035), { color: shade(feet, 0.8), shade: FACET, matrix: at(0, -SHIN + 0.175, 0, 1, 0, DOWN) });
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
    upper.add(taperedBox(waistW, waistW * deep, chestW, chestW * deep, 0.28), {
      color: style === 4 ? top : shirt, shade: FACET, matrix: at(0, 0.84, 0, 1, 0, UP),
    });
    upper.add(taperedBox(chestW, chestW * deep, shoulderW, shoulderW * deep * 0.95, 0.15), {
      color: style === 4 ? shade(top, 0.7) : shirt, shade: FACET, matrix: at(0, 1.12, 0, 1, 0, UP),
    });
    upper.add(taperedBox(shoulderW, shoulderW * deep * 0.95, shoulderW * 0.66, shoulderW * deep * 0.66, 0.06), {
      color: style === 4 ? shade(top, 0.7) : shirt, shade: FACET, matrix: at(0, 1.27, 0, 1, 0, UP),
    });
    // Fills the waist behind when the back bends.
    upper.add(taperedBox(waistW * 0.94, waistW * deep, waistW * 0.94, waistW * deep, 0.06), { color: shirt, matrix: at(0, 0.79, 0, 1, 0, UP) });
    if (vest) {
      // A vest over the shirt: the same blocks a shade wider, open down the middle.
      for (const s of [1, -1]) {
        upper.add(taperedBox(waistW * 0.44, waistW * deep * 1.07, chestW * 0.44, chestW * deep * 1.07, 0.28), {
          color: top, shade: FACET, matrix: at(s * waistW * 0.3, 0.84, 0, 1, 0, UP),
        });
        upper.add(taperedBox(chestW * 0.44, chestW * deep * 1.07, shoulderW * 0.42, shoulderW * deep, 0.16), {
          color: top, shade: FACET, matrix: at(s * chestW * 0.3, 1.12, 0, 1, 0, UP),
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
    pelvis.add(taperedBox(waistW * 1.08, waistW * deep * 1.1, waistW * 1.08, waistW * deep * 1.1, 0.042), {
      color: belt, shade: FACET, matrix: at(0, 0.85, 0, 1, 0, UP),
    });
    if (style === 3) pelvis.add(taperedBox(0.045, 0.035, 0.04, 0.03, 0.018), { color: 0xc8a040, matrix: at(0, 0.868, waistW * deep * 0.56) });
    pelvis.add(taperedBox(f.hip * 1.92, f.hip * 1.38, f.hip * 2.02, f.hip * 1.44, 0.13), { color: legs, shade: FACET, matrix: at(0, 0.73, 0, 1, 0, UP) });
  }

  private buildHead(b: MeshBuilder, skin: number, hair: number, hairStyle: number, beard: number): void {
    const hy = HEAD_Y, k = SKULL;
    b.add(taperedBox(0.11, 0.105, 0.098, 0.096, 0.14), { color: skin, shade: FACET, matrix: at(0, 1.24, -0.004, 1, 0, UP) });
    // The skull, slightly narrower at the front, then a jaw hung under its front half and a brow over it.
    b.add(taperedBox(k.w * 2, k.h * 1.9, k.w * 1.84, k.h * 1.7, k.d * 2), {
      color: skin, shade: FACET, matrix: at(0, hy + k.h * 0.2, -k.d),
    });
    b.add(taperedBox(k.w * 1.76, k.h * 0.88, k.w * 1.46, k.h * 0.6, k.d * 1.36, -k.h * 0.12), {
      color: skin, shade: FACET, matrix: at(0, hy - k.h * 0.46, -k.d * 0.5),
    });
    b.add(taperedBox(k.w * 1.96, k.h * 0.3, k.w * 1.84, k.h * 0.24, k.d * 0.22), {
      color: shade(skin, 0.9), shade: FACET, matrix: at(0, hy + k.h * 0.42, k.d * 0.74),
    });
    for (const s of [1, -1]) {
      b.add(taperedBox(k.w * 0.3, k.h * 0.5, k.w * 0.24, k.h * 0.42, k.d * 0.3), { color: skin, shade: FACET, matrix: at(s * k.w, hy, -k.d * 0.2) });
      b.add(taperedBox(0.042, 0.02, 0.036, 0.017, 0.012), { color: EYE_WHITE, matrix: at(s * 0.042, hy + 0.016, k.d * 0.78) });
      b.add(taperedBox(0.018, 0.017, 0.015, 0.014, 0.01), { color: EYE_PUPIL, matrix: at(s * 0.041, hy + 0.016, k.d * 0.84) });
      b.add(taperedBox(0.05, 0.014, 0.042, 0.012, 0.012), { color: shade(hair, 0.8), matrix: at(s * 0.043, hy + 0.046, k.d * 0.8, 1, 0, 0, s * -0.16) });
    }
    b.add(taperedBox(0.032, 0.03, 0.022, 0.05, 0.04), { color: shade(skin, 0.92), shade: FACET, matrix: at(0, hy - 0.006, k.d * 0.66) });
    b.add(taperedBox(0.046, 0.011, 0.038, 0.009, 0.012), { color: MOUTH, matrix: at(0, hy - 0.058, k.d * 0.74) });

    // Hair: a slab cap over the crown and down the back, tipped to leave the forehead showing.
    const cap = () => {
      b.add(taperedBox(k.w * 2.1, k.d * 2.08, k.w * 1.9, k.d * 1.9, k.h * 0.62), {
        color: hair, shade: FACET, matrix: at(0, hy + k.h * 0.52, 0.004, 1, 0, UP),
      });
      b.add(taperedBox(k.w * 2.02, k.h * 1.1, k.w * 1.86, k.h * 0.9, k.d * 0.3), {
        color: hair, shade: FACET, matrix: at(0, hy + k.h * 0.18, -k.d * 1.02),
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
