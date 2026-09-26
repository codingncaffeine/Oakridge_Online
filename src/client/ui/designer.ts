import * as THREE from "three";
import { BODY_B, LOOK, LOOK_SLOTS, normalizeLook, STARTER_LOOK } from "../../shared/look.ts";
import {
  ARM_STYLES, BEARD_STYLES, BODY_TYPES, CLOTH, FEET_STYLES, FOOTWEAR, GROUND_LIGHT, HAIR, HAIR_STYLES, HAND_STYLES,
  LEG_STYLES, SKIN, SKY_LIGHT, SUN_COLOR, TORSO_STYLES,
} from "../palette.ts";
import { CharacterModel, type CharacterExtras } from "../render/character.ts";
import { holdDrags } from "./press.ts";

const DESIGN_ROWS = [
  { slot: LOOK.hair, names: HAIR_STYLES },
  { slot: LOOK.beard, names: BEARD_STYLES },
  { slot: LOOK.torso, names: TORSO_STYLES },
  { slot: LOOK.arms, names: ARM_STYLES },
  { slot: LOOK.hands, names: HAND_STYLES },
  { slot: LOOK.legs, names: LEG_STYLES },
  { slot: LOOK.feet, names: FEET_STYLES },
];
const COLOUR_ROWS = [
  { slot: LOOK.hairColor, colors: HAIR },
  { slot: LOOK.topColor, colors: CLOTH },
  { slot: LOOK.legsColor, colors: CLOTH },
  { slot: LOOK.feetColor, colors: FOOTWEAR },
  { slot: LOOK.skin, colors: SKIN },
];
const ARROW_PATHS = ["M7 1 L2 5 L7 9 Z", "M3 1 L8 5 L3 9 Z"];

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

/** The character creator: arrows step through styles and colours; the preview turns when dragged. */
export class Designer {
  private readonly root = byId<HTMLElement>("designer");
  private readonly canvas = byId<HTMLCanvasElement>("designer-view");
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(28, 0.75, 0.1, 20);
  private renderer: THREE.WebGLRenderer | null = null;
  private model: CharacterModel | null = null;
  private look: number[] = STARTER_LOOK.slice();
  private yaw = 0.45;
  private dragX: number | null = null;
  private raf = 0;
  private last = 0;
  private resolve: ((look: number[]) => void) | null = null;
  private readonly optionText = new Map<number, HTMLElement>();
  private readonly chips = new Map<number, HTMLElement>();
  private readonly rows = new Map<number, HTMLElement>();
  private readonly bodyButtons: HTMLButtonElement[] = [];
  /** What the preview wears over the look: item ids in VISIBLE_GEAR order, and the village's extras (the NPC maker's). */
  private gear: number[] = [];
  private extras: CharacterExtras = {};
  /** Told the look each time an arrow or a body button changes it. */
  onChange: ((look: number[]) => void) | null = null;

  constructor() {
    const design = byId("designer-design"), colour = byId("designer-colour");
    for (const { slot } of DESIGN_ROWS) design.append(this.row(slot, false));
    for (const { slot } of COLOUR_ROWS) colour.append(this.row(slot, true));
    BODY_TYPES.forEach((name, i) => {
      const button = byId<HTMLButtonElement>(`designer-body-${i}`);
      button.textContent = name;
      button.addEventListener("click", () => this.set(LOOK.body, i));
      this.bodyButtons.push(button);
    });
    byId("designer-confirm").addEventListener("click", () => this.confirm());

    this.camera.position.set(0, 1.0, 4.3);
    this.camera.lookAt(0, 0.82, 0);
    this.scene.add(new THREE.HemisphereLight(SKY_LIGHT, GROUND_LIGHT, 1.9));
    const sun = new THREE.DirectionalLight(SUN_COLOR, 2.3);
    sun.position.set(-0.6, 1, 1.2);
    this.scene.add(sun);

    holdDrags(this.canvas);
    this.canvas.addEventListener("pointerdown", (e) => {
      this.dragX = e.clientX;
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener("pointermove", (e) => {
      if (this.dragX === null) return;
      this.yaw += (e.clientX - this.dragX) * 0.012;
      this.dragX = e.clientX;
    });
    const stop = () => { this.dragX = null; };
    this.canvas.addEventListener("pointerup", stop);
    this.canvas.addEventListener("pointercancel", stop);
  }

  /** Shows the creator starting from `look`; resolves with the confirmed look. */
  open(look: number[]): Promise<number[]> {
    this.look = normalizeLook(look);
    this.root.hidden = false;
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    }
    const r = this.canvas.getBoundingClientRect();
    this.renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
    this.camera.aspect = Math.max(1, r.width) / Math.max(1, r.height);
    this.camera.updateProjectionMatrix();
    this.refresh();
    this.render(0);
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.frame);
    return new Promise((resolve) => { this.resolve = resolve; });
  }

  /** The preview canvas, for the self-test's snapshot. */
  snapshot(): string {
    this.render(0);
    return this.canvas.toDataURL("image/png");
  }

  /** Dresses the preview from now on: worn item ids in VISIBLE_GEAR order, and what only the village's people wear. */
  dress(gear: number[], extras: CharacterExtras = {}): void {
    this.gear = gear;
    this.extras = extras;
    this.refresh();
  }

  /** Replaces the look under the arrows without closing. */
  setLook(look: number[]): void {
    this.look = normalizeLook(look);
    this.refresh();
  }

  /** The look as the arrows have it now. */
  current(): number[] {
    return this.look.slice();
  }

  /**
   * Turns the creator into the front half of the NPC maker: the title says so, and there is no Confirm,
   * because there is no character to confirm. The maker puts its own controls under the columns.
   */
  asMaker(): void {
    this.root.classList.add("maker");
    byId("creator-title").textContent = "NPC Maker";
    byId("designer-confirm").hidden = true;
  }

  private row(slot: number, isColour: boolean): HTMLElement {
    const el = document.createElement("div");
    el.className = "row";
    const label = document.createElement("div");
    label.className = "row-label";
    const name = document.createElement("span");
    name.textContent = LOOK_SLOTS[slot]!.label;
    const detail = document.createElement(isColour ? "i" : "small");
    if (isColour) {
      detail.className = "chip";
      this.chips.set(slot, detail);
    } else {
      this.optionText.set(slot, detail);
    }
    label.append(name, detail);
    const arrow = (dir: number) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "stone arrow";
      b.setAttribute("aria-label", `${dir < 0 ? "Previous" : "Next"} ${LOOK_SLOTS[slot]!.label.toLowerCase()}${isColour ? " colour" : ""}`);
      b.innerHTML = `<svg viewBox="0 0 10 10" aria-hidden="true"><path d="${ARROW_PATHS[dir < 0 ? 0 : 1]}"/></svg>`;
      b.addEventListener("click", () => this.step(slot, dir));
      return b;
    };
    el.append(arrow(-1), label, arrow(1));
    this.rows.set(slot, el);
    return el;
  }

  private step(slot: number, dir: number): void {
    const count = LOOK_SLOTS[slot]!.count;
    this.set(slot, ((this.look[slot] ?? 0) + dir + count) % count);
  }

  private set(slot: number, value: number): void {
    this.look[slot] = value;
    this.look = normalizeLook(this.look);
    this.refresh();
    this.onChange?.(this.look.slice());
  }

  private refresh(): void {
    if (this.model) {
      this.scene.remove(this.model.root);
      this.model.dispose();
    }
    this.model = new CharacterModel(this.look, this.gear, this.extras);
    this.model.root.rotation.y = this.yaw;
    this.scene.add(this.model.root);
    for (const { slot, names } of DESIGN_ROWS) this.optionText.get(slot)!.textContent = names[this.look[slot] ?? 0] ?? "";
    for (const { slot, colors } of COLOUR_ROWS) this.chips.get(slot)!.style.background = hex(colors[this.look[slot] ?? 0]!);
    const typeB = this.look[LOOK.body] === BODY_B;
    this.rows.get(LOOK.beard)!.classList.toggle("disabled", typeB);
    this.bodyButtons.forEach((b, i) => b.setAttribute("aria-pressed", String(this.look[LOOK.body] === i)));
  }

  private render(dt: number): void {
    if (!this.renderer || !this.model) return;
    this.model.root.rotation.y = this.yaw;
    this.model.animate(dt, 0, false, false);
    this.renderer.render(this.scene, this.camera);
  }

  private readonly frame = (now: number) => {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.dragX === null) this.yaw += dt * 0.35;
    this.render(dt);
    this.raf = requestAnimationFrame(this.frame);
  };

  private confirm(): void {
    cancelAnimationFrame(this.raf);
    this.root.hidden = true;
    this.resolve?.(this.look.slice());
    this.resolve = null;
  }
}
