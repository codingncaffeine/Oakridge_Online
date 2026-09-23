import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import type * as THREE from "three";
import { blankMap, ORE_KINDS, TREE_KINDS, type ObjectKind } from "../../src/shared/map.ts";

// leafTexture() wants a canvas; nothing here ever draws, so a no-op stands in for one.
const noop = new Proxy({}, { get: () => () => undefined, set: () => true });
(globalThis as Record<string, unknown>).document = { createElement: () => ({ width: 0, height: 0, getContext: () => noop }) };
const { buildObjects } = await import("../../src/client/render/objects.ts");

/** Every vertex of every part an object draws, as one short hash. */
function hashOf(kind: ObjectKind, variant: number): string {
  const map = blankMap(4, 4);
  map.objects.push({ id: 0, kind, x: 1, y: 1, plane: 0, side: 0, variant });
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
