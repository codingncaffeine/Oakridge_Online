// The sky preview (#skypreview): the village under the sky at any hour and in any weather, so day,
// night and the weathers can be judged without waiting for them. [ and ] step the hour, W cycles the
// weather, F flashes lightning, drag to orbit; `#skypreview=hour:18,weather:rain` starts there. With a
// beacon it posts a shot at dawn, noon, dusk and night, then in cloud, mist, rain and storm, then DONE.
import * as THREE from "three";
import { boxOf, heightAt, type Box, type WorldMap } from "../shared/map.ts";
import { MONSTER_BY_KEY } from "../shared/monsters.ts";
import { buildOakridge, GREEN, OAKRIDGE_SEED } from "../shared/oakridge.ts";
import { hourOf, type Weather, type WeatherKind } from "../shared/sky.ts";
import { inBox } from "../shared/worldgen.ts";
import { modelFor, type Model } from "./entity.ts";
import { FOG_COLOR, FOG_FAR, FOG_NEAR, GROUND_LIGHT, SKY_INTENSITY, SKY_LIGHT, SUN_COLOR, SUN_FROM, SUN_INTENSITY } from "./palette.ts";
import { OrbitCamera } from "./render/camera.ts";
import { CharacterModel } from "./render/character.ts";
import { Flames } from "./render/flames.ts";
import { buildGrass } from "./render/grass.ts";
import { buildObjects } from "./render/objects.ts";
import { Roofs } from "./render/roofs.ts";
import { Sky } from "./render/sky.ts";
import { buildTerrain } from "./render/terrain.ts";

/** The weathers the W key cycles through, each as what it forces on the sky. */
const WEATHERS: Array<[WeatherKind, Partial<Weather>]> = [
  ["clear", { cover: 0, rain: 0, mist: 0, storm: 0 }],
  ["cloud", { cover: 0.8, rain: 0, mist: 0, storm: 0 }],
  ["mist", { cover: 0.3, rain: 0, mist: 1, storm: 0 }],
  ["rain", { cover: 0.9, rain: 0.7, mist: 0, storm: 0 }],
  ["storm", { cover: 1, rain: 1, mist: 0, storm: 1 }],
];

/** A shot: its hour and weather, and where it looks from (the green, or a close view of a place). */
interface Shot {
  name: string;
  phase: number;
  weather: number;
  flash?: number;
  /** A close view: the tile looked at, the camera's turn and tilt, and how far back. */
  at?: { x: number; y: number; yaw: number; pitch: number; distance: number };
}

/** The shots posted: the four hours of a clear day, each weather at the hour it shows best, then the ground cover and the fires up close. */
const SHOTS: Shot[] = [
  { name: "sky_dawn", phase: 0.26, weather: 0 },
  { name: "sky_noon", phase: 0.5, weather: 0 },
  { name: "sky_dusk", phase: 0.74, weather: 0 },
  { name: "sky_night", phase: 0.0, weather: 0 },
  { name: "sky_cloud", phase: 0.45, weather: 1 },
  { name: "sky_mist", phase: 0.27, weather: 2 },
  { name: "sky_rain", phase: 0.55, weather: 3 },
  { name: "sky_storm", phase: 0.6, weather: 4, flash: 0.35 },
  // Phase 15: grass along a fence, round trees and beside the road; the stockade's campfire by day and by night.
  { name: "ground_fence", phase: 0.45, weather: 0, at: { x: 3241, y: 3281, yaw: 0.4, pitch: 0.42, distance: 9 } },
  { name: "ground_road", phase: 0.45, weather: 0, at: { x: 3228, y: 3272, yaw: -0.3, pitch: 0.45, distance: 11 } },
  { name: "ground_wood", phase: 0.45, weather: 0, at: { x: 3196, y: 3250, yaw: 0.8, pitch: 0.4, distance: 9 } },
  { name: "ground_fire", phase: 0.45, weather: 0, at: { x: 3155, y: 3249, yaw: 0.6, pitch: 0.38, distance: 6 } },
  { name: "ground_fire_night", phase: 0.0, weather: 0, at: { x: 3155, y: 3249, yaw: 0.6, pitch: 0.38, distance: 6 } },
];

/**
 * The village and the wood west of it, as far as the game streams ground: past the fog in every
 * direction, so what the fog half-takes is seen against fogged ground and never against the dome.
 */
const SHOWN: Box = boxOf(3140, GREEN.y - 64, GREEN.x + 63, GREEN.y + 63);

export function startSkyPreview(container: HTMLElement, want: string | null, beacon: ((line: string) => Promise<void>) | null): void {
  const asked = Object.fromEntries((want ?? "").split(",").map((part) => part.split(":") as [string, string]));
  let phase = asked.hour !== undefined ? (Number(asked.hour) / 24) % 1 : 0.4;
  let weather = Math.max(0, WEATHERS.findIndex(([kind]) => kind === asked.weather));

  const stack = buildOakridge(OAKRIDGE_SEED);
  const map = stack.planes.get(0)!;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG_COLOR);
  const fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);
  scene.fog = fog;
  const hemi = new THREE.HemisphereLight(SKY_LIGHT, GROUND_LIGHT, SKY_INTENSITY);
  const sun = new THREE.DirectionalLight(SUN_COLOR, SUN_INTENSITY);
  sun.position.set(...SUN_FROM);
  scene.add(hemi, sun);
  scene.add(buildTerrain(map, SHOWN));
  const within = (o: { x: number; y: number }) => inBox(SHOWN, o.x, o.y);
  scene.add(buildObjects(map, map.objects.filter(within)).group);
  scene.add(new Roofs(map, [SHOWN]).group);
  const grass = buildGrass(map, SHOWN);
  if (grass) scene.add(grass);
  const flames = new Flames();
  flames.set(map, map.objects.filter(within));
  scene.add(flames.group);
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
  const sky = new Sky(scene, hemi, sun, fog);
  scene.add(sky.group);
  const focus = new THREE.Vector3(GREEN.x + 0.5, heightAt(map, GREEN.x + 0.5, GREEN.y + 0.5) + 1, -(GREEN.y + 0.5));

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.append(renderer.domElement);
  const canvas = renderer.domElement;
  const view = new OrbitCamera(canvas);
  view.yaw = 0.5;
  view.pitch = 0.4;
  view.distance = 18;
  let drag: { x: number; y: number } | null = null;
  canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    view.yaw += (e.clientX - drag.x) * 0.006;
    view.pitch = THREE.MathUtils.clamp(view.pitch + (e.clientY - drag.y) * 0.006, 0.12, 1.3);
    drag = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener("pointerup", () => { drag = null; });
  let flashUntil = 0;
  window.addEventListener("keydown", (e) => {
    if (e.key === "]") phase = (phase + 1 / 96) % 1;
    else if (e.key === "[") phase = (phase + 1 - 1 / 96) % 1;
    else if (e.key === "w" || e.key === "W") weather = (weather + 1) % WEATHERS.length;
    else if (e.key === "f" || e.key === "F") flashUntil = performance.now() + 500;
  });
  const caption = document.createElement("div");
  caption.id = "sky-caption";
  caption.style.cssText = "position:fixed;left:12px;top:12px;padding:6px 10px;background:rgba(0,0,0,0.55);color:#f2ecd8;font:14px/1.3 serif;border-radius:4px;pointer-events:none";
  document.body.append(caption);
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
    for (const m of models) if (m instanceof CharacterModel) m.animate(dt, 0, false, false);
    flames.update(dt);
    view.update(dt, focus);
    sky.forcedPhase = phase;
    sky.forcedWeather = WEATHERS[weather]![1];
    sky.forcedFlash = now < flashUntil ? Math.exp(-(500 - (flashUntil - now)) / 120) : null;
    sky.update(dt, view.camera.position, focus, 0);
    renderer.render(scene, view.camera);
    const h = hourOf(phase);
    caption.textContent = `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.floor((h % 1) * 60)).padStart(2, "0")} — ${sky.weather.kind}   ([ ] hour, W weather, F lightning)`;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  if (beacon) void shoot(renderer, scene, sky, flames, map, focus, beacon);
}

/** Every shot the plan names, each at its hour and weather, posted through the beacon; then DONE. */
async function shoot(
  renderer: THREE.WebGLRenderer, scene: THREE.Scene, sky: Sky, flames: Flames, map: WorldMap, focus: THREE.Vector3,
  beacon: (line: string) => Promise<void>,
): Promise<void> {
  await new Promise((r) => setTimeout(r, 800));
  const camera = new THREE.PerspectiveCamera(50, 4 / 3, 0.05, 200);
  const size = new THREE.Vector2();
  renderer.getSize(size);
  renderer.setSize(640, 480, false);
  for (const s of SHOTS) {
    const target = s.at ? new THREE.Vector3(s.at.x + 0.5, heightAt(map, s.at.x + 0.5, s.at.y + 0.5) + 0.6, -(s.at.y + 0.5)) : focus;
    const yaw = s.at?.yaw ?? 0.5, pitch = s.at?.pitch ?? 0.3, distance = s.at?.distance ?? 24;
    const flat = Math.cos(pitch) * distance;
    camera.position.set(target.x - Math.sin(yaw) * flat, target.y + Math.sin(pitch) * distance, target.z + Math.cos(yaw) * flat);
    camera.lookAt(target.x, target.y + (s.at ? 0 : 3), target.z);
    sky.forcedPhase = s.phase;
    sky.forcedWeather = WEATHERS[s.weather]![1];
    sky.forcedFlash = s.flash ?? null;
    flames.update(0.35);
    sky.update(0, camera.position, target, 0);
    renderer.render(scene, camera);
    await beacon(`SHOT ${s.name} ${renderer.domElement.toDataURL("image/png")}`);
  }
  sky.forcedFlash = null;
  renderer.setSize(size.x, size.y, false);
  await beacon("DONE");
}
