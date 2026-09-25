// The Caldmoor preview (#caldmoor): the second kingdom's building style, put up before any of Caldmoor is
// (PLAN §7.7 rule 10: a second kingdom reads as a different country). A townhouse, a cottage, a hall with
// a round tower at its corner, a narrow house turned gable-end to the street, and a round tower alone —
// steep slate between crow-stepped stone gables, chimneys on the gables' heads, conical caps — and an
// Oakridge cottage at the end to judge them against. With a beacon it posts the row and each building.
import * as THREE from "three";
import { heightAt, ROOF_CLAY, ROOF_GABLE, UNDERLAY_DIRT, type WorldMap } from "../shared/map.ts";
import { boxOf, building, WorldBuilder, type Box } from "../shared/worldgen.ts";
import { FOG_COLOR, GROUND_LIGHT, SKY_INTENSITY, SKY_LIGHT, SUN_COLOR, SUN_FROM, SUN_INTENSITY } from "./palette.ts";
import { OrbitCamera } from "./render/camera.ts";
import { buildObjects } from "./render/objects.ts";
import { Roofs } from "./render/roofs.ts";
import { buildTerrain } from "./render/terrain.ts";

const WIDTH = 52;
const HEIGHT = 26;

/** A building of the line-up: its box, what its snapshot is called, and its label. */
interface Shown {
  box: Box;
  shot: string;
  label: string;
}

export function startCaldmoorPreview(container: HTMLElement, beacon: ((line: string) => Promise<void>) | null): void {
  const b = new WorldBuilder(WIDTH, HEIGHT, 0, 0, 5);
  const map = b.plane(0);
  const shown: Shown[] = [
    { box: boxOf(2, 12, 8, 18), shot: "townhouse", label: "Townhouse: two storeys, crow-stepped gables" },
    { box: boxOf(11, 13, 16, 17), shot: "cottage", label: "Cottage" },
    { box: boxOf(19, 12, 30, 18), shot: "hall", label: "Hall, a round tower at its corner" },
    { box: boxOf(34, 12, 38, 19), shot: "gablehouse", label: "Narrow house, gable-end to the street" },
    { box: boxOf(41, 14, 43, 16), shot: "tower", label: "Round tower: a conical cap" },
    { box: boxOf(46, 13, 51, 18), shot: "oakridge", label: "Oakridge cottage, for comparison" },
  ];
  building(b, {
    box: shown[0]!.box, doors: [{ side: 2, along: 3 }], windows: [{ side: 2, along: 1 }, { side: 2, along: 5 }, { side: 0, along: 3 }],
    storeys: 2, stair: { x: 3, y: 17 }, floor: UNDERLAY_DIRT, roof: ROOF_GABLE,
  });
  building(b, { box: shown[1]!.box, doors: [{ side: 2, along: 2 }], windows: [{ side: 2, along: 4 }], floor: UNDERLAY_DIRT, roof: ROOF_GABLE });
  building(b, {
    box: shown[2]!.box, doors: [{ side: 2, along: 5 }], windows: [{ side: 2, along: 2 }, { side: 2, along: 8 }, { side: 2, along: 10 }], floor: UNDERLAY_DIRT, roof: ROOF_GABLE,
  });
  b.place(0, "round_tower", 31, 11);
  building(b, {
    box: shown[3]!.box, doors: [{ side: 2, along: 2 }], windows: [{ side: 3, along: 3 }, { side: 1, along: 5 }],
    storeys: 2, stair: { x: 37, y: 18 }, floor: UNDERLAY_DIRT, roof: ROOF_GABLE,
  });
  b.place(0, "round_tower", 42, 15);
  building(b, { box: shown[5]!.box, doors: [{ side: 2, along: 2 }], windows: [{ side: 2, along: 4 }], floor: UNDERLAY_DIRT, roof: ROOF_CLAY });

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG_COLOR);
  const sun = new THREE.DirectionalLight(SUN_COLOR, SUN_INTENSITY);
  sun.position.set(...SUN_FROM);
  scene.add(new THREE.HemisphereLight(SKY_LIGHT, GROUND_LIGHT, SKY_INTENSITY), sun, buildTerrain(map), buildObjects(map).group, new Roofs(map).group);

  const labels = document.createElement("div");
  labels.className = "preview-labels";
  document.body.append(labels);
  for (const s of shown) labels.append(Object.assign(document.createElement("div"), { className: "preview-label", textContent: s.label }));

  const canvas = renderer.domElement;
  const view = new OrbitCamera(canvas);
  view.yaw = 0.35;
  view.pitch = 0.42;
  view.distance = 34;
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

  const focus = new THREE.Vector3(WIDTH / 2, 2, -15);
  const v = new THREE.Vector3();
  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    view.update(dt, focus);
    renderer.render(scene, view.camera);
    const r = canvas.getBoundingClientRect();
    shown.forEach((s, i) => {
      const x = (s.box.x0 + s.box.x1 + 1) / 2, y = (s.box.y0 + s.box.y1 + 1) / 2;
      v.set(x, heightAt(map, x, y) + 7.5, -y).project(view.camera);
      const el = labels.children[i] as HTMLElement;
      el.style.left = `${r.left + ((v.x + 1) / 2) * r.width}px`;
      el.style.top = `${r.top + ((1 - v.y) / 2) * r.height}px`;
    });
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  if (beacon) void shoot(map, renderer, scene, shown, beacon);
}

/** The row from the street, then each building from its south-west corner, framed by its own size. */
async function shoot(map: WorldMap, renderer: THREE.WebGLRenderer, scene: THREE.Scene, shown: Shown[], beacon: (line: string) => Promise<void>): Promise<void> {
  await new Promise((r) => setTimeout(r, 800));
  const camera = new THREE.PerspectiveCamera(32, 4 / 3, 0.05, 160);
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
  await beacon(`SHOT caldmoor_row ${look(WIDTH / 2, 15, 2.5, 0.1, 0.3, 56, 46)}`);
  for (const s of shown) {
    const w = s.box.x1 - s.box.x0 + 1, h = s.box.y1 - s.box.y0 + 1;
    await beacon(`SHOT caldmoor_${s.shot} ${look((s.box.x0 + s.box.x1 + 1) / 2, (s.box.y0 + s.box.y1 + 1) / 2, 2.4, 0.75, 0.38, Math.max(w, h, 5) * 2.4)}`);
  }
  renderer.setSize(size.x, size.y, false);
  beacon("DONE");
}
