// The site previews (#stonecote, #thornbury): a site as built, three-quarters on, with its people and
// creatures standing where they spawn, and the planes under it — so a site can be judged without
// walking hundreds of tiles to it. Drag to orbit; H cycles the surface and what is under it (or
// `#thornbury=sewers` starts there). With a beacon it posts the shots the plan names, then DONE.
import * as THREE from "three";
import { boxOf, heightAt, type Box, type WorldMap, type WorldStack } from "../shared/map.ts";
import { MONSTER_BY_KEY } from "../shared/monsters.ts";
import { buildOakridge, OAKRIDGE_SEED } from "../shared/oakridge.ts";
import { HOLLOW_CHEST, HOLLOW_MOUTH, HOLLOW_PLANE, HOLLOW_REGION, SQUARE, STONECOTE } from "../shared/stonecote.ts";
import {
  DEEP_BOX, DEEP_PLANE, DEEP_STAIR, OUTFALL, SEWER_BOX, SEWER_CHEST, SEWER_MOUTH, SEWER_PLANE, THORNBURY, WELL,
} from "../shared/thornbury.ts";
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

/** One place of a site: which plane, the box of it that is built and shown, and where the camera rests. */
interface PlaceSpec {
  key: string;
  plane: number;
  box: Box;
  focus: { x: number; y: number };
  /** How far back the camera starts. */
  distance: number;
  /** How far out the surface fog is pushed, so the whole site can be seen at once (a city needs more than a hamlet). */
  fogFar?: number;
  /** How far the shots' camera sees; the same distance a hamlet was shot at, further for a city. */
  cameraFar?: number;
}

/** A shot: which place, what it looks at, and from where (yaw round it, pitch above it, how far). */
interface Shot {
  name: string;
  place: string;
  x: number;
  y: number;
  lift: number;
  yaw: number;
  pitch: number;
  distance: number;
  fov: number;
}

interface SiteSpec {
  places: PlaceSpec[];
  shots: Shot[];
}

const SITES: Record<string, SiteSpec> = {
  stonecote: {
    places: [
      // The surface box reaches 32 rows into the district, so the seam between the two sites is in frame.
      { key: "surface", plane: 0, box: boxOf(STONECOTE.x0, STONECOTE.y0 - 32, STONECOTE.x1, STONECOTE.y1), focus: SQUARE, distance: 30 },
      { key: "hollow", plane: HOLLOW_PLANE, box: HOLLOW_REGION, focus: { x: HOLLOW_MOUTH.x + 6, y: HOLLOW_MOUTH.y - 1 }, distance: 14 },
    ],
    shots: [
      { name: "stonecote_square", place: "surface", x: SQUARE.x, y: SQUARE.y, lift: 1.2, yaw: 0, pitch: 0.6, distance: 34, fov: 46 },
      { name: "stonecote_bridge", place: "surface", x: SQUARE.x, y: 3427, lift: 1.0, yaw: 2.4, pitch: 0.42, distance: 24, fov: 40 },
      { name: "stonecote_inn", place: "surface", x: 3159, y: 3409, lift: 1.6, yaw: 0.85, pitch: 0.45, distance: 20, fov: 36 },
      { name: "stonecote_north", place: "surface", x: 3164, y: 3446, lift: 1.2, yaw: -0.6, pitch: 0.55, distance: 30, fov: 42 },
      { name: "stonecote_mouth", place: "surface", x: HOLLOW_MOUTH.x, y: HOLLOW_MOUTH.y, lift: 0.8, yaw: 0.6, pitch: 0.5, distance: 12, fov: 36 },
      { name: "stonecote_seam", place: "surface", x: 3240, y: 3330, lift: 0, yaw: 0, pitch: 0.6, distance: 60, fov: 50 },
      { name: "stonecote_road", place: "surface", x: 3205, y: 3375, lift: 0, yaw: 0.35, pitch: 0.6, distance: 70, fov: 50 },
      { name: "stonecote_hollow", place: "hollow", x: HOLLOW_MOUTH.x + 2, y: HOLLOW_MOUTH.y, lift: 0.6, yaw: 0.5, pitch: 0.7, distance: 14, fov: 46 },
      { name: "stonecote_hollow_deep", place: "hollow", x: HOLLOW_CHEST.x - 4, y: HOLLOW_CHEST.y + 4, lift: 0.6, yaw: -0.7, pitch: 0.7, distance: 14, fov: 46 },
    ],
  },
  thornbury: {
    places: [
      // The surface reaches back over the bend and Stonecote's west column, so the river and the seam are in frame.
      { key: "surface", plane: 0, box: boxOf(THORNBURY.x0, 3400, THORNBURY.x1, THORNBURY.y1), focus: WELL, distance: 40, fogFar: 260, cameraFar: 300 },
      { key: "sewers", plane: SEWER_PLANE, box: SEWER_BOX, focus: { x: SEWER_MOUTH.x - 3, y: SEWER_MOUTH.y }, distance: 14 },
      { key: "deep", plane: DEEP_PLANE, box: DEEP_BOX, focus: { x: DEEP_STAIR.x + 2, y: DEEP_STAIR.y }, distance: 14 },
    ],
    shots: [
      { name: "thornbury_square", place: "surface", x: WELL.x, y: WELL.y, lift: 1.2, yaw: 0.2, pitch: 0.62, distance: 40, fov: 48 },
      { name: "thornbury_castle", place: "surface", x: 3151, y: 3552, lift: 2, yaw: 0.35, pitch: 0.5, distance: 46, fov: 46 },
      { name: "thornbury_gate", place: "surface", x: 3151, y: 3481, lift: 1.4, yaw: 3.0, pitch: 0.36, distance: 30, fov: 42 },
      { name: "thornbury_highstreet", place: "surface", x: 3136, y: 3520, lift: 1.4, yaw: -1.3, pitch: 0.4, distance: 30, fov: 44 },
      { name: "thornbury_banks", place: "surface", x: 3172, y: 3524, lift: 1.4, yaw: 0.9, pitch: 0.48, distance: 26, fov: 42 },
      { name: "thornbury_wall", place: "surface", x: 3112, y: 3482, lift: 1, yaw: 2.2, pitch: 0.4, distance: 44, fov: 48 },
      { name: "thornbury_city", place: "surface", x: 3151, y: 3520, lift: 0, yaw: 0.4, pitch: 0.95, distance: 120, fov: 50 },
      { name: "thornbury_seam", place: "surface", x: 3160, y: 3458, lift: 0, yaw: 0.2, pitch: 0.6, distance: 60, fov: 50 },
      { name: "thornbury_bend", place: "surface", x: 3110, y: 3450, lift: 0, yaw: 0.6, pitch: 0.6, distance: 70, fov: 50 },
      { name: "thornbury_north", place: "surface", x: 3126, y: 3560, lift: 1.2, yaw: -0.5, pitch: 0.5, distance: 32, fov: 44 },
      { name: "thornbury_yard", place: "surface", x: SEWER_MOUTH.x, y: SEWER_MOUTH.y, lift: 0.6, yaw: 0.7, pitch: 0.55, distance: 12, fov: 38 },
      { name: "thornbury_outfall", place: "surface", x: OUTFALL.x, y: OUTFALL.y, lift: 0.6, yaw: -0.8, pitch: 0.5, distance: 18, fov: 42 },
      { name: "thornbury_sewers", place: "sewers", x: SEWER_MOUTH.x - 3, y: SEWER_MOUTH.y, lift: 0.6, yaw: 0.5, pitch: 0.7, distance: 14, fov: 46 },
      { name: "thornbury_drain", place: "sewers", x: 3160, y: 3489, lift: 0.6, yaw: 1.5, pitch: 0.55, distance: 12, fov: 46 },
      { name: "thornbury_cistern", place: "sewers", x: 3148, y: 3490, lift: 0.6, yaw: -0.6, pitch: 0.7, distance: 16, fov: 46 },
      { name: "thornbury_deep", place: "deep", x: SEWER_CHEST.x - 5, y: SEWER_CHEST.y - 4, lift: 0.6, yaw: -0.7, pitch: 0.7, distance: 14, fov: 46 },
    ],
  },
};

/** One place shown: its scene, the map it was built from, and where the camera rests. */
interface Shown {
  key: string;
  scene: THREE.Scene;
  map: WorldMap;
  models: Model[];
  focus: THREE.Vector3;
  distance: number;
  cameraFar: number;
}

export function startSitePreview(container: HTMLElement, site: string, want: string | null, beacon: ((line: string) => Promise<void>) | null): void {
  const spec = SITES[site];
  if (!spec) throw new Error(`no site preview ${site}`);
  const stack = buildOakridge(OAKRIDGE_SEED);
  const places = spec.places.map((p) => show(stack, p));
  let shown = places.find((p) => p.key === want) ?? places[0]!;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.append(renderer.domElement);
  const canvas = renderer.domElement;
  const view = new OrbitCamera(canvas);
  view.yaw = 0.5;
  view.pitch = 0.55;
  view.distance = shown.distance;
  let drag: { x: number; y: number } | null = null;
  canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    view.yaw += (e.clientX - drag.x) * 0.006;
    view.pitch = THREE.MathUtils.clamp(view.pitch + (e.clientY - drag.y) * 0.006, 0.2, 1.3);
    drag = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener("pointerup", () => { drag = null; });
  canvas.addEventListener("wheel", (e) => { view.distance = THREE.MathUtils.clamp(view.distance * (e.deltaY > 0 ? 1.1 : 0.9), 6, 160); });
  window.addEventListener("keydown", (e) => {
    if (e.key !== "h" && e.key !== "H") return;
    shown = places[(places.indexOf(shown) + 1) % places.length]!;
    view.distance = shown.distance;
  });
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

  if (beacon) void shoot(renderer, places, spec.shots, beacon);
}

/** A place built from the real map: its ground, its objects and roofs, and whoever spawns in it, standing still. */
function show(stack: WorldStack, p: PlaceSpec): Shown {
  const map = stack.planes.get(p.plane)!;
  const below = p.plane < 0;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG_COLOR);
  // Underground the game's own fog, so a dungeon is judged as it plays; above it the fog is pushed out, so the whole site can be seen at once.
  scene.fog = new THREE.Fog(FOG_COLOR, below ? CAVE_FOG_NEAR : 60, below ? CAVE_FOG_FAR : (p.fogFar ?? 200));
  const sun = new THREE.DirectionalLight(SUN_COLOR, below ? CAVE_SUN_INTENSITY : SUN_INTENSITY);
  sun.position.set(...SUN_FROM);
  scene.add(new THREE.HemisphereLight(SKY_LIGHT, GROUND_LIGHT, below ? CAVE_SKY_INTENSITY : SKY_INTENSITY), sun);
  scene.add(buildTerrain(map, p.box));
  const within = (o: { x: number; y: number }) => inBox(p.box, o.x, o.y);
  scene.add(buildObjects(map, map.objects.filter(within)).group);
  if (!below) scene.add(new Roofs(map, [p.box]).group);
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
  const focus = new THREE.Vector3(p.focus.x, heightAt(map, p.focus.x, p.focus.y) + 1, -p.focus.y);
  return { key: p.key, scene, map, models, focus, distance: p.distance, cameraFar: p.cameraFar ?? 160 };
}

/** Every shot the plan names, each framed by hand, posted through the beacon; then DONE. */
async function shoot(renderer: THREE.WebGLRenderer, places: Shown[], shots: Shot[], beacon: (line: string) => Promise<void>): Promise<void> {
  await new Promise((r) => setTimeout(r, 800));
  const camera = new THREE.PerspectiveCamera(32, 4 / 3, 0.05, 160);
  const size = new THREE.Vector2();
  renderer.getSize(size);
  renderer.setSize(640, 480, false);
  for (const s of shots) {
    const place = places.find((p) => p.key === s.place)!;
    camera.fov = s.fov;
    camera.far = place.cameraFar;
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
