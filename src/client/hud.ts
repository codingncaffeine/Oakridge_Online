import { WALK_CROSS } from "./palette.ts";

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** The 2D layer over the 3D view: hover text, click crosses, player count, run orb, notices. */
export class Hud {
  private readonly hover = byId<HTMLDivElement>("hover");
  private readonly online = byId<HTMLDivElement>("online-count");
  private readonly banner = byId<HTMLDivElement>("banner");
  private readonly runOrb = byId<HTMLButtonElement>("orb-run");
  private readonly runValue = this.runOrb.querySelector(".orb-value") as HTMLElement;
  private hoverHtml = "";
  running = false;
  energy = 100;
  onRunChange: (on: boolean) => void = () => {};

  constructor() {
    this.runOrb.addEventListener("click", () => {
      if (!this.running && this.energy <= 0) return;
      this.setRunning(!this.running, true);
    });
  }

  show(): void {
    document.body.classList.add("playing");
  }

  /** Hover text is built from escaped parts by the menu code, so it is set as markup. */
  setHover(html: string | null): void {
    const h = html ?? "";
    if (h === this.hoverHtml) return;
    this.hoverHtml = h;
    this.hover.innerHTML = h;
  }

  /** The cross that marks a click: yellow for walking, red for an action. */
  cross(clientX: number, clientY: number, color = WALK_CROSS): void {
    const el = document.createElement("div");
    el.className = "cross";
    el.style.left = `${clientX}px`;
    el.style.top = `${clientY}px`;
    el.style.setProperty("--cross", color);
    document.body.append(el);
    el.addEventListener("animationend", () => el.remove());
  }

  setOnline(n: number): void {
    this.online.textContent = `${n} online`;
  }

  setBanner(text: string | null): void {
    this.banner.hidden = !text;
    this.banner.textContent = text ?? "";
  }

  setEnergy(percent: number): void {
    this.energy = percent;
    this.runValue.textContent = String(percent);
  }

  setRunning(on: boolean, notify = false): void {
    this.running = on;
    this.runOrb.setAttribute("aria-pressed", String(on));
    if (notify) this.onRunChange(on);
  }
}
