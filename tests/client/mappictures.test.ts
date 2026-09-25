// The map's pictures (ui/mappictures.ts): a region is rendered once and kept at every scale the map
// draws at, a scale keeps at least what one draw showed, a picture missing at one scale is made from
// a bigger one rather than rendered again, every scale goes when the region changes, and a frame's
// request renders one picture at most.
import assert from "node:assert/strict";
import { test } from "node:test";
import { blankMap, type Box } from "../../src/shared/map.ts";
import type { Overhead } from "../../src/client/render/overhead.ts";

// A picture is a canvas; nothing here draws, so a bare object with a size stands in for one.
const context = { imageSmoothingEnabled: false, imageSmoothingQuality: "low", drawImage: () => undefined, getImageData: () => ({ data: new Uint8ClampedArray(4) }) };
const canvas = () => ({ width: 0, height: 0, getContext: () => context });
(globalThis as Record<string, unknown>).document = { createElement: canvas };
const { MapPictures, SCALES } = await import("../../src/client/ui/mappictures.ts");

/** A world of 8×8 regions, every one built, with a set of pictures over it whose renders are counted. */
function world() {
  const map = blankMap(512, 512);
  const regions = [...map.regions.values()];
  const overhead = {
    picture: (box: Box, scale: number) => ({ width: (box.x1 - box.x0 + 1) * scale, height: (box.y1 - box.y0 + 1) * scale, getContext: () => context }),
  } as unknown as Overhead;
  const pictures = new MapPictures(overhead, map, { extrasFor: () => null });
  return { regions, pictures };
}

const rest = () => new Promise((r) => setTimeout(r, 12));

test("a region is rendered once and kept at every scale, each half the one above", () => {
  const { regions, pictures } = world();
  const r = regions[0]!;
  const small = pictures.request(r, 1);
  assert.ok(small, "the first request renders it");
  assert.equal(pictures.renders, 1);
  for (const scale of SCALES) {
    assert.ok(pictures.has(r, scale), `kept at ${scale} pixels a tile`);
    const picture = pictures.request(r, scale);
    assert.equal(picture?.width, 64 * scale, `${scale} pixels a tile is ${64 * scale} wide`);
  }
  assert.equal(pictures.renders, 1, "and nothing rendered again for the other scales");
  assert.equal(pictures.at(r).width, 512, "the rendered scale is the biggest");
});

test("a frame's request renders one picture at most; a check's `at` renders whatever it costs", async () => {
  const { regions, pictures } = world();
  assert.ok(pictures.request(regions[0]!, 2), "the first is rendered");
  assert.equal(pictures.request(regions[1]!, 2), null, "the second in the same frame's time is not");
  assert.equal(pictures.renders, 1);
  assert.ok(pictures.at(regions[2]!, 2), "asked outright, it is rendered now");
  assert.equal(pictures.renders, 2);
  await rest();
  assert.ok(pictures.request(regions[1]!, 2), "a frame's time later it is the second's turn");
  assert.equal(pictures.renders, 3);
});

test("a scale keeps at least what one draw showed, so a drag never renders again what it just drew", () => {
  const { regions, pictures } = world();
  const shown = regions.slice(0, 36);
  for (const r of shown) pictures.at(r, 8);
  assert.equal(pictures.renders, 36);
  assert.equal(pictures.count, 24, "unasked, the rendered scale keeps its usual two dozen");
  assert.equal(pictures.kept(1).count, 36, "the pixel-a-tile pictures are all kept");
  // A draw of 36 regions reserves room for them: the pass after the next renders nothing at all.
  pictures.reserve(8, 36);
  for (const r of shown) pictures.at(r, 8);
  const after = pictures.renders;
  assert.ok(after < 36 * 2, `the pass that fills the room renders only what was let go (${after - 36})`);
  for (const r of shown) pictures.at(r, 8);
  assert.equal(pictures.renders, after, "the pass after renders nothing");
  assert.equal(pictures.count, 36);
  pictures.reserve(8, 10);
  assert.equal(pictures.kept(8).keep, 36 + 8, "a smaller draw does not take the room back");
});

test("a picture let go at one scale is made from a bigger one that is kept, not rendered again", () => {
  const { regions, pictures } = world();
  pictures.reserve(8, 60);
  for (const r of regions.slice(0, 60)) pictures.at(r, 8);
  assert.equal(pictures.renders, 60);
  const first = regions[0]!;
  assert.ok(pictures.has(first, 8), "kept at the rendered scale, which made room for all sixty");
  assert.ok(!pictures.has(first, 4), "let go at the next scale down, which keeps fewer");
  const picture = pictures.request(first, 4);
  assert.equal(picture?.width, 256, "asked for, it is there");
  assert.equal(pictures.renders, 60, "made by halving the kept one, not rendered");
  assert.ok(pictures.has(first, 4), "and kept from now on");
});

test("a change in a region throws its picture away at every scale", () => {
  const { regions, pictures } = world();
  const r = regions[5]!;
  pictures.at(r, 1);
  pictures.invalidate(r.x0 + 3, r.y0 + 7);
  for (const scale of SCALES) assert.ok(!pictures.has(r, scale), `gone at ${scale}`);
  pictures.at(r, 2);
  assert.equal(pictures.renders, 2, "rendered again when next asked for");
  pictures.setMap(blankMap(64, 64));
  assert.equal(pictures.count, 0, "another plane starts with nothing");
});
