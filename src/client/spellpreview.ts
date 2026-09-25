// The spell preview (#spellpreview): a mage with a staff and a goblin across a strip of grass, and a button
// for every spell of the book, so each one's cast, flight and hit can be judged without a fight (the magic
// plan, §5). "Every spell" plays the whole ladder in turn. With a beacon it steps each spell through on a
// fixed clock and posts one strip a spell: the gather, the flight, the hit and what the hit leaves.
import * as THREE from "three";
import { item, VISIBLE_GEAR, type EquipSlot } from "../shared/items.ts";
import { STARTER_LOOK } from "../shared/look.ts";
import { blankMap, heightAt } from "../shared/map.ts";
import { SPELLS, type Spell } from "../shared/spells.ts";
import { TICK_MS } from "../shared/constants.ts";
import { GROUND_LIGHT, SKY_INTENSITY, SKY_LIGHT, SUN_COLOR, SUN_FROM, SUN_INTENSITY } from "./palette.ts";
import { OrbitCamera } from "./render/camera.ts";
import { CharacterModel } from "./render/character.ts";
import { Effects } from "./render/effects.ts";
import { MonsterModel } from "./render/monster.ts";
import { CAST_WINDUP, SpellFx } from "./render/spellfx.ts";
import { buildTerrain } from "./render/terrain.ts";
import { spellIcon } from "./ui/spellicons.ts";

const WIDTH = 24, HEIGHT = 16;
const CASTER = { x: 7.5, y: 8.5 }, TARGET = { x: 15.5, y: 8.5 };
const gearOf = (worn: Partial<Record<EquipSlot, string>>) => VISIBLE_GEAR.map((slot) => (worn[slot] ? item(worn[slot]).id : 0));

export function startSpellPreview(container: HTMLElement, beacon: ((line: string) => Promise<void>) | null): void {
  const map = blankMap(WIDTH, HEIGHT);
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.append(renderer.domElement);
  const scene = new THREE.Scene();
  // A daylight sky behind them: the game draws its own, and colours are judged against daylight.
  scene.background = new THREE.Color(0xa8c8e8);
  const sun = new THREE.DirectionalLight(SUN_COLOR, SUN_INTENSITY);
  sun.position.set(...SUN_FROM);
  scene.add(new THREE.HemisphereLight(SKY_LIGHT, GROUND_LIGHT, SKY_INTENSITY), sun, buildTerrain(map));

  const staff = item("ember_staff").id;
  const mage = new CharacterModel(STARTER_LOOK, gearOf({ weapon: "ember_staff", body: "wool_robe", head: "wool_hood" }));
  mage.act("guard", staff);
  mage.root.position.set(CASTER.x, heightAt(map, CASTER.x, CASTER.y), -CASTER.y);
  mage.root.rotation.y = Math.PI / 2;
  const goblin = new MonsterModel("mudfoot_goblin");
  goblin.root.position.set(TARGET.x, heightAt(map, TARGET.x, TARGET.y), -TARGET.y);
  goblin.root.rotation.y = -Math.PI / 2;
  scene.add(mage.root, goblin.root);
  const effects = new Effects();
  const strike = Math.max(0.55, goblin.height) * 0.6;
  const cast = (spell: Spell) => {
    mage.cast();
    effects.shot(mage.root, goblin.root, spell.key, strike);
  };

  // The buttons: the book in its order, and every spell in turn.
  const bar = Object.assign(document.createElement("section"), { className: "spell-preview" });
  const every = Object.assign(document.createElement("button"), { type: "button", textContent: "Every spell" });
  bar.append(every);
  for (const spell of SPELLS) {
    const b = Object.assign(document.createElement("button"), { type: "button", title: `${spell.name} (level ${spell.level})` });
    b.append(Object.assign(document.createElement("img"), { src: spellIcon(spell), alt: spell.name }));
    b.addEventListener("click", () => cast(spell));
    bar.append(b);
  }
  let queue: Spell[] = [];
  let nextAt = 0;
  every.addEventListener("click", () => {
    queue = [...SPELLS];
    nextAt = 0;
  });
  document.body.append(bar);

  const canvas = renderer.domElement;
  const view = new OrbitCamera(canvas);
  view.yaw = 0.2;
  view.pitch = 0.32;
  view.distance = 11;
  let drag: { x: number; y: number } | null = null;
  canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    view.yaw += (e.clientX - drag.x) * 0.006;
    view.pitch = THREE.MathUtils.clamp(view.pitch + (e.clientY - drag.y) * 0.006, 0.1, 1.2);
    drag = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener("pointerup", () => { drag = null; });
  const resize = () => {
    renderer.setSize(container.clientWidth, container.clientHeight);
    view.resize(container.clientWidth, container.clientHeight);
  };
  new ResizeObserver(resize).observe(container);
  resize();

  const focus = new THREE.Vector3((CASTER.x + TARGET.x) / 2, heightAt(map, 11, 8) + 1, -(CASTER.y + TARGET.y) / 2);
  const step = (dt: number) => {
    mage.animate(dt, 0, false, false);
    goblin.animate(dt, 0, false, false);
    effects.update(dt);
  };
  let last = performance.now(), shooting = false;
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!shooting) {
      if (queue.length > 0 && now >= nextAt) {
        const spell = queue.shift()!;
        cast(spell);
        nextAt = now + (SpellFx.arrival(spell.key) + 0.9) * 1000;
      }
      step(dt);
      view.update(dt, focus);
      renderer.render(scene, view.camera);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  if (beacon) {
    void (async () => {
      shooting = true;
      await shoot(renderer, scene, focus, cast, step, beacon);
      shooting = false;
    })();
  }
}

/**
 * Every spell stepped through on a fixed clock of sixtieths, photographed at four moments and posted as
 * one strip: mid-gather, mid-flight, the hit, and a moment after it.
 */
async function shoot(
  renderer: THREE.WebGLRenderer, scene: THREE.Scene, focus: THREE.Vector3, cast: (spell: Spell) => void, step: (dt: number) => void,
  beacon: (line: string) => Promise<void>,
): Promise<void> {
  await new Promise((r) => setTimeout(r, 500));
  const W = 480, H = 300;
  const camera = new THREE.PerspectiveCamera(46, W / H, 0.05, 120);
  camera.position.set(focus.x, focus.y + 2.6, focus.z + 7.4);
  camera.lookAt(focus);
  const size = new THREE.Vector2();
  renderer.getSize(size);
  renderer.setSize(W, H, false);
  const strip = Object.assign(document.createElement("canvas"), { width: W * 4, height: H });
  const g = strip.getContext("2d")!;
  const tick = 1 / 60;
  for (const spell of SPELLS) {
    const flight = SpellFx.arrival(spell.key) - CAST_WINDUP;
    const moments = [CAST_WINDUP * 0.6, CAST_WINDUP + flight * 0.5, CAST_WINDUP + flight + 0.05, CAST_WINDUP + flight + 0.35];
    cast(spell);
    let t = 0;
    for (let i = 0; i < moments.length; i++) {
      while (t < moments[i]!) {
        step(tick);
        t += tick;
      }
      renderer.render(scene, camera);
      g.drawImage(renderer.domElement, i * W, 0, W, H);
    }
    await beacon(`SHOT spell_${spell.key} ${strip.toDataURL("image/png")}`);
    // Everything it left clears before the next: a bind's coil stays for its whole hold.
    const clear = spell.holds ? (spell.holds * TICK_MS) / 1000 + 1 : spell.curse?.stat === "attack" && spell.curse.share > 0.05 ? 4.5 : 2;
    for (let k = 0; k < clear * 60; k++) step(tick);
  }
  renderer.setSize(size.x, size.y, false);
  await beacon("DONE");
}
