// The animation preview (#animations): characters in a small scene showing every pose the rig has, so
// the look can be judged without playing. With a beacon it also posts close-up snapshots of each action.
import * as THREE from "three";
import { item, VISIBLE_GEAR, type EquipSlot } from "../shared/items.ts";
import { STARTER_LOOK } from "../shared/look.ts";
import { blankMap, heightAt, OVERLAY_WATER, UNDERLAY_SAND } from "../shared/map.ts";
import {
  FOG_COLOR, GROUND_LIGHT, SKY_INTENSITY, SKY_LIGHT, SUN_COLOR, SUN_FROM, SUN_INTENSITY,
} from "./palette.ts";
import { OrbitCamera } from "./render/camera.ts";
import { CharacterModel } from "./render/character.ts";
import { buildObjects } from "./render/objects.ts";
import type { ActionName } from "./render/poses.ts";
import { buildTerrain } from "./render/terrain.ts";

interface Actor {
  label: string;
  model: CharacterModel;
  fx: number;
  fy: number;
  /** Radians about the vertical: 0 faces south, π faces north. */
  facing: number;
  walking?: boolean;
  action?: ActionName;
}

const gearOf = (worn: Partial<Record<EquipSlot, string>>) => VISIBLE_GEAR.map((slot) => (worn[slot] ? item(worn[slot]).id : 0));

export function startAnimationPreview(container: HTMLElement, beacon: ((line: string) => void) | null): void {
  // A strip of grass with a tree, a rock and a stretch of water with a sandy bank.
  const map = blankMap(15, 8);
  for (let x = 9; x < 15; x++) {
    map.underlay[4 * map.width + x] = UNDERLAY_SAND;
    for (let y = 5; y < 8; y++) map.overlay[y * map.width + x] = OVERLAY_WATER;
  }
  // The tree and the rock are built apart, so close-ups can swap the tree's canopy for a bare trunk.
  const tree = buildObjects({ ...map, objects: [{ kind: "tree", x: 4, y: 5, side: 0, variant: 0.35 }] });
  const rock = buildObjects({ ...map, objects: [{ kind: "rock", x: 7, y: 5, side: 0, variant: 0.2 }] });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 2.2, 10), new THREE.MeshLambertMaterial({ color: 0xb27c4e }));
  trunk.position.set(4.5, 1.1, -5.5);
  trunk.visible = false;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG_COLOR);
  const sun = new THREE.DirectionalLight(SUN_COLOR, SUN_INTENSITY);
  sun.position.set(...SUN_FROM);
  scene.add(new THREE.HemisphereLight(SKY_LIGHT, GROUND_LIGHT, SKY_INTENSITY), sun, buildTerrain(map), tree, rock, trunk);

  const axe = item("bronze_axe").id, pickaxe = item("bronze_pickaxe").id, net = item("fishing_net").id;
  const actors: Actor[] = [
    { label: "Standing", model: new CharacterModel(STARTER_LOOK), fx: 1.5, fy: 4.5, facing: 0 },
    { label: "Walking, axe wielded", model: new CharacterModel(STARTER_LOOK, gearOf({ weapon: "bronze_axe" })), fx: 2.6, fy: 3.2, facing: Math.PI / 2, walking: true },
    { label: "Chopping", model: new CharacterModel(STARTER_LOOK), fx: 4.5, fy: 4.5, facing: Math.PI, action: "chop" },
    { label: "Mining", model: new CharacterModel(STARTER_LOOK), fx: 7.5, fy: 4.5, facing: Math.PI, action: "mine" },
    { label: "Net fishing", model: new CharacterModel(STARTER_LOOK), fx: 10.5, fy: 4.5, facing: Math.PI, action: "net" },
    {
      label: "Starter kit worn", fx: 12.8, fy: 3, facing: 0.5,
      model: new CharacterModel(STARTER_LOOK, gearOf({
        head: "leather_cap", cape: "red_cape", weapon: "bronze_dagger", body: "leather_jerkin", shield: "wooden_shield",
        legs: "leather_trousers", hands: "leather_gloves", feet: "leather_boots",
      })),
    },
  ];
  const tools: Record<ActionName, number> = { chop: axe, mine: pickaxe, net };
  const labels = document.createElement("div");
  labels.className = "preview-labels";
  document.body.append(labels);
  for (const a of actors) {
    if (a.action) a.model.act(a.action, tools[a.action]);
    a.model.root.position.set(a.fx, heightAt(map, a.fx, a.fy), -a.fy);
    a.model.root.rotation.y = a.facing;
    scene.add(a.model.root);
    labels.append(Object.assign(document.createElement("div"), { className: "preview-label", textContent: a.label }));
  }

  // The game camera, turned with the arrow keys or by dragging, and zoomed with the wheel.
  const canvas = renderer.domElement;
  const view = new OrbitCamera(canvas);
  view.yaw = -0.35;
  view.distance = 12;
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

  const focus = new THREE.Vector3(7.2, 0.9, -4.2);
  const v = new THREE.Vector3();
  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    for (const a of actors) a.model.animate(dt, a.walking ? dt * 1.6 : 0, a.walking === true, false);
    view.update(dt, focus);
    renderer.render(scene, view.camera);
    const r = canvas.getBoundingClientRect();
    actors.forEach((a, i) => {
      v.copy(a.model.root.position).setY(a.model.root.position.y + 1.95).project(view.camera);
      const el = labels.children[i] as HTMLElement;
      el.style.left = `${r.left + ((v.x + 1) / 2) * r.width}px`;
      el.style.top = `${r.top + ((1 - v.y) / 2) * r.height}px`;
    });
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  if (beacon) void shoot(actors, renderer, scene, beacon, { tree, trunk });
}

/** Close-ups of each action at points through its loop, from the side and from the front. */
async function shoot(
  actors: Actor[], renderer: THREE.WebGLRenderer, scene: THREE.Scene, beacon: (line: string) => void, props: { tree: THREE.Object3D; trunk: THREE.Object3D },
): Promise<void> {
  await new Promise((r) => setTimeout(r, 800));
  props.tree.visible = false;
  props.trunk.visible = true;
  const camera = new THREE.PerspectiveCamera(32, 4 / 3, 0.05, 60);
  const size = new THREE.Vector2();
  renderer.getSize(size);
  renderer.setSize(640, 480, false);
  const shot = (name: string, a: Actor, around: number, distance: number, height: number) => {
    const p = a.model.root.position, dir = a.facing + around;
    camera.position.set(p.x + Math.sin(dir) * distance, p.y + height, p.z + Math.cos(dir) * distance);
    camera.lookAt(p.x, p.y + 0.8, p.z);
    renderer.render(scene, camera);
    beacon(`SHOT ${name} ${renderer.domElement.toDataURL("image/png")}`);
  };
  for (const a of actors) {
    if (a.action) {
      for (const t of [0.05, 0.3, 0.5, 0.62]) {
        a.model.freeze(t);
        a.model.animate(0, 0, false, false);
        const at = String(Math.round(t * 100));
        // Side on (from the character's right), then from in front and to the left.
        shot(`anim_${a.action}_${at}_side`, a, -Math.PI / 2, 3, 1.1);
        shot(`anim_${a.action}_${at}_front`, a, 0.7, 3.2, 1.4);
      }
      a.model.freeze(null);
    } else {
      shot(`anim_${a.walking ? "walk" : a.label.startsWith("Starter") ? "kit" : "stand"}_front`, a, 0.3, 3.2, 1.2);
      shot(`anim_${a.walking ? "walk" : a.label.startsWith("Starter") ? "kit" : "stand"}_side`, a, -Math.PI / 2, 3, 1.1);
    }
  }
  props.tree.visible = true;
  props.trunk.visible = false;
  renderer.setSize(size.x, size.y, false);
  beacon("DONE");
}
