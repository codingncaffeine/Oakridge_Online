import * as THREE from "three";
import { mulberry32 } from "../../shared/rng.ts";
import { LEAF_BACKING, LEAF_GREENS, STONE, STONE_MORTAR } from "../palette.ts";

/**
 * One tile's worth of a building surface, in pixels. Walls and roofs map their textures in world
 * units — u and v are tiles — so a texture's period is one tile both ways and every seam lines up,
 * whatever a wall's length or a roof's slope.
 */
const SURFACE_PX = 128;

/** The three tones a roof is painted in. */
export interface Tones {
  base: string;
  dark: string;
  light: string;
}

const css = (hex: number) => "#" + hex.toString(16).padStart(6, "0");

/** A hex colour lightened or darkened by `k`, and pushed `warm` steps toward red (or, negative, toward blue). */
function tone(hex: string, k: number, warm = 0): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (shift: number, extra: number) => Math.max(0, Math.min(255, Math.round(((n >> shift) & 255) * k + extra)));
  return `rgb(${c(16, warm)}, ${c(8, 0)}, ${c(0, -warm)})`;
}

/** A square tile of surface, drawn once and repeated. */
function surface(seed: number, draw: (g: CanvasRenderingContext2D, size: number, rand: () => number) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SURFACE_PX;
  const g = canvas.getContext("2d")!;
  draw(g, SURFACE_PX, mulberry32(seed));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

/** Fills a rectangle and its eight wrapped copies, so whatever crosses the tile's edge continues on the other side. */
function wrapped(g: CanvasRenderingContext2D, size: number, x: number, y: number, w: number, h: number): void {
  for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) g.fillRect(x + dx, y + dy, w, h);
}

/**
 * Coursed grey stone: five courses to the tile, blocks of uneven length breaking joint from course to
 * course, dark mortar between, and each block a little lighter or darker and warmer or cooler than
 * the next. A lit top edge and a shadowed foot are what make a flat block read as laid, not painted.
 */
export function stoneTexture(): THREE.CanvasTexture {
  return surface(20260924, (g, size, rand) => {
    const courses = 5, ch = size / courses, joint = 2;
    g.fillStyle = css(STONE_MORTAR);
    g.fillRect(0, 0, size, size);
    for (let c = 0; c < courses; c++) {
      const y = c * ch;
      let x = -rand() * ch * 1.2;
      while (x < size) {
        const len = ch * (0.9 + rand() * 1.6);
        const light = 0.84 + rand() * 0.3, warm = (rand() - 0.5) * 14;
        g.fillStyle = tone(css(STONE), light, warm);
        wrapped(g, size, x + joint / 2, y + joint / 2, len - joint, ch - joint);
        g.fillStyle = tone(css(STONE), light * 1.14, warm);
        wrapped(g, size, x + joint / 2, y + joint / 2, len - joint, 1.5);
        g.fillStyle = tone(css(STONE), light * 0.78, warm);
        wrapped(g, size, x + joint / 2, y + ch - joint / 2 - 1.5, len - joint, 1.5);
        x += len;
      }
    }
  });
}

/**
 * Rows of tiles, each row lapping the one below: `rows` to the tile, six across, staggered by half a
 * tile from row to row, with the shadow of each row's lower edge falling on the row beneath it. Clay
 * and slate are the same drawing in different tones.
 */
export function tileTexture(tones: Tones, rows: number, seed: number): THREE.CanvasTexture {
  return surface(seed, (g, size, rand) => {
    const rh = size / rows, across = 6, tw = size / across;
    g.fillStyle = tones.dark;
    g.fillRect(0, 0, size, size);
    for (let r = 0; r < rows; r++) {
      const y = r * rh, shift = (r % 2) * (tw / 2);
      for (let i = -1; i <= across; i++) {
        const x = i * tw + shift;
        g.fillStyle = tone(tones.base, 0.88 + rand() * 0.24, (rand() - 0.5) * 12);
        wrapped(g, size, x + 1, y + 3, tw - 2, rh - 3);
        g.fillStyle = tones.light;
        wrapped(g, size, x + 1, y + 3, tw - 2, 1.5);
      }
    }
  });
}

/** Thatch: straw laid in courses, a soft line every quarter tile where one layer ends over the next. */
export function thatchTexture(tones: Tones, seed: number): THREE.CanvasTexture {
  return surface(seed, (g, size, rand) => {
    g.fillStyle = tones.base;
    g.fillRect(0, 0, size, size);
    for (let i = 0; i < 700; i++) {
      const x = rand() * size, y = rand() * size, len = 6 + rand() * 22;
      g.fillStyle = rand() < 0.5 ? tone(tones.light, 0.85 + rand() * 0.3) : tone(tones.dark, 0.9 + rand() * 0.3);
      wrapped(g, size, x, y, 1.5, len);
    }
    g.fillStyle = tone(tones.dark, 0.9);
    for (let r = 0; r < 4; r++) wrapped(g, size, 0, (r * size) / 4, size, 2);
  });
}

/** Rows of the leaf texture (from the top) that are solid foliage; below it is the ragged fringe. */
export const LEAF_SOLID = 0.7;

/**
 * Foliage drawn from thousands of small leaves, tiling left to right. The top LEAF_SOLID of the image
 * is solid foliage, darker further down. Below that, strands of leaves hang with gaps between them, so
 * an alpha-tested canopy gets a ragged hanging edge. On a canopy, v = 1 is the crown and v = 0 is the
 * tip of the fringe.
 */
export function leafTexture(size = 256): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d")!;
  const rand = mulberry32(20260922);
  const solid = size * LEAF_SOLID;

  g.fillStyle = LEAF_BACKING;
  g.fillRect(0, 0, size, solid);

  const leaf = (x: number, y: number, len: number, color: string) => {
    const angle = rand() * Math.PI * 2, width = len * (0.45 + rand() * 0.2);
    g.fillStyle = color;
    for (const dx of [-size, 0, size]) {
      g.beginPath();
      g.ellipse(x + dx, y, len, width, angle, 0, Math.PI * 2);
      g.fill();
    }
  };
  // Deeper leaves are darker; sunlit ones near the crown are lighter.
  const shadeFor = (y: number) => {
    const depth = Math.min(1, Math.max(0, y / size));
    const i = Math.min(LEAF_GREENS.length - 1, Math.max(0, Math.floor(depth * 5 + rand() * 4 - 1)));
    return LEAF_GREENS[i]!;
  };
  // Clumps: a dark core with lighter leaves on top, so the foliage has depth rather than even noise.
  for (let i = 0; i < 260; i++) {
    const cx = rand() * size, cy = rand() * solid;
    leaf(cx, cy + 3, 12 + rand() * 6, LEAF_GREENS[6 + Math.floor(rand() * 2)]!);
    for (let j = 0; j < 7; j++) {
      const y = cy + (rand() - 0.6) * 14;
      leaf(cx + (rand() - 0.5) * 18, y, 5 + rand() * 5, shadeFor(y - 18));
    }
  }
  for (let i = 0; i < 900; i++) {
    const y = rand() * solid;
    leaf(rand() * size, y, 4 + rand() * 5, shadeFor(y));
  }

  // The fringe: strands hanging from the solid edge to random lengths, leaves thinning as they fall.
  const strands = 58;
  for (let s = 0; s < strands; s++) {
    const x0 = ((s + rand() * 0.8) / strands) * size;
    const length = (size - solid) * (0.25 + rand() * 0.75);
    for (let d = -8; d < length; d += 3) {
      const spread = 3 + (d / length) * 6;
      leaf(x0 + (rand() - 0.5) * spread * 2, solid + d, 4 + rand() * 5 * (1 - (d / length) * 0.5), shadeFor(solid + d * 0.6));
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  return texture;
}
