import assert from "node:assert/strict";
import { test } from "node:test";
import { taperedBox } from "../src/client/render/meshkit.ts";

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
