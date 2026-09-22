import * as THREE from "three";

/** How long overhead chat stays up (150 cycles of 20 ms, as in the classic client). */
const SHOW_MS = 3000;
/** Height above a character's feet where the text sits, in tiles. */
const HEAD = 1.95;

/** Yellow chat text floating over whoever said it. */
export class Overheads {
  private readonly layer = document.getElementById("overheads") as HTMLDivElement;
  private readonly items = new Map<number, { el: HTMLDivElement; until: number }>();
  private readonly v = new THREE.Vector3();

  say(id: number, text: string): void {
    let item = this.items.get(id);
    if (!item) {
      item = { el: Object.assign(document.createElement("div"), { className: "overhead" }), until: 0 };
      this.layer.append(item.el);
      this.items.set(id, item);
    }
    item.el.textContent = text;
    item.until = performance.now() + SHOW_MS;
  }

  /** Positions each text over its speaker; `positions` gives each speaker's feet. */
  update(camera: THREE.Camera, width: number, height: number, positions: (id: number) => THREE.Vector3 | undefined): void {
    const now = performance.now();
    for (const [id, item] of this.items) {
      const feet = positions(id);
      if (now > item.until || !feet) {
        item.el.remove();
        this.items.delete(id);
        continue;
      }
      this.v.copy(feet).setY(feet.y + HEAD).project(camera);
      const visible = this.v.z < 1 && Math.abs(this.v.x) < 1.2 && Math.abs(this.v.y) < 1.2;
      item.el.hidden = !visible;
      if (visible) {
        item.el.style.left = `${((this.v.x + 1) / 2) * width}px`;
        item.el.style.top = `${((1 - this.v.y) / 2) * height}px`;
      }
    }
  }
}
