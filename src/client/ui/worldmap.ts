import { builtBounds, builtRegions, climbable, REGION, regionId, regionsIn, type Box, type WorldMap } from "../../shared/map.ts";
import { MAP_EXITS, MAP_LABELS, MAP_MARKS, type MapIcon } from "../../shared/oakridge.ts";
import { SHOPS } from "../../shared/shops.ts";
import { STATION_OF } from "../../shared/stations.ts";
import type { Tile } from "../../shared/pathfind.ts";
import { SCALES, type MapPictures, type Scale } from "./mappictures.ts";
import type { Other } from "./minimap.ts";

/**
 * The world map: the world seen from above, the way every game of this kind shows one. It is drawn from
 * the same pictures as the radar (ui/mappictures.ts) — the world itself rendered straight down, a
 * region at a time, and rendered again whenever something in it changes — so the map is the game:
 * a tree felled in the world is a stump on the map, a door swung open is open on it, and the people
 * and creatures in view stand on it as dots. The names, the icons and the roads that run off the edge
 * go on over the picture. Drag to move, the wheel or the buttons to zoom, and the arrow is you.
 */

/**
 * Pixels per tile at each zoom step — each a scale the pictures are kept at, so a region is one blit
 * of a picture already its size — and which one a freshly opened map starts at.
 */
const ZOOMS: Scale[] = [1, 2, 4, 8];
const START_ZOOM = 2;

/** The map's own ink and paper: what shows beyond the edge of the built world, and what the writing is in. */
const INK = "#2b2118";
const PARCHMENT = "#cbbb92";

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
  ferry: { mark: "⚓", fill: "#4a6a8a" },
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
  private pictures: MapPictures | null = null;
  /** The tiles somebody has built: what the map shows, and where its dashed edge runs. */
  private bounds: Box | null = null;
  private marks: Mark[] = [];
  /** The tile at the middle of the view, and how many pixels a tile takes. */
  private centre: Tile = { x: 0, y: 0 };
  private zoom = START_ZOOM;
  private me: Tile | null = null;
  private others: Other[] = [];
  private drag: { x: number; y: number; cx: number; cy: number } | null = null;
  /** Whether a draw is booked for the next frame. */
  private scheduled = false;
  /** Draws so far, how long the last one took, how many regions it showed and how many it could not yet: the checks read them. */
  draws = 0;
  lastDrawMs = 0;
  regionsShown = 0;
  pending = 0;

  constructor() {
    this.g = this.canvas.getContext("2d")!;
    const close = () => this.close();
    document.getElementById("worldmap-close")!.addEventListener("click", close);
    document.getElementById("worldmap-in")!.addEventListener("click", () => this.setZoom(this.zoom + 1));
    document.getElementById("worldmap-out")!.addEventListener("click", () => this.setZoom(this.zoom - 1));
    document.getElementById("worldmap-here")!.addEventListener("click", () => {
      if (this.me) this.centre = { ...this.me };
      this.redraw();
    });
    window.addEventListener("keydown", (e) => {
      if (this.root.hidden) return;
      if (e.key === "Escape") close();
    });

    // Dragging moves the map under the cursor, which is how every map of this kind is read.
    this.canvas.addEventListener("pointerdown", (e) => {
      this.drag = { x: e.clientX, y: e.clientY, cx: this.centre.x, cy: this.centre.y };
      // A pointer the page made up (the self-test's drag) is not one the canvas can capture.
      try { this.canvas.setPointerCapture(e.pointerId); } catch { /* the drag still follows the moves */ }
    });
    this.canvas.addEventListener("pointermove", (e) => {
      if (!this.drag) return;
      const px = ZOOMS[this.zoom]!;
      this.centre = { x: this.drag.cx - (e.clientX - this.drag.x) / px, y: this.drag.cy + (e.clientY - this.drag.y) / px };
      this.redraw();
    });
    const stop = () => { this.drag = null; };
    this.canvas.addEventListener("pointerup", stop);
    this.canvas.addEventListener("pointercancel", stop);
    this.canvas.addEventListener("wheel", (e) => {
      this.setZoom(this.zoom + (e.deltaY < 0 ? 1 : -1));
      e.preventDefault();
    }, { passive: false });

    new ResizeObserver(() => {
      this.resizes++;
      this.resize();
    }).observe(this.canvas.parentElement!);
  }

  /**
   * How often the paper has changed size: the checks read it. ⛔ The canvas is sized from the paper
   * and must never size the paper back: it once took the paper's border box as its own height, two
   * pixels more than the paper's inside, and the paper grew two pixels a frame to hold it, for ever.
   */
  resizes = 0;

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  /** Whether the map on screen is complete: drawn, with every region in view pictured, and nothing booked to draw. */
  get settled(): boolean {
    return this.draws > 0 && this.pending === 0 && !this.scheduled;
  }

  /** The map this screen draws, the pictures it is drawn from, and where the marks on it are. Set whenever the plane changes. */
  setMap(map: WorldMap, pictures: MapPictures): void {
    this.map = map;
    this.pictures = pictures;
    this.bounds = builtBounds(map);
    this.marks = marksOf(map);
    if (this.isOpen) this.redraw();
  }

  /** Where the player is standing and who else is in view, so the arrow, the dots and the "where am I" button know. */
  setViewer(at: Tile, others: Other[] = []): void {
    this.me = { ...at };
    this.others = others;
    if (this.isOpen) this.redraw();
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
    this.redraw();
  }

  private resize(): void {
    // The paper's inside, not its border box; the canvas fills it by its own style and is out of the
    // paper's flow, so its size here can never change the paper's.
    const paper = this.canvas.parentElement!;
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.canvas.width = Math.max(1, Math.round(paper.clientWidth * dpr));
    this.canvas.height = Math.max(1, Math.round(paper.clientHeight * dpr));
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.redraw();
  }

  // --- Drawing -----------------------------------------------------------------------------------

  /** Draws on the next frame: a drag's many moves, a tick's arrivals and a resize between them cost one draw. */
  private redraw(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    requestAnimationFrame(() => {
      this.scheduled = false;
      this.draw();
    });
  }

  private draw(): void {
    const map = this.map, built = this.bounds, pictures = this.pictures;
    if (!map || !built || !pictures || this.root.hidden) return;
    const started = performance.now();
    const g = this.g;
    const w = this.canvas.width / Math.min(window.devicePixelRatio, 2);
    const h = this.canvas.height / Math.min(window.devicePixelRatio, 2);
    const px = ZOOMS[this.zoom]!;

    // Nothing has been built past the edge of the mapped world, so the paper shows through around it.
    g.fillStyle = PARCHMENT;
    g.fillRect(0, 0, w, h);

    // Tile (x, y) draws at this screen point. y grows north, the canvas grows down.
    const sx = (x: number) => w / 2 + (x - this.centre.x) * px;
    const sy = (y: number) => h / 2 - (y - this.centre.y) * px;

    // The world itself: every built region in view, each from the kept picture at the scale nearest
    // the device pixels a tile takes, so on a plain screen a region is a pixel a pixel. The pictures
    // keep at least what one draw shows, so a drag never renders again what it drew a moment ago; a
    // region whose picture is not ready yet shows the paper this frame and is drawn the frame it is.
    const view = {
      x0: Math.max(built.x0, Math.floor(this.centre.x - w / 2 / px) - 1), x1: Math.min(built.x1, Math.ceil(this.centre.x + w / 2 / px) + 1),
      y0: Math.max(built.y0, Math.floor(this.centre.y - h / 2 / px) - 1), y1: Math.min(built.y1, Math.ceil(this.centre.y + h / 2 / px) + 1),
    };
    const dpr = Math.min(window.devicePixelRatio, 2);
    const source = [...SCALES].reverse().find((s) => s >= px * dpr) ?? SCALES[0];
    const regions = regionsIn(map, view);
    pictures.reserve(source, regions.length);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    const side = REGION * source;
    let missing = 0;
    for (const region of regions) {
      const picture = pictures.request(region, source);
      if (!picture) {
        missing++;
        continue;
      }
      const x = Math.round(sx(region.x0) * dpr) / dpr, y = Math.round(sy(region.y0 + REGION) * dpr) / dpr;
      g.drawImage(picture, 0, 0, side, side, x, y, REGION * px, REGION * px);
    }

    this.drawEdges(g, map, px, sx, sy, w, h);
    if (px >= 3) this.drawMarks(g, px, sx, sy, w, h);
    this.drawLabels(g, px, sx, sy, w, h);
    this.drawOthers(g, px, sx, sy);
    this.drawMe(g, px, sx, sy);
    this.regionsShown = regions.length;
    this.pending = missing;
    this.lastDrawMs = performance.now() - started;
    this.draws++;
    if (missing > 0) this.redraw();
  }

  /**
   * The edge of what has been mapped, and the roads that run off it. The built world is not a
   * rectangle — the city's regions stand north-west of the hamlet's — so the edge is drawn region by
   * region, along every side of a built region that has nothing built beyond it, and each road's
   * label sits at the tile where the road actually leaves. The places the roads lead to are Phase
   * 12's to build, so the map says so rather than letting the end of the drawn ground read as the end
   * of the world.
   */
  private drawEdges(
    g: CanvasRenderingContext2D, map: WorldMap, px: number,
    sx: (x: number) => number, sy: (y: number) => number, width: number, height: number,
  ): void {
    g.save();
    g.strokeStyle = INK;
    g.globalAlpha = 0.5;
    g.setLineDash([6, 5]);
    g.lineWidth = 2;
    g.beginPath();
    const builtAt = (rx: number, ry: number) => map.regions.get(regionId(rx, ry))?.built === true;
    for (const r of builtRegions(map)) {
      const left = sx(r.x0), right = sx(r.x0 + REGION), top = sy(r.y0 + REGION), bottom = sy(r.y0);
      if (!builtAt(r.rx, r.ry + 1)) { g.moveTo(left, top); g.lineTo(right, top); }
      if (!builtAt(r.rx, r.ry - 1)) { g.moveTo(left, bottom); g.lineTo(right, bottom); }
      if (!builtAt(r.rx - 1, r.ry)) { g.moveTo(left, top); g.lineTo(left, bottom); }
      if (!builtAt(r.rx + 1, r.ry)) { g.moveTo(right, top); g.lineTo(right, bottom); }
    }
    g.stroke();
    g.restore();

    g.save();
    g.font = `italic ${Math.max(11, Math.min(15, px * 2.2))}px "Palatino Linotype", Georgia, serif`;
    for (const exit of MAP_EXITS) {
      // The label sits on the edge the road crosses, at the tile it crosses it, and is only drawn when
      // that spot is in view: otherwise it slides into the middle of the map and reads as a place that is there.
      const across = exit.side === "w" || exit.side === "e";
      const ex = exit.side === "w" ? sx(exit.x) : exit.side === "e" ? sx(exit.x + 1) : sx(exit.x) + px / 2;
      const ey = exit.side === "n" ? sy(exit.y + 1) : exit.side === "s" ? sy(exit.y) : sy(exit.y) - px / 2;
      if (across ? ex < -40 || ex > width + 40 : ex < -80 || ex > width + 80) continue;
      if (across ? ey < -30 || ey > height + 30 : ey < -30 || ey > height + 30) continue;
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

  /** Everyone else in view, as the radar shows them: white for a player, yellow for a creature. */
  private drawOthers(
    g: CanvasRenderingContext2D, px: number,
    sx: (x: number) => number, sy: (y: number) => number,
  ): void {
    const r = Math.max(2, Math.min(4, px * 0.5));
    for (const o of this.others) {
      g.beginPath();
      g.arc(sx(o.fx), sy(o.fy), r, 0, Math.PI * 2);
      g.fillStyle = o.npc ? "#f4d03f" : "#ffffff";
      g.fill();
      g.lineWidth = 1;
      g.strokeStyle = INK;
      g.stroke();
    }
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
    else if (climbable(o.kind)) {
      const name = o.kind === "stairs" ? "Stairs" : o.kind === "ladder" ? "Ladder" : o.kind === "adit" ? "Adit" : o.kind === "open_stair" ? "Barrow stair" : "Trapdoor";
      once("stair", o.x, o.y, name);
    }
  }
  for (const m of MAP_MARKS) once(m.icon, m.x, m.y, m.name);
  return marks;
}
