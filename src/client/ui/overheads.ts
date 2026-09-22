import * as THREE from "three";

/** How long overhead chat stays up (150 cycles of 20 ms, as in the classic client). */
const SHOW_MS = 3000;
/** How long a health bar stays up after the last blow, and how long a hitsplat shows. */
const BAR_MS = 5000;
const SPLAT_MS = 1000;
/** Height above a character's feet where the text sits, in tiles, when nothing better is known. */
const HEAD = 1.95;

/** Where an entity is and how tall it stands. */
export interface Anchor {
  feet: THREE.Vector3;
  height: number;
}

/**
 * The layer over everyone's heads: what they said, how much health they have left, and the damage of
 * each blow floating up off them. All of it is positioned from the 3D scene every frame.
 */
export class Overheads {
  private readonly layer = document.getElementById("overheads") as HTMLDivElement;
  private readonly said = new Map<number, { el: HTMLDivElement; until: number }>();
  private readonly bars = new Map<number, { el: HTMLDivElement; fill: HTMLElement; until: number }>();
  private readonly splats: Array<{ el: HTMLDivElement; id: number; until: number; from: number }> = [];
  private readonly v = new THREE.Vector3();

  say(id: number, text: string): void {
    let item = this.said.get(id);
    if (!item) {
      item = { el: Object.assign(document.createElement("div"), { className: "overhead" }), until: 0 };
      this.layer.append(item.el);
      this.said.set(id, item);
    }
    item.el.textContent = text;
    item.until = performance.now() + SHOW_MS;
  }

  /** Shows (or refreshes) an entity's health bar. It fades away again once nothing has hit it for a while. */
  setHealth(id: number, hp: number, max: number): void {
    let bar = this.bars.get(id);
    if (!bar) {
      const el = document.createElement("div");
      el.className = "healthbar";
      const fill = document.createElement("i");
      fill.className = "healthbar-fill";
      el.append(fill);
      this.layer.append(el);
      bar = { el, fill, until: 0 };
      this.bars.set(id, bar);
    }
    bar.fill.style.width = `${Math.max(0, Math.min(1, max > 0 ? hp / max : 0)) * 100}%`;
    bar.until = performance.now() + BAR_MS;
  }

  /** One blow landing on an entity: red with the damage, or blue and empty for a blow turned aside. */
  hit(id: number, damage: number): void {
    const el = document.createElement("div");
    el.className = damage > 0 ? "hitsplat" : "hitsplat miss";
    el.textContent = String(damage);
    this.layer.append(el);
    const now = performance.now();
    // Blows landing together stack up the side of the entity rather than on top of each other.
    const standing = this.splats.filter((s) => s.id === id && s.until > now).length;
    el.style.setProperty("--lane", String(standing % 3));
    this.splats.push({ el, id, until: now + SPLAT_MS, from: now });
  }

  /** Everything an entity has over its head goes away with it. */
  forget(id: number): void {
    for (const map of [this.said, this.bars]) {
      map.get(id)?.el.remove();
      map.delete(id);
    }
    for (let i = this.splats.length - 1; i >= 0; i--) {
      if (this.splats[i]!.id === id) {
        this.splats[i]!.el.remove();
        this.splats.splice(i, 1);
      }
    }
  }

  /** Positions everything over its entity; `anchors` gives each one's feet and height. */
  update(camera: THREE.Camera, width: number, height: number, anchors: (id: number) => Anchor | undefined): void {
    const now = performance.now();
    /** Screen position `lift` tiles above an entity's feet, or null when it is off screen or gone. */
    const place = (id: number, lift: (a: Anchor) => number): { x: number; y: number } | null => {
      const a = anchors(id);
      if (!a) return null;
      this.v.copy(a.feet).setY(a.feet.y + lift(a)).project(camera);
      if (!(this.v.z < 1 && Math.abs(this.v.x) < 1.2 && Math.abs(this.v.y) < 1.2)) return null;
      return { x: ((this.v.x + 1) / 2) * width, y: ((1 - this.v.y) / 2) * height };
    };

    for (const [id, item] of this.said) {
      const spot = now > item.until ? null : place(id, (a) => a.height || HEAD);
      if (now > item.until || !anchors(id)) {
        item.el.remove();
        this.said.delete(id);
        continue;
      }
      item.el.hidden = !spot;
      if (spot) {
        item.el.style.left = `${spot.x}px`;
        item.el.style.top = `${spot.y}px`;
      }
    }

    for (const [id, bar] of this.bars) {
      const gone = now > bar.until || !anchors(id);
      if (gone) {
        bar.el.remove();
        this.bars.delete(id);
        continue;
      }
      // The bar sits a little under the chat line, so the two never cover each other.
      const spot = place(id, (a) => (a.height || HEAD) - 0.22);
      bar.el.hidden = !spot;
      if (spot) {
        bar.el.style.left = `${spot.x}px`;
        bar.el.style.top = `${spot.y}px`;
      }
    }

    for (let i = this.splats.length - 1; i >= 0; i--) {
      const splat = this.splats[i]!;
      if (now > splat.until || !anchors(splat.id)) {
        splat.el.remove();
        this.splats.splice(i, 1);
        continue;
      }
      // It rises over the middle of the entity as it fades.
      const t = (now - splat.from) / SPLAT_MS;
      const spot = place(splat.id, (a) => (a.height || HEAD) * 0.6 + t * 0.5);
      splat.el.hidden = !spot;
      if (spot) {
        splat.el.style.left = `${spot.x}px`;
        splat.el.style.top = `${spot.y}px`;
        splat.el.style.opacity = String(Math.max(0, 1 - t ** 3));
      }
    }
  }
}
