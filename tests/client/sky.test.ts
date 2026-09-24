// The sky's colours (PLAN Phase 16): they blend through the day, meet themselves at midnight, and at
// noon are exactly the daylight the village was approved under.
import assert from "node:assert/strict";
import { test } from "node:test";
import { GROUND_LIGHT, SKY_KEYS, SKY_LIGHT } from "../../src/client/palette.ts";
import { rgb, skyAt, type Rgb } from "../../src/client/render/skycolours.ts";

const close = (a: Rgb, b: Rgb, eps = 0.02) => a.every((v, i) => Math.abs(v - b[i]!) < eps);
const lum = (c: Rgb) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

test("the sky's colours blend through the day and meet themselves at midnight", () => {
  assert.ok(close(skyAt(0.999).zenith, skyAt(0.001).zenith), "no seam at midnight");
  assert.ok(close(skyAt(0.999).horizon, skyAt(0.001).horizon), "on the horizon either");
  assert.deepEqual(skyAt(0.5).sky, rgb(SKY_LIGHT), "noon's light from above is the village's approved daylight");
  assert.deepEqual(skyAt(0.5).ground, rgb(GROUND_LIGHT), "and from below");
  assert.deepEqual(skyAt(0.4), skyAt(0.6), "the middle of the day holds still");
  assert.ok(lum(skyAt(0).zenith) < lum(skyAt(0.26).zenith) && lum(skyAt(0.26).zenith) < lum(skyAt(0.5).zenith), "brighter from midnight through dawn to noon");
  assert.ok(lum(skyAt(0.5).zenith) > lum(skyAt(0.74).zenith) && lum(skyAt(0.74).zenith) > lum(skyAt(0.9).zenith), "and darker from noon through dusk to night");
  const dawn = skyAt(0.26).horizon, noon = skyAt(0.5).horizon;
  assert.ok(dawn[0] - dawn[2] > noon[0] - noon[2], "dawn's horizon is warmer than noon's");
  // Between two keys the colour is between them: never past either.
  for (let p = 0; p < 1; p += 0.01) {
    const c = skyAt(p);
    for (const v of [...c.zenith, ...c.horizon, ...c.sun, ...c.sky, ...c.ground]) assert.ok(v >= 0 && v <= 1, `a colour part at ${p.toFixed(2)} is 0 to 1`);
  }
  assert.equal(SKY_KEYS[0]!.at, 0);
  assert.equal(SKY_KEYS.at(-1)!.at, 1);
  for (let i = 1; i < SKY_KEYS.length; i++) assert.ok(SKY_KEYS[i]!.at > SKY_KEYS[i - 1]!.at, "the keys are in order");
});
