import {
  builtBounds, indoorsAt, isEdgeKind, isTree, openable, OVERLAY_PATH, OVERLAY_WATER, overlayAt, underlayAt, type Box, type WorldMap,
} from "../../shared/map.ts";
import { MAP_EXITS, MAP_LABELS, MAP_MARKS, type MapIcon } from "../../shared/oakridge.ts";
import { SHOPS } from "../../shared/shops.ts";
import { STATION_OF } from "../../shared/stations.ts";
import type { Tile } from "../../shared/pathfind.ts";

/**
 * The world map: the whole district drawn from above, the way every game of this kind draws one. It is
 * a picture of the map data itself rather than an authored image, so it can never drift from the world
 * — a tree felled into the map is a tree on the map.
 *
 * Land is painted from the tiles, buildings are filled and outlined so a village reads as a village at
 * a glance, roads are drawn over the top, and then the names and the icons go on. Drag to move, the
 * wheel or the buttons to zoom, and the arrow shows where you are standing.
 */

/** Pixels per tile at each zoom step, and which one a freshly opened map starts at. */
const ZOOMS = [1.5, 3, 5, 8];
const START_ZOOM = 2;

/** The map's own colours: flatter and lighter than the world's, the way a drawn map is. */
const INK = "#2b2118";
const PARCHMENT = "#cbbb92";
const LAND = ["#8fa65a", "#6f8a46", "#a8916a", "#d6c391"];
const WATER = "#5f7fa5";
const DEEP = "#4a6788";
const ROAD = "#b8a274";
const BUILDING = "#6b6155";
const BUILDING_EDGE = "#3a332a";

/** What each icon is drawn as: a letter in a coloured disc, which reads at any zoom. */
const ICONS: Record<MapIcon, { mark: string; fill: string }> = {
  bank: { mark: "B", fill: "#d8b23a" },
  shop: { mark: "S", fill: "#3a8ad8" },
  tools: { mark: "T", fill: "#3a8ad8" },
  furnace: { mark: "F", fill: "#d8542a" },
  anvil: { mark: "A", fill: "#8a8f96" },
  range: { mark: "C", fill: "#d8542a" },
  mill: { mark: "M", fill: "#a88a5a" },
  inn: { mark: "I", fill: "#a8563a" },
  church: { mark: "+", fill: "#d8d0b8" },
  gate: { mark: "G", fill: "#8a5a2a" },
  stair: { mark: "↑", fill: "#6a5a8a" },
  fish: { mark: "≈", fill: "#3aa8c8" },
  mine: { mark: "◆", fill: "#8a7a6a" },
  tree: { mark: "♣", fill: "#2f6424" },
  quest: { mark: "!", fill: "#c8402a" },
};

/** One thing marked on the map, once the map data and the written-down marks are put together. */
interface Mark {
  icon: MapIcon;
  x: number;
  y: number;
  name: string;
}

export class WorldMapScreen {
  private readonly root = document.getElementById("worldmap") as HTMLDivElement;
  private readonly canvas = document.getElementById("worldmap-canvas") as HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private readonly hint = document.getElementById("worldmap-hint") as HTMLElement;
  private map: WorldMap | null = null;
  /** The tiles somebody has built: what the map shows, and where its dashed edge runs. */
  private bounds: Box | null = null;
  private marks: Mark[] = [];
  /** The tile at the middle of the view, and how many pixels a tile takes. */
  private centre: Tile = { x: 0, y: 0 };
  private zoom = START_ZOOM;
  private me: Tile | null = null;
  private drag: { x: number; y: number; cx: number; cy: number } | null = null;

  constructor() {
    this.g = this.canvas.getContext("2d")!;
    const close = () => this.close();
    document.getElementById("worldmap-close")!.addEventListener("click", close);
    document.getElementById("worldmap-in")!.addEventListener("click", () => this.setZoom(this.zoom + 1));
    document.getElementById("worldmap-out")!.addEventListener("click", () => this.setZoom(this.zoom - 1));
    document.getElementById("worldmap-here")!.addEventListener("click", () => {
      if (this.me) this.centre = { ...this.me };
      this.draw();
    });
    window.addEventListener("keydown", (e) => {
      if (this.root.hidden) return;
      if (e.key === "Escape") close();
    });

    // Dragging moves the map under the cursor, which is how every map of this kind is read.
    this.canvas.addEventListener("pointerdown", (e) => {
      this.drag = { x: e.clientX, y: e.clientY, cx: this.centre.x, cy: this.centre.y };
      this.canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    this.canvas.addEventListener("pointermove", (e) => {
      if (!this.drag) return;
      const px = ZOOMS[this.zoom]!;
      this.centre = {
        x: Math.round(this.drag.cx - (e.clientX - this.drag.x) / px),
        y: Math.round(this.drag.cy + (e.clientY - this.drag.y) / px),
      };
      this.draw();
    });
    const stop = () => { this.drag = null; };
    this.canvas.addEventListener("pointerup", stop);
    this.canvas.addEventListener("pointercancel", stop);
    this.canvas.addEventListener("wheel", (e) => {
      this.setZoom(this.zoom + (e.deltaY < 0 ? 1 : -1));
      e.preventDefault();
    }, { passive: false });

    new ResizeObserver(() => this.resize()).observe(this.canvas.parentElement!);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  /** The map this screen draws, and where the marks on it are. Set whenever the plane changes. */
  setMap(map: WorldMap): void {
    this.map = map;
    this.bounds = builtBounds(map);
    this.marks = marksOf(map);
    if (this.isOpen) this.draw();
  }

  /** Where the player is standing, so the arrow and the "where am I" button know. */
  setViewer(at: Tile): void {
    this.me = { ...at };
    if (this.isOpen) this.draw();
  }

  open(): void {
    if (!this.map) return;
    this.root.hidden = false;
    const built = this.bounds ?? { x0: this.map.originX, y0: this.map.originY, x1: this.map.originX, y1: this.map.originY };
    this.centre = { x: (built.x0 + built.x1 + 1) / 2, y: (built.y0 + built.y1 + 1) / 2 };
    // Opened, it shows the whole of what has been mapped — which is the question a map is opened to
    // answer. Zooming in is one click, and "Where am I" puts the player back in the middle of it.
    const box = this.canvas.parentElement!.getBoundingClientRect();
    const fits = Math.min(box.width, box.height) / (Math.max(built.x1 - built.x0, built.y1 - built.y0) + 1 + 12);
    const step = ZOOMS.map((px, i) => (px <= fits ? i : -1)).filter((i) => i >= 0).pop();
    this.zoom = step ?? 0;
    this.resize();
  }

  close(): void {
    this.root.hidden = true;
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  private setZoom(step: number): void {
    const next = Math.max(0, Math.min(ZOOMS.length - 1, step));
    if (next === this.zoom) return;
    this.zoom = next;
    this.draw();
  }

  private resize(): void {
    const box = this.canvas.parentElement!.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.canvas.width = Math.max(1, Math.round(box.width * dpr));
    this.canvas.height = Math.max(1, Math.round(box.height * dpr));
    this.canvas.style.width = `${box.width}px`;
    this.canvas.style.height = `${box.height}px`;
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  // --- Drawing -----------------------------------------------------------------------------------

  private draw(): void {
    const map = this.map, built = this.bounds;
    if (!map || !built || this.root.hidden) return;
    const g = this.g;
    const w = this.canvas.width / Math.min(window.devicePixelRatio, 2);
    const h = this.canvas.height / Math.min(window.devicePixelRatio, 2);
    const px = ZOOMS[this.zoom]!;

    // Nothing has been mapped outside the district, so the paper shows through around it.
    g.fillStyle = PARCHMENT;
    g.fillRect(0, 0, w, h);

    // Tile (x, y) draws at this screen point. y grows north, the canvas grows down.
    const sx = (x: number) => w / 2 + (x - this.centre.x) * px;
    const sy = (y: number) => h / 2 - (y - this.centre.y) * px;

    const x0 = Math.max(built.x0, Math.floor(this.centre.x - w / 2 / px) - 1);
    const x1 = Math.min(built.x1, Math.ceil(this.centre.x + w / 2 / px) + 1);
    const y0 = Math.max(built.y0, Math.floor(this.centre.y - h / 2 / px) - 1);
    const y1 = Math.min(built.y1, Math.ceil(this.centre.y + h / 2 / px) + 1);

    // The ground, a tile at a time. Water first as one flat colour so a river reads as a river.
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const over = overlayAt(map, x, y);
        g.fillStyle = over === OVERLAY_WATER ? WATER : over === OVERLAY_PATH ? ROAD : LAND[underlayAt(map, x, y)]!;
        g.fillRect(sx(x), sy(y) - px, px + 0.6, px + 0.6);
      }
    }
    // The deep water past the shelf, so the sea is not one flat sheet.
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (overlayAt(map, x, y) !== OVERLAY_WATER || !this.isDeep(map, built, x, y)) continue;
        g.fillStyle = DEEP;
        g.fillRect(sx(x), sy(y) - px, px + 0.6, px + 0.6);
      }
    }
    // Indoor floors: the footprint of every building, filled and then outlined by its walls.
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (indoorsAt(map, x, y) === 0) continue;
        g.fillStyle = BUILDING;
        g.fillRect(sx(x), sy(y) - px, px + 0.6, px + 0.6);
      }
    }

    this.drawObjects(g, map, px, sx, sy, x0, x1, y0, y1);
    this.drawEdges(g, built, px, sx, sy, w, h);
    if (px >= 3) this.drawMarks(g, px, sx, sy, w, h);
    this.drawLabels(g, px, sx, sy, w, h);
    this.drawMe(g, px, sx, sy);
  }

  /** Whether a water tile is away from every shore, which is what makes it read as deep. */
  private isDeep(map: WorldMap, built: Box, x: number, y: number): boolean {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < built.x0 || ny < built.y0 || nx > built.x1 || ny > built.y1) continue;
        if (overlayAt(map, nx, ny) !== OVERLAY_WATER) return false;
      }
    }
    return true;
  }

  /** Walls, fences and doors as lines on the tile edges; trees and rocks as dots. */
  private drawObjects(
    g: CanvasRenderingContext2D, map: WorldMap, px: number,
    sx: (x: number) => number, sy: (y: number) => number,
    x0: number, x1: number, y0: number, y1: number,
  ): void {
    const thick = Math.max(1, px * 0.22);
    for (const o of map.objects) {
      if (o.x < x0 - 1 || o.x > x1 + 1 || o.y < y0 - 1 || o.y > y1 + 1) continue;
      if (isEdgeKind(o.kind)) {
        g.fillStyle = o.kind === "fence" ? "#8a6a42" : openable(o.kind) ? "#c8a03a" : BUILDING_EDGE;
        const left = sx(o.x), top = sy(o.y) - px;
        if (o.side === 0) g.fillRect(left, top - thick / 2, px, thick);
        else if (o.side === 2) g.fillRect(left, top + px - thick / 2, px, thick);
        else if (o.side === 1) g.fillRect(left + px - thick / 2, top, thick, px);
        else g.fillRect(left - thick / 2, top, thick, px);
        continue;
      }
      // Trees and rocks only show once the map is zoomed enough for a dot to mean anything.
      if (px < 3) continue;
      const r = px * (isTree(o.kind) ? 0.34 : 0.26);
      if (isTree(o.kind)) g.fillStyle = o.kind === "tree" ? "#3d7a2c" : "#245018";
      else if (o.kind === "rock") g.fillStyle = "#8a857c";
      else continue;
      g.beginPath();
      g.arc(sx(o.x) + px / 2, sy(o.y) - px / 2, r, 0, Math.PI * 2);
      g.fill();
    }
  }

  /**
   * The edge of what has been mapped, and the roads that run off it. Four roads leave the district
   * (PLAN §7.4) and the places they lead to are Phase 12's to build — so the map says so, rather than
   * letting the end of the drawn ground read as the end of the world.
   */
  private drawEdges(
    g: CanvasRenderingContext2D, built: Box, px: number,
    sx: (x: number) => number, sy: (y: number) => number, width: number, height: number,
  ): void {
    const left = sx(built.x0), right = sx(built.x1 + 1);
    const top = sy(built.y1 + 1), bottom = sy(built.y0);
    g.save();
    g.strokeStyle = INK;
    g.globalAlpha = 0.5;
    g.setLineDash([6, 5]);
    g.lineWidth = 2;
    g.strokeRect(left, top, right - left, bottom - top);
    g.restore();

    g.save();
    g.font = `italic ${Math.max(11, Math.min(15, px * 2.2))}px "Palatino Linotype", Georgia, serif`;
    for (const exit of MAP_EXITS) {
      // The label belongs on the edge its road crosses, so it is only drawn when that edge is in view:
      // otherwise it slides into the middle of the map and reads as a place that is there.
      const across = exit.side === "w" || exit.side === "e";
      const edge = exit.side === "w" ? left : exit.side === "e" ? right : exit.side === "n" ? top : bottom;
      if (across ? edge < -40 || edge > width + 40 : edge < -30 || edge > height + 30) continue;
      const ex = across ? edge : sx(exit.x), ey = across ? sy(exit.y) : edge;
      g.textAlign = exit.side === "w" ? "left" : exit.side === "e" ? "right" : "center";
      g.textBaseline = exit.side === "s" ? "top" : exit.side === "n" ? "bottom" : "middle";
      const dx = exit.side === "w" ? 9 : exit.side === "e" ? -9 : 0;
      const dy = exit.side === "s" ? 9 : exit.side === "n" ? -9 : 0;
      const away = exit.away > 0 ? `  → ${exit.away} tiles` : "";
      const text = `${exit.name}${away}`;
      // The same pale halo the place names wear, so a road label stays readable over grass or sand.
      g.lineWidth = 3;
      g.strokeStyle = "rgba(233, 224, 198, 0.9)";
      g.strokeText(text, ex + dx, ey + dy);
      g.fillStyle = INK;
      g.fillText(text, ex + dx, ey + dy);
    }
    g.restore();
  }

  /** The icons: a letter in a disc, with its name beside it once the map is zoomed right in. */
  private drawMarks(
    g: CanvasRenderingContext2D, px: number,
    sx: (x: number) => number, sy: (y: number) => number, w: number, h: number,
  ): void {
    const r = Math.max(6, Math.min(11, px * 1.6));
    for (const mark of this.marks) {
      const x = sx(mark.x) + px / 2, y = sy(mark.y) - px / 2;
      if (x < -20 || y < -20 || x > w + 20 || y > h + 20) continue;
      const icon = ICONS[mark.icon];
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fillStyle = icon.fill;
      g.fill();
      g.lineWidth = 1.5;
      g.strokeStyle = INK;
      g.stroke();
      g.fillStyle = INK;
      g.font = `bold ${Math.round(r * 1.25)}px "Trebuchet MS", sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(icon.mark, x, y + 0.5);
    }
  }

  /** Place names, in the map's own serif. The small ones only appear once there is room for them. */
  private drawLabels(
    g: CanvasRenderingContext2D, px: number,
    sx: (x: number) => number, sy: (y: number) => number, w: number, h: number,
  ): void {
    g.save();
    g.textAlign = "center";
    g.textBaseline = "middle";
    for (const label of MAP_LABELS) {
      if (label.small && px < 5) continue;
      const x = sx(label.x) + px / 2, y = sy(label.y) - px / 2;
      if (x < -60 || y < -20 || x > w + 60 || y > h + 20) continue;
      const size = label.small ? Math.max(10, Math.min(13, px * 1.7)) : Math.max(12, Math.min(19, px * 2.6));
      g.font = `${label.small ? "italic " : ""}${size}px "Palatino Linotype", "Book Antiqua", Georgia, serif`;
      // Written twice: a pale halo under the ink, so a name stays readable over grass or over water.
      g.lineWidth = 3;
      g.strokeStyle = "rgba(233, 224, 198, 0.85)";
      g.strokeText(label.name, x, y);
      g.fillStyle = INK;
      g.fillText(label.name, x, y);
    }
    g.restore();
  }

  /** Where the player is standing: a white arrow with a dark rim, the brightest thing on the map. */
  private drawMe(
    g: CanvasRenderingContext2D, px: number,
    sx: (x: number) => number, sy: (y: number) => number,
  ): void {
    if (!this.me) return;
    const x = sx(this.me.x) + px / 2, y = sy(this.me.y) - px / 2;
    g.save();
    g.translate(x, y);
    g.beginPath();
    g.moveTo(0, -9);
    g.lineTo(6, 7);
    g.lineTo(0, 3.5);
    g.lineTo(-6, 7);
    g.closePath();
    g.fillStyle = "#ffffff";
    g.strokeStyle = INK;
    g.lineWidth = 1.6;
    g.fill();
    g.stroke();
    g.restore();
    this.hint.textContent = `You are at ${this.me.x}, ${this.me.y}`;
  }
}

/**
 * Everything worth an icon on a map, worked out from the map itself: a bank booth is a bank, a counter
 * is whichever shop it sells for, a furnace is a furnace. Only what no object can say for itself — an
 * inn, a church, a wood — is written down by hand in `MAP_MARKS`.
 */
function marksOf(map: WorldMap): Mark[] {
  const marks: Mark[] = [];
  const seen = new Set<string>();
  const once = (icon: MapIcon, x: number, y: number, name: string) => {
    // One icon per kind per building: a row of five bank booths is one bank.
    const key = `${icon}:${Math.round(x / 8)}:${Math.round(y / 8)}`;
    if (seen.has(key)) return;
    seen.add(key);
    marks.push({ icon, x, y, name });
  };
  for (const o of map.objects) {
    const station = STATION_OF[o.kind];
    if (station === "bank") once("bank", o.x, o.y, "Bank");
    else if (station === "shop") {
      const shop = o.tag ? SHOPS[o.tag] : undefined;
      once(o.tag === "oakridge_tools" ? "tools" : "shop", o.x, o.y, shop?.name ?? "Shop");
    } else if (station === "furnace") once("furnace", o.x, o.y, "Furnace");
    else if (station === "anvil") once("anvil", o.x, o.y, "Anvil");
    else if (station === "range") once("range", o.x, o.y, "Range");
    else if (station === "mill") once("mill", o.x, o.y, "Mill");
    else if (o.kind === "stairs" || o.kind === "ladder") once("stair", o.x, o.y, "Stairs");
  }
  for (const m of MAP_MARKS) once(m.icon, m.x, m.y, m.name);
  return marks;
}
