import * as THREE from "three";
import {
  isEdgeKind, isTree, objectsIn, openable, OVERLAY_NONE, overlayAt, REGION, regionBox, regionId, regionOf, underlayAt,
  type Region, type WorldMap,
} from "../../shared/map.ts";
import type { Tile } from "../../shared/pathfind.ts";
import { OVERLAY_COLORS, UNDERLAY_COLORS } from "../palette.ts";

/** Pixels per tile on the minimap. */
const SCALE = 4;
/** Painted regions further than this many regions from the player are let go. */
const KEEP_REGIONS = 2;

const css = (hex: number) => `#${new THREE.Color(hex).getHexString()}`;

/**
 * The round minimap: the map drawn from above, turned with the camera so "ahead" is up. White dots are
 * other players; the red flag marks where you clicked. Clicking it walks there, and the compass beside
 * it points north and turns the camera north when clicked.
 *
 * It is painted a region at a time (Phase 12): each 64×64 region becomes a picture the first time it
 * comes into the disc, the pictures near the player are kept, and far ones are dropped, so a world of
 * hundreds of regions costs the minimap only the handful in view.
 */
export class Minimap {
  onWalk: (tile: Tile) => void = () => {};
  onNorth: () => void = () => {};
  private readonly canvas = document.getElementById("minimap") as HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private readonly dial = (document.getElementById("compass-dial") as HTMLCanvasElement).getContext("2d")!;
  /** The painted regions, by region id. */
  private readonly pictures = new Map<number, HTMLCanvasElement>();
  private map: WorldMap;
  private flag: Tile | null = null;
  private centre = { x: 0, y: 0 };
  private yaw = 0;

  constructor(map: WorldMap) {
    this.g = this.canvas.getContext("2d")!;
    this.map = map;
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
   * change swaps the pictures rather than building a second minimap over the top of the first.
   */
  setMap(map: WorldMap): void {
    this.map = map;
    this.pictures.clear();
    this.flag = null;
  }

  /** How many regions are painted right now (the self-test reads it). */
  get painted(): number {
    return this.pictures.size;
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
  draw(fx: number, fy: number, yaw: number, others: Array<{ fx: number; fy: number }>): void {
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
    // Every region the turned disc could show: its corner is at most the disc's diagonal away.
    const reach = Math.ceil((half * Math.SQRT2) / SCALE) + 1;
    const rx0 = regionOf(fx - reach), rx1 = regionOf(fx + reach), ry0 = regionOf(fy - reach), ry1 = regionOf(fy + reach);
    for (let ry = ry0; ry <= ry1; ry++) {
      for (let rx = rx0; rx <= rx1; rx++) {
        const region = this.map.regions.get(regionId(rx, ry));
        if (!region?.built) continue;
        // A picture is drawn from its north-west corner: tile (x0, y0 + 64) in world terms.
        g.drawImage(this.picture(region), (region.x0 - fx) * SCALE, -(region.y0 + REGION - fy) * SCALE);
      }
    }
    const at = (x: number, y: number) => [(x - fx) * SCALE, -(y - fy) * SCALE] as const;
    g.fillStyle = "#fff";
    for (const o of others) {
      const [x, y] = at(o.fx, o.fy);
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
    this.forgetFar(regionOf(fx), regionOf(fy));
  }

  /** The picture of a region, painted the first time it is asked for. */
  private picture(region: Region): HTMLCanvasElement {
    const id = regionId(region.rx, region.ry);
    let picture = this.pictures.get(id);
    if (!picture) {
      picture = drawRegion(this.map, region);
      this.pictures.set(id, picture);
    }
    return picture;
  }

  /** Lets go of pictures more than KEEP_REGIONS regions from the player's. */
  private forgetFar(rx: number, ry: number): void {
    for (const id of [...this.pictures.keys()]) {
      const prx = Math.floor(id / 256), pry = id % 256;
      if (Math.max(Math.abs(prx - rx), Math.abs(pry - ry)) > KEEP_REGIONS) this.pictures.delete(id);
    }
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

/** One region at SCALE pixels per tile: ground colours, paths and water, then its objects on top. */
function drawRegion(map: WorldMap, region: Region): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = REGION * SCALE;
  canvas.height = REGION * SCALE;
  const g = canvas.getContext("2d")!;
  const under = UNDERLAY_COLORS.map(css), over = OVERLAY_COLORS.map(css);
  // Canvas y grows downward, tile y northward: tile (x, y) is drawn at row (63 - (y - y0)).
  const px = (x: number) => (x - region.x0) * SCALE, py = (y: number) => (region.y0 + REGION - 1 - y) * SCALE;
  for (let y = region.y0; y < region.y0 + REGION; y++) {
    for (let x = region.x0; x < region.x0 + REGION; x++) {
      const overlay = overlayAt(map, x, y);
      g.fillStyle = overlay !== OVERLAY_NONE ? over[overlay]! : under[underlayAt(map, x, y)]!;
      g.fillRect(px(x), py(y), SCALE, SCALE);
    }
  }
  for (const o of objectsIn(map, regionBox(region))) {
    if (isEdgeKind(o.kind)) {
      g.fillStyle = o.kind === "fence" ? "#8a6a42" : openable(o.kind) ? "#c08a3a" : "#e8e2d0";
      const x = px(o.x), y = py(o.y);
      if (o.side === 0) g.fillRect(x, y, SCALE, 1);
      else if (o.side === 2) g.fillRect(x, y + SCALE - 1, SCALE, 1);
      else if (o.side === 1) g.fillRect(x + SCALE - 1, y, 1, SCALE);
      else g.fillRect(x, y, 1, SCALE);
    } else {
      g.fillStyle = isTree(o.kind) ? (o.kind === "oak" ? "#1e4a14" : "#2f6424") : "#8a857c";
      g.beginPath();
      g.arc(px(o.x) + SCALE / 2, py(o.y) + SCALE / 2, o.kind === "oak" ? 3 : 2.2, 0, Math.PI * 2);
      g.fill();
    }
  }
  return canvas;
}
