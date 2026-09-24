// The village preview (#village): every person of Oakridge standing in a row, with one building of
// each kind behind them, so the look of a town can be judged without walking one. With a beacon it
// also posts the row, a close-up of each person, and each building three-quarters on.
import * as THREE from "three";
import { heightAt, ROOF_KEEP, ROOF_SLATE, ROOF_THATCH, UNDERLAY_DIRT, type WorldMap } from "../shared/map.ts";
import { VILLAGERS } from "../shared/monsters.ts";
import { boxOf, building, WorldBuilder, type Box } from "../shared/worldgen.ts";
import { personGear } from "./entity.ts";
import {
  FOG_COLOR, GROUND_LIGHT, SKY_INTENSITY, SKY_LIGHT, SUN_COLOR, SUN_FROM, SUN_INTENSITY,
} from "./palette.ts";
import { OrbitCamera } from "./render/camera.ts";
import { CharacterModel } from "./render/character.ts";
import { buildObjects } from "./render/objects.ts";
import { Roofs } from "./render/roofs.ts";
import { buildTerrain } from "./render/terrain.ts";

const WIDTH = 40;
const HEIGHT = 26;
/** The row the people stand on, how far apart they stand, and where the first one is. */
const PEOPLE_ROW = 6;
const SPACING = 2.6;
const FIRST = 6;

/** One thing in the line-up: its label, where it stands, how high its label floats, and its snapshot's name. */
interface Marked {
  label: string;
  x: number;
  y: number;
  lift: number;
  shot: string;
}

/** A building of the line-up: its box, and what its snapshot is called. */
interface Shown {
  box: Box;
  shot: string;
  label: string;
}

export function startVillagePreview(container: HTMLElement, beacon: ((line: string) => Promise<void>) | null): void {
  const b = new WorldBuilder(WIDTH, HEIGHT, 0, 0, 3);
  const map = b.plane(0);
  // One building of each kind along the back: a clay-tiled cottage, a two-storey slate inn, a thatched
  // barn, and a keep with a turret on its corner — put up by the same builder the district uses, so
  // what is judged here is what stands there.
  const shown: Shown[] = [
    { box: boxOf(2, 14, 8, 19), shot: "cottage", label: "Cottage: clay tile" },
    { box: boxOf(11, 14, 17, 20), shot: "inn", label: "Inn: two storeys, slate" },
    { box: boxOf(20, 14, 26, 19), shot: "barn", label: "Barn: thatch" },
    { box: boxOf(30, 14, 36, 20), shot: "keep", label: "Keep: parapet, slits, a turret" },
  ];
  building(b, {
    box: shown[0]!.box, doors: [{ side: 2, along: 3 }], windows: [{ side: 2, along: 1 }, { side: 2, along: 5 }, { side: 3, along: 2 }], floor: UNDERLAY_DIRT,
  });
  building(b, {
    box: shown[1]!.box, doors: [{ side: 2, along: 3 }], windows: [{ side: 2, along: 1 }, { side: 2, along: 5 }, { side: 1, along: 3 }],
    storeys: 2, stair: { x: 12, y: 15 }, floor: UNDERLAY_DIRT, roof: ROOF_SLATE,
  });
  building(b, { box: shown[2]!.box, doors: [{ side: 2, along: 3 }], windows: [{ side: 2, along: 1 }], floor: UNDERLAY_DIRT, roof: ROOF_THATCH });
  building(b, {
    box: shown[3]!.box, doors: [{ side: 2, along: 3 }], windows: [{ side: 2, along: 1 }, { side: 2, along: 5 }], floor: UNDERLAY_DIRT, roof: ROOF_KEEP, style: "keep",
  });
  building(b, { box: boxOf(29, 13, 30, 14), doors: [], windows: [{ side: 2, along: 0 }], floor: UNDERLAY_DIRT, height: 2, roof: ROOF_KEEP, style: "keep" });

  const marks: Marked[] = shown.map((s) => ({
    label: s.label, x: (s.box.x0 + s.box.x1 + 1) / 2, y: (s.box.y0 + s.box.y1 + 1) / 2, lift: 4.8, shot: `building_${s.shot}`,
  }));

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG_COLOR);
  const sun = new THREE.DirectionalLight(SUN_COLOR, SUN_INTENSITY);
  sun.position.set(...SUN_FROM);
  const roofs = new Roofs(map);
  scene.add(new THREE.HemisphereLight(SKY_LIGHT, GROUND_LIGHT, SKY_INTENSITY), sun, buildTerrain(map), buildObjects(map).group, roofs.group);

  // The people, in the bestiary's order, each facing the camera.
  const people: CharacterModel[] = [];
  VILLAGERS.forEach((def, i) => {
    if (!def.look) return;
    const model = new CharacterModel(def.look, personGear(def), { apron: def.apron });
    const x = FIRST + i * SPACING, y = PEOPLE_ROW + 0.5;
    model.root.position.set(x, heightAt(map, x, y), -y);
    scene.add(model.root);
    people.push(model);
    const label = def.key === "villager" ? "Villager (man)" : def.key === "villager_woman" ? "Villager (woman)" : def.name;
    marks.push({ label, x, y, lift: 1.95, shot: `villager_${def.key}` });
  });

  const labels = document.createElement("div");
  labels.className = "preview-labels";
  document.body.append(labels);
  for (const m of marks) labels.append(Object.assign(document.createElement("div"), { className: "preview-label", textContent: m.label }));

  const canvas = renderer.domElement;
  const view = new OrbitCamera(canvas);
  view.yaw = 0;
  view.pitch = 0.42;
  view.distance = 22;
  let drag: { x: number; y: number } | null = null;
  canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    view.yaw += (e.clientX - drag.x) * 0.006;
    view.pitch = THREE.MathUtils.clamp(view.pitch + (e.clientY - drag.y) * 0.006, 0.2, 1.2);
    drag = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener("pointerup", () => { drag = null; });
  const resize = () => {
    renderer.setSize(container.clientWidth, container.clientHeight);
    view.resize(container.clientWidth, container.clientHeight);
  };
  new ResizeObserver(resize).observe(container);
  resize();

  const focus = new THREE.Vector3(WIDTH / 2, 1.2, -(PEOPLE_ROW + 5));
  const v = new THREE.Vector3();
  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    for (const p of people) p.animate(dt, 0, false, false);
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

  if (beacon) void shoot(map, renderer, scene, marks, shown, beacon);
}

/**
 * The row of people from the front, then each one close up and three-quarters on — the angle a
 * player sees them from — then each building from its south-west corner, framed by its own size.
 */
async function shoot(
  map: WorldMap, renderer: THREE.WebGLRenderer, scene: THREE.Scene, marks: Marked[], shown: Shown[],
  beacon: (line: string) => Promise<void>,
): Promise<void> {
  await new Promise((r) => setTimeout(r, 800));
  const camera = new THREE.PerspectiveCamera(32, 4 / 3, 0.05, 120);
  const size = new THREE.Vector2();
  renderer.getSize(size);
  renderer.setSize(640, 480, false);
  const look = (tx: number, ty: number, lift: number, yaw: number, pitch: number, distance: number, fov = 32): string => {
    camera.fov = fov;
    camera.updateProjectionMatrix();
    const target = new THREE.Vector3(tx, heightAt(map, tx, ty) + lift, -ty);
    const flat = Math.cos(pitch) * distance;
    camera.position.set(target.x - Math.sin(yaw) * flat, target.y + Math.sin(pitch) * distance, target.z + Math.cos(yaw) * flat);
    camera.lookAt(target);
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL("image/png");
  };
  await beacon(`SHOT village_people ${look(WIDTH / 2 - 1, PEOPLE_ROW + 0.5, 0.9, 0, 0.1, 30, 46)}`);
  for (const m of marks) {
    if (m.shot.startsWith("villager_")) await beacon(`SHOT ${m.shot} ${look(m.x, m.y, 0.85, 0.5, 0.18, 3.2)}`);
  }
  for (const s of shown) {
    const w = s.box.x1 - s.box.x0 + 1, h = s.box.y1 - s.box.y0 + 1;
    await beacon(`SHOT building_${s.shot} ${look((s.box.x0 + s.box.x1 + 1) / 2, (s.box.y0 + s.box.y1 + 1) / 2, 1.6, 0.75, 0.42, Math.max(w, h) * 2.2)}`);
  }
  renderer.setSize(size.x, size.y, false);
  beacon("DONE");
}
