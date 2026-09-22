// The animation preview (#animations): characters in a small scene showing every pose the rig has, so
// the look can be judged without playing. With a beacon it also posts close-up snapshots of each action.
import * as THREE from "three";
import { item, VISIBLE_GEAR, type EquipSlot } from "../shared/items.ts";
import { STARTER_LOOK } from "../shared/look.ts";
import { blankMap, heightAt, OVERLAY_WATER, UNDERLAY_SAND } from "../shared/map.ts";
import {
  FOG_COLOR, GROUND_LIGHT, SKY_INTENSITY, SKY_LIGHT, SUN_COLOR, SUN_FROM, SUN_INTENSITY,
} from "./palette.ts";
import { MONSTERS } from "../shared/monsters.ts";
import { OrbitCamera } from "./render/camera.ts";
import { CharacterModel } from "./render/character.ts";
import { MonsterModel } from "./render/monster.ts";
import { buildObjects } from "./render/objects.ts";
import type { ActionName } from "./render/poses.ts";
import { buildTerrain } from "./render/terrain.ts";

interface Actor {
  label: string;
  model: CharacterModel | MonsterModel;
  fx: number;
  fy: number;
  /** Radians about the vertical: 0 faces south, π faces north. */
  facing: number;
  walking?: boolean;
  action?: ActionName;
  /** A creature's key, for naming its snapshots. */
  npc?: string;
  /** A head to photograph close up, under this name. */
  face?: string;
}

/**
 * The looks the face row wears: the head across both body types, light skin and dark, and hair and
 * beards that sit on it differently. Slots are in LOOK_SLOTS order.
 */
const FACES: Array<[name: string, look: number[]]> = [
  ["bald", [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 2, 0]],
  ["long", [1, 3, 0, 4, 1, 0, 0, 1, 3, 5, 9, 3, 0]],
  ["beard", [0, 2, 4, 1, 1, 0, 0, 1, 6, 7, 12, 6, 2]],
  ["mohawk", [0, 7, 2, 3, 2, 1, 0, 1, 4, 3, 0, 8, 4]],
];

/** Where the bestiary is laid out: creatures across, in rows behind the people. */
const PER_ROW = 6;
const SPACING = 3.6;
const FIRST_ROW_Y = 9.5;

const gearOf = (worn: Partial<Record<EquipSlot, string>>) => VISIBLE_GEAR.map((slot) => (worn[slot] ? item(worn[slot]).id : 0));

export function startAnimationPreview(container: HTMLElement, beacon: ((line: string) => Promise<void>) | null): void {
  // A strip of grass with a tree, a rock and a stretch of water with a sandy bank, and behind it the
  // room the whole bestiary stands in.
  const rows = Math.ceil(MONSTERS.length / PER_ROW);
  const map = blankMap(24, Math.ceil(FIRST_ROW_Y + rows * 3 + 1));
  for (let x = 9; x < 15; x++) {
    map.underlay[4 * map.width + x] = UNDERLAY_SAND;
    for (let y = 5; y < 8; y++) map.overlay[y * map.width + x] = OVERLAY_WATER;
  }
  // The tree and the rock are built apart, so close-ups can swap the tree's canopy for a bare trunk.
  const tree = buildObjects({ ...map, objects: [{ id: 0, kind: "tree", x: 4, y: 5, side: 0, variant: 0.35 }] }).group;
  const rock = buildObjects({ ...map, objects: [{ id: 0, kind: "rock", x: 7, y: 5, side: 0, variant: 0.2 }] }).group;
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
    {
      label: "On guard", fx: 15.5, fy: 4.5, facing: Math.PI, action: "guard",
      model: new CharacterModel(STARTER_LOOK, gearOf({ weapon: "bronze_sword", shield: "bronze_shield" })),
    },
    {
      label: "Striking", fx: 18.5, fy: 4.5, facing: Math.PI, action: "strike",
      model: new CharacterModel(STARTER_LOOK, gearOf({ weapon: "bronze_sword", shield: "bronze_shield" })),
    },
    // The face row: the same head under different hair, beards and skins, for a close look at it.
    ...FACES.map(([name, look], i): Actor => ({
      label: `Face: ${name}`,
      model: new CharacterModel(look),
      fx: 3 + i * 3,
      fy: 6.8,
      facing: 0,
      face: name,
    })),
    // The whole bestiary, weakest first, each facing the camera.
    ...MONSTERS.map((def, i): Actor => ({
      label: def.name,
      model: new MonsterModel(def.key),
      fx: 2 + (i % PER_ROW) * SPACING,
      fy: FIRST_ROW_Y + Math.floor(i / PER_ROW) * 3,
      facing: 0,
      npc: def.key,
    })),
  ];
  const tools: Record<ActionName, number> = {
    chop: axe, mine: pickaxe, net, guard: item("bronze_sword").id, strike: item("bronze_sword").id,
  };
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
  let nextSwing = 0;
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    // Every couple of seconds the creatures throw a blow, so the lunge can be seen.
    if (now >= nextSwing) {
      nextSwing = now + 2200;
      for (const a of actors) if (a.npc) a.model.swing();
    }
    for (const a of actors) a.model.animate(dt, a.walking ? dt * 1.6 : 0, a.walking === true, false);
    view.update(dt, focus);
    renderer.render(scene, view.camera);
    const r = canvas.getBoundingClientRect();
    actors.forEach((a, i) => {
      v.copy(a.model.root.position).setY(a.model.root.position.y + a.model.height + 0.3).project(view.camera);
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
  actors: Actor[], renderer: THREE.WebGLRenderer, scene: THREE.Scene, beacon: (line: string) => Promise<void>,
  props: { tree: THREE.Object3D; trunk: THREE.Object3D },
): Promise<void> {
  await new Promise((r) => setTimeout(r, 800));
  props.tree.visible = false;
  props.trunk.visible = true;
  const camera = new THREE.PerspectiveCamera(32, 4 / 3, 0.05, 60);
  const size = new THREE.Vector2();
  renderer.getSize(size);
  renderer.setSize(640, 480, false);
  // Each snapshot is waited on before the next is taken: without that, a run of them loses some.
  const shot = async (name: string, a: Actor, around: number, distance: number, height: number, look = 0.8) => {
    const p = a.model.root.position, dir = a.facing + around;
    camera.position.set(p.x + Math.sin(dir) * distance, p.y + height, p.z + Math.cos(dir) * distance);
    camera.lookAt(p.x, p.y + look, p.z);
    renderer.render(scene, camera);
    await beacon(`SHOT ${name} ${renderer.domElement.toDataURL("image/png")}`);
  };
  for (const a of actors) {
    if (a.face) {
      // The head filling the frame, three-quarters on and from a shade above — the angle and the size a
      // player sees it at is no use for judging a face, and head-on tells you nothing about its shape.
      for (const other of actors) other.model.root.visible = other === a;
      const h = a.model.height;
      await shot(`head_${a.face}_front`, a, 0.7, 0.92, h * 1.02, h * 0.907);
      await shot(`head_${a.face}_side`, a, -Math.PI / 2, 0.92, h * 1.0, h * 0.907);
      for (const other of actors) other.model.root.visible = true;
      continue;
    }
    if (a.npc) {
      // A creature gets the frame to itself: everything else is hidden, so nothing stands behind it.
      for (const other of actors) other.model.root.visible = other === a;
      // Framed by its own size, three-quarters on — the angle a player sees it from, and the one that
      // shows an animal's outline. Head-on, anything long reads as a flat face of a box.
      const h = Math.max(0.3, a.model.height), near = h * 3.4 + 0.7;
      await shot(`npc_${a.npc}_front`, a, 0.85, near, h * 1.25, h * 0.45);
      a.model.freeze(0.45);
      a.model.animate(0, 0, false, false);
      await shot(`npc_${a.npc}_strike`, a, -1.3, near, h * 1.25, h * 0.45);
      a.model.freeze(null);
      for (const other of actors) other.model.root.visible = true;
      continue;
    }
    if (a.action) {
      for (const t of [0.05, 0.3, 0.5, 0.62]) {
        a.model.freeze(t);
        a.model.animate(0, 0, false, false);
        const at = String(Math.round(t * 100));
        // Side on (from the character's right), then from in front and to the left.
        await shot(`anim_${a.action}_${at}_side`, a, -Math.PI / 2, 3, 1.1);
        await shot(`anim_${a.action}_${at}_front`, a, 0.7, 3.2, 1.4);
      }
      a.model.freeze(null);
    } else {
      const name = a.walking ? "walk" : a.label.startsWith("Starter") ? "kit" : "stand";
      await shot(`anim_${name}_front`, a, 0.3, 3.2, 1.2);
      await shot(`anim_${name}_side`, a, -Math.PI / 2, 3, 1.1);
    }
  }
  props.tree.visible = true;
  props.trunk.visible = false;
  renderer.setSize(size.x, size.y, false);
  beacon("DONE");
}
