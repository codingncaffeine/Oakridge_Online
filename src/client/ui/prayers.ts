import { PRAYERS } from "../../shared/prayers.ts";

/**
 * The prayer tab (PLAN Phase 11): a page of toggles, one a prayer, each with its level and what it
 * lends; the points at the top. A press flips the toggle at once and asks the server, which answers
 * with the whole set — so one refused for want of the level or of points snaps straight back.
 */
export class PrayerPanel {
  onToggle: (key: string, on: boolean) => void = () => {};
  private on = new Set<string>();
  private level = 1;
  private readonly grid = document.getElementById("prayer-grid") as HTMLElement;
  private readonly points = document.getElementById("prayer-points") as HTMLElement;
  private readonly buttons = new Map<string, HTMLButtonElement>();

  constructor() {
    for (const p of PRAYERS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "prayer-toggle";
      button.dataset.prayer = p.key;
      button.title = p.examine;
      button.append(
        Object.assign(document.createElement("b"), { textContent: p.name }),
        Object.assign(document.createElement("small"), { textContent: `Level ${p.level}` }),
      );
      button.addEventListener("click", () => {
        const now = !this.on.has(p.key);
        if (now) this.on.add(p.key);
        else this.on.delete(p.key);
        this.render();
        this.onToggle(p.key, now);
      });
      this.grid.append(button);
      this.buttons.set(p.key, button);
    }
    this.setPoints(0, 0);
    this.render();
  }

  /** The prayers that are on, as the server holds them. */
  set(on: string[]): void {
    this.on = new Set(on);
    this.render();
  }

  /** The Prayer level, which decides what can be switched on. */
  setLevel(level: number): void {
    this.level = level;
    this.render();
  }

  setPoints(points: number, max: number): void {
    this.points.textContent = `Prayer points: ${points} of ${max}`;
  }

  private render(): void {
    for (const p of PRAYERS) {
      const button = this.buttons.get(p.key)!;
      button.setAttribute("aria-pressed", String(this.on.has(p.key)));
      button.classList.toggle("locked", this.level < p.level);
    }
  }
}
