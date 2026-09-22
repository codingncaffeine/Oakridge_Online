import assert from "node:assert/strict";
import { test } from "node:test";
import { loft, taperedBox, type Ring } from "../src/client/render/meshkit.ts";

/** Every triangle of a convex shape must face away from the point inside it. */
function facesOutward(g: ReturnType<typeof taperedBox>, inside: [number, number, number]): { total: number; inward: number } {
  const pos = g.getAttribute("position");
  let inward = 0;
  for (let t = 0; t < pos.count; t += 3) {
    const p = [0, 1, 2].map((k) => [pos.getX(t + k), pos.getY(t + k), pos.getZ(t + k)] as [number, number, number]);
    const u = [0, 1, 2].map((i) => p[1]![i]! - p[0]![i]!);
    const v = [0, 1, 2].map((i) => p[2]![i]! - p[0]![i]!);
    const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
    const centre = [0, 1, 2].map((i) => (p[0]![i]! + p[1]![i]! + p[2]![i]!) / 3);
    const away = [0, 1, 2].map((i) => centre[i]! - inside[i]!);
    if (n[0]! * away[0]! + n[1]! * away[1]! + n[2]! * away[2]! <= 0) inward++;
  }
  return { total: pos.count / 3, inward };
}

/**
 * Every face of a closed block must face outward. A face wound the other way is lit from inside, so it
 * renders black while the geometry still looks correct in every other respect — there is nothing to see
 * in a wireframe and nothing to catch in a typecheck.
 */
test("a tapered box has every face pointing away from its middle", () => {
  const w1 = 0.4, h1 = 0.3, w2 = 0.2, h2 = 0.5, length = 0.9;
  const g = taperedBox(w1, h1, w2, h2, length);
  const pos = g.getAttribute("position");
  assert.equal(pos.count % 3, 0, "the block is made of whole triangles");
  assert.equal(pos.count / 3, 12, "six quads, two triangles each");
  const middle = [0, 0, length / 2];

  let outward = 0;
  for (let t = 0; t < pos.count; t += 3) {
    const p = [0, 1, 2].map((k) => [pos.getX(t + k), pos.getY(t + k), pos.getZ(t + k)] as [number, number, number]);
    const u = [0, 1, 2].map((i) => p[1]![i]! - p[0]![i]!);
    const v = [0, 1, 2].map((i) => p[2]![i]! - p[0]![i]!);
    // The face normal, and the direction from the block's middle out to the face.
    const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
    const centre = [0, 1, 2].map((i) => (p[0]![i]! + p[1]![i]! + p[2]![i]!) / 3);
    const away = [0, 1, 2].map((i) => centre[i]! - middle[i]!);
    const dot = n[0]! * away[0]! + n[1]! * away[1]! + n[2]! * away[2]!;
    assert.ok(dot > 0, `triangle ${t / 3} faces inward (dot ${dot.toFixed(4)})`);
    outward++;
  }
  assert.equal(outward, 12);
});

test("a lofted hull has every face pointing away from its axis", () => {
  const rings: Ring[] = [[0.1, 0.09, 0], [0.22, 0.2, 0.3], [0.18, 0.17, 0.7], [0.06, 0.06, 1]];
  for (const sides of [6, 8, 10]) {
    const { total, inward } = facesOutward(loft(rings, sides), [0, 0, 0.5]);
    assert.equal(inward, 0, `${sides} sides: ${inward} of ${total} faces are inside out`);
    assert.equal(total, sides * 2 * (rings.length - 1) + sides * 2, `${sides} sides: walls plus both caps`);
  }
});

test("a lofted hull closes to a point where a ring has no size", () => {
  // A snout or a tail tip: the end ring is a point, so there is no cap to draw there.
  const blunt = loft([[0.2, 0.2, 0], [0.2, 0.2, 1]], 8);
  const pointed = loft([[0.2, 0.2, 0], [0, 0, 1]], 8);
  assert.equal(blunt.getAttribute("position").count / 3, 8 * 2 + 8 * 2, "two triangles a side, plus both caps");
  // Against a point the quads collapse to one triangle each, and there is no cap to draw on that end.
  assert.equal(pointed.getAttribute("position").count / 3, 8 + 8, "one triangle a side, plus the blunt cap");
  assert.equal(facesOutward(pointed, [0, 0, 0.3]).inward, 0);
});

test("a lofted hull is the size its rings ask for", () => {
  const g = loft([[0.1, 0.05, 0], [0.3, 0.2, 0.8]], 8);
  const pos = g.getAttribute("position");
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity, minZ = Infinity;
  for (let i = 0; i < pos.count; i++) {
    maxX = Math.max(maxX, pos.getX(i));
    maxY = Math.max(maxY, pos.getY(i));
    maxZ = Math.max(maxZ, pos.getZ(i));
    minZ = Math.min(minZ, pos.getZ(i));
  }
  assert.ok(Math.abs(maxX - 0.3) < 1e-6, `widest ring sets the width (${maxX})`);
  assert.ok(Math.abs(maxY - 0.2) < 1e-6, `tallest ring sets the height (${maxY})`);
  assert.ok(Math.abs(minZ) < 1e-6 && Math.abs(maxZ - 0.8) < 1e-6, "it runs from the first ring to the last");
});

test("a tapered box is the size it was asked for", () => {
  const g = taperedBox(0.4, 0.3, 0.2, 0.5, 0.9);
  const pos = g.getAttribute("position");
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    minX = Math.min(minX, pos.getX(i));
    maxX = Math.max(maxX, pos.getX(i));
    minZ = Math.min(minZ, pos.getZ(i));
    maxZ = Math.max(maxZ, pos.getZ(i));
    maxY = Math.max(maxY, pos.getY(i));
  }
  // Positions are stored as 32-bit floats, so these are compared within that precision.
  const near = (got: number, want: number, what: string) => assert.ok(Math.abs(got - want) < 1e-6, `${what}: ${got} is not ${want}`);
  near(maxX - minX, 0.4, "as wide as its widest end");
  near(minZ, 0, "it starts at the origin");
  near(maxZ, 0.9, "and runs its full length along +z");
  near(maxY, 0.25, "as tall as its tallest end");
});
