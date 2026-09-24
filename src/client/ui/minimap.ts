import { REGION, regionId, regionOf, type WorldMap } from "../../shared/map.ts";
import type { Tile } from "../../shared/pathfind.ts";
import { MapPictures, PICTURE_SCALE } from "./mappictures.ts";

/** Pixels per tile on the minimap. */
const SCALE = 4;

/** Someone else on the map: where they stand, and whether they are a creature rather than a player. */
export interface Other {
  fx: number;
  fy: number;
  npc: boolean;
}

/**
 * The round minimap: the world seen from above, turned with the camera so "ahead" is up. It is drawn
 * from the same pictures as the world map (ui/mappictures.ts), so the two are one map at two zooms and
 * both show the world as it stands. White dots are other players, yellow ones creatures; the red flag
 * marks where you clicked. Clicking it walks there, and the compass beside it points north and turns
 * the camera north when clicked.
 */
export class Minimap {
  onWalk: (tile: Tile) => void = () => {};
  onNorth: () => void = () => {};
  private readonly canvas = document.getElementById("minimap") as HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private readonly dial = (document.getElementById("compass-dial") as HTMLCanvasElement).getContext("2d")!;
  private readonly pictures: MapPictures;
  private map: WorldMap;
  private flag: Tile | null = null;
  private centre = { x: 0, y: 0 };
  private yaw = 0;

  constructor(map: WorldMap, pictures: MapPictures) {
    this.g = this.canvas.getContext("2d")!;
    this.map = map;
    this.pictures = pictures;
    this.canvas.addEventListener("pointerdown", (e) => {
      const r = this.canvas.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * this.canvas.width - this.canvas.width / 2;
      const py = ((e.clientY - r.top) / r.height) * this.canvas.height - this.canvas.height / 2;
      if (Math.hypot(px, py) > this.canvas.width / 2) return;
      // Undo the minimap's turn, then pixels to tiles (canvas y grows south, tile y grows north).
      const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
      const mx = px * c - py * s, my = px * s + py * c;
      const tile = { x: Math.floor(this.centre.x + mx / SCALE), y: Math.floor(this.centre.y - my / SCALE) };
      this.flag = tile;
      this.onWalk(tile);
      e.preventDefault();
    });
    document.getElementById("compass")!.addEventListener("click", () => this.onNorth());
  }

  /**
   * Draws a different plane. The listeners are hung on the canvas once in the constructor, so a plane
   * change swaps the map rather than building a second minimap over the top of the first.
   */
  setMap(map: WorldMap): void {
    this.map = map;
    this.flag = null;
  }

  setFlag(tile: Tile): void {
    this.flag = tile;
  }

  clearFlag(): void {
    this.flag = null;
  }

  /** Called with the player's tile each tick: the flag comes down once they reach it. */
  arrived(x: number, y: number): void {
    if (this.flag && this.flag.x === x && this.flag.y === y) this.flag = null;
  }

  /** Redraws around (fx, fy) in tile coordinates, turned by the camera's yaw. */
  draw(fx: number, fy: number, yaw: number, others: Other[]): void {
    this.centre = { x: fx, y: fy };
    this.yaw = yaw;
    const { g } = this;
    const w = this.canvas.width, half = w / 2;
    g.clearRect(0, 0, w, w);
    g.save();
    g.beginPath();
    g.arc(half, half, half, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = "#000";
    g.fillRect(0, 0, w, w);
    g.translate(half, half);
    g.rotate(-yaw);
    // Every region the turned disc could show: its corner is at most the disc's diagonal away. A
    // region without a picture yet gets one, but only one a frame, so a crossing costs no frame much.
    const reach = Math.ceil((half * Math.SQRT2) / SCALE) + 1;
    const rx0 = regionOf(fx - reach), rx1 = regionOf(fx + reach), ry0 = regionOf(fy - reach), ry1 = regionOf(fy + reach);
    let rendered = false;
    for (let ry = ry0; ry <= ry1; ry++) {
      for (let rx = rx0; rx <= rx1; rx++) {
        const region = this.map.regions.get(regionId(rx, ry));
        if (!region?.built) continue;
        if (!this.pictures.has(region)) {
          if (rendered) continue;
          rendered = true;
        }
        const picture = this.pictures.at(region);
        // A picture is drawn from its north-west corner: tile (x0, y0 + 64) in world terms.
        const size = REGION * SCALE;
        g.drawImage(picture, 0, 0, REGION * PICTURE_SCALE, REGION * PICTURE_SCALE, (region.x0 - fx) * SCALE, -(region.y0 + REGION - fy) * SCALE, size, size);
      }
    }
    const at = (x: number, y: number) => [(x - fx) * SCALE, -(y - fy) * SCALE] as const;
    for (const o of others) {
      const [x, y] = at(o.fx, o.fy);
      g.fillStyle = o.npc ? "#f4d03f" : "#fff";
      g.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    if (this.flag) {
      const [x, y] = at(this.flag.x + 0.5, this.flag.y + 0.5);
      g.fillStyle = "#e02020";
      g.fillRect(x - 0.5, y - 9, 1.5, 9);
      g.beginPath();
      g.moveTo(x + 1, y - 9);
      g.lineTo(x + 7, y - 6.5);
      g.lineTo(x + 1, y - 4);
      g.fill();
    }
    g.restore();
    g.fillStyle = "#fff";
    g.fillRect(half - 2, half - 2, 4, 4);
    this.drawCompass(yaw);
  }

  private drawCompass(yaw: number): void {
    const g = this.dial, s = 34, c = s / 2;
    g.clearRect(0, 0, s, s);
    g.save();
    g.translate(c, c);
    g.rotate(-yaw);
    g.fillStyle = "#c81e1e";
    g.beginPath();
    g.moveTo(0, -13);
    g.lineTo(4, 0);
    g.lineTo(-4, 0);
    g.fill();
    g.fillStyle = "#e8e2d0";
    g.beginPath();
    g.moveTo(0, 13);
    g.lineTo(4, 0);
    g.lineTo(-4, 0);
    g.fill();
    g.fillStyle = "#fff";
    g.font = "bold 9px sans-serif";
    g.textAlign = "center";
    g.fillText("N", 0, -14 + 9);
    g.restore();
  }
}
