import assert from "node:assert/strict";
import { test } from "node:test";
import { buildHead, BROW_T, EYE_T, FACE, headPoint, HEAD_Y } from "../src/client/render/head.ts";
import { MeshBuilder } from "../src/client/render/meshkit.ts";
import { EYE_DARK } from "../src/client/palette.ts";

const SKIN = 0xf2c9a0, HAIR = 0x5e3a1e;
const head = (hairStyle = 0, beard = 0) => {
  const b = new MeshBuilder();
  buildHead(b, { skin: SKIN, hair: HAIR, hairStyle, beard });
  return b.build();
};
/** How far it is round the outline: the head's own coordinates. */
const POINTS = 14;

function bounds(g: ReturnType<typeof head>) {
  const p = g.getAttribute("position");
  const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (let i = 0; i < p.count; i++) {
    box.minX = Math.min(box.minX, p.getX(i)); box.maxX = Math.max(box.maxX, p.getX(i));
    box.minY = Math.min(box.minY, p.getY(i)); box.maxY = Math.max(box.maxY, p.getY(i));
    box.minZ = Math.min(box.minZ, p.getZ(i)); box.maxZ = Math.max(box.maxZ, p.getZ(i));
  }
  return box;
}

test("the head is a head's size, sitting on top of the neck", () => {
  const box = bounds(head());
  const width = box.maxX - box.minX;
  // Ears aside, it is about as wide as it is deep and a little taller than either.
  assert.ok(width > 0.2 && width < 0.28, `across the ears it is ${width.toFixed(3)} tiles`);
  assert.ok(box.maxY > HEAD_Y + 0.12 && box.maxY < 1.62, `the crown is at ${box.maxY.toFixed(3)}`);
  assert.ok(box.minY < 1.22, "the neck reaches down inside the collar");
  // The chin is carried out in front of the throat, so the front of the head is the face.
  assert.ok(box.maxZ > 0.1, `the face reaches z ${box.maxZ.toFixed(3)}`);
});

/**
 * What makes this a face is not features but where the light falls off: the brow stands out over the
 * eyes and leaves them in shadow, and the middle of the face swells into a nose. Both are millimetres,
 * and both vanish if a ring is retyped, with nothing else to show for it.
 */
test("the brow stands out over the eyes, and the face swells down the middle into a nose", () => {
  // Beside the nose, where the eyes go: the brow is proud of the band the eyes sit in.
  const brow = headPoint(BROW_T, FACE - 1)[2], socket = headPoint(EYE_T, FACE - 1)[2];
  assert.ok(brow - socket > 0.003, `the brow stands ${((brow - socket) * 1000).toFixed(1)} mm out over the eyes`);
  // The nose: the middle of the face, against the same height a step to the side of it.
  const nose = headPoint(0.5, FACE)[2] - headPoint(0.5, FACE - 1)[2];
  // The control is the same measurement at the crown, where there is no ridge and the outline alone
  // still puts the middle furthest forward: a nose has to be several times that to be a nose.
  const plain = headPoint(0.95, FACE)[2] - headPoint(0.95, FACE - 1)[2];
  assert.ok(nose > 0.012, `the nose swells ${(nose * 1000).toFixed(1)} mm`);
  assert.ok(nose > plain * 4, `the nose (${nose.toFixed(4)}) is a ridge, not the outline (${plain.toFixed(4)})`);
});

/** The nearest point on the skull to `p`, over a fine grid of its surface. */
function nearestSurface(p: [number, number, number]): [number, number, number] {
  let best = Infinity, at: [number, number, number] = p;
  for (let t = 0; t <= 1.0001; t += 0.02) {
    for (let k = 0; k < POINTS; k += 0.1) {
      const q = headPoint(t, k);
      const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
      if (d < best) { best = d; at = q; }
    }
  }
  return at;
}
/** How far a point is from the middle of the head: further than the surface means it stands proud. */
const outFromMiddle = (p: [number, number, number]) => Math.hypot(p[0], (p[1] - HEAD_Y) * 0.9, p[2]);

/**
 * An eye set behind the surface vanishes inside the head and the face goes blank — which is exactly
 * what a typecheck, a build and a screenshot of the back of the head all pass.
 */
test("every eye lies on the face, not inside it", () => {
  const g = head();
  const p = g.getAttribute("position"), c = g.getAttribute("color");
  const eye = [EYE_DARK >> 16 & 255, EYE_DARK >> 8 & 255, EYE_DARK & 255].map((v) => (v / 255) ** 2.2);
  let vertices = 0;
  for (let i = 0; i < p.count; i++) {
    // The eyes are the only part painted that colour (light skin, so it is not darkened further).
    if (Math.abs(c.getX(i) - eye[0]!) > 0.02 || Math.abs(c.getY(i) - eye[1]!) > 0.02 || Math.abs(c.getZ(i) - eye[2]!) > 0.02) continue;
    vertices++;
    const v: [number, number, number] = [p.getX(i), p.getY(i), p.getZ(i)];
    const surface = nearestSurface(v);
    assert.ok(
      outFromMiddle(v) > outFromMiddle(surface),
      `an eye corner at ${v.map((n) => n.toFixed(3)).join(", ")} is inside the head`,
    );
    // It is ON the face, not floating off it: a couple of millimetres, no more.
    const gap = Math.hypot(v[0] - surface[0], v[1] - surface[1], v[2] - surface[2]);
    assert.ok(gap < 0.008, `an eye corner stands ${(gap * 1000).toFixed(1)} mm off the face`);
    // Both eyes are on the front of the head, above the middle of it.
    assert.ok(v[2] > 0.08 && v[1] > HEAD_Y, "an eye is somewhere other than the face");
  }
  assert.equal(vertices, 24, "two eyes, four triangles each");
  // The control: the same check on a point pushed the other way calls it inside, so it can see the fault.
  const sunk = headPoint(0.58, FACE - 1, -0.004);
  assert.ok(outFromMiddle(sunk) < outFromMiddle(nearestSurface(sunk)), "a sunken eye is not reported as proud");
});

test("every hair and beard builds a solid mesh", () => {
  for (let hairStyle = 0; hairStyle < 8; hairStyle++) {
    for (let beard = 0; beard < 6; beard++) {
      const p = head(hairStyle, beard).getAttribute("position");
      assert.ok(p.count > 300, `hair ${hairStyle}, beard ${beard}: only ${p.count} vertices`);
      for (let i = 0; i < p.count; i++) {
        // A NaN anywhere drops the whole mesh from the scene with nothing logged.
        assert.ok(Number.isFinite(p.getX(i)) && Number.isFinite(p.getY(i)) && Number.isFinite(p.getZ(i)),
          `hair ${hairStyle}, beard ${beard}: vertex ${i} is not a number`);
      }
    }
  }
});
