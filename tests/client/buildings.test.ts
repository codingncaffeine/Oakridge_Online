// The stone village (2026-09-24): that a wall is a storey tall and a door most of that, that the stone
// is textured and the texture is actually read, that every building gets its own roof even wall to
// wall with the next, and that every roof face points at the sky.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { blankMap, ROOF_CLAY, ROOF_GABLE, ROOF_KEEP, ROOF_SLATE, type MapObject, type WorldMap } from "../../src/shared/map.ts";
import { boxOf, building, STOREY, WorldBuilder } from "../../src/shared/worldgen.ts";

// The textures want a canvas; nothing here ever draws, so a no-op stands in for one.
const noop = new Proxy({}, { get: () => () => undefined, set: () => true });
(globalThis as Record<string, unknown>).document = { createElement: () => ({ width: 0, height: 0, getContext: () => noop }) };
const { buildObjects, DOOR_HEIGHT, WALL_HEIGHT } = await import("../../src/client/render/objects.ts");
const { Roofs } = await import("../../src/client/render/roofs.ts");
const { MeshBuilder } = await import("../../src/client/render/meshkit.ts");
const { surfaces } = await import("../../src/client/render/surfaces.ts");

/** The instanced meshes that draw `o`, in the order the model lists its parts. */
function meshesOf(group: THREE.Group, o: MapObject): THREE.InstancedMesh[] {
  return group.children.filter((c) => ((c as THREE.InstancedMesh).userData.items as MapObject[] | undefined)?.includes(o)) as THREE.InstancedMesh[];
}

const top = (g: THREE.BufferGeometry) => {
  g.computeBoundingBox();
  return g.boundingBox!.max.y;
};

test("a wall stands a storey tall, and a door is most of that and swings without its frame", () => {
  const map = blankMap(6, 6);
  const wall: MapObject = { id: 1, kind: "wall", x: 2, y: 2, plane: 0, side: 2, variant: 0.3, tall: 1 };
  const door: MapObject = { id: 2, kind: "door", x: 3, y: 2, plane: 0, side: 2, variant: 0.3, tall: 1 };
  map.objects.push(wall, door);
  const objects = buildObjects(map);
  assert.equal(WALL_HEIGHT, STOREY, "the wall is exactly a storey, so an upper floor sits on it");
  const wallTop = Math.max(...meshesOf(objects.group, wall).map((m) => top(m.geometry)));
  assert.ok(Math.abs(wallTop - WALL_HEIGHT) < 0.02, `the wall's top is at ${wallTop.toFixed(2)}, not ${WALL_HEIGHT}`);

  // Open the door: the one part that moves is the leaf, and it is most of the wall's height. The
  // frame and the stone over the lintel stay exactly where they were.
  const before = meshesOf(objects.group, door).map((m) => {
    const at = new THREE.Matrix4();
    m.getMatrixAt(m.userData.items.indexOf(door), at);
    return at;
  });
  objects.setOpen(door, true);
  const moved = meshesOf(objects.group, door).filter((m, i) => {
    const at = new THREE.Matrix4();
    m.getMatrixAt(m.userData.items.indexOf(door), at);
    return !at.equals(before[i]!);
  });
  assert.equal(moved.length, 1, `exactly one part of a door swings (${moved.length} did)`);
  assert.ok(meshesOf(objects.group, door).length >= 2, "and there is a frame that does not");
  const leafTop = top(moved[0]!.geometry);
  assert.ok(leafTop >= DOOR_HEIGHT && leafTop >= 0.75 * WALL_HEIGHT, `the leaf reaches ${leafTop.toFixed(2)} of a ${WALL_HEIGHT} wall`);
});

test("the stone is textured, and the texture is read: every textured part carries UVs", () => {
  const map = blankMap(6, 6);
  const wall: MapObject = { id: 1, kind: "wall", x: 2, y: 2, plane: 0, side: 2, variant: 0.3, tall: 2 };
  const window: MapObject = { id: 2, kind: "wall_window", x: 3, y: 2, plane: 0, side: 2, variant: 0.3, tall: 1, tag: "keep" };
  map.objects.push(wall, window);
  const objects = buildObjects(map);
  let textured = 0;
  for (const o of [wall, window]) {
    for (const m of meshesOf(objects.group, o)) {
      const material = m.material as THREE.MeshLambertMaterial;
      if (!material.map) continue;
      textured++;
      assert.ok(m.geometry.getAttribute("uv"), `${o.kind}: a part drawn with a texture has UVs for it to land on`);
    }
  }
  assert.ok(textured >= 2, `the wall and the window are both drawn in textured stone (${textured} parts)`);
  assert.ok((surfaces().stone as THREE.MeshLambertMaterial).map, "the stone material has its texture");
  // The control: a builder given one part without UVs drops the attribute for the whole mesh, which is
  // what the check above is there to catch.
  const bare = new THREE.BufferGeometry();
  bare.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  const mixed = new MeshBuilder().add(new THREE.BoxGeometry(1, 1, 1), { color: 0xffffff }).add(bare, { color: 0xffffff }).build();
  assert.equal(mixed.getAttribute("uv"), undefined, "the control: a UV-less part loses the texture for everything");
});

/** Two buildings on one map, and whether the second stands wall to wall with the first. */
function pair(touching: boolean): WorldMap {
  const b = new WorldBuilder(24, 16, 100, 200, 1);
  building(b, { box: boxOf(102, 202, 108, 207), doors: [{ side: 2, along: 3 }] });
  building(b, { box: boxOf(touching ? 109 : 111, 202, 114, 207), doors: [{ side: 2, along: 2 }], roof: ROOF_KEEP, style: "keep", height: 2 });
  return b.plane(0);
}

test("every building gets its own roof, even wall to wall with the next; a keep's is flat behind a parapet", () => {
  const roofs = new Roofs(pair(true));
  assert.equal(roofs.group.children.length, 2, "two buildings sharing a wall are two roofs");
  // Which is which: the first footprint in scan order is the western, clay-tiled house.
  const materials = (g: THREE.Object3D) => {
    const out: THREE.Material[] = [];
    g.traverse((o) => { if ((o as THREE.Mesh).isMesh) out.push((o as THREE.Mesh).material as THREE.Material); });
    return out;
  };
  assert.ok(materials(roofs.group.children[0]!).includes(surfaces().clay), "the house wears clay tile");
  assert.ok(materials(roofs.group.children[1]!).includes(surfaces().stone), "the keep's roof is stone");
  // The keep's parapet stands above its two storeys of wall; the house's ridge stands above its one.
  const highest = (g: THREE.Object3D) => {
    let y = -Infinity;
    g.traverse((o) => { if ((o as THREE.Mesh).isMesh) y = Math.max(y, top((o as THREE.Mesh).geometry)); });
    return y;
  };
  assert.ok(highest(roofs.group.children[1]!) > 2 * STOREY + 0.2, "the keep's merlons stand on top of two storeys of wall");
  assert.ok(highest(roofs.group.children[0]!) > STOREY + 0.6, "the house's ridge rises above its eaves");
  // The control: with nothing walled between them, one building's tiles run into the next.
  const one = new WorldBuilder(24, 16, 100, 200, 1);
  building(one, { box: boxOf(102, 202, 114, 207), doors: [{ side: 2, along: 3 }], roof: ROOF_CLAY });
  assert.equal(new Roofs(one.plane(0)).group.children.length, 1, "one building is one roof");
  // And the style is read from the map, not guessed from the size: a small slate house is slate.
  const slate = new WorldBuilder(12, 12, 0, 0, 1);
  building(slate, { box: boxOf(2, 2, 5, 5), doors: [{ side: 2, along: 1 }], roof: ROOF_SLATE });
  assert.ok(materials(new Roofs(slate.plane(0)).group.children[0]!).includes(surfaces().slate), "a slate roof is slate");
});

test("every face of a hipped roof points at the sky", () => {
  for (const [w, h] of [[7, 6], [4, 9], [5, 5]] as const) {
    const b = new WorldBuilder(16, 16, 0, 0, 1);
    building(b, { box: boxOf(2, 2, 1 + w, 1 + h), doors: [{ side: 2, along: 1 }] });
    const roofs = new Roofs(b.plane(0));
    const found: THREE.Mesh[] = [];
    roofs.group.traverse((o) => { if (o.name === "roof") found.push(o as THREE.Mesh); });
    const slopes = found[0];
    assert.ok(slopes, "the roof has its slopes");
    const normal = slopes.geometry.getAttribute("normal") as THREE.BufferAttribute;
    for (let i = 0; i < normal.count; i++) assert.ok(normal.getY(i) > 0.1, `${w}×${h}: vertex ${i} faces up (${normal.getY(i).toFixed(2)})`);
  }
  // The control: a face wound the other way computes a normal that points down, which is what the
  // check above is there to catch.
  const wrong = new THREE.BufferGeometry();
  wrong.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 0, 1], 3));
  wrong.computeVertexNormals();
  assert.ok((wrong.getAttribute("normal") as THREE.BufferAttribute).getY(0) < 0, "the control face points down");
});

/**
 * Caldmoor's roof (PLAN Wave 4, #caldmoor): two steep slate slopes that face the sky, the ridge along the
 * longer side whichever way the building lies, between stone gables that stand up through the roof in
 * crow-steps and over its ridge, one at each end.
 */
test("a Caldmoor roof: steep slopes facing the sky, the ridge along the longer side, and crow-stepped gables standing over it", () => {
  for (const [w, h] of [[8, 6], [5, 9]] as const) {
    const b = new WorldBuilder(16, 16, 0, 0, 1);
    building(b, { box: boxOf(2, 2, 1 + w, 1 + h), doors: [{ side: 2, along: 1 }], roof: ROOF_GABLE });
    const group = new Roofs(b.plane(0)).group.children[0]!;
    const named = (name: string) => {
      let found: THREE.Mesh | undefined;
      group.traverse((o) => { if (o.name === name) found = o as THREE.Mesh; });
      return found!;
    };
    const slopes = named("roof"), gables = named("gable");
    assert.ok(slopes && gables, `${w}×${h}: slopes and gables`);
    assert.equal(slopes.material, surfaces().slate, "slate");
    assert.equal(gables.material, surfaces().stone, "and stone gables");
    const normal = slopes.geometry.getAttribute("normal") as THREE.BufferAttribute;
    for (let i = 0; i < normal.count; i++) assert.ok(normal.getY(i) > 0.4, `${w}×${h}: vertex ${i} of the slopes faces up (${normal.getY(i).toFixed(2)})`);
    slopes.geometry.computeBoundingBox();
    const s = slopes.geometry.boundingBox!;
    const along = w >= h ? s.max.x - s.min.x : s.max.z - s.min.z, across = w >= h ? s.max.z - s.min.z : s.max.x - s.min.x;
    assert.ok(along > across, `${w}×${h}: the ridge runs along the longer side (${along.toFixed(1)} along, ${across.toFixed(1)} across)`);
    assert.ok((s.max.y - s.min.y) / (across / 2) > 0.9, `${w}×${h}: steeper than Aldermarch's (${((s.max.y - s.min.y) / (across / 2)).toFixed(2)})`);
    gables.geometry.computeBoundingBox();
    const g = gables.geometry.boundingBox!;
    assert.ok(g.max.y > s.max.y, `${w}×${h}: the gables stand over the ridge`);
    const ends = w >= h ? [g.min.x, g.max.x] : [-g.max.z, -g.min.z];
    assert.ok(Math.abs(ends[0]! - 2) < 0.2 && Math.abs(ends[1]! - (2 + (w >= h ? w : h))) < 0.2, `${w}×${h}: one gable at each end (${ends.map((e) => e.toFixed(2)).join(" to ")})`);
    // Crow-steps: the gables are blocks of several widths, not one slab.
    const position = gables.geometry.getAttribute("position") as THREE.BufferAttribute;
    const widths = new Set<number>();
    for (let i = 0; i + 24 <= position.count; i += 24) {
      let lo = Infinity, hi = -Infinity;
      for (let k = i; k < i + 24; k++) {
        const v = w >= h ? position.getZ(k) : position.getX(k);
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
      widths.add(Math.round((hi - lo) * 100));
    }
    assert.ok(widths.size >= 3, `${w}×${h}: the gables climb in steps (${widths.size} widths)`);
  }
});

test("a round tower stands true: a stone drum under a slate cone, the same size and way round whatever its seed", () => {
  const map = blankMap(8, 8);
  const towers: MapObject[] = [0.1, 0.7].map((variant, i) => ({ id: i + 1, kind: "round_tower", x: 2 + 3 * i, y: 3, plane: 0, side: 0, variant }));
  map.objects.push(...towers);
  const group = buildObjects(map).group;
  const drum = meshesOf(group, towers[0]!).find((m) => m.material === surfaces().stone)!;
  const cap = meshesOf(group, towers[0]!).find((m) => m.material === surfaces().slate)!;
  assert.ok(drum && cap, "a stone drum and a slate cap");
  assert.ok(top(cap.geometry) > top(drum.geometry) + 2, "the cap rises well over the drum");
  // Each tower's drum, wherever its seed put it among the instanced meshes: the same size, the same way round.
  const placed = towers.map((t) => {
    const mesh = meshesOf(group, t).find((m) => m.material === surfaces().stone)!;
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    mesh.getMatrixAt((mesh.userData.items as MapObject[]).indexOf(t), m);
    m.decompose(p, q, s);
    return { q, s };
  });
  assert.ok(placed.every(({ s }) => Math.abs(s.x - 1) < 1e-6 && Math.abs(s.y - 1) < 1e-6), "neither drawn bigger nor smaller by its seed");
  assert.ok(placed[0]!.q.angleTo(placed[1]!.q) < 1e-6, "nor turned by it");
});
