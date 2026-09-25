// The site previews (#stonecote, #thornbury, #wickstead, #brinehaven): a site as built, three-quarters on, with its
// people and creatures standing where they spawn, and the planes under it or the road to it — so a site
// can be judged without walking hundreds of tiles to it. Drag to orbit; H cycles the places (or
// `#thornbury=sewers` starts there). With a beacon it posts the shots the plan names, then DONE.
import * as THREE from "three";
import {
  BANK as BRINE_BANK, BERTHS, BRINEHAVEN, INN as BRINE_INN, MOLE, OFFICE, ROAD_IN, SQUARE as BRINE_SQUARE, YARD,
} from "../shared/brinehaven.ts";
import {
  BANK as KILN_BANK, BLADES, INN as KILN_INN, KILNHOLD_SITE, OUTCROP, SMITHY, SQUARE as KILN_SQUARE, WAYSTATION,
} from "../shared/kilnhold.ts";
import { boxOf, heightAt, type Box, type WorldMap, type WorldStack } from "../shared/map.ts";
import { MONSTER_BY_KEY } from "../shared/monsters.ts";
import { buildOakridge, OAKRIDGE_SEED } from "../shared/oakridge.ts";
import { HOLLOW_CHEST, HOLLOW_MOUTH, HOLLOW_PLANE, HOLLOW_REGION, SQUARE, STONECOTE } from "../shared/stonecote.ts";
import {
  DEEP_BOX, DEEP_PLANE, DEEP_STAIR, OUTFALL, SEWER_BOX, SEWER_CHEST, SEWER_MOUTH, SEWER_PLANE, THORNBURY, WELL,
} from "../shared/thornbury.ts";
import { BANK, COAST_EXIT, FOOTHILLS, INN, JETTY, LOCKUP, MANOR, SPRING, SQUARE as WICK_SQUARE, WICKSTEAD } from "../shared/wickstead.ts";
import { inBox } from "../shared/worldgen.ts";
import { modelFor, type Model } from "./entity.ts";
import {
  CAVE_FOG_FAR, CAVE_FOG_NEAR, CAVE_SKY_INTENSITY, CAVE_SUN_INTENSITY, FOG_COLOR, GROUND_LIGHT,
  SKY_INTENSITY, SKY_LIGHT, SUN_COLOR, SUN_FROM, SUN_INTENSITY,
} from "./palette.ts";
import { OrbitCamera } from "./render/camera.ts";
import { CharacterModel } from "./render/character.ts";
import { Flames } from "./render/flames.ts";
import { buildGrass } from "./render/grass.ts";
import { buildObjects } from "./render/objects.ts";
import { Roofs } from "./render/roofs.ts";
import { Sky } from "./render/sky.ts";
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
  wickstead: {
    places: [
      // The village end of the site, from the Sound's far water to the pasture; then the road end, reaching 32 columns into the district so the seam is in frame.
      { key: "surface", plane: 0, box: boxOf(WICKSTEAD.x0, WICKSTEAD.y0, 2999, FOOTHILLS.y1), focus: WICK_SQUARE, distance: 34, fogFar: 260, cameraFar: 300 },
      { key: "road", plane: 0, box: boxOf(3000, WICKSTEAD.y0, 3167, WICKSTEAD.y1), focus: { x: 3100, y: 3245 }, distance: 40, fogFar: 260, cameraFar: 300 },
    ],
    shots: [
      { name: "wickstead_square", place: "surface", x: WICK_SQUARE.x, y: WICK_SQUARE.y, lift: 1.2, yaw: 0.3, pitch: 0.6, distance: 36, fov: 46 },
      { name: "wickstead_bank", place: "surface", x: BANK.x0 + 4, y: BANK.y0 + 3, lift: 1.4, yaw: 0.2, pitch: 0.45, distance: 22, fov: 40 },
      { name: "wickstead_inn", place: "surface", x: INN.x0 + 4, y: INN.y0 + 4, lift: 1.6, yaw: 2.9, pitch: 0.45, distance: 22, fov: 38 },
      { name: "wickstead_manor", place: "surface", x: MANOR.x0 + 4, y: MANOR.y0 + 4, lift: 1.6, yaw: -0.6, pitch: 0.5, distance: 30, fov: 42 },
      { name: "wickstead_lockup", place: "surface", x: LOCKUP.x0 + 2, y: LOCKUP.y0 + 2, lift: 0.8, yaw: 0.5, pitch: 0.5, distance: 14, fov: 38 },
      { name: "wickstead_jetty", place: "surface", x: JETTY.x0 + 6, y: JETTY.y0, lift: 0.6, yaw: -1.2, pitch: 0.45, distance: 26, fov: 42 },
      { name: "wickstead_shore", place: "surface", x: 2890, y: 3268, lift: 0.8, yaw: -1.9, pitch: 0.5, distance: 34, fov: 44 },
      { name: "wickstead_beck", place: "surface", x: 2900, y: 3309, lift: 0.6, yaw: 0.9, pitch: 0.55, distance: 28, fov: 44 },
      { name: "wickstead_foothills", place: "surface", x: 2936, y: 3330, lift: 1, yaw: 0.2, pitch: 0.5, distance: 60, fov: 50 },
      { name: "wickstead_spring", place: "surface", x: SPRING.x, y: SPRING.y, lift: 0.6, yaw: 2.6, pitch: 0.55, distance: 22, fov: 42 },
      { name: "wickstead_village", place: "surface", x: WICK_SQUARE.x, y: WICK_SQUARE.y + 2, lift: 0, yaw: 0.4, pitch: 0.95, distance: 110, fov: 50 },
      { name: "wickstead_coast", place: "surface", x: COAST_EXIT.x, y: COAST_EXIT.y + 30, lift: 0, yaw: 0, pitch: 0.6, distance: 70, fov: 50 },
      { name: "wickstead_seam", place: "road", x: 3136, y: 3240, lift: 0, yaw: 0, pitch: 0.6, distance: 60, fov: 50 },
      { name: "wickstead_wood", place: "road", x: 3100, y: 3245, lift: 1.0, yaw: 1.4, pitch: 0.5, distance: 40, fov: 46 },
    ],
  },
  brinehaven: {
    places: [
      // The town end of the site, from the Sound's far water to the pen; then the corridor, reaching 30 rows into Wickstead so the seam is in frame.
      { key: "surface", plane: 0, box: boxOf(BRINEHAVEN.x0, BRINEHAVEN.y0, BRINEHAVEN.x1, 3100), focus: BRINE_SQUARE, distance: 36, fogFar: 260, cameraFar: 300 },
      { key: "road", plane: 0, box: boxOf(BRINEHAVEN.x0, 3100, BRINEHAVEN.x1, 3230), focus: { x: 2900, y: 3160 }, distance: 40, fogFar: 260, cameraFar: 300 },
    ],
    shots: [
      { name: "brinehaven_square", place: "surface", x: BRINE_SQUARE.x, y: BRINE_SQUARE.y, lift: 1.2, yaw: 0.3, pitch: 0.6, distance: 36, fov: 46 },
      { name: "brinehaven_quay", place: "surface", x: 2889, y: 3038, lift: 1.0, yaw: -1.6, pitch: 0.45, distance: 32, fov: 44 },
      { name: "brinehaven_berths", place: "surface", x: BERTHS[1]!.x0 + 6, y: BERTHS[1]!.y0, lift: 0.6, yaw: -1.2, pitch: 0.45, distance: 30, fov: 44 },
      { name: "brinehaven_mole", place: "surface", x: MOLE.x0 + 6, y: MOLE.y0, lift: 0.6, yaw: -0.6, pitch: 0.5, distance: 28, fov: 42 },
      { name: "brinehaven_bank", place: "surface", x: BRINE_BANK.x0 + 4, y: BRINE_BANK.y0 + 3, lift: 1.4, yaw: 0.2, pitch: 0.45, distance: 22, fov: 40 },
      { name: "brinehaven_inn", place: "surface", x: BRINE_INN.x0 + 4, y: BRINE_INN.y0 + 4, lift: 1.6, yaw: 2.9, pitch: 0.45, distance: 22, fov: 38 },
      { name: "brinehaven_yard", place: "surface", x: YARD.x0 + 4, y: YARD.y0 + 2, lift: 0.8, yaw: 0.5, pitch: 0.5, distance: 18, fov: 40 },
      { name: "brinehaven_office", place: "surface", x: OFFICE.x0 + 2, y: OFFICE.y0 + 2, lift: 0.8, yaw: -0.5, pitch: 0.5, distance: 14, fov: 38 },
      { name: "brinehaven_town", place: "surface", x: BRINE_SQUARE.x, y: BRINE_SQUARE.y, lift: 0, yaw: 0.4, pitch: 0.95, distance: 110, fov: 50 },
      { name: "brinehaven_south", place: "surface", x: 2912, y: 3012, lift: 0.6, yaw: 2.8, pitch: 0.5, distance: 40, fov: 46 },
      { name: "brinehaven_seam", place: "road", x: ROAD_IN.x, y: 3200, lift: 0, yaw: 0, pitch: 0.6, distance: 60, fov: 50 },
      { name: "brinehaven_road", place: "road", x: 2900, y: 3140, lift: 1.0, yaw: 1.2, pitch: 0.5, distance: 50, fov: 46 },
    ],
  },
  kilnhold: {
    places: [
      // The hold's end of the site, kilns to Sand Road; then the waste, reaching 32 columns into the district so the toll gate and the seam are in frame.
      { key: "hold", plane: 0, box: boxOf(3560, KILNHOLD_SITE.y0, KILNHOLD_SITE.x1, KILNHOLD_SITE.y1), focus: KILN_SQUARE, distance: 36, fogFar: 260, cameraFar: 300 },
      { key: "waste", plane: 0, box: boxOf(3296, KILNHOLD_SITE.y0, 3559, KILNHOLD_SITE.y1), focus: { x: 3440, y: 3232 }, distance: 40, fogFar: 260, cameraFar: 300 },
    ],
    shots: [
      { name: "kilnhold_square", place: "hold", x: KILN_SQUARE.x, y: KILN_SQUARE.y, lift: 1.2, yaw: 0.3, pitch: 0.6, distance: 36, fov: 46 },
      { name: "kilnhold_gate", place: "hold", x: 3600, y: 3232, lift: 1.4, yaw: 3.0, pitch: 0.36, distance: 30, fov: 42 },
      { name: "kilnhold_bank", place: "hold", x: KILN_BANK.x0 + 5, y: KILN_BANK.y0 + 3, lift: 1.4, yaw: 0.2, pitch: 0.45, distance: 22, fov: 40 },
      { name: "kilnhold_smithy", place: "hold", x: SMITHY.x0 + 5, y: SMITHY.y0 + 4, lift: 1.2, yaw: 0.4, pitch: 0.5, distance: 20, fov: 40 },
      { name: "kilnhold_blades", place: "hold", x: BLADES.x0 + 4, y: BLADES.y0 + 4, lift: 1.4, yaw: 2.9, pitch: 0.45, distance: 22, fov: 38 },
      { name: "kilnhold_inn", place: "hold", x: KILN_INN.x0 + 5, y: KILN_INN.y0 + 5, lift: 1.6, yaw: 2.9, pitch: 0.45, distance: 22, fov: 38 },
      { name: "kilnhold_kilns", place: "hold", x: 3590, y: 3239, lift: 0.8, yaw: -0.6, pitch: 0.5, distance: 16, fov: 40 },
      { name: "kilnhold_hold", place: "hold", x: KILN_SQUARE.x, y: KILN_SQUARE.y, lift: 0, yaw: 0.4, pitch: 0.95, distance: 110, fov: 50 },
      { name: "kilnhold_outcrop", place: "hold", x: OUTCROP.x, y: OUTCROP.y, lift: 0.8, yaw: 2.6, pitch: 0.5, distance: 26, fov: 44 },
      { name: "kilnhold_sandroad", place: "hold", x: 3690, y: 3232, lift: 1.0, yaw: -1.4, pitch: 0.5, distance: 40, fov: 46 },
      { name: "kilnhold_waystation", place: "waste", x: WAYSTATION.x0 + 3, y: WAYSTATION.y0 + 2, lift: 0.8, yaw: 0.5, pitch: 0.5, distance: 20, fov: 42 },
      { name: "kilnhold_waste", place: "waste", x: 3420, y: 3228, lift: 1.0, yaw: 1.4, pitch: 0.5, distance: 40, fov: 46 },
      { name: "kilnhold_seam", place: "waste", x: 3328, y: 3232, lift: 0, yaw: 0, pitch: 0.6, distance: 60, fov: 50 },
      { name: "kilnhold_tollgate", place: "waste", x: 3320, y: 3231, lift: 1.2, yaw: -1.6, pitch: 0.45, distance: 24, fov: 42 },
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
  /** The sky over a place above ground, held at a clear noon so the site is judged in plain daylight. */
  sky: Sky | null;
  /** The flames on the place's fires, swaying. */
  flames: Flames;
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
    shown.flames.update(dt);
    view.update(dt, shown.focus);
    shown.sky?.update(dt, view.camera.position, shown.focus, 0);
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
  const fog = new THREE.Fog(FOG_COLOR, below ? CAVE_FOG_NEAR : 60, below ? CAVE_FOG_FAR : (p.fogFar ?? 200));
  scene.fog = fog;
  const sun = new THREE.DirectionalLight(SUN_COLOR, below ? CAVE_SUN_INTENSITY : SUN_INTENSITY);
  sun.position.set(...SUN_FROM);
  const hemi = new THREE.HemisphereLight(SKY_LIGHT, GROUND_LIGHT, below ? CAVE_SKY_INTENSITY : SKY_INTENSITY);
  scene.add(hemi, sun);
  // Above ground the sky stands over the site, held at a clear noon, with the fog kept pushed out.
  let sky: Sky | null = null;
  if (!below) {
    sky = new Sky(scene, hemi, sun, fog);
    sky.forcedPhase = 0.5;
    sky.forcedWeather = { cover: 0, rain: 0, mist: 0, storm: 0 };
    sky.fogRange = [60, p.fogFar ?? 200];
    scene.add(sky.group);
  }
  scene.add(buildTerrain(map, p.box));
  const within = (o: { x: number; y: number }) => inBox(p.box, o.x, o.y);
  scene.add(buildObjects(map, map.objects.filter(within)).group);
  if (!below) scene.add(new Roofs(map, [p.box]).group);
  const grass = buildGrass(map, p.box);
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
  const focus = new THREE.Vector3(p.focus.x, heightAt(map, p.focus.x, p.focus.y) + 1, -p.focus.y);
  return { key: p.key, scene, map, models, focus, distance: p.distance, cameraFar: p.cameraFar ?? 160, sky, flames };
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
    place.sky?.update(0, camera.position, target, 0);
    renderer.render(place.scene, camera);
    await beacon(`SHOT ${s.name} ${renderer.domElement.toDataURL("image/png")}`);
  }
  renderer.setSize(size.x, size.y, false);
  await beacon("DONE");
}
