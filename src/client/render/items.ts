import * as THREE from "three";
import { ITEM_BY_ID, type EquipSlot } from "../../shared/items.ts";
import { at, between, ellipsoid, MeshBuilder } from "./meshkit.ts";

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const BRONZE = 0xb0763a, WOOD = 0x7a5230, LEATHER = 0x7a5230, IRON = 0x6f6f72;
const BONE = 0xe6e2d8, BONE_PALE = 0xf4f2ec;
/** Brass for a crossguard and pommel, which is what makes a sword read as a sword at icon size. */
const BRASS = 0xd8c040;
/** Tool heads by metal: the blade or point, then the collar that holds it on the shaft. */
const HEADS = { bronze: [BRONZE, 0x8a5a2a], iron: [0x7c7c82, 0x55555a], steel: [0xb3bac3, 0x80868e] } as const;
/** A cape's length from collar to hem. */
export const CAPE_LENGTH = 0.84;
/** Where a net's handle ends, which is where the hand holds it. */
const NET_GRIP = 0.62;

/**
 * Every item as a small model, built in code: the same geometry is an inventory icon, an item on the
 * ground and, for weapons and shields, the thing in a character's hand. Models sit on y = 0 and are
 * about half a tile across; hand-held ones have the grip at the origin and point up +y. The last few
 * are no item yet: they draw the outlines of empty equipment slots.
 */
const MODELS: Record<string, (b: MeshBuilder) => void> = {
  coins(b) {
    const spots: Array<[number, number, number]> = [[0, 0, 0], [0.09, 0.02, 0.04], [-0.07, 0.01, 0.06], [0.03, 0.04, -0.08], [-0.05, 0.03, -0.04]];
    for (const [x, y, z] of spots) b.add(new THREE.CylinderGeometry(0.07, 0.07, 0.022, 12), { color: 0xe0b83a, matrix: at(x, y + 0.012, z, 1, x * 9, z * 4) });
  },
  logs(b) { logPile(b, 0x8a5a32, 0xd6b07a); },
  oak_logs(b) { logPile(b, 0x6a4424, 0xc49a62); },
  copper_ore(b) { ore(b, 0xc47a44); },
  tin_ore(b) { ore(b, 0xc8c8c0); },
  iron_ore(b) { ore(b, 0x9a4a2c); },
  raw_sardine(b) {
    b.add(ellipsoid(0.15, 0.045, 0.055), { color: 0x9ab0c0, matrix: at(0, 0.05, 0) });
    b.add(new THREE.ConeGeometry(0.05, 0.08, 4).rotateZ(Math.PI / 2), { color: 0x7890a0, matrix: at(-0.18, 0.05, 0) });
  },
  bronze_axe(b) { axe(b, "bronze"); },
  iron_axe(b) { axe(b, "iron"); },
  steel_axe(b) { axe(b, "steel"); },
  bronze_pickaxe(b) { pickaxe(b, "bronze"); },
  iron_pickaxe(b) { pickaxe(b, "iron"); },
  steel_pickaxe(b) { pickaxe(b, "steel"); },
  raw_smelt(b) {
    // Slimmer and longer than a sardine, olive-backed.
    b.add(ellipsoid(0.17, 0.035, 0.045), { color: 0xa9b8a0, matrix: at(0, 0.045, 0) });
    b.add(ellipsoid(0.15, 0.012, 0.03), { color: 0x6f7f5a, matrix: at(0, 0.074, 0) });
    b.add(new THREE.ConeGeometry(0.045, 0.08, 4).rotateZ(Math.PI / 2), { color: 0x8a9a80, matrix: at(-0.2, 0.045, 0) });
  },
  bronze_dagger(b) {
    b.add(new THREE.CylinderGeometry(0.018, 0.018, 0.1, 6), { color: 0x4a3020, matrix: at(0, 0.05, 0) });
    b.add(new THREE.BoxGeometry(0.1, 0.02, 0.03), { color: BRONZE, matrix: at(0, 0.11, 0) });
    b.add(new THREE.ConeGeometry(0.03, 0.24, 4).scale(1, 1, 0.35), { color: 0xd09a5a, matrix: at(0, 0.24, 0) });
  },
  wooden_shield(b) {
    // Disc, rim and boss all face along x: the shield's front looks out from the arm it is strapped to.
    b.add(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 16), { color: 0x8a6034, matrix: at(0, 0, 0, 1, 0, 0, Math.PI / 2) });
    b.add(new THREE.TorusGeometry(0.22, 0.018, 6, 20), { color: IRON, matrix: at(0, 0, 0, 1, Math.PI / 2) });
    b.add(ellipsoid(0.05, 0.05, 0.03), { color: IRON, matrix: at(0.03, 0, 0, 1, Math.PI / 2) });
  },
  fishing_net(b) {
    b.add(new THREE.TorusGeometry(0.13, 0.012, 6, 16).rotateX(Math.PI / 2), { color: WOOD, matrix: at(0, 0.02, 0) });
    b.add(new THREE.SphereGeometry(0.13, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), { color: 0xd8cfb0, matrix: at(0, 0.02, 0, [1, 0.5, 1]) });
    b.add(new THREE.CylinderGeometry(0.012, 0.012, 1, 5), { color: WOOD, matrix: between(V(0.12, 0.02, 0), V(NET_GRIP, 0.05, 0)) });
  },
  tinderbox(b) {
    b.add(new THREE.BoxGeometry(0.16, 0.06, 0.1), { color: 0x6a4a2a, matrix: at(0, 0.03, 0) });
    b.add(new THREE.BoxGeometry(0.17, 0.02, 0.11), { color: 0x8a6a42, matrix: at(0, 0.065, 0) });
  },
  leather_cap(b) {
    b.add(new THREE.SphereGeometry(0.13, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), { color: LEATHER, matrix: at(0, 0, 0) });
    b.add(new THREE.CylinderGeometry(0.135, 0.14, 0.03, 12), { color: 0x5a3a20, matrix: at(0, 0.01, 0) });
  },
  leather_jerkin(b) {
    b.add(new THREE.CylinderGeometry(0.15, 0.12, 0.26, 8).scale(1, 1, 0.55), { color: LEATHER, matrix: at(0, 0.13, 0) });
    b.add(new THREE.BoxGeometry(0.02, 0.2, 0.01), { color: 0x4a2e18, matrix: at(0, 0.14, 0.075) });
  },
  leather_trousers(b) {
    for (const s of [1, -1]) b.add(new THREE.CylinderGeometry(0.05, 0.045, 0.3, 7), { color: 0x6a4428, matrix: at(s * 0.055, 0.15, 0) });
    b.add(new THREE.BoxGeometry(0.2, 0.07, 0.09), { color: 0x6a4428, matrix: at(0, 0.3, 0) });
  },
  leather_gloves(b) {
    for (const s of [1, -1]) b.add(ellipsoid(0.05, 0.03, 0.065), { color: 0x6a4428, matrix: at(s * 0.07, 0.03, 0) });
  },
  leather_boots(b) {
    for (const s of [1, -1]) {
      b.add(ellipsoid(0.045, 0.035, 0.08), { color: 0x4a3020, matrix: at(s * 0.06, 0.03, 0.03) });
      b.add(new THREE.CylinderGeometry(0.04, 0.042, 0.1, 8), { color: 0x4a3020, matrix: at(s * 0.06, 0.08, 0) });
    }
  },
  red_cape(b) {
    // Hangs from the shoulders to the calves, flaring toward the hem; the collar is at the top (y = CAPE_LENGTH).
    b.add(new THREE.CylinderGeometry(0.13, 0.24, CAPE_LENGTH, 12, 3, true, -Math.PI * 0.42, Math.PI * 0.84), { color: 0xa82020, matrix: at(0, CAPE_LENGTH / 2, 0) });
  },
  bread(b) {
    b.add(ellipsoid(0.14, 0.06, 0.08), { color: 0xc08a40, matrix: at(0, 0.05, 0) });
    for (const x of [-0.05, 0, 0.05]) b.add(new THREE.BoxGeometry(0.012, 0.01, 0.1), { color: 0xe8c078, matrix: at(x, 0.105, 0, 1, 0.3) });
  },
  amulet(b) {
    b.add(new THREE.TorusGeometry(0.12, 0.008, 5, 24).scale(1, 1.25, 1), { color: 0xc8a040, matrix: at(0, 0.15, 0) });
    b.add(ellipsoid(0.035, 0.045, 0.02), { color: 0xc8a040, matrix: at(0, 0, 0) });
  },
  ring(b) {
    b.add(new THREE.TorusGeometry(0.07, 0.018, 6, 20), { color: 0xc8a040, matrix: at(0, 0.07, 0) });
  },
  arrows(b) {
    for (const x of [-0.04, 0, 0.04]) {
      b.add(new THREE.CylinderGeometry(0.007, 0.007, 0.36, 4), { color: WOOD, matrix: at(x, 0.18, 0) });
      b.add(new THREE.ConeGeometry(0.018, 0.05, 4), { color: IRON, matrix: at(x, 0.38, 0) });
    }
  },
  bones(b) {
    // Two long bones crossed, each a shaft with a knuckle at either end, and a rib over them.
    for (const [turn, x, z] of [[0.5, 0, 0], [-0.42, 0.01, 0.03]] as const) {
      const long = 0.34;
      b.add(new THREE.CylinderGeometry(0.022, 0.022, long, 6).rotateZ(Math.PI / 2), { color: BONE, matrix: at(x, 0.035, z, 1, turn) });
      for (const end of [-1, 1]) {
        for (const spread of [-1, 1]) {
          b.add(ellipsoid(0.028, 0.026, 0.024, 6, 5), {
            color: BONE_PALE, matrix: at(x + Math.cos(turn) * end * long * 0.5, 0.035, z - Math.sin(turn) * end * long * 0.5 + spread * 0.018, 1, turn),
          });
        }
      }
    }
    b.add(new THREE.TorusGeometry(0.09, 0.013, 5, 12, Math.PI * 1.1), { color: BONE_PALE, matrix: at(-0.02, 0.055, -0.02, 1, 0.9, 1.3) });
  },
  bronze_sword(b) { blade(b, BRONZE, 0xd6a066, 0.34, 0.036); },
  iron_sword(b) { blade(b, 0x8d939b, 0xc2c8d0, 0.36, 0.038); },
  iron_dagger(b) { blade(b, 0x9aa0a8, 0xcdd3da, 0.2, 0.028); },
  bronze_mace(b) {
    handle(b, 0.36);
    // A head of two cones base to base: a squat diamond with a clear silhouette at icon size.
    b.add(new THREE.ConeGeometry(0.075, 0.11, 6), { color: BRONZE, matrix: at(0, 0.33, 0) });
    b.add(new THREE.ConeGeometry(0.075, 0.09, 6), { color: 0x8a5a2a, matrix: at(0, 0.275, 0, 1, 0, Math.PI) });
    b.add(new THREE.CylinderGeometry(0.022, 0.022, 0.04, 6), { color: 0x6a4420, matrix: at(0, 0.24, 0) });
  },
  bronze_helm(b) { helm(b, BRONZE, 0x8a5a2a); },
  iron_helm(b) { helm(b, 0x7c7c82, 0x55555a); },
  bronze_shield(b) {
    // A kite: square shoulders narrowing to a point, faced along x like the wooden one so it looks out
    // from the arm it is strapped to. The cross on the face is what tells it from a plank.
    const thick = 0.035, wide = 0.3, tall = 0.26;
    b.add(new THREE.BoxGeometry(thick, tall, wide), { color: BRONZE, matrix: at(0, 0.07, 0) });
    // The point: a four-sided pyramid turned to stand on its tip under the square shoulders.
    b.add(new THREE.ConeGeometry(wide * 0.708, 0.22, 4).rotateY(Math.PI / 4), {
      color: BRONZE, matrix: at(0, -0.17, 0, [thick / (wide * 1.001), 1, 1], 0, Math.PI),
    });
    // A cross on the face, which is what tells a kite shield from a plank.
    b.add(new THREE.BoxGeometry(thick * 1.1, tall * 1.02, wide * 0.1), { color: 0x6a4420, matrix: at(0, 0.07, 0) });
    b.add(new THREE.BoxGeometry(thick * 1.1, tall * 0.1, wide * 1.02), { color: 0x6a4420, matrix: at(0, 0.07, 0) });
  },
  raw_beef(b) {
    b.add(ellipsoid(0.13, 0.05, 0.1, 8, 6), { color: 0xa83a38, matrix: at(0, 0.05, 0) });
    b.add(ellipsoid(0.1, 0.02, 0.075, 7, 5), { color: 0xc45a54, matrix: at(0.01, 0.085, 0.005) });
    b.add(ellipsoid(0.05, 0.02, 0.04, 6, 4), { color: 0xe8d8c0, matrix: at(-0.07, 0.07, 0.03) });
  },
  raw_fowl(b) {
    const flesh = 0xe6bfb4, pale = 0xf0d4cb;
    b.add(ellipsoid(0.1, 0.08, 0.125, 7, 5), { color: flesh, matrix: at(0, 0.08, 0) });
    b.add(ellipsoid(0.07, 0.05, 0.07, 6, 5), { color: pale, matrix: at(0, 0.115, 0.04) });
    // Two legs sticking up off the back, as a plucked bird is trussed.
    for (const s of [1, -1]) {
      b.add(new THREE.CylinderGeometry(0.016, 0.026, 0.1, 5), { color: flesh, matrix: at(s * 0.045, 0.14, -0.05, 1, 0, 0, s * 0.45) });
      b.add(new THREE.CylinderGeometry(0.008, 0.012, 0.05, 4), { color: pale, matrix: at(s * 0.072, 0.19, -0.05, 1, 0, 0, s * 0.5) });
    }
  },
  cowhide(b) { pelt(b, 0xd9d2c4, 0x4a3b2c); },
  wolf_pelt(b) { pelt(b, 0x6b6a64, 0x2f2d2a); },
  feather(b) {
    // A dark quill up the middle with pale barbs stepping off it, which is what reads as a feather.
    // A dark quill running corner to corner, with pale barbs swept back off it toward the tip, so the
    // outline is a blade rather than the teeth of a comb.
    const lean = 0.5, span = 0.34;
    b.add(new THREE.CylinderGeometry(0.003, 0.009, span, 4), { color: 0x1c4a26, matrix: at(0, 0.02, 0, 1, 0, 0, Math.PI / 2 - lean) });
    for (let i = 0; i < 16; i++) {
      const t = i / 15, along = (t - 0.5) * span * 0.92;
      // Widest a third of the way up, tapering to nothing at both ends.
      const width = 0.075 * Math.sin(Math.min(1, t * 1.25) * Math.PI) ** 0.7;
      const x = Math.cos(lean) * along, y = 0.022 + Math.sin(lean) * along;
      for (const side of [1, -1]) {
        b.add(new THREE.BoxGeometry(width, 0.005, 0.03), {
          color: side > 0 ? 0xf4f1e8 : 0xe4e0d4,
          matrix: at(x + Math.cos(lean - side * 1.1) * width * 0.5, y + Math.sin(lean - side * 1.1) * width * 0.5, 0, 1, 0, 0, lean - side * 1.1),
        });
      }
    }
  },
  spider_silk(b) {
    // A loose hank: three loops of thread wound round each other.
    for (const [y, r, turn] of [[0.04, 0.11, 0.2], [0.05, 0.095, 1.1], [0.055, 0.08, 2.1]] as const) {
      b.add(new THREE.TorusGeometry(r, 0.014, 5, 12), { color: 0xe4e0d2, matrix: at(0, y, 0, [1, 1, 0.5], turn, Math.PI / 2 - 0.35) });
    }
  },
};

function logPile(b: MeshBuilder, bark: number, end: number): void {
  const logs: Array<[number, number]> = [[-0.06, 0.05], [0.06, 0.05], [0, 0.14]];
  for (const [x, y] of logs) {
    b.add(new THREE.CylinderGeometry(0.055, 0.055, 0.42, 8).rotateX(Math.PI / 2), { color: bark, matrix: at(x, y, 0) });
    for (const z of [-0.211, 0.211]) b.add(new THREE.CircleGeometry(0.05, 8), { color: end, matrix: at(x, y, z, 1, z > 0 ? 0 : Math.PI) });
  }
}

function ore(b: MeshBuilder, fleck: number): void {
  b.add(new THREE.DodecahedronGeometry(0.12, 0), { color: 0x6e6a64, matrix: at(0, 0.09, 0), jitter: 0.04, shade: 0.12, seed: fleck });
  for (const [x, y, z] of [[0.07, 0.13, 0.05], [-0.06, 0.1, 0.08], [0.02, 0.18, -0.05]] as const) {
    b.add(ellipsoid(0.035, 0.025, 0.03, 6, 4), { color: fleck, matrix: at(x, y, z) });
  }
}

function handle(b: MeshBuilder, length: number): void {
  b.add(new THREE.CylinderGeometry(0.018, 0.022, length, 6), { color: WOOD, matrix: at(0, length / 2 - 0.08, 0) });
}

function axe(b: MeshBuilder, metal: keyof typeof HEADS): void {
  handle(b, 0.5);
  b.add(new THREE.BoxGeometry(0.03, 0.12, 0.14), { color: HEADS[metal][0], matrix: at(0, 0.44, 0.06) });
}

/**
 * A straight blade over a crossguard and a bound grip, pointing up +y from the hand. The brass guard
 * and pommel are what make it read as a sword at the size of an inventory square: without them a
 * blade is a grey sliver.
 */
function blade(b: MeshBuilder, metal: number, edge: number, length: number, width: number): void {
  b.add(new THREE.CylinderGeometry(0.016, 0.018, 0.085, 6), { color: 0x4a3020, matrix: at(0, 0.055, 0) });
  b.add(new THREE.BoxGeometry(0.042, 0.03, 0.034), { color: BRASS, matrix: at(0, 0.008, 0) });
  b.add(new THREE.BoxGeometry(width * 3.2, 0.026, 0.036), { color: BRASS, matrix: at(0, 0.108, 0) });
  // The blade: a flat four-sided taper running most of the length, then a point.
  b.add(new THREE.CylinderGeometry(width * 0.62, width, length, 4).rotateY(Math.PI / 4).scale(1, 1, 0.3), {
    color: metal, matrix: at(0, 0.125 + length / 2, 0),
  });
  b.add(new THREE.ConeGeometry(width * 0.62, width * 2.6, 4).rotateY(Math.PI / 4).scale(1, 1, 0.3), {
    color: metal, matrix: at(0, 0.125 + length + width * 1.3, 0),
  });
  // A lighter edge down one face, so the blade is not one flat colour.
  b.add(new THREE.BoxGeometry(width * 0.3, length * 0.92, 0.008), { color: edge, matrix: at(width * 0.42, 0.125 + length / 2, 0.012) });
}

/**
 * A helm: a dome with a band round it and a dark slot cut for the eyes, which is the part that says
 * "helmet" rather than "bowl" when the whole thing is thirty pixels across.
 */
function helm(b: MeshBuilder, metal: number, dark: number): void {
  b.add(new THREE.SphereGeometry(0.135, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.62), { color: metal, matrix: at(0, 0.035, 0) });
  b.add(new THREE.CylinderGeometry(0.138, 0.142, 0.045, 8), { color: dark, matrix: at(0, 0.025, 0) });
  b.add(new THREE.CylinderGeometry(0.145, 0.145, 0.022, 8), { color: 0x9a2020, matrix: at(0, 0.075, 0) });
  // The eye slot, and the nose bar that splits it.
  b.add(new THREE.BoxGeometry(0.15, 0.042, 0.03), { color: 0x181410, matrix: at(0, 0.035, 0.115) });
  b.add(new THREE.BoxGeometry(0.026, 0.085, 0.03), { color: metal, matrix: at(0, 0.02, 0.125) });
}

/** A folded skin: a rough square of hide with a darker underside showing at the fold. */
function pelt(b: MeshBuilder, outer: number, inner: number): void {
  b.add(new THREE.BoxGeometry(0.26, 0.03, 0.2), { color: outer, matrix: at(0, 0.025, 0, 1, 0.2) });
  b.add(new THREE.BoxGeometry(0.24, 0.028, 0.11), { color: inner, matrix: at(0.01, 0.055, -0.04, 1, -0.12) });
  b.add(new THREE.BoxGeometry(0.2, 0.026, 0.08), { color: outer, matrix: at(-0.01, 0.082, 0.02, 1, 0.34) });
}

/** Each half of the head tapers to a point and curves down a little, either side of a collar. */
function pickaxe(b: MeshBuilder, metal: keyof typeof HEADS): void {
  handle(b, 0.52);
  for (const s of [1, -1]) {
    b.add(new THREE.CylinderGeometry(0.012, 0.034, 0.22, 6), { color: HEADS[metal][0], matrix: at(0, 0.45, s * 0.1, 1, 0, s * (Math.PI / 2 + 0.28)) });
  }
  b.add(new THREE.BoxGeometry(0.05, 0.06, 0.05), { color: HEADS[metal][1], matrix: at(0, 0.46, 0) });
}

const models = new Map<string, THREE.BufferGeometry>();

/** A model by its key (vertex coloured), built once. Unknown keys become a small sack. */
function modelGeometry(key: string): THREE.BufferGeometry {
  let g = models.get(key);
  if (!g) {
    const b = new MeshBuilder();
    const make = MODELS[key];
    if (make) make(b);
    else b.add(ellipsoid(0.1, 0.09, 0.1), { color: 0x9a8a60, matrix: at(0, 0.09, 0) });
    g = b.build();
    g.computeBoundingBox();
    models.set(key, g);
  }
  return g;
}

/** The item's model, as held or worn. */
export function itemGeometry(id: number): THREE.BufferGeometry {
  return modelGeometry(ITEM_BY_ID.get(id)?.key ?? "");
}

/** Taller than it is long: a tool or a garment, which lies on its side on the ground. */
function isTall(g: THREE.BufferGeometry): boolean {
  const size = g.boundingBox!.getSize(new THREE.Vector3());
  return size.y > 0.8 * Math.max(size.x, size.z);
}

const grounded = new Map<number, THREE.BufferGeometry>();

/** The item as it lies on the ground: tall things laid down, centred on the origin, resting on y = 0. */
export function groundGeometry(id: number): THREE.BufferGeometry {
  let g = grounded.get(id);
  if (!g) {
    g = itemGeometry(id).clone();
    if (isTall(g)) g.rotateX(-Math.PI / 2);
    g.computeBoundingBox();
    const box = g.boundingBox!, centre = box.getCenter(new THREE.Vector3());
    g.translate(-centre.x, -box.min.y, -centre.z);
    g.computeBoundingSphere();
    grounded.set(id, g);
  }
  return g;
}

/**
 * How an item sits in the hand when that isn't simply its model: the grip at the origin and the shaft
 * up +y. A net is held by the end of its handle, with the hoop flat across the shaft and the bag below it.
 */
const HELD: Record<string, THREE.Matrix4> = {
  fishing_net: new THREE.Matrix4().set(0, 0, 1, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 0, 1).multiply(new THREE.Matrix4().makeTranslation(-NET_GRIP, -0.05, 0)),
};
const held = new Map<number, THREE.BufferGeometry>();

/** The item as a hand holds it (for tools used from the inventory as well as wielded weapons). */
export function heldGeometry(id: number): THREE.BufferGeometry {
  let g = held.get(id);
  if (!g) {
    const pose = HELD[ITEM_BY_ID.get(id)?.key ?? ""];
    g = pose ? itemGeometry(id).clone().applyMatrix4(pose) : itemGeometry(id);
    g.computeBoundingSphere();
    held.set(id, g);
  }
  return g;
}

export const itemMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });

// Icons: each model drawn once from a three-quarter view into a small transparent picture.
let iconRenderer: THREE.WebGLRenderer | null = null;
const iconScene = new THREE.Scene();
const iconCamera = new THREE.PerspectiveCamera(30, 36 / 32, 0.01, 10);
const icons = new Map<string, string>();
const silhouetteMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, side: THREE.DoubleSide });

/**
 * The rendered picture with a dark rim around its shape, like the classic item pictures: every clear
 * pixel within two pixels of the item (one pixel once shown at half size) turns near-black.
 */
function outlined(source: HTMLCanvasElement): string {
  const w = source.width, h = source.height;
  const canvas = Object.assign(document.createElement("canvas"), { width: w, height: h });
  const g = canvas.getContext("2d")!;
  g.drawImage(source, 0, 0);
  const img = g.getImageData(0, 0, w, h), d = img.data, out = new Uint8ClampedArray(d);
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3]! > 100;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3]! > 100) continue;
      let near = false;
      for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2 && !near; dx++) near = Math.abs(dx) + Math.abs(dy) <= 3 && solid(x + dx, y + dy);
      if (near) out.set([14, 10, 6, 255], i);
    }
  }
  img.data.set(out);
  g.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png");
}

/**
 * How a model turns for its picture: `y` then `x` (radians) bring its broad face round to the viewer,
 * and `lean` tips a long tool corner to corner, which is how it fills a square slot best.
 */
interface IconPose {
  x?: number;
  y?: number;
  lean?: boolean;
}
const ICON_POSES: Record<string, IconPose> = {
  bronze_axe: { y: Math.PI / 2, lean: true },
  iron_axe: { y: Math.PI / 2, lean: true },
  steel_axe: { y: Math.PI / 2, lean: true },
  bronze_pickaxe: { y: Math.PI / 2, lean: true },
  iron_pickaxe: { y: Math.PI / 2, lean: true },
  steel_pickaxe: { y: Math.PI / 2, lean: true },
  bronze_dagger: { lean: true },
  wooden_shield: { y: -1.2 },
  fishing_net: { x: 0.9 },
  arrows: { lean: true },
};

function renderIcon(geometry: THREE.BufferGeometry, material: THREE.Material, rim: boolean, pose: IconPose = {}): string {
  if (!iconRenderer) {
    iconRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    iconRenderer.setSize(72, 64, false);
    iconScene.add(new THREE.HemisphereLight(0xffffff, 0x554433, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(-1, 2, 2);
    iconScene.add(sun);
  }
  const turned = new THREE.Mesh(geometry, material);
  turned.rotation.set(pose.x ?? 0, pose.y ?? 0, 0, "YXZ");
  const mesh = new THREE.Group().add(turned);
  if (pose.lean) mesh.rotation.z = -Math.PI / 4;
  mesh.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(mesh), size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z) * 0.54;
  iconCamera.position.set(centre.x + radius * 1.6, centre.y + radius * 1.5, centre.z + radius * 2.6);
  iconCamera.lookAt(centre);
  iconScene.add(mesh);
  iconRenderer.render(iconScene, iconCamera);
  iconScene.remove(mesh);
  return rim ? outlined(iconRenderer.domElement) : iconRenderer.domElement.toDataURL("image/png");
}

/** The item's inventory picture, as a PNG data URL (drawn once). */
export function itemIcon(id: number): string {
  const key = `item:${id}`;
  let url = icons.get(key);
  if (!url) {
    url = renderIcon(itemGeometry(id), itemMaterial, true, ICON_POSES[ITEM_BY_ID.get(id)?.key ?? ""]);
    icons.set(key, url);
  }
  return url;
}

/** What each empty equipment slot shows a faint outline of. */
const SLOT_OUTLINE: Record<EquipSlot, string> = {
  head: "leather_cap", cape: "red_cape", neck: "amulet", weapon: "bronze_dagger", body: "leather_jerkin", shield: "wooden_shield",
  legs: "leather_trousers", hands: "leather_gloves", feet: "leather_boots", ring: "ring", ammo: "arrows",
};

/** The dark outline an empty equipment slot shows, as a PNG data URL. */
export function slotOutline(slot: EquipSlot): string {
  const key = `slot:${slot}`;
  let url = icons.get(key);
  if (!url) {
    url = renderIcon(modelGeometry(SLOT_OUTLINE[slot]), silhouetteMaterial, false, ICON_POSES[SLOT_OUTLINE[slot]]);
    icons.set(key, url);
  }
  return url;
}
