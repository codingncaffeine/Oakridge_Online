// A tuft of grass is blades, not a shrub: each blade is many times taller than it is wide, bows
// outward as it rises rather than leaning straight, takes the ground's light on both faces, and shows
// from either side.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { blankMap } from "../../src/shared/map.ts";
import { GRASS_ROOT, GRASS_TIP } from "../../src/client/palette.ts";
import { BLADE_LEAN, BLADE_WIDTH, BLADES, buildGrass, tuftGeometry } from "../../src/client/render/grass.ts";

/** Vertex `i` of the geometry. */
const vertex = (g: THREE.BufferGeometry, i: number): [number, number, number] => {
  const a = g.getAttribute("position");
  return [a.getX(i), a.getY(i), a.getZ(i)];
};

/** A blade is three faces wound both ways: 18 vertices, of which the first nine are one winding. */
const PER_BLADE = 18;

test("a blade is a thin strip that bows outward, not a spike", () => {
  const g = tuftGeometry();
  assert.equal(g.getAttribute("position").count, BLADES * PER_BLADE, "seven blades of three faces, each face wound both ways");
  for (let b = 0; b < BLADES; b++) {
    const at = (i: number) => vertex(g, b * PER_BLADE + i);
    // The first face is root-left, root-right, joint-right; the last is joint-left, joint-right, tip.
    const [r0, r1, j1] = [at(0), at(1), at(2)];
    const [j0, top] = [at(12), at(14)];
    const width = Math.hypot(r1[0] - r0[0], r1[2] - r0[2]);
    assert.ok(Math.abs(width - 2 * BLADE_WIDTH) < 1e-6, `blade ${b} is two half-widths wide at the root (${width.toFixed(3)})`);
    assert.ok(top[1] >= 5 * width, `blade ${b} is at least five times taller (${top[1].toFixed(3)}) than wide (${width.toFixed(3)})`);
    assert.ok(r0[1] === 0 && r1[1] === 0, `blade ${b} is rooted on the ground`);
    // It bows: the tip is well out from the root, and the joint is less far out than a straight lean
    // would put it, so the blade curves outward rather than leaning like a stick.
    const rootMid: [number, number] = [(r0[0] + r1[0]) / 2, (r0[2] + r1[2]) / 2];
    const jointMid: [number, number] = [(j0[0] + j1[0]) / 2, (j0[2] + j1[2]) / 2];
    const tipOut = Math.hypot(top[0] - rootMid[0], top[2] - rootMid[1]);
    const jointOut = Math.hypot(jointMid[0] - rootMid[0], jointMid[1] - rootMid[1]);
    const jointUp = (j0[1] + j1[1]) / 2;
    assert.ok(tipOut >= 0.6 * BLADE_LEAN, `blade ${b}'s tip curls out (${tipOut.toFixed(3)})`);
    assert.ok(jointOut < (jointUp / top[1]) * tipOut, `blade ${b} bows (joint ${jointOut.toFixed(3)} out at ${jointUp.toFixed(3)} up, tip ${tipOut.toFixed(3)} out at ${top[1].toFixed(3)})`);
    assert.ok(jointUp > 0.4 * top[1] && jointUp < 0.7 * top[1], `blade ${b}'s joint is past halfway up`);
    // Wound both ways: the second copy of each face is the first with two corners swapped.
    for (let f = 0; f < 3; f++) {
      const [p, q, s] = [at(f * 6), at(f * 6 + 1), at(f * 6 + 2)];
      assert.deepEqual([at(f * 6 + 3), at(f * 6 + 4), at(f * 6 + 5)], [p, s, q], `blade ${b} face ${f} shows from both sides`);
    }
  }
});

test("every blade takes the ground's light: normals straight up, root dark and tip light", () => {
  const g = tuftGeometry();
  const n = g.getAttribute("normal"), c = g.getAttribute("color");
  for (let i = 0; i < n.count; i++) assert.deepEqual([n.getX(i), n.getY(i), n.getZ(i)], [0, 1, 0], `vertex ${i} faces up`);
  const root = new THREE.Color(GRASS_ROOT), tip = new THREE.Color(GRASS_TIP);
  const lum = (r: number, gg: number, b: number) => 0.2126 * r + 0.7152 * gg + 0.0722 * b;
  assert.ok(lum(tip.r, tip.g, tip.b) > lum(root.r, root.g, root.b), "the tip colour is the lighter one");
  for (let b = 0; b < BLADES; b++) {
    const at = (i: number) => [c.getX(b * PER_BLADE + i), c.getY(b * PER_BLADE + i), c.getZ(b * PER_BLADE + i)] as const;
    assert.ok(Math.abs(at(0)[1] - root.g) < 1e-6, `blade ${b}'s root wears the root colour`);
    assert.ok(Math.abs(at(14)[1] - tip.g) < 1e-6, `blade ${b}'s tip wears the tip colour`);
    assert.ok(at(2)[1] > at(0)[1] && at(2)[1] < at(14)[1], `blade ${b}'s joint is between the two`);
  }
});

test("a field's grass is one instanced mesh of tufts, lit on the face it shows", () => {
  const map = blankMap(16, 16);
  const mesh = buildGrass(map, { x0: 0, y0: 0, x1: 15, y1: 15 });
  assert.ok(mesh, "grass grows on a field");
  assert.ok(mesh.count > 5, `${mesh.count} tufts`);
  assert.equal(mesh.userData.tufts, mesh.count);
  const material = mesh.material as THREE.MeshLambertMaterial;
  assert.equal(material.side, THREE.FrontSide, "every face is a front face: the both-ways winding does the showing, not a flipped normal");
  assert.equal(material.vertexColors, true, "the root-to-tip colours are read");
  assert.equal(mesh.geometry, tuftGeometry(), "every tuft is the one model");
});
