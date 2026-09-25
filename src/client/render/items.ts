import * as THREE from "three";
import { ITEM_BY_ID, type EquipSlot } from "../../shared/items.ts";
import { GEMS } from "../../shared/gems.ts";
import { ENCHANTED } from "../../shared/enchant.ts";
import { at, between, ellipsoid, MeshBuilder } from "./meshkit.ts";

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const BRONZE = 0xb0763a, WOOD = 0x7a5230, LEATHER = 0x7a5230, IRON = 0x6f6f72;
const BONE = 0xe6e2d8, BONE_PALE = 0xf4f2ec;
/** Brass for a crossguard and pommel, which is what makes a sword read as a sword at icon size. */
const BRASS = 0xd8c040;
/** Tool heads by metal: the blade or point, then the collar that holds it on the shaft. */
const HEADS = {
  bronze: [BRONZE, 0x8a5a2a], iron: [0x7c7c82, 0x55555a], steel: [0xb3bac3, 0x80868e],
  coldiron: [0x8aa2bd, 0x5c7186], emberite: [0xc4502a, 0x7a2c16], starfall: [0xc8bce8, 0x8a7ab0],
} as const;

/**
 * The six metals of PLAN §8.3, each as the four colours everything made of it is drawn from: the metal
 * itself, the light it catches along an edge, its shadow, and the trim on a shield. Bronze, iron and
 * steel keep the exact colours their own models were tuned with; the three above them are new.
 */
const METALS: Record<string, { metal: number; edge: number; dark: number; trim: number }> = {
  bronze: { metal: BRONZE, edge: 0xd6a066, dark: 0x8a5a2a, trim: 0x6a4420 },
  iron: { metal: 0x8d939b, edge: 0xc2c8d0, dark: 0x55555a, trim: 0x44444a },
  steel: { metal: 0xb3bac3, edge: 0xe2e7ee, dark: 0x80868e, trim: 0x5e646c },
  coldiron: { metal: 0x8aa2bd, edge: 0xcfe2f4, dark: 0x5c7186, trim: 0x3f5266 },
  emberite: { metal: 0xc4502a, edge: 0xffa050, dark: 0x7a2c16, trim: 0x5a1e0e },
  starfall: { metal: 0xc8bce8, edge: 0xf2ecff, dark: 0x8a7ab0, trim: 0x6a5c90 },
};
/** How long a blade of each metal is drawn, so a better sword reads as better on sight. */
const BLADE_LENGTH: Record<string, [sword: number, dagger: number]> = {
  bronze: [0.34, 0.18], iron: [0.36, 0.2], steel: [0.39, 0.22],
  coldiron: [0.41, 0.235], emberite: [0.43, 0.25], starfall: [0.45, 0.265],
};
/** A cape's length from collar to hem. */
export const CAPE_LENGTH = 0.84;
/** Where a net's handle ends, which is where the hand holds it. */
const NET_GRIP = 0.62;
/** Where a creel's rope ends: the basket hangs this far below the hand. */
const CREEL_GRIP = 0.6;

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
  // The rest of the woodcutting ladder: the same pile in each wood's bark, and its own cut face.
  alder_logs(b) { logPile(b, 0x7a6a5a, 0xd8cfc0); },
  rowan_logs(b) { logPile(b, 0x9a7a5a, 0xd8a88a); },
  blackthorn_logs(b) { logPile(b, 0x3a2f2a, 0xa89478); },
  ironbark_logs(b) { logPile(b, 0x8d8c86, 0xc8c4b8); },
  sable_logs(b) { logPile(b, 0x2e2a26, 0x8a7f72); },
  heartoak_logs(b) { logPile(b, 0x8a5a2e, 0xe0b878); },
  copper_ore(b) { ore(b, 0xc47a44); },
  tin_ore(b) { ore(b, 0xc8c8c0); },
  iron_ore(b) { ore(b, 0x9a4a2c); },
  // The one thing off a rock that isn't ore held in stone: three black lumps, and nothing else.
  coal(b) {
    for (const [x, y, z, r] of [[0, 0.075, 0, 0.1], [0.1, 0.05, 0.06, 0.07], [-0.07, 0.045, -0.07, 0.06]] as const) {
      b.add(new THREE.DodecahedronGeometry(r, 0), { color: 0x2a2a2e, matrix: at(x, y, z), jitter: 0.03, shade: 0.3, seed: r * 100 });
    }
  },
  silver_ore(b) { ore(b, 0xd8dce4); },
  coldiron_ore(b) { ore(b, 0x8aa2bd); },
  gold_ore(b) { ore(b, 0xe0b83a); },
  emberite_ore(b) { ore(b, 0xd8542a); },
  starfall_ore(b) { ore(b, 0xa88ce8); },
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
  // The rest of the fishing ladder. Each one is told by a single feature at icon size: the redfin by
  // its fin, the grayling by its sail, the blackfish by its bulk, the hoarfish by its forked tail.
  raw_redfin(b) {
    fish(b, { length: 0.17, depth: 0.05, wide: 0.055, body: 0xb0a48c, back: 0x7a6a50 });
    b.add(new THREE.ConeGeometry(0.05, 0.1, 3).rotateX(Math.PI / 2).scale(1, 1, 0.3), { color: 0xc03a2a, matrix: at(0.01, 0.1, 0) });
  },
  raw_grayling(b) {
    fish(b, { length: 0.19, depth: 0.05, wide: 0.05, body: 0xb8c0c8, back: 0x70808e });
    // The sail: a tall dorsal fin, which is the whole of what tells a grayling from any other fish.
    b.add(new THREE.ConeGeometry(0.09, 0.12, 3).rotateX(Math.PI / 2).scale(1, 1, 0.22), { color: 0x8a7fa8, matrix: at(0.01, 0.11, 0) });
  },
  raw_blackfish(b) {
    // Deep-bodied and heavy, not a slim river fish.
    fish(b, { length: 0.2, depth: 0.085, wide: 0.075, body: 0x3a4248, back: 0x22282c, tail: 0.11 });
    b.add(ellipsoid(0.06, 0.03, 0.02), { color: 0x8a9298, matrix: at(0.1, 0.075, 0.05) });
  },
  raw_hoarfish(b) {
    fish(b, { length: 0.21, depth: 0.055, wide: 0.055, body: 0xdfe6ec, back: 0xa8bcc8, tail: 0 });
    // A forked tail, two blades off the same root.
    for (const s of [1, -1]) {
      b.add(new THREE.ConeGeometry(0.045, 0.1, 3).rotateZ(Math.PI / 2 + s * 0.5).scale(1, 1, 0.3), { color: 0xbcccd8, matrix: at(-0.25, 0.055 + s * 0.035, 0) });
    }
  },
  raw_bay_crab(b) { crab(b, { shell: 0xb8543a, pale: 0xd8a068, span: 0.13, claw: 0.05, arm: 0.09 }); },
  // The same creature grown long in cold water: a small body carried on much longer arms.
  raw_deepclaw(b) { crab(b, { shell: 0x6a5a78, pale: 0xa892b8, span: 0.1, claw: 0.055, arm: 0.17 }); },
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
  /**
   * A rod: a long shaft tapering to nothing, a bound grip at the bottom, and a line off the tip to a
   * hook. The line is what tells it from a stick, so it is drawn even at icon size.
   */
  fishing_rod(b) {
    b.add(new THREE.CylinderGeometry(0.004, 0.017, 0.84, 6), { color: 0x7a5228, matrix: at(0, 0.36, 0) });
    b.add(new THREE.CylinderGeometry(0.023, 0.025, 0.14, 6), { color: 0x3a2a1c, matrix: at(0, 0.02, 0) });
    b.add(new THREE.CylinderGeometry(0.004, 0.004, 0.035, 6), { color: BRASS, matrix: at(0, 0.62, 0) });
    // `between` stretches a UNIT-height part, so the line is built 1 tall and shrunk to its own span.
    b.add(new THREE.CylinderGeometry(0.0022, 0.0022, 1, 4), { color: 0xeae6da, matrix: between(V(0, 0.75, 0), V(0.11, 0.48, 0)) });
    b.add(new THREE.TorusGeometry(0.016, 0.005, 4, 10, Math.PI * 1.45), { color: IRON, matrix: at(0.115, 0.455, 0, 1, Math.PI / 2, 0, 0.6) });
  },
  /**
   * A creel: a woven basket narrowing to a mouth, banded round, on a rope. It hangs below the hand,
   * which is what `HELD` does with it.
   */
  creel(b) {
    b.add(new THREE.CylinderGeometry(0.1, 0.14, 0.2, 10), { color: 0xc8a066, matrix: at(0, 0.1, 0) });
    for (const y of [0.03, 0.1, 0.17]) b.add(new THREE.TorusGeometry(0.128 - (y - 0.03) * 0.2, 0.011, 5, 12).rotateX(Math.PI / 2), { color: 0x8a6a36, matrix: at(0, y, 0) });
    b.add(new THREE.CylinderGeometry(0.06, 0.1, 0.05, 10), { color: 0x9a7a44, matrix: at(0, 0.215, 0) });
    b.add(new THREE.CylinderGeometry(0.008, 0.008, 1, 4), { color: 0xbcae90, matrix: between(V(0, 0.23, 0), V(0, CREEL_GRIP, 0)) });
  },
  /** A harpoon: a long shaft, a collar, and a barbed head — the barbs are what make it read at all. */
  harpoon(b) {
    b.add(new THREE.CylinderGeometry(0.019, 0.023, 0.68, 6), { color: 0x6a4a2a, matrix: at(0, 0.28, 0) });
    b.add(new THREE.CylinderGeometry(0.028, 0.028, 0.05, 6), { color: 0x55555a, matrix: at(0, 0.63, 0) });
    b.add(new THREE.ConeGeometry(0.032, 0.2, 4).rotateY(Math.PI / 4), { color: 0x9aa0a8, matrix: at(0, 0.75, 0) });
    for (const s of [1, -1]) {
      b.add(new THREE.ConeGeometry(0.018, 0.09, 3), { color: 0x9aa0a8, matrix: at(s * 0.035, 0.7, 0, 1, 0, 0, s * 2.4) });
    }
  },
  /** Bait: a handful of chopped scraps, loose in the hand. */
  bait(b) {
    for (const [x, y, z] of [[0, 0.03, 0], [0.06, 0.025, 0.04], [-0.05, 0.022, 0.05], [0.02, 0.05, -0.04], [-0.04, 0.02, -0.05]] as const) {
      b.add(ellipsoid(0.04, 0.018, 0.028, 6, 4), { color: 0x9a6a58, matrix: at(x, y, z, 1, x * 20 + z * 8) });
    }
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
  // Longer and paler than the iron one, so the best blade in the game reads as the best on sight.
  steel_sword(b) { blade(b, 0xb3bac3, 0xe2e7ee, 0.39, 0.041); },
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

/**
 * A fish lying on its side: a body, a darker back over it, and a tail. Every one up the ladder is this
 * shape in its own colours and proportions, with one feature of its own added on top.
 */
function fish(b: MeshBuilder, f: { length: number; depth: number; wide: number; body: number; back: number; tail?: number }): void {
  const y = f.depth + 0.005;
  b.add(ellipsoid(f.length, f.depth, f.wide), { color: f.body, matrix: at(0, y, 0) });
  b.add(ellipsoid(f.length * 0.88, f.depth * 0.3, f.wide * 0.6), { color: f.back, matrix: at(0, y + f.depth * 0.68, 0) });
  const tail = f.tail ?? 0.09;
  if (tail > 0) b.add(new THREE.ConeGeometry(f.depth, tail, 4).rotateZ(Math.PI / 2), { color: f.back, matrix: at(-f.length - tail * 0.35, y, 0) });
  b.add(ellipsoid(0.012, 0.012, 0.008), { color: 0x22201c, matrix: at(f.length * 0.7, y + f.depth * 0.35, f.wide * 0.6) });
}

/** A crab: a low shell, two claws out in front on their arms, and legs down each side. */
function crab(b: MeshBuilder, c: { shell: number; pale: number; span: number; claw: number; arm: number }): void {
  b.add(ellipsoid(c.span, c.span * 0.42, c.span * 0.8), { color: c.shell, matrix: at(0, c.span * 0.4, 0) });
  b.add(ellipsoid(c.span * 0.7, c.span * 0.12, c.span * 0.5), { color: c.pale, matrix: at(0, c.span * 0.72, 0) });
  for (const s of [1, -1]) {
    // The claws: an arm out at an angle and a pincer on the end of it, opened a little.
    const tip = V(c.span * 0.55 + c.arm, c.span * 0.4, s * (c.span * 0.5 + c.arm * 0.55));
    b.add(new THREE.CylinderGeometry(c.claw * 0.3, c.claw * 0.4, 1, 5), { color: c.shell, matrix: between(V(c.span * 0.5, c.span * 0.4, s * c.span * 0.4), tip) });
    for (const half of [1, -1]) {
      b.add(ellipsoid(c.claw, c.claw * 0.45, c.claw * 0.34, 7, 5), { color: c.pale, matrix: at(tip.x + c.claw * 0.6, tip.y + half * c.claw * 0.3, tip.z, 1, s * 0.5, 0, half * 0.35) });
    }
    for (let k = 0; k < 3; k++) {
      const from = V(-c.span * 0.15 - k * c.span * 0.3, c.span * 0.3, s * c.span * 0.55);
      b.add(new THREE.CylinderGeometry(0.008, 0.012, 1, 4), { color: c.shell, matrix: between(from, V(from.x - c.span * 0.2, 0.01, s * (c.span * 0.75 + c.arm * 0.4))) });
    }
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

/**
 * Phase 8's items, built from the same generators the earlier tiers use. The bronze, iron and steel
 * pieces that already existed are NOT rebuilt here — they keep the models they were tuned with, and
 * this only fills in what the metal ladder and the workbenches added.
 */
function addPhase8Models(): void {
  const add = (key: string, make: (b: MeshBuilder) => void) => {
    if (!MODELS[key]) MODELS[key] = make;
  };
  // Bars: a cast ingot, wider at the bottom than the top, in its metal's colour.
  const bars: Array<[string, number, number]> = [
    ["bronze_bar", BRONZE, 0x8a5a2a], ["iron_bar", 0x8d939b, 0x5f656d], ["steel_bar", 0xb3bac3, 0x80868e],
    ["coldiron_bar", 0x8aa2bd, 0x5c7186], ["emberite_bar", 0xc4502a, 0x7a2c16], ["starfall_bar", 0xc8bce8, 0x8a7ab0],
    ["silver_bar", 0xd8dce4, 0x9aa0aa], ["gold_bar", 0xe0b83a, 0xa88420],
  ];
  for (const [key, metal, dark] of bars) add(key, (b) => ingot(b, metal, dark));

  // The rest of every metal's rungs. Each shape is the one its bronze version uses.
  for (const [name, c] of Object.entries(METALS)) {
    const [swordLen, daggerLen] = BLADE_LENGTH[name]!;
    add(`${name}_axe`, (b) => axe(b, name as keyof typeof HEADS));
    add(`${name}_pickaxe`, (b) => pickaxe(b, name as keyof typeof HEADS));
    add(`${name}_sword`, (b) => blade(b, c.metal, c.edge, swordLen, 0.036 + swordLen * 0.012));
    add(`${name}_dagger`, (b) => blade(b, c.metal, c.edge, daggerLen, 0.026 + daggerLen * 0.01));
    add(`${name}_mace`, (b) => mace(b, c.metal, c.dark));
    add(`${name}_helm`, (b) => helm(b, c.metal, c.dark));
    add(`${name}_shield`, (b) => kite(b, c.metal, c.trim));
    add(`${name}_arrowheads`, (b) => arrowheads(b, c.metal, c.dark));
    add(`${name}_arrow`, (b) => arrowsOf(b, c.metal, c.dark));
  }

  // Cooking: the same creature, browned and crisped at the edges.
  const cooked: Array<[string, string]> = [
    ["sardine", "raw_sardine"], ["smelt", "raw_smelt"], ["redfin", "raw_redfin"], ["grayling", "raw_grayling"],
    ["bay_crab", "raw_bay_crab"], ["blackfish", "raw_blackfish"], ["deepclaw", "raw_deepclaw"], ["hoarfish", "raw_hoarfish"],
  ];
  for (const [done, raw] of cooked) add(done, (b) => browned(b, MODELS[raw]!));
  add("cooked_beef", (b) => cut(b, 0x8a4a2a, 0xc47a4a));
  add("cooked_fowl", (b) => cut(b, 0xb07a3a, 0xd8a868));
  add("burnt_fish", (b) => browned(b, MODELS.raw_sardine!, 0x2a2420));
  add("burnt_meat", (b) => cut(b, 0x2a2420, 0x443c34));

  // The workbench tools, and what a leatherworker uses.
  add("hammer", (b) => {
    handle(b, 0.34);
    b.add(new THREE.BoxGeometry(0.16, 0.06, 0.06), { color: 0x5f656d, matrix: at(0, 0.3, 0) });
    b.add(new THREE.BoxGeometry(0.05, 0.07, 0.07), { color: 0x44484e, matrix: at(0.08, 0.3, 0) });
  });
  add("needle", (b) => {
    b.add(new THREE.CylinderGeometry(0.004, 0.009, 0.22, 5), { color: 0xc9ced6, matrix: at(0, 0.11, 0) });
    b.add(new THREE.TorusGeometry(0.012, 0.004, 4, 8), { color: 0xc9ced6, matrix: at(0, 0.215, 0, 1, 0, Math.PI / 2) });
  });
  add("thread", (b) => {
    b.add(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 10), { color: 0xd8c8a0, matrix: at(0, 0.05, 0) });
    for (const y of [0.012, 0.088]) b.add(new THREE.CylinderGeometry(0.062, 0.062, 0.016, 10), { color: 0x8a7a58, matrix: at(0, y, 0) });
  });
  add("leather", (b) => pelt(b, 0x8a5e34, 0xa87a4a));

  // Crafting's jewellery, and fletching's shafts, string and bows.
  add("silver_ring", (b) => ringOf(b, 0xd8dce4));
  add("gold_ring", (b) => ringOf(b, 0xe0b83a));
  add("gold_amulet", (b) => MODELS.amulet!(b));
  add("arrow_shafts", (b) => {
    for (let i = 0; i < 5; i++) {
      b.add(new THREE.CylinderGeometry(0.008, 0.008, 0.26, 5), {
        color: 0xc0a070, matrix: at(-0.05 + i * 0.025, 0.02, (i % 2) * 0.02 - 0.01, 1, 0, 0, Math.PI / 2),
      });
    }
  });
  add("bow_string", (b) => {
    b.add(new THREE.TorusGeometry(0.08, 0.012, 5, 14), { color: 0xd8d0b8, matrix: at(0, 0.014, 0, [1, 1, 0.3], 0, Math.PI / 2) });
    b.add(new THREE.TorusGeometry(0.06, 0.01, 5, 14), { color: 0xc4bca0, matrix: at(0.01, 0.03, 0, [1, 1, 0.3], 0.4, Math.PI / 2) });
  });
  for (const [key, wood, length, strung] of [
    ["unstrung_shortbow", 0xa8764a, 0.34, false], ["unstrung_longbow", 0xa8764a, 0.46, false],
    ["unstrung_oak_shortbow", 0x8a5e34, 0.34, false], ["unstrung_oak_longbow", 0x8a5e34, 0.46, false],
    ["shortbow", 0xa8764a, 0.34, true], ["longbow", 0xa8764a, 0.46, true],
    ["oak_shortbow", 0x8a5e34, 0.34, true], ["oak_longbow", 0x8a5e34, 0.46, true],
  ] as const) {
    add(key, (b) => bow(b, wood, length, strung));
  }

  // Magic (Phase 11): the staves, held a third of the way up so the head stands well over the hand,
  // and the mage's wool in its blue. The runes and the elemental staves follow (the magic plan).
  add("ash_staff", (b) => {
    staff(b, 0xd8c8a0, 0xc4b088);
    b.add(ellipsoid(0.055, 0.065, 0.055, 8, 6), { color: 0xb8a070, matrix: at(0, 0.7, 0) });
  });
  add("oak_staff", (b) => {
    staff(b, 0x6a4424, 0x44484e);
    b.add(new THREE.CylinderGeometry(0.03, 0.026, 0.05, 7), { color: 0x44484e, matrix: at(0, 0.66, 0) });
    b.add(ellipsoid(0.045, 0.055, 0.045, 8, 6), { color: 0x7fc4ff, matrix: at(0, 0.72, 0) });
  });
  add("wool_robe", (b) => {
    b.add(new THREE.CylinderGeometry(0.15, 0.17, 0.34, 8).scale(1, 1, 0.55), { color: 0x3a4a80, matrix: at(0, 0.17, 0) });
    b.add(new THREE.TorusGeometry(0.11, 0.03, 5, 12), { color: 0x2c3a68, matrix: at(0, 0.34, 0, 1, 0, Math.PI / 2) });
    b.add(new THREE.BoxGeometry(0.16, 0.02, 0.09), { color: 0xc8a040, matrix: at(0, 0.2, 0.02) });
  });
  add("wool_hood", (b) => {
    b.add(new THREE.SphereGeometry(0.13, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), { color: 0x3a4a80, matrix: at(0, 0, 0) });
    b.add(new THREE.ConeGeometry(0.06, 0.12, 8), { color: 0x2c3a68, matrix: at(0, 0.16, -0.03, 1, 0, 0, -0.5) });
    b.add(new THREE.CylinderGeometry(0.135, 0.14, 0.03, 12), { color: 0x2c3a68, matrix: at(0, 0.01, 0) });
  });
  // The castle's leave (The Silence at Mourn): a fold of parchment, its flap down over the front, and the red wax seal where the flap meets it.
  add("sealed_leave", (b) => {
    b.add(new THREE.BoxGeometry(0.3, 0.018, 0.2), { color: 0xe8dcb8, matrix: at(0, 0.009, 0, 1, 0.2) });
    b.add(new THREE.BoxGeometry(0.3, 0.012, 0.09), { color: 0xd8caa0, matrix: at(-0.018, 0.024, 0.052, 1, 0.2, 0.08) });
    b.add(new THREE.CylinderGeometry(0.036, 0.04, 0.02, 12), { color: 0xa81e1e, matrix: at(0.003, 0.034, 0.012) });
    b.add(new THREE.CylinderGeometry(0.018, 0.018, 0.024, 8), { color: 0x7a1010, matrix: at(0.003, 0.038, 0.012) });
  });
  // The Pull of the Charm: a sheet with the altar's writing come off on it in charcoal, and Agnes's note, folded once.
  add("altar_rubbing", (b) => {
    b.add(new THREE.BoxGeometry(0.3, 0.01, 0.22), { color: 0xe4dcc4, matrix: at(0, 0.005, 0, 1, -0.15) });
    for (let i = 0; i < 4; i++) b.add(new THREE.BoxGeometry(0.2 - i * 0.03, 0.004, 0.018), { color: 0x2a2626, matrix: at(-0.01, 0.012, -0.07 + i * 0.045, 1, -0.15), shade: 0 });
  });
  add("agnes_note", (b) => {
    b.add(new THREE.BoxGeometry(0.2, 0.014, 0.14), { color: 0xf0ead8, matrix: at(0, 0.007, 0, 1, 0.3) });
    b.add(new THREE.BoxGeometry(0.2, 0.01, 0.07), { color: 0xe6dec8, matrix: at(0, 0.018, 0.035, 1, 0.3, 0.06) });
    b.add(new THREE.BoxGeometry(0.12, 0.004, 0.012), { color: 0x2a3a6a, matrix: at(0.01, 0.024, 0.03, 1, 0.3), shade: 0 });
  });
  // A plum (Bones to Plums): dark and round, a short stem and a leaf.
  add("plum", (b) => {
    b.add(ellipsoid(0.1, 0.11, 0.1, 12, 10), { color: 0x5a2266, matrix: at(0, 0.11, 0) });
    b.add(ellipsoid(0.03, 0.03, 0.03, 6, 4), { color: 0x8a4a9a, matrix: at(-0.04, 0.16, 0.06), shade: 0 });
    b.add(new THREE.CylinderGeometry(0.008, 0.01, 0.06, 5), { color: 0x5a3a1e, matrix: at(0, 0.24, 0, 1, 0, 0, 0.3) });
    b.add(ellipsoid(0.05, 0.008, 0.025, 6, 3), { color: 0x4a8a30, matrix: at(0.04, 0.25, 0, 1, 0.4, 0, -0.3) });
  });
  // The runes (the magic plan): a small stone tablet in its own colour with its sign cut into the top.
  for (const [key, stone, sign, glyph] of RUNES) add(key, (b) => rune(b, stone, sign, glyph));
  // Runesmithing (Phase 18): each rune's charm, and the glimstone runes are carved from: a pale lump, and a
  // purer, brighter one with a glint in it.
  for (const [key, stone, sign, glyph] of RUNES) add(key.replace(/_rune$/, "_charm"), (b) => charmOf(b, stone, sign, glyph));
  // Gems (the magic plan, stage A5): uncut, a rough lump of its colour; cut, a brilliant with a flat table on top.
  for (const g of GEMS) {
    add(`uncut_${g.key}`, (b) => {
      b.add(new THREE.DodecahedronGeometry(0.075, 0), { color: shadeTo(g.colour, 0.72), matrix: at(0, 0.06, 0, [1, 0.8, 0.9], 0.5), shade: 0.12 });
      b.add(new THREE.DodecahedronGeometry(0.035, 0), { color: shadeTo(g.colour, 0.6), matrix: at(0.05, 0.04, 0.04), shade: 0.12 });
    });
    add(g.key, (b) => {
      b.add(new THREE.ConeGeometry(0.085, 0.09, 8), { color: g.colour, matrix: at(0, 0.045, 0, 1, Math.PI / 8, Math.PI) });
      b.add(new THREE.CylinderGeometry(0.05, 0.085, 0.035, 8), { color: g.colour, matrix: at(0, 0.108, 0, 1, Math.PI / 8), shade: 0.1 });
      b.add(new THREE.CylinderGeometry(0.05, 0.05, 0.004, 8), { color: shadeTo(g.colour, 1.25), matrix: at(0, 0.127, 0, 1, Math.PI / 8), shade: 0 });
    });
  }
  // Gem jewellery (the magic plan, stage A5b): one shape a kind, in gold or silver, with the gem's own colour.
  add("gold_necklace", (b) => jewel(b, "necklace", JEWEL_GOLD, null));
  add("gold_bracelet", (b) => jewel(b, "bracelet", JEWEL_GOLD, null));
  for (const [gem, stem, metal] of JEWELLERY) {
    for (const kind of ["ring", "necklace", "bracelet", "amulet"] as const) add(`${stem}_${kind}`, (b) => jewel(b, kind, metal, GEMS.find((g) => g.key === gem)!.colour));
  }
  // Enchanted jewellery (stage A5c): the plain piece with a faint halo of its gem's colour round it.
  for (const [gem, stem, metal] of JEWELLERY) {
    for (const kind of ["ring", "necklace", "bracelet", "amulet"] as const) {
      const into = ENCHANTED[`${stem}_${kind}`];
      const colour = GEMS.find((g) => g.key === gem)!.colour;
      if (into) add(into, (b) => {
        jewel(b, kind, metal, colour);
        b.add(new THREE.TorusGeometry(kind === "ring" ? 0.085 : 0.16, 0.006, 4, 24), { color: shadeTo(colour, 1.3), matrix: at(0, kind === "ring" ? 0.06 : 0.02, 0, 1, 0, Math.PI / 2), shade: 0 });
      });
    }
  }
  // Gem tips, gem-tipped arrows and enchanted ones (stage A5d): the arrows' bundle with the gem's colour at the heads.
  for (const [gem, stem, head] of [["opal", "opal", 0x9a9aa2], ["jade", "jade", 0x9a9aa2], ["red_topaz", "topaz", 0x9a9aa2], ["sapphire", "sapphire", 0xb8bec6], ["emerald", "emerald", 0xb8bec6], ["ruby", "ruby", 0xb8bec6], ["diamond", "diamond", 0xb8bec6], ["wyrmstone", "wyrmstone", 0xb8bec6], ["onyx", "onyx", 0xb8bec6]] as const) {
    const colour = GEMS.find((g) => g.key === gem)!.colour;
    add(`${stem}_tips`, (b) => {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        b.add(new THREE.OctahedronGeometry(0.022, 0), { color: colour, matrix: at(Math.cos(a) * 0.05, 0.02, Math.sin(a) * 0.05, [1, 1.6, 1], a), shade: 0.05 });
      }
    });
    add(`${stem}_tipped_arrow`, (b) => {
      arrowsOf(b, head, 0x5a5a60);
      for (const x of [-0.04, 0, 0.04]) b.add(new THREE.OctahedronGeometry(0.016, 0), { color: colour, matrix: at(x, 0.41, 0, [1, 1.5, 1]), shade: 0.05 });
    });
    add(`enchanted_${stem}_arrow`, (b) => {
      arrowsOf(b, head, 0x5a5a60);
      for (const x of [-0.04, 0, 0.04]) b.add(new THREE.OctahedronGeometry(0.018, 0), { color: shadeTo(colour, 1.25), matrix: at(x, 0.41, 0, [1, 1.5, 1]), shade: 0 });
      b.add(new THREE.TorusGeometry(0.07, 0.004, 4, 16), { color: shadeTo(colour, 1.3), matrix: at(0, 0.41, 0, 1, 0, Math.PI / 2), shade: 0 });
    });
  }
  add("chisel", (b) => {
    b.add(new THREE.CylinderGeometry(0.018, 0.022, 0.13, 8), { color: 0x8a5a30, matrix: at(0, 0.02, 0, 1, 0, 0, Math.PI / 2) });
    b.add(new THREE.BoxGeometry(0.12, 0.012, 0.03), { color: 0xb8bec6, matrix: at(0.12, 0.02, 0) });
  });
  // A silver circlet, and each rune's with its charm set at the brow.
  add("silver_circlet", (b) => circletOf(b, null, null));
  for (const [key, stone, sign] of RUNES) add(key.replace(/_rune$/, "_circlet"), (b) => circletOf(b, stone, sign));
  add("glimstone", (b) => {
    b.add(ellipsoid(0.11, 0.08, 0.09, 6, 4), { color: 0xc8c0d8, matrix: at(0, 0.07, 0, 1, 0.4), shade: 0.1 });
    b.add(ellipsoid(0.05, 0.04, 0.05, 5, 3), { color: 0xa8a0bc, matrix: at(0.06, 0.05, 0.05), shade: 0.1 });
  });
  add("pure_glimstone", (b) => {
    b.add(ellipsoid(0.11, 0.08, 0.09, 6, 4), { color: 0xeae4ff, matrix: at(0, 0.07, 0, 1, 0.4), shade: 0.06 });
    b.add(ellipsoid(0.03, 0.03, 0.03, 5, 3), { color: 0xffffff, matrix: at(-0.04, 0.12, 0.04), shade: 0 });
  });
  // The elemental staves: an iron-shod staff with a claw at the head holding a stone of the element's colour.
  for (const [key, orb] of [["gale_staff", 0xe8eef4], ["tide_staff", 0x3a7ad0], ["stone_staff", 0x7f9048], ["ember_staff", 0xe0502a]] as const) {
    add(key, (b) => {
      staff(b, 0x7a6450, 0x5c5c62);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        b.add(new THREE.BoxGeometry(0.012, 0.09, 0.012), { color: 0x5c5c62, matrix: at(Math.cos(a) * 0.03, 0.72, Math.sin(a) * 0.03, 1, -a, 0, 0.35) });
      }
      b.add(ellipsoid(0.045, 0.05, 0.045, 10, 8), { color: orb, matrix: at(0, 0.745, 0) });
    });
  }
  // The magic plan, stage A4: the glass orb and the four it is filled into, the battlestaff with its empty
  // socket and the four with an orb set in it, and the staff each special spell is cast through, drawn as
  // its examine says.
  add("glass_orb", (b) => orbOf(b, 0xd8ecf4, 0xffffff));
  for (const [key, shell, heart] of [
    ["tide_orb", 0x2f6ad0, 0x9ad4ff], ["stone_orb", 0x6a7a34, 0xd0dc98], ["ember_orb", 0xc03a18, 0xffc060], ["gale_orb", 0xc8d4e2, 0xffffff],
  ] as const) {
    add(key, (b) => orbOf(b, shell, heart));
  }
  add("battlestaff", (b) => battlestaffOf(b, null));
  for (const [key, colour] of [["tide_battlestaff", 0x2f6ad0], ["stone_battlestaff", 0x6a7a34], ["ember_battlestaff", 0xc03a18], ["gale_battlestaff", 0xc8d4e2]] as const) {
    add(key, (b) => battlestaffOf(b, colour));
  }
  // Sunfall's: pale wood capped in gold, and a gold sunburst round a white-gold stone.
  add("dawn_staff", (b) => {
    staff(b, 0xe8dcc0, 0xd8b030);
    b.add(new THREE.CylinderGeometry(0.03, 0.024, 0.06, 8), { color: 0xd8b030, matrix: at(0, 0.67, 0) });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      b.add(new THREE.BoxGeometry(0.012, 0.07, 0.012), { color: 0xf0cc40, matrix: at(Math.cos(a) * 0.055, 0.76 + Math.sin(a) * 0.055, 0, 1, 0, 0, a - Math.PI / 2) });
    }
    b.add(ellipsoid(0.04, 0.04, 0.04, 10, 8), { color: 0xfff4c8, matrix: at(0, 0.76, 0), shade: 0 });
  });
  // Pyre's: fire-hardened black wood, and three tongues of flame round a hot heart at the head.
  add("pyre_staff", (b) => {
    staff(b, 0x2a2220, 0x5a2a18);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      b.add(new THREE.ConeGeometry(0.03, 0.14, 6), { color: i === 0 ? 0xff7a20 : 0xd8401a, matrix: at(Math.cos(a) * 0.022, 0.76, Math.sin(a) * 0.022, 1, -a, 0, 0.3) });
    }
    b.add(ellipsoid(0.03, 0.045, 0.03, 8, 6), { color: 0xffd060, matrix: at(0, 0.73, 0), shade: 0 });
  });
  // Wildclaw's: a green stem thorned all the way up, leaves at the head round a bud.
  add("briar_staff", (b) => {
    staff(b, 0x4a5a2a, 0x3a2a1a);
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4;
      b.add(new THREE.ConeGeometry(0.008, 0.04, 4), { color: 0x8a7a44, matrix: at(Math.cos(a) * 0.026, -0.1 + i * 0.1, Math.sin(a) * 0.026, 1, -a, 0, -Math.PI / 2) });
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      b.add(ellipsoid(0.045, 0.008, 0.022, 6, 3), { color: 0x5a9a30, matrix: at(Math.cos(a) * 0.035, 0.7, Math.sin(a) * 0.035, 1, -a, 0, 0.5) });
    }
    b.add(ellipsoid(0.028, 0.04, 0.028, 8, 6), { color: 0xa0d860, matrix: at(0, 0.75, 0) });
  });
  // Scorch's: a rough shaft of dark stone and a jagged head, hot cracks glowing in it.
  add("sear_staff", (b) => {
    b.add(new THREE.CylinderGeometry(0.022, 0.03, 0.92, 5), { color: 0x3a3230, matrix: at(0, 0.24, 0, 1, 0.3), shade: 0.12 });
    b.add(ellipsoid(0.06, 0.085, 0.06, 5, 4), { color: 0x2a2422, matrix: at(0, 0.74, 0, 1, 0.5), shade: 0.1 });
    for (const [x, y, z, r] of [[0.045, 0.74, 0.03, 0.4], [-0.04, 0.72, 0.035, -0.6], [0, 0.78, -0.05, 1.2]] as const) {
      b.add(new THREE.BoxGeometry(0.01, 0.06, 0.01), { color: 0xff6a20, matrix: at(x, y, z, 1, r, 0, 0.5), shade: 0 });
    }
  });
  // Thought Dart's: plain ash notched with a tally, a hook at the head holding a small violet stone.
  add("hunter_staff", (b) => {
    staff(b, 0xd0c09a, 0x6a5a40);
    for (let i = 0; i < 6; i++) b.add(new THREE.CylinderGeometry(0.025, 0.025, 0.008, 7), { color: 0x5a4a30, matrix: at(0, 0.2 + i * 0.05, 0) });
    b.add(new THREE.TorusGeometry(0.04, 0.012, 5, 10, Math.PI * 1.2), { color: 0xd0c09a, matrix: at(0.02, 0.74, 0, 1, 0, 0, 0.6) });
    b.add(ellipsoid(0.022, 0.022, 0.022, 6, 5), { color: 0x9a8ac8, matrix: at(-0.02, 0.73, 0) });
  });
}

/** A rune's sign, as strokes on the tablet's top: each one a picture a player can learn at a glance. */
type Glyph = "wind" | "wave" | "peak" | "flame" | "eye" | "knot" | "spiral" | "leaf" | "seal" | "mound" | "heart" | "ring" | "bolt" | "star";
/** Every rune: its key, the tablet's colour, the sign's colour, and the sign. */
const RUNES: ReadonlyArray<readonly [string, number, number, Glyph]> = [
  ["gale_rune", 0xd8dce2, 0x7c8898, "wind"], ["tide_rune", 0x3a6ab0, 0xbfe4ff, "wave"], ["stone_rune", 0x6f7a44, 0xdde4a8, "peak"],
  ["ember_rune", 0xb8421e, 0xffd070, "flame"], ["thought_rune", 0x8a7fa8, 0xfff0c0, "eye"], ["sinew_rune", 0xb0806e, 0x5a2a20, "knot"],
  ["wild_rune", 0x5a4a78, 0xffa048, "spiral"], ["bloom_rune", 0x3f7a3a, 0xc8f090, "leaf"], ["oath_rune", 0x3a4a8a, 0xeae2c4, "seal"],
  ["grave_rune", 0x4a4a4e, 0xdcdad0, "mound"], ["heart_rune", 0x7a1a24, 0xff5a6a, "heart"], ["shade_rune", 0x2a2630, 0xa092d0, "ring"],
  ["fury_rune", 0x3a2a24, 0xff6a20, "bolt"], ["star_rune", 0x2a2a4a, 0xfff4b0, "star"],
];

/** A rune: an eight-sided tablet with a bevelled top, and its sign in strokes laid on the top face. */
function rune(b: MeshBuilder, stone: number, sign: number, glyph: Glyph): void {
  b.add(new THREE.CylinderGeometry(0.1, 0.112, 0.045, 8), { color: stone, matrix: at(0, 0.0225, 0, 1, Math.PI / 8) });
  b.add(new THREE.CylinderGeometry(0.086, 0.1, 0.012, 8), { color: stone, matrix: at(0, 0.051, 0, 1, Math.PI / 8), shade: 0.06 });
  signOn(b, sign, glyph, 0.06);
}

/** A charm (Runesmithing, Phase 18): a round disc of its rune's stone on a loop, the rune's sign on its face. */
function charmOf(b: MeshBuilder, stone: number, sign: number, glyph: Glyph): void {
  b.add(new THREE.CylinderGeometry(0.1, 0.1, 0.024, 18), { color: stone, matrix: at(0, 0.012, 0) });
  b.add(new THREE.TorusGeometry(0.1, 0.008, 5, 22), { color: 0xc8a040, matrix: at(0, 0.02, 0, 1, 0, Math.PI / 2) });
  b.add(new THREE.TorusGeometry(0.025, 0.008, 5, 10), { color: 0xc8a040, matrix: at(0, 0.02, -0.12) });
  signOn(b, sign, glyph, 0.026, 0.85);
}

const JEWEL_GOLD = 0xd8b030, JEWEL_SILVER = 0xd0d6de;
/** Each gem jewellery set: its gem, the stem of its item keys, and its metal. */
const JEWELLERY: ReadonlyArray<readonly [string, string, number]> = [
  ["opal", "opal", JEWEL_SILVER], ["jade", "jade", JEWEL_SILVER], ["red_topaz", "topaz", JEWEL_SILVER], ["sapphire", "sapphire", JEWEL_GOLD],
  ["emerald", "emerald", JEWEL_GOLD], ["ruby", "ruby", JEWEL_GOLD], ["diamond", "diamond", JEWEL_GOLD], ["wyrmstone", "wyrmstone", JEWEL_GOLD],
  ["onyx", "onyx", JEWEL_GOLD], ["sunstone", "sunstone", JEWEL_GOLD],
];

/**
 * A piece of jewellery: a ring stood up with its stone on top; a necklace's fine chain in a loop with the stone
 * hanging at the front; a bracelet's thicker band with the stone in its clasp; an amulet's chain with a disc
 * setting holding the stone.
 */
function jewel(b: MeshBuilder, kind: "ring" | "necklace" | "bracelet" | "amulet", metal: number, gem: number | null): void {
  const stone = (x: number, y: number, z: number, r: number) => {
    if (gem !== null) b.add(new THREE.OctahedronGeometry(r, 0), { color: gem, matrix: at(x, y, z, [1, 0.8, 1], Math.PI / 4), shade: 0.05 });
  };
  switch (kind) {
    case "ring":
      b.add(new THREE.TorusGeometry(0.055, 0.014, 6, 16), { color: metal, matrix: at(0, 0.06, 0, 1, 0.3, Math.PI / 2) });
      stone(0, 0.125, 0, 0.026);
      break;
    case "necklace":
      b.add(new THREE.TorusGeometry(0.12, 0.007, 4, 24), { color: metal, matrix: at(0, 0.007, 0, 1, 0, Math.PI / 2) });
      stone(0, 0.02, 0.135, 0.03);
      break;
    case "bracelet":
      b.add(new THREE.TorusGeometry(0.08, 0.02, 6, 20), { color: metal, matrix: at(0, 0.02, 0, 1, 0, Math.PI / 2) });
      b.add(new THREE.BoxGeometry(0.04, 0.03, 0.03), { color: metal, matrix: at(0, 0.03, 0.085) });
      stone(0, 0.05, 0.085, 0.022);
      break;
    case "amulet":
      b.add(new THREE.TorusGeometry(0.12, 0.006, 4, 24), { color: metal, matrix: at(0, 0.006, 0, 1, 0, Math.PI / 2) });
      b.add(new THREE.CylinderGeometry(0.045, 0.045, 0.014, 14), { color: metal, matrix: at(0, 0.007, 0.15) });
      stone(0, 0.028, 0.15, 0.028);
      break;
  }
}

/** A colour brightened or darkened by a factor. */
function shadeTo(hex: number, k: number): number {
  return new THREE.Color(hex).multiplyScalar(k).getHex();
}

/** A silver circlet: a thin band lying flat, a setting at the front, and a charm's disc in it when one is set. */
function circletOf(b: MeshBuilder, stone: number | null, sign: number | null): void {
  b.add(new THREE.TorusGeometry(0.13, 0.012, 6, 28), { color: 0xd8dde4, matrix: at(0, 0.012, 0, 1, 0, Math.PI / 2) });
  b.add(new THREE.BoxGeometry(0.05, 0.03, 0.022), { color: 0xc0c6ce, matrix: at(0, 0.02, 0.13) });
  if (stone !== null && sign !== null) {
    b.add(new THREE.CylinderGeometry(0.028, 0.028, 0.012, 14), { color: stone, matrix: at(0, 0.034, 0.13) });
    b.add(new THREE.CylinderGeometry(0.012, 0.012, 0.014, 10), { color: sign, matrix: at(0, 0.036, 0.13), shade: 0 });
  }
}

/** A rune's sign in strokes laid flat at height `top` (and `scale` its size): on a rune's tablet, and on its charm. */
function signOn(b: MeshBuilder, sign: number, glyph: Glyph, top: number, scale = 1): void {
  /** A stroke from (x0, z0) to (x1, z1) on the top face. */
  const stroke = (x0: number, z0: number, x1: number, z1: number, w = 0.016) => {
    [x0, z0, x1, z1, w] = [x0 * scale, z0 * scale, x1 * scale, z1 * scale, w * scale];
    const length = Math.hypot(x1 - x0, z1 - z0);
    b.add(new THREE.BoxGeometry(length, 0.008, w), { color: sign, matrix: at((x0 + x1) / 2, top, (z0 + z1) / 2, 1, -Math.atan2(z1 - z0, x1 - x0)), shade: 0 });
  };
  const dot = (x: number, z: number, r = 0.014) => b.add(new THREE.CylinderGeometry(r * scale, r * scale, 0.008, 8), { color: sign, matrix: at(x * scale, top, z * scale), shade: 0 });
  const arc = (r: number, from: number, to: number, x = 0, z = 0) => {
    const steps = Math.max(2, Math.round(((to - from) / Math.PI) * 6));
    for (let i = 0; i < steps; i++) {
      const a0 = from + ((to - from) * i) / steps, a1 = from + ((to - from) * (i + 1)) / steps;
      stroke(x + Math.cos(a0) * r, z + Math.sin(a0) * r, x + Math.cos(a1) * r, z + Math.sin(a1) * r, 0.013);
    }
  };
  switch (glyph) {
    case "wind": for (const z of [-0.035, 0, 0.035]) stroke(-0.05 + z * 0.4, z, 0.04 + z * 0.4, z); arc(0.02, -Math.PI / 2, Math.PI / 2, 0.045, 0.015); break;
    case "wave": stroke(-0.06, 0.01, -0.03, -0.02); stroke(-0.03, -0.02, 0, 0.01); stroke(0, 0.01, 0.03, -0.02); stroke(0.03, -0.02, 0.06, 0.01); break;
    case "peak": stroke(-0.055, 0.04, 0, -0.045); stroke(0, -0.045, 0.055, 0.04); stroke(-0.055, 0.04, 0.055, 0.04); break;
    case "flame": stroke(-0.03, 0.04, 0, -0.05); stroke(0, -0.05, 0.03, 0.04); arc(0.03, 0, Math.PI, 0, 0.04); break;
    case "eye": arc(0.05, Math.PI * 1.15, Math.PI * 1.85, 0, 0.035); arc(0.05, Math.PI * 0.15, Math.PI * 0.85, 0, -0.035); dot(0, 0, 0.016); break;
    case "knot": stroke(-0.045, -0.045, 0.045, 0.045); stroke(-0.045, 0.045, 0.045, -0.045); arc(0.022, 0, Math.PI * 2); break;
    case "spiral": arc(0.055, 0, Math.PI * 1.5); arc(0.035, Math.PI * 1.5, Math.PI * 3); dot(0, 0, 0.01); break;
    case "leaf": arc(0.06, Math.PI * 1.2, Math.PI * 1.8, 0, 0.045); arc(0.06, Math.PI * 0.2, Math.PI * 0.8, 0, -0.045); stroke(-0.06, 0, 0.06, 0); break;
    case "seal": arc(0.045, 0, Math.PI * 2); stroke(0, -0.06, 0, 0.06); break;
    case "mound": arc(0.05, Math.PI, Math.PI * 2, 0, 0.025); stroke(-0.06, 0.025, 0.06, 0.025); break;
    case "heart": arc(0.022, Math.PI * 0.9, Math.PI * 2.05, -0.022, -0.012); arc(0.022, Math.PI * 0.95, Math.PI * 2.1, 0.022, -0.012); stroke(-0.044, -0.008, 0, 0.05); stroke(0.044, -0.008, 0, 0.05); break;
    case "ring": arc(0.05, 0, Math.PI * 2); arc(0.03, 0, Math.PI * 2); break;
    case "bolt": stroke(0.03, -0.06, -0.015, 0); stroke(-0.015, 0, 0.02, 0); stroke(0.02, 0, -0.03, 0.06); break;
    case "star":
      for (let i = 0; i < 5; i++) {
        const a0 = -Math.PI / 2 + (i * 2 * Math.PI) / 5, a1 = -Math.PI / 2 + (((i + 2) % 5) * 2 * Math.PI) / 5;
        stroke(Math.cos(a0) * 0.058, Math.sin(a0) * 0.058, Math.cos(a1) * 0.058, Math.sin(a1) * 0.058, 0.012);
      }
      break;
  }
}

/** A staff: a long shaft up from below the hand, a binding at the grip, and a shoe or knot in the second colour. */
function staff(b: MeshBuilder, wood: number, trim: number): void {
  b.add(new THREE.CylinderGeometry(0.02, 0.026, 0.92, 7), { color: wood, matrix: at(0, 0.24, 0) });
  b.add(new THREE.CylinderGeometry(0.025, 0.025, 0.08, 7), { color: trim, matrix: at(0, 0.02, 0) });
  b.add(new THREE.CylinderGeometry(0.028, 0.024, 0.04, 7), { color: trim, matrix: at(0, -0.2, 0) });
}

/** An orb on a little iron ring so it does not roll, its lighter heart catching the light on the near side. */
function orbOf(b: MeshBuilder, shell: number, heart: number): void {
  b.add(new THREE.TorusGeometry(0.05, 0.012, 5, 12), { color: 0x5c5c62, matrix: at(0, 0.012, 0, 1, 0, Math.PI / 2) });
  b.add(ellipsoid(0.085, 0.085, 0.085, 14, 10), { color: shell, matrix: at(0, 0.09, 0) });
  b.add(ellipsoid(0.04, 0.04, 0.04, 8, 6), { color: heart, matrix: at(-0.03, 0.12, 0.05), shade: 0 });
}

/** A battlestaff: dark wood shod in iron, iron bands at the grip and the neck, a socket at the head with an orb in it, or dark and empty. */
function battlestaffOf(b: MeshBuilder, orb: number | null): void {
  staff(b, 0x4a3a2a, 0x7a7a80);
  for (const y of [0.5, 0.64]) b.add(new THREE.CylinderGeometry(0.026, 0.026, 0.025, 8), { color: 0x7a7a80, matrix: at(0, y, 0) });
  b.add(new THREE.CylinderGeometry(0.045, 0.028, 0.05, 8), { color: 0x7a7a80, matrix: at(0, 0.7, 0) });
  if (orb === null) b.add(new THREE.CylinderGeometry(0.036, 0.036, 0.006, 8), { color: 0x2a2a2e, matrix: at(0, 0.726, 0), shade: 0 });
  else b.add(ellipsoid(0.042, 0.042, 0.042, 10, 8), { color: orb, matrix: at(0, 0.745, 0) });
}

/** A cast bar: a wedge that is wider at the bottom, with a lighter top face. */
function ingot(b: MeshBuilder, metal: number, dark: number): void {
  b.add(new THREE.CylinderGeometry(0.075, 0.1, 0.07, 4).rotateY(Math.PI / 4).scale(2.2, 1, 1), { color: dark, matrix: at(0, 0.035, 0) });
  b.add(new THREE.BoxGeometry(0.3, 0.012, 0.1), { color: metal, matrix: at(0, 0.072, 0) });
}

/** The bronze mace's head and haft, in another metal. */
function mace(b: MeshBuilder, metal: number, dark: number): void {
  handle(b, 0.36);
  b.add(new THREE.ConeGeometry(0.075, 0.11, 6), { color: metal, matrix: at(0, 0.33, 0) });
  b.add(new THREE.ConeGeometry(0.075, 0.09, 6), { color: dark, matrix: at(0, 0.275, 0, 1, 0, Math.PI) });
  b.add(new THREE.CylinderGeometry(0.022, 0.022, 0.04, 6), { color: dark, matrix: at(0, 0.24, 0) });
}

/** The bronze shield's kite, in another metal: square shoulders down to a point, with a cross on it. */
function kite(b: MeshBuilder, metal: number, trim: number): void {
  const thick = 0.035, wide = 0.3, tall = 0.26;
  b.add(new THREE.BoxGeometry(thick, tall, wide), { color: metal, matrix: at(0, 0.07, 0) });
  b.add(new THREE.ConeGeometry(wide * 0.708, 0.22, 4).rotateY(Math.PI / 4), {
    color: metal, matrix: at(0, -0.17, 0, [thick / (wide * 1.001), 1, 1], 0, Math.PI),
  });
  b.add(new THREE.BoxGeometry(thick * 1.1, tall * 1.02, wide * 0.1), { color: trim, matrix: at(0, 0.07, 0) });
  b.add(new THREE.BoxGeometry(thick * 1.1, tall * 0.1, wide * 1.02), { color: trim, matrix: at(0, 0.07, 0) });
}

/** Three arrows in a bundle, headed in their own metal and flighted so they are not bare sticks. */
function arrowsOf(b: MeshBuilder, metal: number, dark: number): void {
  for (const x of [-0.04, 0, 0.04]) {
    b.add(new THREE.CylinderGeometry(0.007, 0.007, 0.36, 4), { color: WOOD, matrix: at(x, 0.18, 0) });
    b.add(new THREE.ConeGeometry(0.018, 0.05, 4), { color: metal, matrix: at(x, 0.38, 0) });
    b.add(new THREE.BoxGeometry(0.004, 0.06, 0.03), { color: dark, matrix: at(x, 0.04, 0) });
  }
}

/** A handful of little points, tipped up so the heads catch the light. */
function arrowheads(b: MeshBuilder, metal: number, dark: number): void {
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.add(new THREE.ConeGeometry(0.028, 0.075, 4).rotateY(Math.PI / 4).scale(1, 1, 0.45), {
      color: i % 2 === 0 ? metal : dark, matrix: at(Math.cos(a) * 0.055, 0.04, Math.sin(a) * 0.05, 1, a, 0, 0.5),
    });
  }
}

/** A plain band, standing up so it reads as a ring rather than a washer. */
function ringOf(b: MeshBuilder, metal: number): void {
  b.add(new THREE.TorusGeometry(0.055, 0.016, 6, 14), { color: metal, matrix: at(0, 0.06, 0, 1, 0.3, Math.PI / 2) });
}

/** A stave bent into a curve, with a string across it when it has one. */
function bow(b: MeshBuilder, wood: number, length: number, strung: boolean): void {
  const steps = 7;
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) / steps, y = t * length;
    const bend = Math.sin(t * Math.PI) * length * 0.22;
    b.add(new THREE.CylinderGeometry(0.014, 0.014, length / steps + 0.01, 5), {
      color: wood, matrix: at(bend, y - length / 2 + 0.06, 0, 1, 0, 0, (0.5 - t) * 0.9),
    });
  }
  if (strung) {
    b.add(new THREE.CylinderGeometry(0.006, 0.006, length, 4), { color: 0xd8d0b8, matrix: at(0, 0.06, 0) });
  }
}

/** A cut of meat: a rounded lump with a bone showing at one end. */
function cut(b: MeshBuilder, meat: number, fat: number): void {
  b.add(ellipsoid(0.11, 0.06, 0.08), { color: meat, matrix: at(0, 0.06, 0) });
  b.add(ellipsoid(0.07, 0.03, 0.05), { color: fat, matrix: at(0.01, 0.105, 0) });
  b.add(new THREE.CylinderGeometry(0.018, 0.018, 0.09, 6), { color: BONE_PALE, matrix: at(-0.12, 0.05, 0, 1, 0, Math.PI / 2) });
}

/**
 * The same creature off the fire: its own model, then a browned crust over the back and a scorch mark,
 * so a cooked fish is plainly the fish it was and plainly not raw any more.
 */
function browned(b: MeshBuilder, raw: (b: MeshBuilder) => void, crust = 0x9a6a38): void {
  raw(b);
  b.add(ellipsoid(0.13, 0.022, 0.045), { color: crust, matrix: at(0, 0.088, 0) });
  b.add(ellipsoid(0.05, 0.016, 0.03), { color: crust === 0x9a6a38 ? 0x6a4420 : 0x161210, matrix: at(0.05, 0.1, 0.01) });
}

const models = new Map<string, THREE.BufferGeometry>();

let phase8Added = false;

/** A model by its key (vertex coloured), built once. Unknown keys become a small sack. */
function modelGeometry(key: string): THREE.BufferGeometry {
  if (!phase8Added) {
    phase8Added = true;
    addPhase8Models();
  }
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
  // A creel is carried on its rope, so the basket swings below the hand rather than standing on it.
  creel: new THREE.Matrix4().makeTranslation(0, -CREEL_GRIP, 0),
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
  // The long fishing tools lie corner to corner like the axes, turned so the line and the barbs show.
  fishing_rod: { y: Math.PI / 2, lean: true },
  harpoon: { y: Math.PI / 2, lean: true },
  ash_staff: { y: Math.PI / 2, lean: true },
  oak_staff: { y: Math.PI / 2, lean: true },
  gale_staff: { y: Math.PI / 2, lean: true },
  tide_staff: { y: Math.PI / 2, lean: true },
  stone_staff: { y: Math.PI / 2, lean: true },
  ember_staff: { y: Math.PI / 2, lean: true },
  battlestaff: { y: Math.PI / 2, lean: true },
  tide_battlestaff: { y: Math.PI / 2, lean: true },
  stone_battlestaff: { y: Math.PI / 2, lean: true },
  ember_battlestaff: { y: Math.PI / 2, lean: true },
  gale_battlestaff: { y: Math.PI / 2, lean: true },
  dawn_staff: { lean: true },
  pyre_staff: { y: Math.PI / 2, lean: true },
  briar_staff: { y: Math.PI / 2, lean: true },
  sear_staff: { y: Math.PI / 2, lean: true },
  hunter_staff: { lean: true },
  creel: { x: 0.5 },
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
