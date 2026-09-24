// The Stonecote preview (#stonecote, or #stonecote=hollow to start underground): the hamlet as built,
// three-quarters on, with its people and creatures standing where they spawn, and the Hollow under it —
// so the site can be judged without walking two hundred tiles to it. Drag to orbit; H swaps between the
// surface and the Hollow. With a beacon it posts the shots the plan names.
import * as THREE from "three";
import { boxOf, heightAt, type Box, type WorldMap } from "../shared/map.ts";
import { MONSTER_BY_KEY } from "../shared/monsters.ts";
import { buildOakridge, OAKRIDGE_SEED } from "../shared/oakridge.ts";
import { HOLLOW_CHEST, HOLLOW_MOUTH, HOLLOW_PLANE, HOLLOW_REGION, SQUARE, STONECOTE } from "../shared/stonecote.ts";
import { inBox } from "../shared/worldgen.ts";
import { modelFor, type Model } from "./entity.ts";
import {
  CAVE_FOG_FAR, CAVE_FOG_NEAR, CAVE_SKY_INTENSITY, CAVE_SUN_INTENSITY, FOG_COLOR, GROUND_LIGHT,
  SKY_INTENSITY, SKY_LIGHT, SUN_COLOR, SUN_FROM, SUN_INTENSITY,
} from "./palette.ts";
import { OrbitCamera } from "./render/camera.ts";
import { CharacterModel } from "./render/character.ts";
import { buildObjects } from "./render/objects.ts";
import { Roofs } from "./render/roofs.ts";
import { buildTerrain } from "./render/terrain.ts";

/** One place shown: its scene, the map it was built from, and where the camera rests. */
interface Shown {
  scene: THREE.Scene;
  map: WorldMap;
  models: Model[];
  focus: THREE.Vector3;
}

/** A shot: which place, what it looks at, and from where (yaw round it, pitch above it, how far). */
interface Shot {
  name: string;
  below: boolean;
  x: number;
  y: number;
  lift: number;
  yaw: number;
  pitch: number;
  distance: number;
  fov: number;
}

const SHOTS: Shot[] = [
  { name: "stonecote_square", below: false, x: SQUARE.x, y: SQUARE.y, lift: 1.2, yaw: 0, pitch: 0.6, distance: 34, fov: 46 },
  { name: "stonecote_bridge", below: false, x: SQUARE.x, y: 3427, lift: 1.0, yaw: 2.4, pitch: 0.42, distance: 24, fov: 40 },
  { name: "stonecote_inn", below: false, x: 3159, y: 3409, lift: 1.6, yaw: 0.85, pitch: 0.45, distance: 20, fov: 36 },
  { name: "stonecote_north", below: false, x: 3164, y: 3446, lift: 1.2, yaw: -0.6, pitch: 0.55, distance: 30, fov: 42 },
  { name: "stonecote_mouth", below: false, x: HOLLOW_MOUTH.x, y: HOLLOW_MOUTH.y, lift: 0.8, yaw: 0.6, pitch: 0.5, distance: 12, fov: 36 },
  { name: "stonecote_seam", below: false, x: 3240, y: 3330, lift: 0, yaw: 0, pitch: 0.6, distance: 60, fov: 50 },
  { name: "stonecote_road", below: false, x: 3205, y: 3375, lift: 0, yaw: 0.35, pitch: 0.6, distance: 70, fov: 50 },
  { name: "stonecote_hollow", below: true, x: HOLLOW_MOUTH.x + 2, y: HOLLOW_MOUTH.y, lift: 0.6, yaw: 0.5, pitch: 0.7, distance: 14, fov: 46 },
  { name: "stonecote_hollow_deep", below: true, x: HOLLOW_CHEST.x - 4, y: HOLLOW_CHEST.y + 4, lift: 0.6, yaw: -0.7, pitch: 0.7, distance: 14, fov: 46 },
];

export function startStonecotePreview(container: HTMLElement, want: string | null, beacon: ((line: string) => Promise<void>) | null): void {
  const stack = buildOakridge(OAKRIDGE_SEED);
  // The surface box reaches 32 rows into the district, so the seam between the two sites is in frame.
  const surfaceBox: Box = boxOf(STONECOTE.x0, STONECOTE.y0 - 32, STONECOTE.x1, STONECOTE.y1);
  const surface = show(stack.planes.get(0)!, surfaceBox, false, new THREE.Vector3(SQUARE.x, 1, -SQUARE.y));
  const hollowBox: Box = boxOf(HOLLOW_REGION.x0, HOLLOW_REGION.y0, HOLLOW_REGION.x1, HOLLOW_REGION.y1);
  const hollow = show(stack.planes.get(HOLLOW_PLANE)!, hollowBox, true, new THREE.Vector3(HOLLOW_MOUTH.x + 6, 1, -(HOLLOW_MOUTH.y - 1)));
  let shown = want === "hollow" ? hollow : surface;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.append(renderer.domElement);
  const canvas = renderer.domElement;
  const view = new OrbitCamera(canvas);
  view.yaw = 0.5;
  view.pitch = 0.55;
  view.distance = want === "hollow" ? 14 : 30;
  let drag: { x: number; y: number } | null = null;
  canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    view.yaw += (e.clientX - drag.x) * 0.006;
    view.pitch = THREE.MathUtils.clamp(view.pitch + (e.clientY - drag.y) * 0.006, 0.2, 1.3);
    drag = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener("pointerup", () => { drag = null; });
  canvas.addEventListener("wheel", (e) => { view.distance = THREE.MathUtils.clamp(view.distance * (e.deltaY > 0 ? 1.1 : 0.9), 6, 90); });
  window.addEventListener("keydown", (e) => { if (e.key === "h" || e.key === "H") shown = shown === surface ? hollow : surface; });
  const resize = () => {
    renderer.setSize(container.clientWidth, container.clientHeight);
    view.resize(container.clientWidth, container.clientHeight);
  };
  new ResizeObserver(resize).observe(container);
  resize();

  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    for (const m of shown.models) if (m instanceof CharacterModel) m.animate(dt, 0, false, false);
    view.update(dt, shown.focus);
    renderer.render(shown.scene, view.camera);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  if (beacon) void shoot(renderer, surface, hollow, beacon);
}

/** A place built from the real map: its ground, its objects and roofs, and whoever spawns in it, standing still. */
function show(map: WorldMap, box: Box, below: boolean, focus: THREE.Vector3): Shown {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG_COLOR);
  // Underground the game's own fog, so the Hollow is judged as it plays; above it the fog is pushed out, so the whole site can be seen at once.
  scene.fog = new THREE.Fog(FOG_COLOR, below ? CAVE_FOG_NEAR : 60, below ? CAVE_FOG_FAR : 200);
  const sun = new THREE.DirectionalLight(SUN_COLOR, below ? CAVE_SUN_INTENSITY : SUN_INTENSITY);
  sun.position.set(...SUN_FROM);
  scene.add(new THREE.HemisphereLight(SKY_LIGHT, GROUND_LIGHT, below ? CAVE_SKY_INTENSITY : SKY_INTENSITY), sun);
  scene.add(buildTerrain(map, box));
  const within = (o: { x: number; y: number }) => inBox(box, o.x, o.y);
  scene.add(buildObjects(map, map.objects.filter(within)).group);
  if (!below) scene.add(new Roofs(map, [box]).group);
  const models: Model[] = [];
  for (const s of map.monsters) {
    if (!within(s)) continue;
    const def = MONSTER_BY_KEY.get(s.monster);
    if (!def) continue;
    const model = modelFor(s.monster, def.look ?? [], []);
    model.root.position.set(s.x + 0.5, heightAt(map, s.x + 0.5, s.y + 0.5), -(s.y + 0.5));
    scene.add(model.root);
    models.push(model);
  }
  focus.y = heightAt(map, focus.x, -focus.z) + 1;
  return { scene, map, models, focus };
}

/** Every shot the plan names, each framed by hand, posted through the beacon; then DONE. */
async function shoot(renderer: THREE.WebGLRenderer, surface: Shown, hollow: Shown, beacon: (line: string) => Promise<void>): Promise<void> {
  await new Promise((r) => setTimeout(r, 800));
  const camera = new THREE.PerspectiveCamera(32, 4 / 3, 0.05, 160);
  const size = new THREE.Vector2();
  renderer.getSize(size);
  renderer.setSize(640, 480, false);
  for (const s of SHOTS) {
    const place = s.below ? hollow : surface;
    camera.fov = s.fov;
    camera.updateProjectionMatrix();
    const target = new THREE.Vector3(s.x, heightAt(place.map, s.x, s.y) + s.lift, -s.y);
    const flat = Math.cos(s.pitch) * s.distance;
    camera.position.set(target.x - Math.sin(s.yaw) * flat, target.y + Math.sin(s.pitch) * s.distance, target.z + Math.cos(s.yaw) * flat);
    camera.lookAt(target);
    renderer.render(place.scene, camera);
    await beacon(`SHOT ${s.name} ${renderer.domElement.toDataURL("image/png")}`);
  }
  renderer.setSize(size.x, size.y, false);
  await beacon("DONE");
}
