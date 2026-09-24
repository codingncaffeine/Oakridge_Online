// The resource preview (#resources): every rung of the three ladders standing side by side, so the
// eight trees, the nine rocks and the four kinds of fishing spot can be judged without walking a map
// to find them. With a beacon it also posts a close-up of each one.
import * as THREE from "three";
import { CATCHES, RESOURCES, type FishingMethod } from "../shared/gathering.ts";
import { item } from "../shared/items.ts";
import {
  blankMap, heightAt, ORE_KINDS, OVERLAY_WATER, setOverlay, setUnderlay, TREE_KINDS, UNDERLAY_SAND, type ObjectKind, type WorldMap,
} from "../shared/map.ts";
import { OBJECT_INFO, SPOT_INFO } from "./info.ts";
import {
  FOG_COLOR, GROUND_LIGHT, SKY_INTENSITY, SKY_LIGHT, SUN_COLOR, SUN_FROM, SUN_INTENSITY,
} from "./palette.ts";
import { OrbitCamera } from "./render/camera.ts";
import { groundGeometry, itemMaterial } from "./render/items.ts";
import { buildObjects, MAX_OBJECT_SCALE, objectSize } from "./render/objects.ts";
import { FishingSpots } from "./render/spots.ts";
import { buildTerrain } from "./render/terrain.ts";

/** Which row each ladder stands on, and the gap left around the edge. */
const TREE_ROW = 14;
const ROCK_ROW = 7;
const WATER_ROW = 2;
const MARGIN = 4;
/** Tiles between one rock and the next; trees are spaced by their own canopies, which differ a lot. */
const ROCK_SPACING = 3.4;

/** One thing in the line-up: what it is called, where it stands, and how high its label floats. */
interface Marked {
  label: string;
  x: number;
  y: number;
  lift: number;
}

export function startResourcePreview(container: HTMLElement, beacon: ((line: string) => Promise<void>) | null): void {
  // Each tree takes the room its own canopy needs, so a heartoak does not stand inside its neighbours.
  const trees: Array<{ kind: ObjectKind; x: number }> = [];
  let along = MARGIN;
  for (const kind of TREE_KINDS) {
    const { radius } = objectSize(kind);
    along += radius * MAX_OBJECT_SCALE;
    trees.push({ kind, x: Math.round(along) });
    along += radius * MAX_OBJECT_SCALE + 0.6;
  }
  const width = Math.ceil(Math.max(along + MARGIN, MARGIN * 2 + ORE_KINDS.length * ROCK_SPACING));
  const map: WorldMap = blankMap(width, TREE_ROW + 6);
  // A strip of water along the front for the fishing spots, with a sandy bank in front of it.
  for (let x = 1; x < width - 1; x++) {
    setUnderlay(map, x, WATER_ROW - 1, UNDERLAY_SAND);
    for (let y = WATER_ROW; y < WATER_ROW + 3; y++) setOverlay(map, x, y, OVERLAY_WATER);
  }

  const marks: Marked[] = [];
  const at = (i: number) => MARGIN + i * ROCK_SPACING;
  // Trees on the back row, rocks in front of them, both worst to best from the left.
  for (const { kind, x } of trees) {
    map.objects.push({ id: map.objects.length, kind, x, y: TREE_ROW, plane: 0, side: 0, variant: 0.5 });
    marks.push({ label: rungLabel(kind), x: x + 0.5, y: TREE_ROW + 0.5, lift: objectSize(kind).height * MAX_OBJECT_SCALE + 0.4 });
  }
  ORE_KINDS.forEach((kind, i) => {
    map.objects.push({ id: map.objects.length, kind, x: Math.round(at(i)), y: ROCK_ROW, plane: 0, side: 0, variant: 0.5 });
    marks.push({ label: rungLabel(kind), x: Math.round(at(i)) + 0.5, y: ROCK_ROW + 0.5, lift: 1.1 });
  });

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG_COLOR);
  const sun = new THREE.DirectionalLight(SUN_COLOR, SUN_INTENSITY);
  sun.position.set(...SUN_FROM);
  const objects = buildObjects(map);
  scene.add(new THREE.HemisphereLight(SKY_LIGHT, GROUND_LIGHT, SKY_INTENSITY), sun, buildTerrain(map), objects.group);

  // One fishing spot of each kind, on the water, with the tool it wants lying on the bank in front.
  const spots = new FishingSpots(map);
  const methods = Object.keys(CATCHES) as FishingMethod[];
  spots.set(methods.map((method, i) => ({ id: i, x: Math.round(at(i * 2)), y: WATER_ROW + 1, method })));
  scene.add(spots.group);
  methods.forEach((method, i) => {
    const key = { net: "fishing_net", angle: "fishing_rod", trap: "creel", harpoon: "harpoon" }[method];
    const id = item(key).id;
    const mesh = new THREE.Mesh(groundGeometry(id), itemMaterial);
    const x = Math.round(at(i * 2)) + 0.5, y = WATER_ROW - 1.5;
    mesh.position.set(x, heightAt(map, x, y) + 0.02, -y);
    scene.add(mesh);
    marks.push({ label: `${SPOT_INFO[method].verb}: ${SPOT_INFO[method].name}`, x: Math.round(at(i * 2)) + 0.5, y: WATER_ROW + 1.5, lift: 0.9 });
  });

  const labels = document.createElement("div");
  labels.className = "preview-labels";
  document.body.append(labels);
  for (const m of marks) labels.append(Object.assign(document.createElement("div"), { className: "preview-label", textContent: m.label }));

  const canvas = renderer.domElement;
  const view = new OrbitCamera(canvas);
  view.yaw = -0.1;
  view.distance = 26;
  let drag: { x: number; y: number } | null = null;
  canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    view.yaw += (e.clientX - drag.x) * 0.006;
    view.pitch = THREE.MathUtils.clamp(view.pitch + (e.clientY - drag.y) * 0.006, 0.3, 1.2);
    drag = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener("pointerup", () => { drag = null; });
  const resize = () => {
    renderer.setSize(container.clientWidth, container.clientHeight);
    view.resize(container.clientWidth, container.clientHeight);
  };
  new ResizeObserver(resize).observe(container);
  resize();

  const focus = new THREE.Vector3(width / 2, 1.5, -(TREE_ROW + WATER_ROW) / 2);
  const v = new THREE.Vector3();
  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    spots.update(dt);
    view.update(dt, focus);
    renderer.render(scene, view.camera);
    const r = canvas.getBoundingClientRect();
    marks.forEach((m, i) => {
      v.set(m.x, heightAt(map, m.x, m.y) + m.lift, -m.y).project(view.camera);
      const el = labels.children[i] as HTMLElement;
      el.style.left = `${r.left + ((v.x + 1) / 2) * r.width}px`;
      el.style.top = `${r.top + ((1 - v.y) / 2) * r.height}px`;
    });
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  if (beacon) void shoot(map, renderer, scene, beacon);
}

/** "Oak (Woodcutting 12)" — the name a menu gives it, and what it takes to work it. */
function rungLabel(kind: ObjectKind): string {
  const def = RESOURCES[kind];
  const name = OBJECT_INFO[kind].name;
  return def ? `${name} (${def.yields.level})` : name;
}

/**
 * A close-up of each tree and each rock, from three-quarters on and framed by its own height — the
 * angle that shows a silhouette, and the one a player sees it from.
 */
async function shoot(
  map: WorldMap, renderer: THREE.WebGLRenderer, scene: THREE.Scene, beacon: (line: string) => Promise<void>,
): Promise<void> {
  await new Promise((r) => setTimeout(r, 800));
  const camera = new THREE.PerspectiveCamera(32, 4 / 3, 0.05, 80);
  const size = new THREE.Vector2();
  renderer.getSize(size);
  renderer.setSize(640, 480, false);
  for (const o of map.objects) {
    // Framed by the thing's own size rather than a guess: a heartoak is four times a rowan, and a fixed
    // distance either cut its crown off or left a rock as a speck.
    const { height, radius } = objectSize(o.kind);
    const tall = Math.max(height, radius * 2) * MAX_OBJECT_SCALE;
    const away = tall / (2 * Math.tan((camera.fov * Math.PI) / 360)) * 1.25 + 1;
    const x = o.x + 0.5, y = o.y + 0.5, ground = heightAt(map, x, y);
    camera.position.set(x + Math.sin(0.8) * away, ground + tall * 0.62, -y + Math.cos(0.8) * away);
    camera.lookAt(x, ground + tall * 0.42, -y);
    renderer.render(scene, camera);
    await beacon(`SHOT resource_${o.kind} ${renderer.domElement.toDataURL("image/png")}`);
  }
  renderer.setSize(size.x, size.y, false);
  beacon("DONE");
}
