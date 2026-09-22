import assert from "node:assert/strict";
import { test } from "node:test";
import * as palette from "../src/client/palette.ts";
import { BODY_B, isValidLook, LOOK, LOOK_SLOTS, lookFromSeed, normalizeLook, STARTER_LOOK } from "../src/shared/look.ts";
import { parseC2S } from "../src/shared/protocol.ts";

test("look validation: length, range and integers", () => {
  assert.ok(isValidLook(STARTER_LOOK));
  assert.ok(!isValidLook(STARTER_LOOK.slice(1)), "too short");
  const outOfRange = STARTER_LOOK.slice();
  outOfRange[LOOK.hair] = LOOK_SLOTS[LOOK.hair]!.count;
  assert.ok(!isValidLook(outOfRange));
  const fractional = STARTER_LOOK.slice();
  fractional[LOOK.skin] = 1.5;
  assert.ok(!isValidLook(fractional));
  assert.ok(!isValidLook("nope"));
});

test("body type B never has facial hair", () => {
  const b = STARTER_LOOK.slice();
  b[LOOK.body] = BODY_B;
  assert.equal(normalizeLook(b)[LOOK.beard], 0);
  assert.equal(normalizeLook(STARTER_LOOK)[LOOK.beard], STARTER_LOOK[LOOK.beard], "type A keeps it");
  for (let seed = 0; seed < 200; seed++) {
    const l = lookFromSeed(seed);
    assert.ok(isValidLook(l));
    if (l[LOOK.body] === BODY_B) assert.equal(l[LOOK.beard], 0);
  }
});

test("enter and look messages carry only valid looks", () => {
  assert.deepEqual(parseC2S(JSON.stringify({ t: "enter", look: STARTER_LOOK })), { t: "enter", look: STARTER_LOOK });
  assert.deepEqual(parseC2S(JSON.stringify({ t: "enter" })), { t: "enter" });
  assert.equal(parseC2S(JSON.stringify({ t: "enter", look: [99] })), null);
  assert.equal(parseC2S(JSON.stringify({ t: "look", look: [99] })), null);
});

test("the client has a name or colour for every choice in every slot", () => {
  const lists: Record<string, unknown[]> = {
    body: palette.BODY_TYPES, hair: palette.HAIR_STYLES, beard: palette.BEARD_STYLES, torso: palette.TORSO_STYLES,
    arms: palette.ARM_STYLES, hands: palette.HAND_STYLES, legs: palette.LEG_STYLES, feet: palette.FEET_STYLES,
    skin: palette.SKIN, hairColor: palette.HAIR, topColor: palette.CLOTH, legsColor: palette.CLOTH, feetColor: palette.FOOTWEAR,
  };
  for (const slot of LOOK_SLOTS) {
    assert.ok(lists[slot.key], `no list for ${slot.key}`);
    assert.ok(lists[slot.key]!.length >= slot.count, `${slot.key}: ${lists[slot.key]!.length} < ${slot.count}`);
  }
});

test("chat text: invisible and control characters are dropped, spaces collapsed, length capped", () => {
  const zw = String.fromCharCode(0x200b), ls = String.fromCharCode(0x2028), bell = String.fromCharCode(7), rtl = String.fromCharCode(0x202e);
  assert.deepEqual(parseC2S(JSON.stringify({ t: "chat", text: `  he${zw}llo${ls}  wor${bell}ld${rtl} ` })), { t: "chat", text: "hello world" });
  assert.equal(parseC2S(JSON.stringify({ t: "chat", text: `${zw}${bell}` })), null, "nothing left to say");
  assert.equal((parseC2S(JSON.stringify({ t: "chat", text: "x".repeat(300) })) as { text: string }).text.length, 80);
});
