import { WALK_CROSS } from "./palette.ts";

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** The 2D layer over the 3D view: hover text, click crosses, player count, run toggle, notices. */
export class Hud {
  private readonly hover = byId<HTMLDivElement>("hover");
  private readonly online = byId<HTMLDivElement>("online-count");
  private readonly banner = byId<HTMLDivElement>("banner");
  private readonly runButton = byId<HTMLButtonElement>("run");
  private hoverText = "";
  running = false;
  onRunChange: (on: boolean) => void = () => {};

  constructor() {
    this.runButton.addEventListener("click", () => this.setRunning(!this.running, true));
  }

  show(): void {
    document.body.classList.add("playing");
  }

  setHover(text: string | null): void {
    const t = text ?? "";
    if (t === this.hoverText) return;
    this.hoverText = t;
    this.hover.textContent = t;
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

  setRunning(on: boolean, notify = false): void {
    this.running = on;
    this.runButton.classList.toggle("on", on);
    this.runButton.setAttribute("aria-pressed", String(on));
    if (notify) this.onRunChange(on);
  }
}
