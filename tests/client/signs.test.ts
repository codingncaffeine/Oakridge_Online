// The trades' signs as drawn: that every trade's board is painted with a picture of its own, and that the
// board stands out from the wall over the street, never into the building, whichever wall it hangs on.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { blankMap, SIGN_ICONS, type MapObject } from "../../src/shared/map.ts";

// The textures want a canvas; nothing here needs its pixels, so a no-op stands in for one.
const noop = new Proxy({}, { get: () => () => undefined, set: () => true });
(globalThis as Record<string, unknown>).document = { createElement: () => ({ width: 0, height: 0, getContext: () => noop }) };
const { paintSign } = await import("../../src/client/render/signs.ts");
const { buildObjects } = await import("../../src/client/render/objects.ts");

/** A 2D context that writes down everything asked of it, so two paintings can be compared without pixels. */
function recorder(): { g: CanvasRenderingContext2D; log: string[] } {
  const log: string[] = [];
  const say = (v: unknown) => (typeof v === "number" ? v.toFixed(2) : String(v));
  const g = new Proxy({}, {
    get: (_t, name) => (...args: unknown[]) => void log.push(`${String(name)}(${args.map(say).join(",")})`),
    set: (_t, name, value) => {
      log.push(`${String(name)}=${say(value)}`);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { g, log };
}

test("every trade's sign is painted with a picture of its own", () => {
  const bare = recorder();
  paintSign(bare.g, "no-such-trade");
  assert.ok(bare.log.some((l) => l.startsWith("strokeRect")) && !bare.log.some((l) => l.startsWith("translate")), "the control: an unknown tag gets the board and its panel, and no picture");
  const painted = new Map<string, string>();
  for (const icon of SIGN_ICONS) {
    const { g, log } = recorder();
    paintSign(g, icon);
    assert.ok(log.length > bare.log.length + 12, `${icon} paints a picture on its panel (${log.length - bare.log.length} steps past the bare board)`);
    const key = log.join(";");
    for (const [other, done] of painted) assert.notEqual(key, done, `${icon} is not painted as ${other} is`);
    painted.set(icon, key);
  }
});

test("a sign stands out from the wall over the street on every side, and both its faces are painted", () => {
  // Where each side's edge is, in the scene (z is south), and which way is out of the building.
  const edge = (x: number, y: number, side: number): readonly [number, number] =>
    ([[x + 0.5, -(y + 1)], [x + 1, -(y + 0.5)], [x + 0.5, -y], [x, -(y + 0.5)]] as const)[side]!;
  const out: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  for (const side of [0, 1, 2, 3] as const) {
    const map = blankMap(8, 8);
    const sign: MapObject = { id: 1, kind: "sign", x: 3, y: 3, plane: 0, side, variant: 0.5, tag: "anvil" };
    map.objects.push(sign);
    const faces = buildObjects(map).group.children.find((c) => ((c as THREE.InstancedMesh).material as THREE.MeshLambertMaterial).map) as THREE.InstancedMesh;
    assert.ok(faces && faces.geometry.getAttribute("uv"), `side ${side}: the painted faces are drawn, with their picture mapped`);
    faces.geometry.computeBoundingBox();
    const centre = faces.geometry.boundingBox!.getCenter(new THREE.Vector3());
    const m = new THREE.Matrix4();
    faces.getMatrixAt(0, m);
    centre.applyMatrix4(m);
    const [ex, ez] = edge(3, 3, side), [ox, oz] = out[side]!;
    const reach = (centre.x - ex) * ox + (centre.z - ez) * oz;
    assert.ok(reach > 0.3, `side ${side}: the board stands ${reach.toFixed(2)} out from the wall, over the street`);
    const normals = faces.geometry.getAttribute("normal");
    const facing = new Set<number>();
    for (let i = 0; i < normals.count; i++) facing.add(Math.sign(Math.round(normals.getX(i))));
    assert.deepEqual([...facing].sort(), [-1, 1], `side ${side}: a face on either side of the board`);
  }
});
