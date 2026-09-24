import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import type * as THREE from "three";
import { blankMap, EDGE_KINDS, ORE_KINDS, PROP_KINDS, TREE_KINDS, type ObjectKind } from "../../src/shared/map.ts";

// leafTexture() wants a canvas; nothing here ever draws, so a no-op stands in for one.
const noop = new Proxy({}, { get: () => () => undefined, set: () => true });
(globalThis as Record<string, unknown>).document = { createElement: () => ({ width: 0, height: 0, getContext: () => noop }) };
const { buildObjects } = await import("../../src/client/render/objects.ts");

/** Every vertex of every part an object draws, as one short hash. */
function hashOf(kind: ObjectKind, variant: number, tag?: string): string {
  const map = blankMap(4, 4);
  map.objects.push({ id: 0, kind, x: 1, y: 1, plane: 0, side: 0, variant, ...(tag === undefined ? {} : { tag }) });
  const h = createHash("sha256");
  buildObjects(map).group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.geometry) return;
    for (const name of ["position", "normal", "color", "uv"]) {
      const a = mesh.geometry.getAttribute(name);
      h.update(name).update(a ? Buffer.from(new Float32Array(a.array as Float32Array).buffer) : Buffer.alloc(0));
    }
    h.update(Buffer.from(new Float32Array(mesh.geometry.getIndex()?.array ?? []).buffer));
  });
  return h.digest("hex").slice(0, 16);
}

/**
 * The plain tree and the oak were drawn by hand and approved before the woodcutting ladder existed; the
 * other six are the same builder with other numbers. Rewriting the two of them as rows of a spec table
 * quietly changed their roots' colour — everything still built, every other test stayed green, and the
 * only way to know was to compare the vertices. These are those vertices, taken from the last build
 * before the table and checked against it.
 */
test("the tree and the oak are exactly the geometry they were before the ladder", () => {
  const known: Record<string, Record<number, string>> = {
    tree: { 0.1: "172c37b400dd27df", 0.4: "e5f11e400aa91cdf", 0.8: "ab32558170e9288d" },
    oak: { 0.1: "40353c778734d27c", 0.4: "64ddc524ab4f08d0", 0.8: "dc97df714e484235" },
  };
  for (const [kind, variants] of Object.entries(known)) {
    for (const [variant, hash] of Object.entries(variants)) {
      assert.equal(hashOf(kind as ObjectKind, Number(variant)), hash, `${kind} at variant ${variant} draws differently`);
    }
  }
  // The control: the hash has to be able to tell two models apart, or the six above prove nothing.
  assert.notEqual(hashOf("tree", 0.1), hashOf("oak", 0.1), "a tree and an oak hash the same");
});

/** Each of the three shapes a kind is drawn in, so a spec that reads past its tiers is caught here. */
test("every tree and every rock builds, and no two tiers draw the same", () => {
  const seen = new Map<string, ObjectKind>();
  for (const kind of [...TREE_KINDS, ...ORE_KINDS, "rock"] as ObjectKind[]) {
    for (const variant of [0.1, 0.4, 0.8]) {
      const hash = `${variant}:${hashOf(kind, variant)}`;
      const already = seen.get(hash);
      assert.equal(already, undefined, `${kind} draws exactly like ${already} at variant ${variant}`);
      seen.set(hash, kind);
    }
  }
});

/**
 * ⛔ Every item has a model of its own. An item with no entry in the table falls back to a small
 * sack — which is what seventy of Phase 8's items looked like until this check went in, and nothing
 * else could see it: the icons rendered, they were just all the same blob.
 */
test("every item draws as itself, not as the fallback sack", async () => {
  const { itemGeometry } = await import("../../src/client/render/items.ts");
  const { ITEMS } = await import("../../src/shared/items.ts");
  const hashes = new Map<string, string[]>();
  for (const def of ITEMS) {
    const g = itemGeometry(def.id);
    const h = createHash("sha256");
    for (const name of ["position", "color"]) {
      const attr = g.getAttribute(name) as THREE.BufferAttribute | undefined;
      if (attr) h.update(Buffer.from((attr.array as Float32Array).buffer));
    }
    const key = h.digest("hex").slice(0, 16);
    hashes.set(key, [...(hashes.get(key) ?? []), def.name]);
  }
  // The fallback: whatever an unknown key draws. Anything sharing its shape has no model of its own.
  const sack = (() => {
    const g = itemGeometry(-1);
    const h = createHash("sha256");
    for (const name of ["position", "color"]) {
      const attr = g.getAttribute(name) as THREE.BufferAttribute | undefined;
      if (attr) h.update(Buffer.from((attr.array as Float32Array).buffer));
    }
    return h.digest("hex").slice(0, 16);
  })();
  assert.equal(hashes.get(sack), undefined, `these items draw as the fallback sack: ${hashes.get(sack)?.join(", ")}`);
  // And no two items share a model, which is how a shop full of bars stopped being one beige disc.
  const shared = [...hashes.values()].filter((names) => names.length > 1);
  assert.deepEqual(shared, [], `these items draw as each other: ${shared.map((n) => n.join(" = ")).join("; ")}`);
});

/**
 * Every prop and every edge kind builds, and no two draw alike: a well is not a barrel, a chest is not a
 * crate. The stall is left out because it is the counter by design. A tag that changes a model — the
 * cave wall of Stonecote Hollow — draws differently from the plain kind, with the ruin as the control.
 */
test("every prop and wall kind builds, and no two draw the same", () => {
  const seen = new Map<string, ObjectKind>();
  for (const kind of [...PROP_KINDS, ...EDGE_KINDS] as ObjectKind[]) {
    if (kind === "stall") continue;
    const hash = hashOf(kind, 0.4);
    const already = seen.get(hash);
    assert.equal(already, undefined, `${kind} draws exactly like ${already}`);
    seen.set(hash, kind);
  }
  assert.notEqual(hashOf("stone_wall", 0.4, "cave"), hashOf("stone_wall", 0.4), "a cave wall is not a curtain wall");
  assert.notEqual(hashOf("stone_wall", 0.4, "ruin"), hashOf("stone_wall", 0.4), "the control: a ruin already draws differently");
});
